/* Basketball pick tests (Oct 11 — Sam: "build out basketbal with everything that works", "do your best"). Runs as a probe
   (MODE=probe PROBE=cbbtest); nothing is written to the site.

   The site's pick (job/cbbgames.mjs) uses Elo before the game, last season's adjusted net early on, and home court. Each idea below is
   added to that same fit, trained on 2016–23 and scored blind on 2024, 2025 and 2026 (log loss, Brier, right %, margin miss, and against
   the closing line where our number and the line differ by 3+):
     hca    each team's own home edge: (conference home margin − conference road margin) / 2 over the three seasons before, shrunk
     rest   days since each team's last game (1–7), and back-to-back
     alt    a home team playing at altitude (4,000 ft+) against a team that doesn't
     tz     time zones the road team crossed (from each school's state)
     luck   season to date: points per game opponents made above the league's 3-point and free-throw percentages on their attempts
            (defense "luck") and the same for the team's own shooting (offense)
   Only what lowers the blind log loss in every test season is worth adding. */
import { configure, cb, getPack } from "./cbb.mjs";
import { pickX, seasonFrac, fitPick, pickP, pickM, ranges, pickLine, homeCover } from "./cbbgames.mjs";

const ALT = /^(Air Force|Colorado|Colorado State|Denver|Northern Colorado|Wyoming|New Mexico|Utah|Utah State|BYU|Utah Valley|Weber State|Southern Utah|Montana State|Idaho State|Northern Arizona|Nevada|UTEP|New Mexico State|Montana)$/;
const TZ = { ET: "CT DE FL GA IN KY ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV DC", CT: "AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI", MT: "AZ CO ID MT NM UT WY", PT: "CA NV OR WA", AK: "AK", HI: "HI" };
const TZN = { ET: 0, CT: 1, MT: 2, PT: 3, AK: 4, HI: 5 };
const tzOf = st => { for (const [k, v] of Object.entries(TZ)) if (v.split(" ").includes(st)) return TZN[k]; return null };

