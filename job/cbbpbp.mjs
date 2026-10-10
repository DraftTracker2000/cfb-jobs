/* The basketball play-by-play engine (Oct 9 — Sam: "basketball with the depth charts and minutes alone should be able to be much more
   in-depth than the college football side … give me clutch stats for the point guards. close game and comeback numbers").

   Every CBBD play lists the ten players on the floor, the score, the clock and the home team's win probability after the play. One pass
   over a season's plays (one call per day, up to ~80 MB) gives, for every player:
     minutes · plus-minus and on/off (team scoring margin per 40 with him on vs off) · the clutch line (last 5 minutes of the second
     half or overtime, within 5 points: minutes, +/-, points, shooting, free throws, assists, turnovers, steals, rebounds) · late-game
     go-ahead makes and attempts while down 0–3 in the last 2 minutes · game-winners · win probability added (all game and clutch) ·
     first-half / second-half points · who he assists and who assists him
   and for every team:
     every game's arc (largest lead, largest deficit, halftime margin, lead changes, best run for and against) → comeback wins, blown
     leads, close-game and clutch records · clutch +/- · every five-man unit's minutes and margin · each player's minutes share
   Shot zones come from the same pass. Everything is a sum, so an in-season run only reads the new days and adds them in.

   Pack: p{S}_cbb-pbp (plus the season's p{S}_cbb-shots, written alongside). */

export const PBP_V = 12;   /* 2: player names and teams kept · 3: win probability while on the floor · 4: on-court shares, competition and teammates (Oct 9) · 5: full-period minutes, misses charged, true go-ahead tries (Oct 10 audit) · 6: blocked misses charged too (Oct 10, second audit) · 7: play value = points above an average shot, weighted by the moment · 8: defense on/off and opponents' shots by zone while on the floor · 9: inferred matchups and a zone clue · 10: zone clue from links off the size matchup · 11: possession context (transition, putbacks, shot clock), fatigue, blocks and assists by range, foul trouble, timeouts · 12: rotation patterns, who subs for whom, real game length */
const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
const PERIOD = p => p <= 2 ? 1200 : 300;
const elapsedAt = (period, secLeft) => { let t = 0; for (let p = 1; p < period; p++) t += PERIOD(p); return t + PERIOD(period) - secLeft };
const TOV = /Turnover/i, REB = /Rebound/i, FOUL = /Foul/i;
const blankP = () => ({ min: 0, gp: 0, pm: 0, onF: 0, onA: 0, teamMin: 0, teamF: 0, teamA: 0,
  c: { min: 0, pm: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, ast: 0, tov: 0, stl: 0, reb: 0, g: 0 },
  late: { gam: 0, ga: 0, gw: 0 }, wpa: 0, cwpa: 0, fwpa: 0, cfwpa: 0,
  /* his own events, his team's and the opponent's while he's on the floor (Oct 9 — Sam: "all this data when compared to the other players
     on the court with them"), and minutes against each opponent */
  own: blankE(), onT: blankE(), onO: blankE(), vs: {}, mu: {},
  /* possession context (v11): his shots by phase [transition, putback, early clock, half court, late clock] as [fga, fgm, pts]; by
     minutes into his stint [0–4, 4–8, 8+] as [fga, fgm]; his blocks and the baskets he assisted by range [rim, mid, three]; points
     allowed by phase while he was on the floor; first-half foul trouble [games, his seconds on after the 2nd foul, window seconds,
     team margin over the window] */
  ph: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], st: [[0, 0], [0, 0], [0, 0]], rot: [0, 0, 0, 0, 0, 0], subBy: {}, blkR: [0, 0, 0], azR: [0, 0, 0], dph: [0, 0, 0, 0, 0], ft2: [0, 0, 0, 0], h1: 0, h2: 0, ast: {}, fed: {} });
const blankT = () => ({ games: [], c: { pm: 0, min: 0 }, units: {}, mins: {}, pairs: {}, dE: blankE(), wall: [0, 0], ph: { o: [0, 0, 0, 0, 0], d: [0, 0, 0, 0, 0] }, pot: [0, 0], sc: [0, 0], to: [0, 0], ftw: [0, 0] });
const blankE = () => ({ pts: 0, fgm: 0, fga: 0, fga2: 0, tpa: 0, tpm: 0, ftm: 0, fta: 0, tov: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, pf: 0 });
const OREB = /Offensive Rebound/i, DREB = /Defensive Rebound/i;
/* one event into a counter (shots: made/attempts, free throws, turnovers, rebounds, assists, steals, blocks) */
function countEvent(E, p, ownOnly) {
  const si = p.shotInfo, pt = p.playType || "";
  if (si && (p.shootingPlay || si.range)) { const made = si.made ? 1 : 0, ft = si.range === "free_throw" || /FreeThrow/.test(pt);
    if (ft) { E.fta++; E.ftm += made; E.pts += made } else { E.fga++; E.fgm += made; if (si.range === "three_pointer") { E.tpa++; E.tpm += made; E.pts += 3 * made } else { E.fga2++; E.pts += 2 * made } if (!ownOnly && made && si.assisted) E.ast++ } return }
  if (TOV.test(pt)) E.tov++; else if (OREB.test(pt)) E.oreb++; else if (DREB.test(pt)) E.dreb++; else if (pt === "Steal") E.stl++; else if (/Block/i.test(pt)) E.blk++; else if (FOUL.test(pt) && !/Technical|Offensive/i.test(pt)) E.pf++;
}


