/* NBA season box scores and lineups from NBA.com (Oct 22 — Sam: "+- leaders", "best rotations on the team page … when those rotations
   are on the court together", "NBA award tracking"). For every finished regular-season game of this season: each player's box line (with
   +/- and whether he started) and, from the play-by-play, every five-man unit each team put on the floor — seconds together, points for and
   against, and when (each quarter split into its first and second six minutes, overtime, and clutch: last 5 minutes of the 4th or OT within
   5 points). Lineups at the start of the 2nd–4th quarters and OT aren't listed by NBA.com, so they're read from who acts first in the period
   without being subbed in. In p<S>_cbb-nbaszn. At most CAP games a run. */
const H = { "User-Agent": "Mozilla/5.0 (mycbbbigboard.com data job)", "Referer": "https://www.nba.com/", "Origin": "https://www.nba.com" };
async function j(u) { for (let k = 0; k < 3; k++) { try { const r = await fetch(u, { headers: H }); if (r.ok) return await r.json(); if (r.status === 403 || r.status === 404) return null } catch (e) { } await new Promise(r => setTimeout(r, 800 * (k + 1))) } return null }
const secOf = c => { const m = String(c || "").match(/PT(\d+)M([\d.]+)S/); return m ? +m[1] * 60 + +m[2] : 0 };
const BOXCOLS = ["gid", "team", "min", "pts", "reb", "oreb", "ast", "stl", "blk", "tov", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "pm", "start"];
const LUCOLS = ["secs", "pf", "pa", "q1a", "q1b", "q2a", "q2b", "q3a", "q3b", "q4a", "q4b", "ot", "clutch", "games"];
const NOT_ON = /technical|ejection/i;

