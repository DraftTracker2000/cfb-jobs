/* This week's college football betting angles (Nov 19 — the owner, 1:24 pm: "i don't know why you can't access the lines"; study hunt 79,
   docs/checks/college-angles-test-2026-11-19.txt). Only what held in both halves of the test (2014–19 / 2020–26), the week's single biggest
   mismatch among FBS-vs-FBS games with a line, each team judged on its previous 10 games (crossing seasons, 5+ needed):
     ball security (offense rarely turns it over vs a defense that rarely forces it) → that team covers 63.5% (67/61), its team total over 57.9% (57/59)
     yards a carry → game under 57.9% (62/55) · points → game under 57.7% (62/54) · yards a pass → game under 55.6% (58/53), other team covers 55.2% (56/55)
   CFBD through the site's proxy (finished seasons cost no call; this season about one call a week of games).
   Output: pack "pYYYY_colang" = { t, v, season, week, games, team: [ { k, lab, gid, team, opp, bet, why, hit, h } ], past: { week: [...] } } */
import { gzipSync } from "node:zlib";

const TESTED = [
  { k: "give", bet: "ats-me", hit: 63.5, h: [67, 61], lab: "Ball security" },
  { k: "give", bet: "tt-over", hit: 57.9, h: [57, 59], lab: "Ball security" },
  { k: "ypc", bet: "tot-under", hit: 57.9, h: [62, 55], lab: "Yards a carry" },
  { k: "pf", bet: "tot-under", hit: 57.7, h: [62, 54], lab: "Points" },
  { k: "ypa", bet: "tot-under", hit: 55.6, h: [58, 53], lab: "Yards a pass" },
  { k: "ypa", bet: "ats-other", hit: 55.2, h: [56, 55], lab: "Yards a pass" }];
const M = { pf: 1, ypc: 1, ypa: 1, give: -1 };
const r2 = v => v == null ? null : Math.round(v * 100) / 100;
const fbs = x => String(x || "").toLowerCase() === "fbs";