/* ---- who guarded whom (Oct 10 — Sam: "you can match up size for size … who is stealing from who, who is committing fouls on who …
   you can start to nail down who is guarding who"). CBBD never says, so it's inferred, game by game:
   1. Links: a steal is paired with the other team's turnover in the same second (stealer took it from that player); a block with the
      missed shot it stopped; a foul with the free throws or the shot that follows it in the same second (fouler → shooter), or with
      an offensive rebound (weaker).
   2. Every stretch of the same ten players: each defender is matched to one attacker, choosing the five pairs that best fit size and
      position (height, PG…C) and the game's links (a guard who fouls and steals from the same guard all night is on him).
   Each of the attacker's shots, points and turnovers in that stretch then count against his matched defender. */
const POSI = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };
const PERMS5 = (() => { const out = []; const go = (a, rest) => { if (!rest.length) return out.push(a); rest.forEach((x, i) => go([...a, x], rest.filter((_, j) => j !== i))) }; go([], [0, 1, 2, 3, 4]); return out })();
export function gameLinks(plays, sideOf) {
  const L = [], n = plays.length, same = (a, b) => a.period === b.period && a.secondsRemaining === b.secondsRemaining;
  const actor = p => ((p.participants || [])[0] || {}).id ?? null, shooter = p => p.shotInfo && p.shotInfo.shooter ? p.shotInfo.shooter.id : null;
  for (let i = 0; i < n; i++) { const p = plays[i], pt = p.playType || "", ds = sideOf(p.teamId); if (!ds) continue; const d = actor(p); if (d == null) continue;
    const near = []; for (let j = Math.max(0, i - 4); j < Math.min(n, i + 6); j++) if (j !== i && same(plays[j], p) && sideOf(plays[j].teamId) && sideOf(plays[j].teamId) !== ds) near.push([j, plays[j]]);
    if (pt === "Steal") { const t = near.find(([, q]) => TOV.test(q.playType || "")); if (t && actor(t[1]) != null) L.push([d, actor(t[1]), 2, 0, ds, i]) }
    else if (/Block/i.test(pt)) { const t = near.find(([, q]) => q.shotInfo && !q.shotInfo.made && shooter(q) != null); if (t) L.push([d, shooter(t[1]), 1.2, 1, ds, i]) }
    else if (FOUL.test(pt) && !/Technical|Offensive/i.test(pt)) {
      const ft = near.find(([j, q]) => j > i && /FreeThrow/.test(q.playType || "") && shooter(q) != null), sh = near.find(([j, q]) => j < i && q.shotInfo && q.shotInfo.range !== "free_throw" && shooter(q) != null), rb = near.find(([j, q]) => j < i && OREB.test(q.playType || "") && actor(q) != null);
      if (ft) L.push([d, shooter(ft[1]), 2, 2, ds, i]); else if (sh) L.push([d, shooter(sh[1]), 2, 2, ds, i]); else if (rb) L.push([d, actor(rb[1]), .7, 2, ds, i]) } }
  return L;
}
export function assignFor(D, A, E, size) {
  const sz = id => size && size[id], cost = (d, a) => { const x = sz(d), y = sz(a); let c = x && y ? Math.abs(x[1] - y[1]) + (x[0] && y[0] ? Math.abs(x[0] - y[0]) / 3 : .7) : 1.5; return c - 1.5 * Math.min(4, E[d + "|" + a] || 0) };
  const C = D.map(d => A.map(a => cost(d, a))); let best = null, bc = 1e9;
  for (const pm of PERMS5) { let c = 0; for (let k = 0; k < 5; k++) c += C[k][pm[k]]; if (c < bc) { bc = c; best = pm } }
  const m = {}; D.forEach((d, k) => m[A[best[k]]] = d); return m;   /* attacker → defender */
}

