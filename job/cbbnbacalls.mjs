/* NBA calls by official (Oct 21 — Sam: "the players that they call the most fouls or turnover calls on (traveling, carry HA, etc) per game
   (not including out of bounds or things like that)" … "for sure for nba by player"). NBA.com's play-by-play names the official on every
   foul and violation (checked Oct 21 on game 0022600001: officialId on personal, shooting, offensive, loose-ball and take fouls, traveling,
   palming …). For every finished regular-season game of last season and this one the job reads the box score (for the crew's names and
   the final status) and the play-by-play once, and keeps, for each official and player who shared a floor, the games together and the calls
   by kind; and each player's calls from everyone. In p2000_cbb-nbacalls. At most CAP games a run, so last season fills over a few runs.
   Left out: bad passes, lost balls, out of bounds, shot clock and the turnover copy of an offensive foul. */
const H = { "User-Agent": "Mozilla/5.0 (mycbbbigboard.com data job)", "Referer": "https://www.nba.com/", "Origin": "https://www.nba.com" };
async function j(u) { for (let k = 0; k < 3; k++) { try { const r = await fetch(u, { headers: H }); if (r.ok) return await r.json(); if (r.status === 403 || r.status === 404) return null } catch (e) { } await new Promise(r => setTimeout(r, 1200 * (k + 1))) } return null }
/* call kinds: 0 shooting foul · 1 other personal foul (loose ball, take, flagrant, technical …) · 2 offensive foul · 3 violation (traveling, palming, double dribble, 3/5/8 seconds, backcourt, goaltending, kicked ball, lane …) */
const SKIP_TO = /bad pass|lost ball|out-of-bounds|out of bounds|offensive foul|shot clock|^$/i;
export function kindOf(a) {
  if (a.actionType === "foul") { const s = String(a.subType || "").toLowerCase(), d = String(a.descriptor || "").toLowerCase(); if (s === "offensive") return 2; if (/shooting/.test(d) || /shooting/.test(s)) return 0; return 1 }
  if (a.actionType === "violation") return 3;
  if (a.actionType === "turnover") { const s = String(a.subType || ""); return SKIP_TO.test(s) ? -1 : 3 }
  return -1 }

export async function buildNbaCalls({ getPack, putPack, log = console.log, curNba, CAP = 450 }) {
  let P = await getPack("p2000_cbb-nbacalls").catch(() => null);
  if (!P || P.v !== 1) P = { v: 1, kinds: ["shooting", "personal", "offensive", "violation"], done: {}, miss: {}, ofc: {}, pl: {}, by: {} };
  /* NBA seasons as NBA.com codes: 2025–26 → 225; curNba is the season's end year */
  const seasons = [curNba - 1, curNba].map(y => ({ y, code: "002" + String(y - 1).slice(2) }));
  let read = 0;
  for (const { y, code } of seasons) { let gap = 0;
    for (let n = 1; n <= 1230 && read < CAP && gap < 12; n++) { const gid = code + String(n).padStart(5, "0"); if (P.done[gid]) { gap = 0; continue }
      const bx = await j(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gid}.json`); if (!bx || !bx.game) { gap++; continue } gap = 0;
      if (bx.game.gameStatus !== 3) continue;   /* not final yet */
      const pb = await j(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${gid}.json`); read++; if (!pb || !pb.game) continue;
      const crew = (bx.game.officials || []).map(o => { P.ofc[o.personId] = o.name; return String(o.personId) });
      /* who played: everyone in the box score with minutes */
      const on = {}; for (const side of ["homeTeam", "awayTeam"]) { const T = bx.game[side] || {}; for (const p of T.players || []) { if (p.played === "1") { on[p.personId] = 1; const q = P.pl[p.personId] = P.pl[p.personId] || [p.nameI || p.name || "", T.teamTricode, 0, 0, 0, 0, 0]; q[0] = p.name || q[0]; q[1] = T.teamTricode; q[2]++ } } }
      const calls = {}; for (const a of pb.game.actions || []) { const k = kindOf(a); if (k < 0 || !a.personId || !a.officialId || !on[a.personId]) continue; const key = a.officialId + "|" + a.personId; (calls[key] = calls[key] || [0, 0, 0, 0])[k]++; P.pl[a.personId][3 + k]++ }
      for (const o of crew) { const B = P.by[o] = P.by[o] || {}; for (const pid of Object.keys(on)) { const c = calls[o + "|" + pid]; const e = B[pid] = B[pid] || [0, 0, 0, 0, 0]; e[0]++; if (c) for (let k = 0; k < 4; k++) e[1 + k] += c[k] } }
      P.done[gid] = y }
  }
  P.at = Date.now(); if (read) await putPack("p2000_cbb-nbacalls", P);
  log(`nba calls: read ${read} games · ${Object.keys(P.done).length} in all · ${Object.keys(P.by).length} officials`);
  return P;
}
