/* Past seasons (Oct 10 — Sam: "i saw all the previous seasons weren't built out for college basketball like the football side").
   Football lets you pick any of the last ten seasons; this does the same for basketball. Everything comes from data the job already has:
     - every player-season since 2012 is already scored by the draft model (hist in job/cbb.mjs), so each one gets its BoardScore and
       profile from the same model as this season's board
     - team ratings (H.adj), style (p2000_cbb-teamhist), results (p2000_cbb-ghist) and the NCAA bracket (p2000_cbb-ncaa)
   The only new CBBD reads are the AP polls, one call per season, kept in the pack and reused.

   Pack p{y}_cbb-past: { v, season, built, cols, players: [[...cols]], teams: { id: { conf, rec: [w, l, cw, cl], o, d, n, rn, pace, tpr, efg,
   oefg, orb, tovf, ap, apPre, ncaa: [seed, wins, played the First Four, made the round of 64] } } }. Draft outcomes are not stored: the page joins them from the current
   draft pack, so a player drafted years later shows up without rewriting old seasons.
   Seasons: the last ten finished ones (max(2012, S − 9) … S − 1, plus S once it's over). Rewritten when the format changes or the pack is a
   week old, so BoardScores stay on the current model. */
export const PAST_V = 1;
export const PAST_COLS = ["id", "nm", "tm", "p5", "yr", "ht", "g", "gs", "min", "pts", "reb", "orb", "ast", "stl", "blk", "tov", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "usg", "ortg", "drtg", "porp", "ws40", "score", "prof", "pD", "pR1", "pL"];
const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
const r3 = x => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;

/* the season's AP poll from CBBD /rankings rows: final (last week, postseason after regular season) and preseason (first week) */
export function apPolls(rows) {
  const ap = (rows || []).filter(p => /ap/i.test(p.pollType || "")); if (!ap.length) return { fin: {}, pre: {} };
  const wk = p => (p.seasonType === "postseason" ? 100 : 0) + (p.week || 0), hi = Math.max(...ap.map(wk)), lo = Math.min(...ap.map(wk));
  const at = w => Object.fromEntries(ap.filter(p => wk(p) === w && p.ranking).map(p => [p.teamId, p.ranking]));
  return { fin: at(hi), pre: at(lo) };
}

/* one season's teams: records from game rows ([id, date, home, away, hPts, aPts, neutral, confGame, …]), ratings, style, bracket */
export function pastTeams({ adj = {}, games = [], style = {}, ncaaRows = [], polls = { fin: {}, pre: {} } }) {
  const T = {};
  const ids = Object.keys(adj).map(Number);
  const nets = ids.map(id => [id, adj[id][0]]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]), rn = Object.fromEntries(nets.map(([id], i) => [id, i + 1]));
  for (const id of ids) { const st = style[id] || [];
    T[id] = { conf: adj[id][1] || null, rec: [0, 0, 0, 0], o: st[0] ?? null, d: st[1] ?? null, n: r1(adj[id][0]), rn: rn[id] || null, pace: st[2] ?? null, tpr: st[3] ?? null, tovf: st[4] ?? null, efg: st[5] ?? null, oefg: st[6] ?? null, orb: st[7] ?? null,
      ap: polls.fin[id] || null, apPre: polls.pre[id] || null, ncaa: null } }
  for (const g of games) { const [, , h, a, hp, ap, , cg] = g; if (hp == null || ap == null || hp === ap) continue;
    for (const [id, won] of [[h, hp > ap], [a, ap > hp]]) { const t = T[id]; if (!t) continue; t.rec[won ? 0 : 1]++; if (cg) t.rec[won ? 2 : 3]++ } }
  for (const r of ncaaRows) { const [, , h, a, hs, as, hp, ap, , , first] = r;
    for (const [id, sd, won] of [[h, hs, hp > ap], [a, as, ap > hp]]) { const t = T[id]; if (!t) continue; const n = t.ncaa = t.ncaa || [sd, 0, 0, 0];
      if (first) { n[2] = 1; continue } n[3] = 1; if (won) n[1]++ } }
  return T;
}

/* one season's players from scored hist rows: { r (season row), yr, d (derived), m, pD, pR1, pL } */
export function pastPlayers(rows, { grade, profileOf, ht = {} }) {
  const best = {}; for (const h of rows) { const k = h.r.id; if (!best[k] || h.r.min > best[k].r.min) best[k] = h }   /* a mid-season transfer: the bigger stint */
  /* the same caps as this season's board: no more lottery or first-round tags than a draft takes from college */
  const PROF = ["Lottery", "Round 1", "Round 2", "Fringe", "Undrafted"], CAP = [18, 36, 72, 140];
  const capped = (h, i) => { const c = CAP.findIndex(x => i < x), mine = PROF.indexOf(profileOf(h)); return PROF[Math.max(mine < 0 ? 4 : mine, c < 0 ? 4 : c)] };
  return Object.values(best).sort((a, b) => b.m - a.m).map((h, i) => { const r = h.r;
    return [r.id, r.nm, r.tm, h.d.p5, h.yr, (ht[r.id] || [])[0] || null, r.g, r.gs, r.min, r.pts, r.reb, r.orb, r.ast, r.stl, r.blk, r.tov, r.fgm, r.fga, r.tpm, r.tpa, r.ftm, r.fta,
      r1(r.usg), r1(r.ortg), r1(r.drtg), r1(r.porp), r3(r.ws40), grade(h.m), capped(h, i), r3(h.pD), r3(h.pR1), r3(h.pL)] });
}

export async function buildPast({ cb, getPack, putPack, log, S, off, full, hist, grade, profileOf, H, NCAA, curGames = [] }) {
  const last = off ? S : S - 1, first = Math.max(2012, last - 9);
  const [GH, TH] = await Promise.all([getPack("p2000_cbb-ghist").catch(() => null), getPack("p2000_cbb-teamhist").catch(() => null)]);
  const byS = {}; for (const h of hist) if (h.r.s >= first && h.r.s <= last) (byS[h.r.s] = byS[h.r.s] || []).push(h);
  let wrote = 0;
  for (let y = last; y >= first; y--) {
    const old = await getPack(`p${y}_cbb-past`).catch(() => null);
    if (!full && old && old.v === PAST_V && Date.now() - old.built < 7 * 864e5 && y < S) continue;
    if (!byS[y] || !byS[y].length) { log(`past ${y}: no player seasons`); continue }
    const polls = old && old.polls ? old.polls : apPolls(await cb("/rankings", { season: y }).catch(() => []));
    const games = y === S ? curGames : ((GH && GH.seasons && GH.seasons[y]) || []);   /* the cache holds finished seasons; this one comes from the run */
    const teams = pastTeams({ adj: H.adj[y] || {}, games, style: (TH && TH.seasons && TH.seasons[y]) || {}, ncaaRows: (NCAA && NCAA.seasons && NCAA.seasons[y]) || [], polls });
    const players = pastPlayers(byS[y], { grade, profileOf, ht: H.ht });
    await putPack(`p${y}_cbb-past`, { v: PAST_V, season: y, built: Date.now(), cols: PAST_COLS, players, teams, polls });
    wrote++;
  }
  log(`past seasons ${first}–${last}: ${wrote} written`);
  return { first, last };
}