export async function buildColAngles({ cf, season, log = console.log, prev = null }) {
  const G = [], BOX = {};
  for (const y of [season - 1, season]) {
    const g = await cf(`/games?year=${y}&seasonType=regular`); if (!Array.isArray(g)) throw new Error(`no games ${y}`);
    for (const x of g) if (fbs(x.homeClassification || x.home_division) && fbs(x.awayClassification || x.away_division))
      G.push({ id: x.id, season: y, week: x.week, date: x.startDate || x.start_date, home: x.homeTeam || x.home_team, away: x.awayTeam || x.away_team,
        hs: x.homePoints ?? x.home_points ?? null, as: x.awayPoints ?? x.away_points ?? null });
  }
  const lines = {}; for (const y of [season - 1, season]) { const L = await cf(`/lines?year=${y}&seasonType=regular`);
    for (const x of L || []) { const ls = x.lines || []; const c = ls.find(l => /consensus/i.test(l.provider || "") && l.spread != null) || ls.find(l => l.spread != null);
      const ou = ls.map(l => +l.overUnder).filter(v => isFinite(v) && v > 0);
      if (c) lines[x.id] = { sp: +c.spread, ou: ou.length ? ou.reduce((a, b) => a + b, 0) / ou.length : null } } }   // CFBD spread: home side, negative = home favored
  const open = G.filter(g => g.season === season && g.hs == null), week = open.length ? Math.min(...open.map(g => g.week)) : null;
  const weeks = {}; for (const g of G) if (g.hs != null) (weeks[g.season] = weeks[g.season] || new Set()).add(g.week);
  for (const y of Object.keys(weeks)) for (const w of weeks[y]) { const B = await cf(`/games/teams?year=${y}&week=${w}&seasonType=regular`);
    for (const x of B || []) for (const t of x.teams || []) { const st = {}; for (const s of t.stats || []) st[s.category] = s.stat;
      const ca = String(st.completionAttempts || "").split(/[-\/]/), att = +ca[1] || null;
      BOX[x.id + "|" + (t.team || t.school)] = { car: +st.rushingAttempts || null, ryd: +st.rushingYards || 0, att, pyd: +st.netPassingYards || 0, give: +st.turnovers || 0 } } }
  /* each team's games in order (FBS vs FBS with a line, as in the test), its numbers and what it allowed */
  const done = G.filter(g => g.hs != null && lines[g.id]).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const val = (g, t) => { const B = BOX[g.id + "|" + t] || {}, H = t === g.home; return { pf: H ? g.hs : g.as, ypc: B.car ? B.ryd / B.car : null, ypa: B.att ? B.pyd / B.att : null, give: B.give ?? null } };
  const H = {}; for (const g of done) for (const [t, o] of [[g.home, g.away], [g.away, g.home]]) (H[t] = H[t] || []).push({ o: val(g, t), d: val(g, o) });
  const mean = (A, f) => { const v = A.map(f).filter(x => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  const last = {}; for (const t in H) { const A = H[t].slice(-10); last[t] = { n: A.length }; for (const m in M) { last[t]["o_" + m] = mean(A, x => x.o[m]); last[t]["d_" + m] = mean(A, x => x.d[m]) } }
  const WK = week == null ? [] : G.filter(g => g.season === season && g.week === week && g.hs == null && lines[g.id]);
  const S = []; for (const g of WK) for (const [t, o, h] of [[g.home, g.away, 1], [g.away, g.home, 0]]) { const L = last[t], O = last[o]; if (!L || !O || L.n < 5 || O.n < 5) continue;
    const ln = lines[g.id], sp = h ? -ln.sp : ln.sp; S.push({ g, t, o, sp, ou: ln.ou, imp: ln.ou != null ? (ln.ou + sp) / 2 : null, L, O }) }
  const z = arr => { const v = arr.filter(x => x != null), m = v.reduce((a, b) => a + b, 0) / (v.length || 1), s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)) || 1; return arr.map(x => x == null ? null : (x - m) / s) };
  for (const m in M) { const sg = M[m], a = z(S.map(s => s.L["o_" + m] == null ? null : sg * s.L["o_" + m])), b = z(S.map(s => s.O["d_" + m] == null ? null : sg * s.O["d_" + m]));
    S.forEach((s, i) => { s["mo_" + m] = a[i] == null || b[i] == null ? null : a[i] + b[i] }) }
  const f1 = v => v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1);
  const why = (k, s) => k === "give" ? `${s.t} gives it away ${f1(s.L.o_give)} a game · ${s.o} forces ${f1(s.O.d_give)}` : k === "ypc" ? `${s.t} ${f1(s.L.o_ypc)} yds a carry · ${s.o} allows ${f1(s.O.d_ypc)}`
    : k === "pf" ? `${s.t} scores ${f1(s.L.o_pf)} · ${s.o} allows ${f1(s.O.d_pf)}` : `${s.t} ${f1(s.L.o_ypa)} yds a pass · ${s.o} allows ${f1(s.O.d_ypa)}`;
  const team = [];
  for (const A of TESTED) { const s = S.filter(x => x["mo_" + A.k] != null).sort((a, b) => b["mo_" + A.k] - a["mo_" + A.k])[0]; if (!s) continue;
    if ((A.bet === "tot-under" || A.bet === "tt-over") && s.ou == null) continue;
    const bet = A.bet === "ats-me" ? { t: "ats", side: s.t, line: r2(-s.sp) } : A.bet === "ats-other" ? { t: "ats", side: s.o, line: r2(s.sp) } : A.bet === "tot-under" ? { t: "tot", dir: "under", line: r2(s.ou) } : { t: "tt", side: s.t, dir: "over", line: Math.round(s.imp * 2) / 2 };
    team.push({ k: A.k + "-" + A.bet, lab: A.lab, gid: s.g.id, team: s.t, opp: s.o, bet, why: why(A.k, s), hit: A.hit, h: A.h }) }
  /* grade earlier weeks */
  const past = Object.assign({}, (prev && prev.past) || {});
  if (prev && prev.week != null && prev.season === season && prev.week !== week) past[prev.week] = { team: prev.team || [] };
  const byId = Object.fromEntries(G.map(g => [g.id, g])), cmp = (a, b) => a > b ? 1 : a < b ? 0 : null;
  for (const w in past) for (const a of past[w].team || []) { if (a.r === 0 || a.r === 1) continue; const g = byId[a.gid]; if (!g || g.hs == null) continue; const b = a.bet,
    pts = t => t === g.home ? g.hs : g.as, mg = t => pts(t) - pts(t === g.home ? g.away : g.home);
    a.r = b.t === "ats" ? cmp(mg(b.side) + b.line, 0) : b.t === "tot" ? cmp(b.line, g.hs + g.as) : cmp(pts(b.side), b.line) }
  log(`college angles: ${season} week ${week} · ${WK.length} FBS games with a line · ${S.length} sides with 5+ games · ${team.length} angles · ${Object.keys(past).length} past weeks`);
  return { t: Date.now(), v: 1, season, week, games: WK.map(g => ({ id: g.id, home: g.home, away: g.away, sp: lines[g.id].sp, ou: lines[g.id].ou })), team, past };
}

export async function uploadColAngles({ api, season, data }) {
  const name = `p${season}_colang`, gz = gzipSync(Buffer.from(JSON.stringify(data)));
  const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  await api("PUT", "/api/pack-index", { body: { [name]: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
  return { name, bytes: r.bytes };
}