/* one game's plays → the accumulators */
export function processGame(plays, P, T, opts = {}) {
  plays = plays.slice().sort((a, b) => a.period - b.period || b.secondsRemaining - a.secondsRemaining || a.id - b.id);
  const first = plays.find(p => p.teamId != null && p.isHomeTeam != null); if (!first) return null;
  if (!plays.some(p => (p.homeScore || 0) + (p.awayScore || 0) > 0)) return null;   /* an empty game: nothing counted, so nothing to undo */
  const home = first.isHomeTeam ? first.teamId : first.opponentId, away = first.isHomeTeam ? first.opponentId : first.teamId;
  const nameOf = {}; for (const p of plays) { if (p.teamId != null && p.team) nameOf[p.team] = p.teamId; if (p.opponentId != null && p.opponent) nameOf[p.opponent] = p.opponentId }
  const side = id => id === home ? "h" : id === away ? "a" : null;
  const tm = id => T[id] = T[id] || blankT();
  const pl = id => P[id] = P[id] || blankP();
  const seen = new Set();
  let hs = 0, as = 0, maxH = 0, minH = 0, half = null, leadCh = 0, lastLead = 0, runTeam = null, run = 0, bestRun = { h: 0, a: 0 }, lastWP = null, goAheadLast = null, lev = .01;   /* a point early in a game moves the chance about 1% */
  const unitsOn = { h: null, a: null };
  /* possession context: who has the ball, since when (game seconds), and how they got it */
  let pos = { s: null, el: 0, kind: "start", per: 0 }; let startersSet = false, prevFloor = { h: [], a: [] }; const stintIn = {}, offAt = {}, starters = new Set(), firstOut = new Set(), pf1 = {}, trouble = {}, tos = [];
  /* real time: the wallclock on the first and last plays */
  { const w0 = Date.parse(plays[0].wallclock || ""), w1 = Date.parse(plays[plays.length - 1].wallclock || ""); if (w0 && w1 && w1 > w0 && w1 - w0 < 5 * 3600e3) for (const t of [home, away]) { tm(t).wall[0]++; tm(t).wall[1] += (w1 - w0) / 60000 } }
  const RI = r => r === "rim" ? 0 : r === "three_pointer" ? 2 : 1;
  /* matchups: the game's links first, then a matched defender for each attacker in every stretch */
  const links = gameLinks(plays, id => side(id)), E = {}; for (const [d, a, w] of links) E[d + "|" + a] = (E[d + "|" + a] || 0) + w;
  for (const [d, a, , k] of links) { const M = (pl(d).mu[a] = pl(d).mu[a] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); M[8 + k]++ }
  const linkAt = {}; for (const l of links) (linkAt[l[5]] = linkAt[l[5]] || []).push(l); const zm = { h: [0, 0], a: [0, 0] };
  const amemo = {}, assign = (D, A) => { const k = D.join(",") + "/" + A.join(","); return amemo[k] || (amemo[k] = assignFor(D, A, E, opts.size)) };
  /* zone or man, a clue: in man-to-man a defender's links keep landing on the same player; in a zone they spread over whoever comes to his area */
  for (const s of ["h", "a"]) { const tid = s === "h" ? home : away, by = {}; for (const [d, a, , , ds] of links) if (ds === s) (by[d] = by[d] || []).push(a);
    let n = 0, spread = 0; for (const arr of Object.values(by)) if (arr.length >= 2) { n += arr.length; spread += (new Set(arr).size - 1) / (arr.length - 1) * arr.length }
    if (n >= 4) (tm(tid).zone = tm(tid).zone || []).push([n, Math.round(100 * spread / n) / 100]) }
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i], nx = plays[i + 1];
    const floor = { h: [], a: [] };
    for (const f of p.onFloor || []) { const t = nameOf[f.team]; const s = side(t); if (s && f.id != null) { floor[s].push(f.id); if (i === 0 || !P[f.id] || !P[f.id].nm) pl(f.id).nm = f.name } }
    /* events: the actor's own counter, and both teams' counters for everyone on the floor */
    if (p.teamId != null) { const es = side(p.teamId);
      if (es) { const os = es === "h" ? "a" : "h";
        for (const id of floor[es]) countEvent(pl(id).onT, p); for (const id of floor[os]) countEvent(pl(id).onO, p);
        countEvent(tm(es === "h" ? away : home).dE, p);   /* what each defense allowed, all game: on-floor minus this = off-floor */
        const si = p.shotInfo, actorId = si && si.shooter && si.shooter.id != null ? si.shooter.id : ((p.participants || [])[0] || {}).id;
        if (actorId != null) countEvent(pl(actorId).own, p, true);
        if (si && si.made && si.assisted && si.assistedBy && si.assistedBy.id != null) pl(si.assistedBy.id).own.ast++ } }
    const marginH = hs - as;                                                        /* before this play */
    const clutchNow = p.period >= 2 && p.secondsRemaining <= 300 && Math.abs(marginH) <= 5;
    /* time until the next play: credited to whoever is on the floor now */
    let dt = nx && nx.period === p.period ? Math.max(0, p.secondsRemaining - nx.secondsRemaining) : Math.max(0, p.secondsRemaining || 0);
    const pv = plays[i - 1]; if (!pv || pv.period !== p.period) dt += Math.max(0, PERIOD(p.period) - (p.secondsRemaining || 0));
    if (floor.h.length === 5 && floor.a.length === 5) {
      const am = { h: assign(floor.h, floor.a), a: assign(floor.a, floor.h) };   /* home defenders on away attackers, and the reverse */
      const as_ = p.teamId != null ? side(p.teamId) : null, ds_ = as_ === "h" ? "a" : as_ === "a" ? "h" : null;
      /* zone clue: does each link land on the man his size says he'd guard? (man-to-man: mostly yes; zone: often not) */
      for (const [d, a, , k, lds] of linkAt[i] || []) { const so = assignFor(floor[lds], floor[lds === "h" ? "a" : "h"], {}, opts.size); if (so[a] == null) continue; zm[lds][1]++; if (so[a] === d) zm[lds][0]++;
        /* a check on the method, published in the pack: how often each kind of link lands on the size match, and how many of the ten had a size */
        const DG = opts.diag; if (DG) { DG.k[k][1]++; if (so[a] === d) DG.k[k][0]++; DG.sized[1] += 10; DG.sized[0] += [...floor.h, ...floor.a].filter(x => opts.size && opts.size[x]).length } }
      const ev = (a, f) => { const d = ds_ && am[ds_][a]; if (d == null) return; const M = (pl(d).mu[a] = pl(d).mu[a] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); f(M) };
      if (ds_) { const si = p.shotInfo;
        if (si && si.shooter && si.shooter.id != null) { const ft = si.range === "free_throw" || /FreeThrow/.test(p.playType || ""), three = si.range === "three_pointer", made = si.made ? 1 : 0;
          ev(si.shooter.id, M => { if (ft) { M[6]++; M[1] += made } else { M[2]++; M[3] += made; M[1] += made * (three ? 3 : 2); if (three) { M[4]++; M[5] += made } } }) }
        else if (TOV.test(p.playType || "")) { const a = ((p.participants || [])[0] || {}).id; if (a != null) ev(a, M => M[7]++) } }
      if (dt > 0) for (const s of ["h", "a"]) for (const [a, d] of Object.entries(am[s])) { const M = (pl(d).mu[a] = pl(d).mu[a] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); M[0] += dt }
    }
    if (dt > 0 && floor.h.length === 5 && floor.a.length === 5) {
      for (const s of ["h", "a"]) { const tid = s === "h" ? home : away, X = tm(tid); X._sec = (X._sec || 0) + dt; if (clutchNow) X.c.min += dt / 60;
        const opp = s === "h" ? away : home;
        for (const id of floor[s]) { const Q = pl(id); Q.min += dt / 60; seen.add(id); Q._team = tid; X.mins[id] = (X.mins[id] || 0) + dt / 60; if (clutchNow) Q.c.min += dt / 60; Q.vs[opp] = (Q.vs[opp] || 0) + dt / 60 }
        for (let x = 0; x < 5; x++) for (let y = x + 1; y < 5; y++) { const a = floor[s][x], b = floor[s][y], k = a < b ? a + "|" + b : b + "|" + a; X.pairs[k] = (X.pairs[k] || 0) + dt / 60 }
        const key = floor[s].slice().sort((x, y) => x - y).join("-"); const U = X.units[key] = X.units[key] || [0, 0, 0]; U[0] += dt / 60 }
    }
    /* scoring: the score after this play vs before */
    const nh = p.homeScore ?? hs, na = p.awayScore ?? as, dh = nh - hs, da = na - as;
    if (dh > 0 || da > 0) {
      for (const s of ["h", "a"]) { const mine = s === "h" ? dh - da : da - dh; const tid = s === "h" ? home : away, X = tm(tid);
        for (const id of floor[s]) { const Q = pl(id); Q.pm += mine; Q.onF += s === "h" ? dh : da; Q.onA += s === "h" ? da : dh; if (clutchNow) Q.c.pm += mine }
        if (clutchNow) X.c.pm += mine;
        if (floor[s].length === 5) { const key = floor[s].slice().sort((x, y) => x - y).join("-"); const U = X.units[key] = X.units[key] || [0, 0, 0]; U[1] += s === "h" ? dh : da; U[2] += s === "h" ? da : dh }
        if (floor.h.length === 5 && floor.a.length === 5) { X._f = (X._f || 0) + (s === "h" ? dh : da); X._a = (X._a || 0) + (s === "h" ? da : dh) } }
      /* runs */
      const scorer = dh > 0 ? "h" : "a", pts = dh > 0 ? dh : da;
      if (runTeam === scorer) run += pts; else { runTeam = scorer; run = pts } if (run > bestRun[scorer]) bestRun[scorer] = run;
    }
    /* the actor's own line */
    const actor = (p.participants || [])[0], aid = actor && actor.id, atid = p.teamId, aside = side(atid);
    const si = p.shotInfo;
    if (si && si.shooter && si.shooter.id != null) {
      const Q = pl(si.shooter.id), made = si.made ? 1 : 0, ft = si.range === "free_throw" || /FreeThrow/.test(p.playType || ""), three = si.range === "three_pointer";
      const val = made ? (ft ? 1 : three ? 3 : 2) : 0;
      if (made) { if (p.period <= 1) Q.h1 += val; else Q.h2 += val }
      if (clutchNow) { if (ft) { Q.c.fta++; Q.c.ftm += made } else { Q.c.fga++; Q.c.fgm += made; if (three) { Q.c.tpa++; Q.c.tpm += made } } Q.c.pts += val }
      if (made && si.assisted && si.assistedBy && si.assistedBy.id != null) { const A = pl(si.assistedBy.id); A.ast[si.shooter.id] = (A.ast[si.shooter.id] || 0) + 1; Q.fed[si.assistedBy.id] = (Q.fed[si.assistedBy.id] || 0) + 1; if (clutchNow) A.c.ast++ }
      /* late: last 2 minutes of the second half or overtime, a shot (or free throw) that would tie or take the lead if it went in */
      if (p.period >= 2 && p.secondsRemaining <= 120 && aside) { const myM = aside === "h" ? marginH : -marginH;
        if (myM <= 0 && (ft ? 1 : three ? 3 : 2) >= -myM) { Q.late.ga++;   /* a try that could tie or take the lead */ const after = aside === "h" ? (nh - na) : (na - nh); if (made && after > 0) { Q.late.gam++; goAheadLast = { id: si.shooter.id, team: atid, period: p.period, sec: p.secondsRemaining } } } }
    } else if (aid != null && aside) {
      const Q = pl(aid), pt = p.playType || "";
      if (clutchNow) { if (TOV.test(pt)) Q.c.tov++; else if (pt === "Steal") Q.c.stl++; else if (REB.test(pt) && !/Dead Ball/.test(pt)) Q.c.reb++ }
    }
    /* play value: points above an average shot, weighted by how much a point is worth to the win chance right now (Oct 10 — CBBD's
       win probability moves only when the score does, so crediting raw swings made every shooter positive and charged misses
       nothing). Each make or miss counts its points minus what an average shot of that kind scores (rim 1.2, mid-range 0.76,
       three 1.02, free throw 0.72); a turnover costs an average possession (1.0). The weight is the win-chance change per point
       on this game's most recent basket, so late, close moments count most. */
    const wp = p.homeWinProbability;
    if (wp != null && lastWP != null && (nh - hs) + (na - as) > 0 && wp !== lastWP) lev = Math.abs(wp - lastWP) / ((nh - hs) + (na - as));
    if (aside && lev != null) {
      if (si && si.shooter && si.shooter.id != null) { const ft = si.range === "free_throw" || /FreeThrow/.test(p.playType || ""), three = si.range === "three_pointer";
        const exp = ft ? .72 : three ? 1.02 : si.range === "rim" ? 1.2 : .76, got = si.made ? (ft ? 1 : three ? 3 : 2) : 0, v = lev * (got - exp);
        const Q = pl(si.shooter.id); Q.wpa += v; if (clutchNow) Q.cwpa += v }
      else if (aid != null && TOV.test(p.playType || "")) { const Q = pl(aid); Q.wpa -= lev; if (clutchNow) Q.cwpa -= lev } }
    /* …and the same change to everyone on the floor (zero-sum: one side's gain is the other's loss) */
    if (wp != null && lastWP != null && wp !== lastWP) { const d = wp - lastWP; for (const id of floor.h) { const Q = pl(id); Q.fwpa += d; if (clutchNow) Q.cfwpa += d } for (const id of floor.a) { const Q = pl(id); Q.fwpa -= d; if (clutchNow) Q.cfwpa -= d } }
    if (wp != null) lastWP = wp;
    /* ---- possession context (v11) ---- */
    { const el = elapsedAt(p.period, p.secondsRemaining || 0), pt = p.playType || "", xs = p.teamId != null ? side(p.teamId) : null, oth = x => x === "h" ? "a" : "h";
      if (pos.per !== p.period) { const endEl = elapsedAt(p.period, PERIOD(p.period)); for (const k in stintIn) { const R = pl(k).rot; R[0]++; R[1] += Math.max(0, endEl - stintIn[k]); delete stintIn[k] } for (const k in offAt) delete offAt[k]; pos = { s: null, el: endEl, kind: "start", per: p.period } }
      if (floor.h.length === 5 && floor.a.length === 5) { const on = new Set([...floor.h, ...floor.a]), came = [], went = [];
        for (const id of on) if (stintIn[id] == null) { stintIn[id] = el; came.push(id); if (offAt[id] != null) { const R = pl(id).rot; R[2]++; R[3] += el - offAt[id]; delete offAt[id] } if (p.period === 1 && !startersSet) starters.add(id) }
        for (const k in stintIn) if (!on.has(+k)) { const R = pl(k).rot; R[0]++; R[1] += Math.max(0, el - stintIn[k]); delete stintIn[k]; offAt[k] = el; went.push(+k); if (p.period === 1 && starters.has(+k) && !firstOut.has(+k)) { firstOut.add(+k); R[4] += el; R[5]++ } }
        /* one out, one in on the same team: he came on for him */
        for (const sd of ["h", "a"]) { const w = went.filter(x => prevFloor[sd].includes(x)), c = came.filter(x => floor[sd].includes(x)); if (w.length === 1 && c.length === 1) { const B = pl(w[0]).subBy; B[c[0]] = (B[c[0]] || 0) + 1 } }
        if (p.period === 1) startersSet = true; prevFloor = { h: floor.h.slice(), a: floor.a.slice() } }
      const ptsH = nh - hs, ptsA = na - as;
      const si = p.shotInfo, isFT = si && (si.range === "free_throw" || /FreeThrow/.test(pt));
      /* the phase this play's points and shot belong to */
      let ph = 3; if (xs && pos.s === xs) { const since = el - pos.el; if (pos.kind === "oreb" && since <= 4) ph = 1; else if ((pos.kind === "tov" || pos.kind === "dreb") && since <= 8) ph = 0; else if ((pos.kind === "oreb" ? 20 : 30) - since <= 5) ph = 4; else if (since <= 10) ph = 2 }
      if (xs && (ptsH > 0 || ptsA > 0)) { const pts = xs === "h" ? ptsH : ptsA, tid = xs === "h" ? home : away, oid = xs === "h" ? away : home;
        if (pts > 0) { tm(tid).ph.o[ph] += pts; tm(oid).ph.d[ph] += pts; for (const id of floor[oth(xs)]) pl(id).dph[ph] += pts;
          if (pos.s === xs && pos.kind === "tov") { tm(tid).pot[0] += pts; tm(oid).pot[1] += pts } if (pos.s === xs && pos.kind === "oreb") { tm(tid).sc[0] += pts; tm(oid).sc[1] += pts } } }
      if (si && si.shooter && si.shooter.id != null && !isFT && xs) { const Q = pl(si.shooter.id), made = si.made ? 1 : 0, v = made ? (si.range === "three_pointer" ? 3 : 2) : 0;
        Q.ph[ph][0]++; Q.ph[ph][1] += made; Q.ph[ph][2] += v;
        const sIn = stintIn[si.shooter.id]; if (sIn != null) { const b = el - sIn < 240 ? 0 : el - sIn < 480 ? 1 : 2; Q.st[b][0]++; Q.st[b][1] += made }
        if (made && si.assisted && si.assistedBy && si.assistedBy.id != null) pl(si.assistedBy.id).azR[RI(si.range)]++ }
      if (/Block/i.test(pt) && xs) { const b = ((p.participants || [])[0] || {}).id; if (b != null) for (let j = Math.max(0, i - 3); j < Math.min(plays.length, i + 4); j++) { const q = plays[j]; if (j !== i && q.period === p.period && q.secondsRemaining === p.secondsRemaining && q.shotInfo && !q.shotInfo.made && side(q.teamId) && side(q.teamId) !== xs) { pl(b).blkR[RI(q.shotInfo.range)]++; break } } }
      /* first-half foul trouble: a player's 2nd foul before halftime opens a window that runs to the half */
      if (p.period === 1 && FOUL.test(pt) && !/Technical|Offensive/i.test(pt) && xs) { const f = ((p.participants || [])[0] || {}).id; if (f != null) { pf1[f] = (pf1[f] || 0) + 1; if (pf1[f] === 2) trouble[f] = { s: xs, m: xs === "h" ? nh - na : na - nh } } }
      if (p.period === 1 && dt > 0) for (const [f, T0] of Object.entries(trouble)) { const Q = pl(f); Q.ft2[2] += dt; if (floor[T0.s].includes(+f)) Q.ft2[1] += dt }
      /* timeouts: the team's margin over the next two minutes of game time */
      if (/TimeOut/i.test(pt) && !/Official/i.test(pt) && xs) tos.push({ s: xs, el, m: xs === "h" ? nh - na : na - nh, done: false });
      for (const t of tos) if (!t.done && (el - t.el >= 120 || p.period !== plays[Math.max(0, i - 1)].period)) { t.done = true; const X = tm(t.s === "h" ? home : away); X.to[0]++; X.to[1] += (t.s === "h" ? nh - na : na - nh) - t.m }
      /* the next possession */
      if (xs) { if (si && !isFT && si.made) pos = { s: oth(xs), el, kind: "make", per: p.period };
        else if (isFT && si.made) pos = { s: oth(xs), el, kind: "make", per: p.period };
        else if (DREB.test(pt)) pos = { s: xs, el, kind: "dreb", per: p.period };
        else if (OREB.test(pt)) pos = { s: xs, el, kind: "oreb", per: p.period };
        else if (TOV.test(pt)) pos = { s: oth(xs), el, kind: "tov", per: p.period } } }
    /* the game's arc */
    hs = nh; as = na; const m = hs - as; if (m > maxH) maxH = m; if (m < minH) minH = m;
    const lead = Math.sign(m); if (lead !== 0 && lastLead !== 0 && lead !== lastLead) leadCh++; if (lead !== 0) lastLead = lead;
    if (half == null && p.period >= 2) half = plays[i - 1] ? (plays[i - 1].homeScore ?? 0) - (plays[i - 1].awayScore ?? 0) : 0;
  }
  { const h1 = plays.filter(p => p.period === 1).pop(); if (h1) for (const [f, T0] of Object.entries(trouble)) { const Q = pl(f); Q.ft2[0]++; Q.ft2[3] += (T0.s === "h" ? (h1.homeScore ?? 0) - (h1.awayScore ?? 0) : (h1.awayScore ?? 0) - (h1.homeScore ?? 0)) - T0.m; const X = tm(T0.s === "h" ? home : away); } }
  for (const s of ["h", "a"]) if (zm[s][1] >= 4) (tm(s === "h" ? home : away).zm = tm(s === "h" ? home : away).zm || [0, 0]).forEach((_, k, arr) => arr[k] += zm[s][k]);
  if (hs === 0 && as === 0) return null;
  const won = hs > as ? "h" : "a";
  /* game-winner: the last go-ahead make, in the last minute, by the winning side */
  if (goAheadLast && goAheadLast.sec <= 60 && side(goAheadLast.team) === won) pl(goAheadLast.id).late.gw++;
  const ot = plays.some(p => p.period > 2);
  for (const s of ["h", "a"]) {
    const tid = s === "h" ? home : away, X = tm(tid), sign = s === "h" ? 1 : -1;
    const myMax = s === "h" ? maxH : -minH, myMin = s === "h" ? minH : -maxH, final = sign * (hs - as), halfM = half == null ? null : sign * half;
    const clutchGame = plays.some(p => p.period >= 2 && p.secondsRemaining <= 300 && Math.abs((p.homeScore ?? 0) - (p.awayScore ?? 0)) <= 5);
    X.games.push([opts.gid ?? plays[0].gameId, (plays[0].gameStartDate || "").slice(0, 10), s === "h" ? away : home, final, myMax, -myMin, halfM, leadCh, bestRun[s], bestRun[s === "h" ? "a" : "h"], ot ? 1 : 0, clutchGame ? 1 : 0]);
    /* team minutes and margin, for each player's off-court numbers */
    const sec = X._sec || 0, F = X._f || 0, A = X._a || 0; X._sec = 0; X._f = 0; X._a = 0;
    for (const id of seen) { const Q = P[id]; if (!Q || Q._team !== tid) continue; Q.gp++; Q.teamMin += sec / 60; Q.teamF += F; Q.teamA += A; if (clutchGame) Q.c.g++ }
  }
  return { home, away, hs, as };
}