/* the lineup segments of one game: [{team, five (sorted ids), secs, pf, pa, bucket secs[9], clutch secs}] */
export function lineupsOf(bx, pb) {
  const g = bx.game, home = g.homeTeam.teamTricode, away = g.awayTeam.teamTricode, A = (pb.game.actions || []).slice().sort((a, b) => a.actionNumber - b.actionNumber);
  const roster = {}; for (const [side, ab] of [["homeTeam", home], ["awayTeam", away]]) for (const p of g[side].players || []) roster[p.personId] = ab;
  const starters = { [home]: (g.homeTeam.players || []).filter(p => p.starter === "1").map(p => p.personId), [away]: (g.awayTeam.players || []).filter(p => p.starter === "1").map(p => p.personId) };
  const periods = [...new Set(A.map(a => a.period))].sort((a, b) => a - b), out = [], bad = [];
  let prevEnd = null, sH = 0, sA = 0;
  for (const per of periods) {
    const PA = A.filter(a => a.period === per), len = per <= 4 ? 720 : 300;
    /* who's on the floor to start the period */
    let on;
    /* Oct 22, second look (Sam: "there should be other ways to clean this out"): NBA.com lists the substitutions made between quarters
       (at 12:00 of the new quarter), so each quarter simply starts with the five who ended the last one. Reading the quarter's starters
       from who acted first was what lost minutes; carried over, every player's minutes match his box score on the games checked */
    if (per === 1 || !prevEnd) on = { [home]: new Set(starters[home]), [away]: new Set(starters[away]) };
    else on = { [home]: new Set(prevEnd[home]), [away]: new Set(prevEnd[away]) };
    /* safety net: play the period through; if a player who isn't on the floor by our
       count goes out or does something (a shot, a foul, a rebound) before any sub-in, he must have started the period — put him in the
       starting five in place of the starter seen latest, and play the period again (up to 8 times). stats.nba.com's official rotation would
       settle it outright, but it doesn't answer GitHub's runners (checked Oct 22) */
    const evid = {}; for (const a of PA) { const id = a.personId; if (!id || !roster[id] || evid[id] != null) continue; if (a.actionType === "substitution" && a.subType === "in") { evid[id] = -1; continue } if (NOT_ON.test(a.subType || "") || NOT_ON.test(a.actionType || "")) continue; evid[id] = secOf(a.clock) }
    let res = null;
    for (let tries = 0; tries < 8; tries++) {
      const cur = { [home]: new Set(on[home]), [away]: new Set(on[away]) }, segs = []; let h = sH, w = sA, last = len, conflict = null;
      const close = (tLeft) => { const d = last - tLeft; if (d <= 0) return;
        for (const t of [home, away]) { if (cur[t].size !== 5) continue; const k = [...cur[t]].sort((x, y) => x - y).join(","), seg = { team: t, five: k, secs: d, pf: 0, pa: 0, b: Array(9).fill(0), cl: 0 };
          if (per > 4) seg.b[8] = d; else { const a1 = Math.max(0, last - Math.max(tLeft, 360)), a2 = d - a1; seg.b[(per - 1) * 2] += a1; seg.b[(per - 1) * 2 + 1] += a2 }
          if (per >= 4 && Math.abs(h - w) <= 5) seg.cl = Math.max(0, Math.min(last, 300) - tLeft);
          segs.push(seg) } last = tLeft };
      const seenIn = new Set();
      for (const a of PA) { const tLeft = secOf(a.clock), id = a.personId, t = roster[id];
        if (a.actionType === "substitution") { close(tLeft); if (!t) continue;
          if (a.subType === "out") { if (!cur[t].has(id) && !seenIn.has(id) && !conflict) conflict = { t, id }; cur[t].delete(id) } else { seenIn.add(id); cur[t].add(id) } continue }
        if (t && id && !cur[t].has(id) && !seenIn.has(id) && !conflict && !NOT_ON.test(a.subType || "") && !NOT_ON.test(a.actionType || "")) conflict = { t, id };
        const pts = a.shotResult === "Made" ? (a.actionType === "3pt" ? 3 : a.actionType === "2pt" ? 2 : a.actionType === "freethrow" ? 1 : 0) : 0, st = a.teamTricode;
        if (pts && (st === home || st === away)) { close(tLeft); const dh = st === home ? pts : 0, da = st === away ? pts : 0; h += dh; w += da;
          for (const tt of [home, away]) { if (cur[tt].size !== 5) continue; const k = [...cur[tt]].sort((x, y) => x - y).join(","); segs.push({ team: tt, five: k, secs: 0, pf: tt === home ? dh : da, pa: tt === home ? da : dh, b: Array(9).fill(0), cl: 0 }) } } }
      close(0);
      res = { segs, h, w, end: cur };
      if (!conflict) break;
      /* repair the starting five and go again */
      const S = on[conflict.t]; S.add(conflict.id);
      if (S.size > 5) { const drop = [...S].filter(x => x !== conflict.id).sort((x, y) => (evid[x] ?? -2) - (evid[y] ?? -2))[0]; S.delete(drop) }
    }
    for (const t of [home, away]) if (on[t].size !== 5) bad.push(per + t + on[t].size);
    out.push(...res.segs); sH = res.h; sA = res.w; prevEnd = { [home]: new Set(res.end[home]), [away]: new Set(res.end[away]) }
  }
  return { out, bad };
}

/* the season's finished regular-season games from NBA.com's schedule file (Oct 22: game numbers aren't in date order — opening week's
   national games were 1–5 and the rest come later — so walking the numbers stopped early); null when the file can't be read */
export async function nbaFinalIds(code) { const S = await j("https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json"); if (!S || !S.leagueSchedule) return null;
  const out = []; for (const d of S.leagueSchedule.gameDates || []) for (const g of d.games || []) if (String(g.gameId).startsWith(code) && g.gameStatus === 3) out.push(String(g.gameId)); return out.length ? out.sort() : null }
