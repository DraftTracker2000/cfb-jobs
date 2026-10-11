/* NBA pick test: who's missing (Oct 11 — Sam: "do your best"). Runs as a probe (MODE=probe PROBE=nbatest); nothing is written.

   The site's NBA pick is last season's net rating (blended with this season's as games come in, 15 games = half) plus 2.5 for home
   court. The question: does knowing which rotation players sit out (what the injury report tells you before tip) make it better?
   From the open hoopR box scores (sportsdataverse), for every regular-season game: each team's rotation so far (3+ games for the team,
   12+ minutes a game), and who of them didn't play — absent from the box or listed DNP for anything but a coach's decision (a traded
   player is dropped once he shows up for another team). Their value: game score per 36 and plus-minus per 48 against the team's,
   both shrunk toward average by minutes. Features: minutes missing, and value missing × minutes (home − away).
   Fit on 2022–23, scored blind on 2024, 2025 and 2026 (NBA seasons by the spring they end). */
import { REL, getCsv, rowsOf } from "./cbbnba.mjs";
import { fitPick, pickP, pickM } from "./cbbgames.mjs";

const gs = r => (+r.points || 0) + .4 * (+r.field_goals_made || 0) - .7 * (+r.field_goals_attempted || 0) - .4 * ((+r.free_throws_attempted || 0) - (+r.free_throws_made || 0)) + .7 * (+r.offensive_rebounds || 0) + .3 * (+r.defensive_rebounds || 0) + (+r.steals || 0) + .7 * (+r.assists || 0) + .7 * (+r.blocks || 0) - .4 * (+r.fouls || 0) - (+r.turnovers || 0);