/* turn the sums into what the page shows */
export function finishPbp(P, T, ctx = {}) {
  const adjNet = ctx.adjNet || {}, rating = ctx.rating || {};
  /* teammates: minutes shared with each, from the team's pair counts */
  const mates = {}; for (const X of Object.values(T)) for (const [k, m] of Object.entries(X.pairs || {})) { const [a, b] = k.split("|"); (mates[a] = mates[a] || []).push([b, m]); (mates[b] = mates[b] || []).push([a, m]) }
  const players = {};
  for (const [id, Q] of Object.entries(P)) {
    if (Q.min < 20) continue;
    const offMin = Math.max(0, Q.teamMin - Q.min), offF = Q.teamF - Q.onF, offA = Q.teamA - Q.onA;
    const on40 = Q.min ? (Q.onF - Q.onA) / Q.min * 40 : null, off40 = offMin >= 20 ? (offF - offA) / offMin * 40 : null;
    const topN = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [+k, v]);
    const o = Q.own, t = Q.onT, x = Q.onO, sh = (a, b) => b > 0 ? Math.round(1000 * a / b) / 1000 : null;
    const qoc = (() => { let m = 0, v = 0; for (const [tid, mm] of Object.entries(Q.vs)) { const n = adjNet[tid]; if (n != null) { m += mm; v += mm * n } } return m ? r1(v / m) : null })();
    const qot = (() => { let m = 0, v = 0; for (const [mid, mm] of mates[id] || []) { const r = rating[mid]; if (r != null) { m += mm; v += mm * r } } return m ? Math.round(1000 * v / m) / 1000 : null })();
    const share = { pts: sh(o.pts, t.pts), fga: sh(o.fga, t.fga), usg: sh(o.fga + .44 * o.fta + o.tov, t.fga + .44 * t.fta + t.tov), ast: sh(o.ast, t.fgm - o.fgm), oreb: sh(o.oreb, t.oreb + x.dreb), dreb: sh(o.dreb, t.dreb + x.oreb),
      reb: sh(o.oreb + o.dreb, t.oreb + t.dreb + x.oreb + x.dreb), blk: sh(o.blk, x.fga2), stl: sh(o.stl, x.fga + .44 * x.fta + x.tov - x.oreb), tov: sh(o.tov, o.fga + .44 * o.fta + o.tov) };
    /* defense with him on the floor vs off it (CBBD doesn't say who guarded whom, so this is the five he was part of) */
    const TD = (T[Q._team] || {}).dE, poss = e => e.fga + .44 * e.fta + e.tov - e.oreb, sub = (a, b) => Object.fromEntries(Object.keys(a).map(k => [k, a[k] - (b[k] || 0)]));
    const def = TD && offMin >= 40 ? (() => { const off = sub(TD, x), pOn = poss(x), pOff = poss(off); if (pOn < 50 || pOff < 30) return null;
      const r = e => ({ pp100: r1(100 * e.pts / Math.max(1, poss(e))), efg: sh(e.fgm + .5 * e.tpm, e.fga), tov: sh(e.tov, poss(e)), ftr: sh(e.fta, e.fga), tp: sh(e.tpm, e.tpa), tpr: sh(e.tpa, e.fga), poss: Math.round(poss(e)) });
      return { on: r(x), off: r(off), pf40: r1(40 * o.pf / Math.max(1, Q.min)), stl40: r1(40 * o.stl / Math.max(1, Q.min)), blk40: r1(40 * o.blk / Math.max(1, Q.min)) } })() : null;
    /* his matchups (inferred): what the players he was matched on did against him vs what they do against everyone */
    const mu = (() => { let sec = 0, pts = 0, fga = 0, fgm = 0, tpa = 0, tpm = 0, fta = 0, tov = 0, eP = 0, eF = 0, e3 = 0, eT = 0, stl = 0, blk = 0, pf = 0; const list = [];
      for (const [a, M] of Object.entries(Q.mu || {})) { const A = P[a]; stl += M[8]; blk += M[9]; pf += M[10]; if (!A || A.min < 60 || !M[0]) continue; const m = M[0] / 60;
        sec += M[0]; pts += M[1]; fga += M[2]; fgm += M[3]; tpa += M[4]; tpm += M[5]; fta += M[6]; tov += M[7];
        eP += m * A.own.pts / A.min; eF += m * A.own.fga / A.min; e3 += m * A.own.tpa / A.min; eT += m * A.own.tov / A.min; list.push([+a, r1(m), M[1], M[2], M[3], M[8], M[9], M[10], r1(m * A.own.pts / A.min)]) }
      if (sec < 600) return null; const min = sec / 60;
      return { min: r1(min), pts, fga, fgm, tpa, tpm, fta, tov, exp: r1(eP), expFga: r1(eF), expTpa: r1(e3), expTov: r1(eT), held40: r1((pts - eP) / min * 40), links: [stl, blk, pf], top: list.sort((x, y) => y[1] - x[1]).slice(0, 8) } })();
    const topMates = (mates[id] || []).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([m, mm]) => [+m, r1(mm)]);
    players[id] = { nm: Q.nm || null, tm: Q._team ?? null, min: r1(Q.min), share, def, mu, rot: Q.rot[0] ? Q.rot.map(Math.round) : null, subBy: Object.entries(Q.subBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => [+k, v]), ph: Q.ph, st: Q.st, blkR: Q.blkR, azR: Q.azR, dph: Q.dph, ft2: Q.ft2[0] ? [Q.ft2[0], Math.round(Q.ft2[1]), Math.round(Q.ft2[2]), Q.ft2[3]] : null, qoc, qot, mates: topMates, own: o, gp: Q.gp, pm: Q.pm, on40: r1(on40), off40: r1(off40), onoff: on40 != null && off40 != null ? r1(on40 - off40) : null, offMin: r1(offMin),
      c: { ...Q.c, min: r1(Q.c.min) }, late: Q.late, wpa: Math.round(Q.wpa * 1000) / 10, cwpa: Math.round(Q.cwpa * 1000) / 10, fwpa: Math.round(Q.fwpa * 100) / 100, cfwpa: Math.round(Q.cfwpa * 100) / 100, h1: Q.h1, h2: Q.h2, ast: topN(Q.ast, 6), fed: topN(Q.fed, 6) };
  }
  const teams = {};
  for (const [id, X] of Object.entries(T)) {
    const G = X.games;
    const rec = f => { const g = G.filter(f); return [g.filter(x => x[3] > 0).length, g.filter(x => x[3] < 0).length] };
    const units = Object.entries(X.units).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12).map(([k, u]) => [k.split("-").map(Number), r1(u[0]), u[1], u[2]]);
    const totMin = Object.values(X.mins).reduce((a, b) => a + b, 0) / 5;
    teams[id] = { n: G.length, close: rec(g => Math.abs(g[3]) <= 5 || g[10]), clutch: rec(g => g[11]), ot: rec(g => g[10]), comeback10: G.filter(g => g[3] > 0 && g[5] >= 10).length, blown10: G.filter(g => g[3] < 0 && g[4] >= 10).length,
      trailHalf: rec(g => g[6] != null && g[6] < 0), leadHalf: rec(g => g[6] != null && g[6] > 0), bigComeback: Math.max(0, ...G.filter(g => g[3] > 0).map(g => g[5])), bigBlown: Math.max(0, ...G.filter(g => g[3] < 0).map(g => g[4])),
      cpm: X.c.pm, cmin: r1(X.c.min), wall: X.wall[0] ? Math.round(X.wall[1] / X.wall[0]) : null, ph: X.ph, pot: X.pot, sc: X.sc, to: X.to, ftPlay: (() => { let on = 0, win = 0; for (const Q of Object.values(P)) if (Q._team == id && Q.ft2[2]) { on += Q.ft2[1]; win += Q.ft2[2] } return win ? Math.round(1000 * on / win) / 1000 : null })(), zone: X.zone && X.zone.length ? { mis: X.zm && X.zm[1] ? Math.round(1000 * (1 - X.zm[0] / X.zm[1])) / 1000 : null, g: X.zone.length, spread: Math.round(100 * X.zone.reduce((a, z) => a + z[0] * z[1], 0) / Math.max(1, X.zone.reduce((a, z) => a + z[0], 0))) / 100, links: X.zone.reduce((a, z) => a + z[0], 0) } : null, units, minShare: Object.entries(X.mins).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([pid, m]) => [+pid, r1(m), totMin ? Math.round(1000 * m / totMin) / 1000 : null]), games: G };
  }
  return { players, teams };
}