export async function buildNbaSzn({ getPack, putPack, log = console.log, curNba, CAP = 400 }) {
  const S = curNba, name = `p${S}_cbb-nbaszn`;
  let P = await getPack(name).catch(() => null);
  if (!P || P.v !== 6 || P.season !== S) P = { v: 6, season: S, boxCols: BOXCOLS, luCols: LUCOLS, done: {}, g: {}, nm: {}, box: {}, lu: {}, bad: 0 };
  const code = "002" + String(S - 1).slice(2); let read = 0, gap = 0; const IDS = await nbaFinalIds(code);
  const ids = IDS || Array.from({ length: 1230 }, (_, i) => code + String(i + 1).padStart(5, "0"));
  for (const gid of ids) { if (read >= CAP || (!IDS && gap >= 12)) break; if (P.done[gid]) { gap = 0; continue }
    const bx = await j(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gid}.json`); if (!bx || !bx.game) { gap++; continue } gap = 0;
    if (bx.game.gameStatus !== 3) continue;
    const pb = await j(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${gid}.json`); read++; if (!pb || !pb.game) continue;
    const g = bx.game, home = g.homeTeam.teamTricode, away = g.awayTeam.teamTricode;
    P.g[gid] = [String(g.gameEt || g.gameTimeUTC || "").slice(0, 10), home, away, +g.homeTeam.score, +g.awayTeam.score, g.period > 4 ? g.period - 4 : 0];
    for (const [side, t] of [["homeTeam", home], ["awayTeam", away]]) for (const p of g[side].players || []) { if (p.played !== "1") continue; const s = p.statistics || {};
      P.nm[p.personId] = [p.name, t, p.position || ""];
      (P.box[p.personId] = P.box[p.personId] || []).push([gid, t, Math.round(secOf(s.minutes) / 6) / 10, s.points | 0, s.reboundsTotal | 0, s.reboundsOffensive | 0, s.assists | 0, s.steals | 0, s.blocks | 0, s.turnovers | 0, s.fieldGoalsMade | 0, s.fieldGoalsAttempted | 0, s.threePointersMade | 0, s.threePointersAttempted | 0, s.freeThrowsMade | 0, s.freeThrowsAttempted | 0, s.plusMinusPoints | 0, p.starter === "1" ? 1 : 0]) }
    try { const { out, bad } = lineupsOf(bx, pb); if (bad.length) P.bad++;
      /* check: each team's units should add up to the game's length and its final score */
      const len = 2880 + 300 * Math.max(0, g.period - 4); for (const [t, sc] of [[home, +g.homeTeam.score], [away, +g.awayTeam.score]]) { const U = out.filter(x => x.team === t), ss = U.reduce((a, x) => a + x.secs, 0), pf = U.reduce((a, x) => a + x.pf, 0);
        /* and each player's seconds should match his box-score minutes */
        { const sec = {}; for (const x of U) for (const id of x.five.split(",")) sec[id] = (sec[id] || 0) + x.secs; for (const p of g[t === home ? "homeTeam" : "awayTeam"].players || []) { if (p.played !== "1") continue; P.pChk = (P.pChk || 0) + 1; if (Math.abs((sec[p.personId] || 0) - secOf((p.statistics || {}).minutes)) > 30) P.pOff = (P.pOff || 0) + 1 } }
        if (Math.abs(ss - len) > 2 || pf !== sc) { P.off = (P.off || 0) + 1; if ((P.offEx || []).length < 5) (P.offEx = P.offEx || []).push([gid, t, Math.round(ss), len, pf, sc, bad.join(" ")]) } }
      const inGame = new Set();
      for (const s of out) { const T = P.lu[s.team] = P.lu[s.team] || {}; const e = T[s.five] = T[s.five] || Array(LUCOLS.length).fill(0);
        e[0] += s.secs; e[1] += s.pf; e[2] += s.pa; for (let i = 0; i < 9; i++) e[3 + i] += s.b[i]; e[12] += s.cl; const gk = s.team + s.five; if (!inGame.has(gk) && s.secs > 0) { inGame.add(gk); e[13]++ } }
    } catch (e) { P.bad++ }
    P.done[gid] = 1 }
  if (lineupsOf.dbg) P.dbg = lineupsOf.dbg;
  P.at = Date.now(); if (read) await putPack(name, P);
  log(`nba season: read ${read} games · ${Object.keys(P.done).length} in all · ${Object.keys(P.box).length} players · lineup gaps in ${P.bad} games`);
  return P;
}