export async function run({ site, token, log = console.log }) {
  configure({ site, token: process.env.JOB_TOKEN || token, mode: "cbb" });   /* the job token (the page session token can't open a job session) */
  const GH = await getPack("p2000_cbb-ghist"), HI = await getPack("p2000_cbb-hist");
  if (!GH || !HI) return { ok: false, error: "history packs missing" };
  const adj = HI.adj; const S = 2026;
  /* this season's games and lines (2026 = last winter) */
  if (!GH.seasons[S]) { const rows = []; for (const [a, b] of ranges(S, 31)) for (const g of await cb("/games", { season: S, startDateRange: a, endDateRange: b })) if (g.status === "final")
    rows.push([g.id, g.startDate.slice(0, 10), g.homeTeamId, g.awayTeamId, g.homePoints, g.awayPoints, g.neutralSite ? 1 : 0, g.conferenceGame ? 1 : 0, g.homeTeamEloStart ?? null, g.awayTeamEloStart ?? null, g.seasonType === "postseason" ? 1 : 0, g.tournament || null]);
    const seen = new Set(); GH.seasons[S] = rows.filter(r => !seen.has(r[0]) && seen.add(r[0])) }
  if (!GH.lines[S]) { GH.lines[S] = {}; for (const [a, b] of ranges(S, 31)) for (const l of await cb("/lines", { season: S, startDateRange: a, endDateRange: b })) { const L = pickLine(l.lines); if (L && L.sp != null) GH.lines[S][l.gameId] = [L.sp, L.ou] } }
  const teams = await cb("/teams"); const TM = Object.fromEntries(teams.map(t => [t.id, t]));
  /* team box scores for shooting luck */
  const Y0 = 2016, BOX = {};
  for (let y = Y0; y <= S; y++) { BOX[y] = {}; for (const [a, b] of ranges(y, 14)) for (const t of await cb("/games/teams", { season: y, startDateRange: a, endDateRange: b })) {
    const o = t.opponentStats || {}, u = t.teamStats || {}; const g = BOX[y][t.gameId] = BOX[y][t.gameId] || {};
    g[t.teamId] = { o3m: (o.threePointFieldGoals || {}).made, o3a: (o.threePointFieldGoals || {}).attempted, oftm: (o.freeThrows || {}).made, ofta: (o.freeThrows || {}).attempted,
      u3m: (u.threePointFieldGoals || {}).made, u3a: (u.threePointFieldGoals || {}).attempted, uftm: (u.freeThrows || {}).made, ufta: (u.freeThrows || {}).attempted } }
    log(`cbbtest: box scores ${y} · ${Object.keys(BOX[y]).length} games`) }
  /* league shooting by season */
  const LG = {}; for (const y in BOX) { let m3 = 0, a3 = 0, mf = 0, af = 0; for (const g of Object.values(BOX[y])) for (const s of Object.values(g)) { if (s.u3a) { m3 += s.u3m; a3 += s.u3a } if (s.ufta) { mf += s.uftm; af += s.ufta } } LG[y] = [m3 / a3, mf / af] }

  /* per season: walk games in date order, recording each team's state before the game */
  const prior = (tid, y) => { const a = (adj[y - 1] || {})[tid]; return a ? a[0] : null };
  const hcaCache = {};
  const hcaOf = (tid, y) => { const k = tid + "|" + y; if (k in hcaCache) return hcaCache[k]; let hs = 0, hn = 0, as = 0, an = 0;
    for (let z = y - 3; z < y; z++) for (const r of GH.seasons[z] || []) { if (r[6] || !r[7] || r[4] == null) continue; if (r[2] === tid) { hs += r[4] - r[5]; hn++ } else if (r[3] === tid) { as += r[5] - r[4]; an++ } }
    if (hn < 10 || an < 10) return hcaCache[k] = null; const raw = (hs / hn - as / an) / 2, n = Math.min(hn, an); return hcaCache[k] = raw * n / (n + 40) };
  const rows = [];
  for (const y of Object.keys(GH.seasons).map(Number).filter(y => y >= Y0).sort()) {
    const L = GH.seasons[y].filter(r => r[4] != null).slice().sort((a, b) => a[1].localeCompare(b[1]));
    const last = {}, lk = {}; let hcaAll = [];
    for (const r of L) { for (const t of [r[2], r[3]]) { const h = hcaOf(t, y); if (h != null) hcaAll.push(h) } }
    const hcaMean = hcaAll.length ? hcaAll.reduce((a, b) => a + b, 0) / hcaAll.length : 0;
    for (const r of L) {
      const [gid, date, h, a, hs, as, neu] = r, d = Date.parse(date), home = neu ? 0 : 1;
      const x = pickX(r[8] != null && r[9] != null ? r[8] - r[9] : 0, prior(h, y) != null && prior(a, y) != null ? prior(h, y) - prior(a, y) : 0, home, seasonFrac(date + "T00:00:00Z", y));
      const rest = t => { const l = last[t]; return l == null ? 7 : Math.max(1, Math.min(7, Math.round((d - l) / 864e5))) };
      const rh = rest(h), ra = rest(a);
      const hh = hcaOf(h, y);
      const sh = TM[h] && TM[h].currentState, sa = TM[a] && TM[a].currentState, th = tzOf(sh), ta = tzOf(sa);
      const altH = ALT.test((TM[h] || {}).school || ""), altA = ALT.test((TM[a] || {}).school || "");
      const luck = t => { const o = lk[t]; return o && o.n >= 3 ? [o.d / o.n, o.o / o.n] : [0, 0] };
      const [dh, oh] = luck(h), [da, oa] = luck(a);
      rows.push({ y, gid, x, won: hs > as ? 1 : 0, m: hs - as, ln: (GH.lines[y] || {})[gid] || null,
        f: { hca: [home * ((hh ?? hcaMean) - hcaMean) / 3], rest: [(rh - ra) / 3, (rh === 1 ? 1 : 0) - (ra === 1 ? 1 : 0)], alt: [home && altH && !altA ? 1 : 0], tz: [home && th != null && ta != null ? Math.abs(th - ta) / 2 : 0], luck: [(dh - da) / 5, (oh - oa) / 5] } });
      last[h] = d; last[a] = d;
      const B = (BOX[y] || {})[gid]; if (B) for (const t of [h, a]) { const s = B[t]; if (!s || !s.o3a) continue; const [p3, pf] = LG[y]; const o = lk[t] = lk[t] || { n: 0, d: 0, o: 0 }; o.n++;
        o.d += 3 * (s.o3m - p3 * s.o3a) + ((s.oftm || 0) - pf * (s.ofta || 0)); o.o += 3 * (s.u3m - p3 * s.u3a) + ((s.uftm || 0) - pf * (s.ufta || 0)) }
    }
  }
  const TEST = [2024, 2025, 2026], train = rows.filter(r => r.y < TEST[0] && r.y >= Y0 + 1);
  const score = (P, R, X) => { let ll = 0, br = 0, right = 0, mae = 0, atsN = 0, ats = 0; for (const r of R) { const x = X(r), p = Math.min(1 - 1e-6, Math.max(1e-6, pickP(P, x))), mg = pickM(P, x);
      ll -= r.won * Math.log(p) + (1 - r.won) * Math.log(1 - p); br += (p - r.won) ** 2; right += (p >= .5) === (r.won === 1) ? 1 : 0; mae += Math.abs(mg - r.m);
      if (r.ln && r.ln[0] != null && r.ln[0] !== 0) { const our = -mg; if (Math.abs(our - r.ln[0]) >= 3) { const c = homeCover(r.m, 0, r.ln[0]); if (c !== .5) { atsN++; ats += our < r.ln[0] ? c : 1 - c } } } }
    const n = R.length; return { ll: +(ll / n).toFixed(4), br: +(br / n).toFixed(4), right: +(right / n).toFixed(4), mae: +(mae / n).toFixed(2), ats: atsN ? `${(100 * ats / atsN).toFixed(1)}% of ${atsN}` : "—" } };
  const SETS = { base: [], hca: ["hca"], rest: ["rest"], alt: ["alt"], tz: ["tz"], luck: ["luck"], all: ["hca", "rest", "alt", "tz", "luck"] };
  const out = {};
  for (const [name, keys] of Object.entries(SETS)) { const X = r => [...r.x, ...keys.flatMap(k => r.f[k])]; const P = fitPick(train.map(r => [X(r), r.won, r.m]));
    out[name] = { w: P.w.slice(5).map(v => +v.toFixed(3)), mw: P.mw.slice(5).map(v => +v.toFixed(2)), ...Object.fromEntries(TEST.map(y => [y, score(P, rows.filter(r => r.y === y), X)])) } }
  /* keep a feature set only if it beats the base log loss in every test season */
  const wins = Object.keys(SETS).filter(k => k !== "base" && TEST.every(y => out[k][y].ll < out.base[y].ll));
  return { ok: true, train: `${Y0 + 1}–${TEST[0] - 1} (${train.length} games)`, test: Object.fromEntries(TEST.map(y => [y, rows.filter(r => r.y === y).length])), out, betterEverySeason: wins };
}