export async function run({ log = console.log }) {
  const YS = [2021, 2022, 2023, 2024, 2025, 2026], PB = {}, TB = {};
  for (const y of YS) { const p = await getCsv(REL("espn_nba_player_boxscores", `player_box_${y}.csv`)), t = await getCsv(REL("espn_nba_team_boxscores", `team_box_${y}.csv`));
    if (!p || !t) return { ok: false, error: `box scores ${y} missing` };
    PB[y] = rowsOf(p).filter(r => +r.season_type === 2); TB[y] = rowsOf(t).filter(r => +r.season_type === 2); log(`nbatest: ${y} · ${PB[y].length} player rows, ${TB[y].length} team rows`) }
  const poss = r => (+r.field_goals_attempted || 0) - (+r.offensive_rebounds || 0) + (+r.total_turnovers || +r.turnovers || 0) + .44 * (+r.free_throws_attempted || 0);
  const netOf = rows => { const T = {}; for (const r of rows) { const X = T[r.team_abbreviation] = T[r.team_abbreviation] || { g: 0, pf: 0, pa: 0, p: 0 }; X.g++; X.pf += +r.team_score || 0; X.pa += +r.opponent_team_score || 0; X.p += poss(r) }
    for (const X of Object.values(T)) X.net = X.p ? 100 * (X.pf - X.pa) / X.p : 0; return T };
  const out = [];
  for (const y of YS.slice(1)) {
    const prev = netOf(TB[y - 1]);
    /* season-long player values from last season, carried in */
    const val = {}; const addV = (id, r, team) => { const v = val[id] = val[id] || { min: 0, gs: 0, pm: 0, tmPm: 0 }; const m = +r.minutes || 0; v.min += m; v.gs += gs(r); v.pm += +r.plus_minus || 0; v.tmPm += m / 48 * ((+r.team_score || 0) - (+r.opponent_team_score || 0)) };
    for (const r of PB[y - 1]) if (+r.minutes > 0) addV(r.athlete_id, r);
    /* games of season y in date order */
    const G = {}; for (const r of TB[y]) { const g = G[r.game_id] = G[r.game_id] || { id: r.game_id, d: r.game_date, t: {} }; g.t[r.home_away] = r }
    const PG = {}; for (const r of PB[y]) (PG[r.game_id] = PG[r.game_id] || []).push(r);
    const lastTeam = {}; for (const r of PB[y].slice().sort((a, b) => a.game_date.localeCompare(b.game_date))) if (+r.minutes > 0) (lastTeam[r.athlete_id] = lastTeam[r.athlete_id] || []).push([r.game_date, r.team_abbreviation]);
    const stillOn = (id, tm, d) => { const L = lastTeam[id] || []; const next = L.find(x => x[0] > d); return next ? next[1] === tm : (L.length ? L[L.length - 1][1] === tm : false) };
    const cur = {}, onTeam = {};   // cur: team running sums; onTeam[tm][id] = {g, min}
    for (const g of Object.values(G).sort((a, b) => a.d.localeCompare(b.d))) {
      const H = g.t.home, A = g.t.away; if (!H || !A) continue;
      const rate = tm => { const p = prev[tm], c = cur[tm]; const pn = p ? p.net : 0; if (!c || !c.g) return pn; const w = c.g / (c.g + 15); return w * (100 * (c.pf - c.pa) / c.p) + (1 - w) * pn };
      const rows = PG[g.id] || [];
      const miss = tm => { const R = onTeam[tm] || {}, played = new Set(rows.filter(r => r.team_abbreviation === tm && +r.minutes > 0).map(r => r.athlete_id)), dnp = {}; for (const r of rows) if (r.team_abbreviation === tm && !(+r.minutes > 0)) dnp[r.athlete_id] = r.reason || "";
        let mn = 0, vg = 0, vp = 0, n = 0; for (const [id, o] of Object.entries(R)) { if (o.g < 3) continue; const mpg = o.min / o.g; if (mpg < 12 || played.has(id)) continue; if (/coach/i.test(dnp[id] || "")) continue; if (!(id in dnp) && !stillOn(id, tm, g.d)) continue;
          const v = val[id] || { min: 0, gs: 0, pm: 0, tmPm: 0 }, k = v.min / (v.min + 600); const g36 = v.min ? (v.gs / v.min * 36 - 11) * k : 0, p48 = v.min ? ((v.pm - v.tmPm) / v.min * 48) * k : 0;
          mn += mpg / 48; vg += g36 * mpg / 48; vp += p48 * mpg / 48; n++ } return [mn, vg, vp, n] };
      const mh = miss(H.team_abbreviation), ma = miss(A.team_abbreviation);
      const base = rate(H.team_abbreviation) - rate(A.team_abbreviation), hs = +H.team_score, as = +A.team_score;
      if (hs && as) out.push({ y, base, home: 1, won: hs > as ? 1 : 0, m: hs - as, f: [mh[0] - ma[0], (mh[1] - ma[1]) / 5, (mh[2] - ma[2]) / 5], nMiss: mh[3] + ma[3] });
      /* after the game: running team sums, rotations, values */
      for (const r of [H, A]) { const c = cur[r.team_abbreviation] = cur[r.team_abbreviation] || { g: 0, pf: 0, pa: 0, p: 0 }; c.g++; c.pf += +r.team_score || 0; c.pa += +r.opponent_team_score || 0; c.p += poss(r) }
      for (const r of rows) { if (!(+r.minutes > 0)) continue; const o = (onTeam[r.team_abbreviation] = onTeam[r.team_abbreviation] || {})[r.athlete_id] = (onTeam[r.team_abbreviation] || {})[r.athlete_id] || { g: 0, min: 0 }; o.g++; o.min += +r.minutes; addV(r.athlete_id, r) }
    }
    log(`nbatest: ${y} · ${out.filter(r => r.y === y).length} games`);
  }
  const TEST = [2024, 2025, 2026], train = out.filter(r => !TEST.includes(r.y));
  const sc = (pf, R) => { let ll = 0, br = 0, right = 0, mae = 0; for (const r of R) { const [p0, m] = pf(r), p = Math.min(1 - 1e-6, Math.max(1e-6, p0)); ll -= r.won * Math.log(p) + (1 - r.won) * Math.log(1 - p); br += (p - r.won) ** 2; right += (p >= .5) === (r.won === 1) ? 1 : 0; mae += Math.abs(m - r.m) }
    const n = R.length; return { ll: +(ll / n).toFixed(4), br: +(br / n).toFixed(4), right: +(right / n).toFixed(4), mae: +(mae / n).toFixed(2) } };
  /* the site's formula as it is */
  const ncdf = z => .5 * (1 + Math.tanh(.7978845608 * (z + .044715 * z ** 3)));
  const prod = r => { const m = r.base + 2.5; return [ncdf(m / 12), m] };
  const SETS = { base: [], minutes: [0], gameScore: [1], plusMinus: [2], all: [0, 1, 2] };
  const res = { site: Object.fromEntries(TEST.map(y => [y, sc(prod, out.filter(r => r.y === y))])) };
  for (const [k, idx] of Object.entries(SETS)) { const X = r => [1, r.base / 10, ...idx.map(i => r.f[i])]; const P = fitPick(train.map(r => [X(r), r.won, r.m]));
    res[k] = { w: P.w.map(v => +v.toFixed(3)), mw: P.mw.map(v => +v.toFixed(2)), ...Object.fromEntries(TEST.map(y => [y, sc(r => [pickP(P, X(r)), pickM(P, X(r))], out.filter(r => r.y === y))])) } }
  const withMiss = out.filter(r => TEST.includes(r.y) && r.nMiss > 0).length;
  return { ok: true, games: out.length, train: train.length, testGamesWithSomeoneOut: withMiss, res, betterEverySeason: Object.keys(SETS).filter(k => k !== "base" && TEST.every(y => res[k][y].ll < res.base[y].ll)) };
}