/* read a season's play-by-play day by day (only days not read before), keep the raw sums (p{S}_cbb-pbpraw, job only) and publish the
   finished numbers (p{S}_cbb-pbp) and the shot chart (p{S}_cbb-shots). shots = { addShot, blankAgg, ZONES } from job/cbb.mjs. */
export async function runPbp({ cb, getPack, putPack, log, S, G, D1, full, shots, pool, days, ctx }) {
  /* PBP_V: bump when the engine changes what it adds up — the season is then read again from the start */
  let R = full ? null : await getPack(`p${S}_cbb-pbpraw`).catch(() => null);
  if (!R || !R.P || R.v !== PBP_V) R = { v: PBP_V, season: S, P: {}, T: {}, gameIds: [], sh: { players: {}, teams: {}, def: {} }, done: false };
  if (R.done) { log(`pbp ${S}: complete`); return { skipped: true } }
  const have = new Set(R.gameIds);
  const finals = G.filter(g => g.season === S && g.status === "final" && !have.has(g.id));
  const dates = days || [...new Set(finals.map(g => g.startDate.slice(0, 10)))].sort();
  log(`pbp ${S}: ${dates.length} days to read`);
  let added = 0;
  await pool(dates, 3, async dt => {
    const plays = await cb("/plays/date", { date: dt });
    const byGame = {}; for (const p of plays) { if (p.season !== S || have.has(p.gameId)) continue; (byGame[p.gameId] = byGame[p.gameId] || []).push(p) }
    for (const [gid, ps] of Object.entries(byGame)) {
      if (have.has(+gid)) continue;
      R.diag = R.diag || { k: [[0, 0], [0, 0], [0, 0]], sized: [0, 0] }; const r = processGame(ps, R.P, R.T, { gid: +gid, size: ctx && ctx.size, diag: R.diag }); if (!r) continue;
      have.add(+gid); added++;
      for (const p of ps) { if (!p.shootingPlay || !p.shotInfo) continue; const sh = p.shotInfo.shooter || {};
        if (sh.id) shots.addShot(R.sh.players[sh.id] = R.sh.players[sh.id] || shots.blankAgg(), p);
        if (p.teamId) { const X = R.sh.teams[p.teamId] = R.sh.teams[p.teamId] || { o: shots.blankAgg(), d: shots.blankAgg() }; shots.addShot(X.o, p) }
        if (p.opponentId) { const X = R.sh.teams[p.opponentId] = R.sh.teams[p.opponentId] || { o: shots.blankAgg(), d: shots.blankAgg() }; shots.addShot(X.d, p) }
        /* every defender on the floor for this shot */
        if (p.opponent) for (const f of p.onFloor || []) if (f.team === p.opponent && f.id != null) shots.addShot((R.sh.def = R.sh.def || {})[f.id] = (R.sh.def || {})[f.id] || shots.blankAgg(), p) }
    }
  });
  R.gameIds = [...have]; R.done = Date.now() > Date.UTC(S, 3, 20) && G.filter(g => g.season === S && g.status === "final").every(g => have.has(g.id) || !(D1.has(g.homeTeamId) || D1.has(g.awayTeamId)));
  await putPack(`p${S}_cbb-pbpraw`, R);
  const out = finishPbp(R.P, R.T, ctx);
  for (const id of Object.keys(out.teams)) if (!D1.has(+id)) delete out.teams[id];
  await putPack(`p${S}_cbb-pbp`, { season: S, through: new Date().toISOString().slice(0, 10), games: have.size, diag: R.diag || null, ...out });
  /* the shot chart from the same pass */
  const avg = shots.ZONES.map(() => [0, 0]); for (const [id, X] of Object.entries(R.sh.teams)) if (D1.has(+id)) X.o.z.forEach((v, i) => { avg[i][0] += v[0]; avg[i][1] += v[1] });
  const keep = {}; for (const [id, A] of Object.entries(R.sh.players)) if (A.z.reduce((a, v) => a + v[1], 0) + A.r.reduce((a, v) => a + v[1], 0) >= 25 || A.ft[1] >= 25) keep[id] = A;
  const keepDef = {}; for (const [id, A] of Object.entries(R.sh.def || {})) if (A.z.reduce((a, v) => a + v[1], 0) >= 100) keepDef[id] = { z: A.z, r: A.r };
  await putPack(`p${S}_cbb-shots`, { season: S, zones: shots.ZONES, players: keep, def: keepDef, teams: R.sh.teams, avg, gameIds: [], through: new Date().toISOString().slice(0, 10), done: R.done, fromPbp: 1 });
  log(`pbp ${S}: ${added} new games · ${Object.keys(out.players).length} players · ${Object.keys(out.teams).length} teams`);
  return { added };
}
