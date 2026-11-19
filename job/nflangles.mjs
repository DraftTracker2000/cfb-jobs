/* This week's betting angles (Nov 19 — the owner, 11:03 am: "these look good and just put the data in the right places").
   Only the angles that passed the prediction tests (docs/checks/*-2026-11-19.txt; report: "Betting ideas — what passed"):
   each team and player is judged on its previous 16 games, then the week's biggest mismatch in a stat gets the bet that paid in that spot.

   Output: pack "pYYYY_nfl-angles" = { angles: { t, v, season, week, games, team: [...], rb: [...], dal, sched: [...], past: { week: [...] } } }
     team  — the week's single biggest mismatch per stat: { k, gid, team, opp, bet: { t: "ats"|"tt"|"tot"|"dst", side, line, dir }, why, hit, h }
     rb    — running backs with this week's TD matchup: { g: gsis, n: name, team, opp, gid, gp, td, rate, dal, rk, pm, best, tough }
     dal   — TDs a game each defense allowed by position over its last 16 games: { RB: { team: [perGame, rank] }, …, lg: { RB, WR, TE } }
     sched — from the schedule: teaser legs (underdogs of 1.5–2.5) and teams that just lost as 7+ point favorites
     past  — earlier weeks' angles with their result (1 won, 0 lost, null push / not graded), for the Tuesday fantasy check */
import { gzipSync } from "node:zlib";
import { get0 as get0raw, rows, games } from "./nfl.mjs";
/* one read of each nflverse file per run (the earlier weeks' backfill builds the angles once a week of the season) */
const F0 = new Map(), get0 = (p, log) => { if (!F0.has(p)) F0.set(p, get0raw(p, log)); return F0.get(p) };

const num = v => { if (v === "" || v == null || v === "NA") return null; const x = +v; return isFinite(x) ? x : null };
const r2 = v => v == null ? null : Math.round(v * 100) / 100;
const PBP = ["game_id", "season_type", "home_team", "away_team", "posteam", "defteam", "qtr", "play_type", "yards_gained", "qb_dropback", "qb_scramble", "epa", "success",
  "third_down_converted", "third_down_failed", "interception", "fumble_lost", "rush_attempt", "sack", "yardline_100", "fixed_drive", "fixed_drive_result",
  "total_home_score", "total_away_score", "td_team", "touchdown", "return_touchdown", "field_goal_attempt", "rush_touchdown", "pass_touchdown", "td_player_id",
  "rusher_player_id", "receiver_player_id"];
/* the tested stats; sign +1 = more is better for an offense */
const M = { pts: 1, sf: 1, h1: 1, q4: 1, epa: 1, pepa: 1, repa: 1, succ: 1, ypp: 1, expl: 1, sackr: -1, give: -1, third: 1, rztd: 1, longest: 1, fga: 1, nonoff: 1 };
/* the angles that held in both halves (week's single biggest mismatch, 2017–26, 204 weeks each). Nov 19, 5:04 pm: walking forward (docs/checks/walk-forward-2026-11-19.txt)
   only the two marked fwd held — their hit is the forward rate and h the record; the pages show only those */
const TEAM_ANG = [
  { k: "nonoff", side: "o", bet: "dst", hit: 22.5, h: [22.6, 22.4], base: 13.0, lab: "Defense & special teams" },
  { k: "epa", side: "o", bet: "ats-other", hit: 57.2, h: [53.3, 61.5], lab: "EPA a play" },
  { k: "q4", side: "o", bet: "ats-other", hit: 56.1, h: [57.4, 54.6], lab: "4th-quarter scoring" },
  { k: "q4", side: "d", bet: "tot-under", hit: 54.1, h: [40, 34], fwd: 1, lab: "4th-quarter defense" },
  { k: "third", side: "d", bet: "tot-under", hit: 55.7, h: [55.7, 55.8], lab: "3rd-down defense" },
  { k: "pts", side: "o", bet: "tt-under", hit: 54.1, h: [53, 45], fwd: 1, lab: "Points" },
  { k: "sf", side: "d", bet: "tot-under", hit: 54.2, h: [54.7, 53.6], lab: "Score-first defense" },
  { k: "longest", side: "o", bet: "tt-over", hit: 55.9, h: [55.7, 56.1], lab: "Longest play" },
  { k: "fga", side: "o", bet: "tt-over", hit: 54.2, h: [55.7, 52.6], lab: "Field-goal tries" }];
const STACK = { hit: 53.7, h: [54.3, 53.1], lab: "Stacked mismatches" };
const RB_TD = { hit: 55.5, h: [53.9, 57.1], base: 47.5 };   /* top-25% scorer vs a bottom-25% RB-TD defense: 55.5% vs 47.5% expected (+6.7 / +9.4 by half) */
const TEASE = { hit: 75.7, h: [73.6, 76.9], need: 72.4 }, AFTER = { hit: 55.0, h: [52.7, 57.4] };

export async function buildAngles({ season, log = console.log, prev = null, asOf = null }) {
  const GS = await games(log); if (!GS || !GS.g.length) throw new Error("no schedule");
  const C = Object.fromEntries(GS.cols.map((k, i) => [k, i]));
  const SG = GS.g.map(r => ({ id: r[C.id], season: r[C.season], type: r[C.type], week: r[C.week], date: r[C.date], time: r[C.time], away: r[C.away], home: r[C.home],
    as: r[C.awayScore], hs: r[C.homeScore], sp: r[C.spread], tl: r[C.total] }));
  const open = g => g.hs == null || (asOf != null && g.season === season && g.week >= asOf);   /* asOf: test a past week as if it were next */
  const cur = SG.filter(g => g.season === season && open(g));
  const week = cur.length ? Math.min(...cur.map(g => g.week)) : null;
  const WK = week == null ? [] : SG.filter(g => g.season === season && g.week === week && open(g));

  /* ── play-by-play, last season and this one: per team-game numbers and per player-game TDs ── */
  const TG = {}, PG = {}, GI = {};   // TG[gid|team] offense; PG[gid|pid] {t, td, tch}; GI[gid] game state
  const posOf = {}, nameOf = {};
  rows(await get0("players/players.csv", log), ["gsis_id", "display_name", "position"], o => { if (o.gsis_id) { posOf[o.gsis_id] = o.position === "FB" ? "RB" : o.position; nameOf[o.gsis_id] = o.display_name } });
  for (const S of [season - 1, season]) {
    const t = await get0(`pbp/play_by_play_${S}.csv.gz`, log); if (!t) { log(`angles: no play-by-play ${S}`); continue }
    rows(t, PBP, o => {
      const g = o.game_id; if (!g || (o.season_type !== "REG" && o.season_type !== "POST")) return;
      const I = GI[g] = GI[g] || { S, home: o.home_team, away: o.away_team, fs: null, q2: [0, 0], q3: [0, 0], fin: [0, 0] };
      const hs = num(o.total_home_score), as = num(o.total_away_score), q = num(o.qtr) || 0;
      if (hs != null && as != null) { if (!I.fs && hs + as > 0) I.fs = hs > 0 ? "H" : "A"; if (q <= 2) I.q2 = [hs, as]; if (q <= 3) I.q3 = [hs, as]; I.fin = [hs, as] }
      const tdt = o.td_team, pos = o.posteam;
      if (tdt && tdt !== "NA" && num(o.touchdown) === 1 && ((pos && pos !== tdt) || (pos === tdt && num(o.return_touchdown) === 1))) { const k = g + "|" + tdt, x = TG[k] = TG[k] || acc(); x.nonoff++; I["dst_" + tdt] = 1 }
      if (!pos || pos === "NA") return;
      const x = TG[g + "|" + pos] = TG[g + "|" + pos] || acc();
      if (num(o.field_goal_attempt) === 1) x.fga++;
      const pt = o.play_type; if (pt !== "pass" && pt !== "run") return;
      const e = num(o.epa), y = num(o.yards_gained) || 0, db = num(o.qb_dropback) === 1, ru = num(o.rush_attempt) === 1 && num(o.qb_scramble) !== 1;
      x.n++; if (e != null) { x.e += e; x.en++; if (db) { x.pe += e; x.pn++ } if (ru) { x.re += e; x.rn++ } }
      x.su += num(o.success) || 0; x.y += y; if (y >= 20) x.ex++; if (y > x.lg) x.lg = y;
      if (db) { x.db++; if (num(o.sack) === 1) x.sk++ }
      x.gv += (num(o.interception) || 0) + (num(o.fumble_lost) || 0);
      x.t3c += num(o.third_down_converted) || 0; x.t3 += (num(o.third_down_converted) || 0) + (num(o.third_down_failed) || 0);
      const d = o.fixed_drive, yl = num(o.yardline_100); if (d) { const D = x.dr[d] = x.dr[d] || { m: 99, r: o.fixed_drive_result }; if (yl != null && yl < D.m) D.m = yl; D.r = o.fixed_drive_result }
      for (const [id, rk] of [[o.rusher_player_id, "r"], [o.receiver_player_id, "c"]]) if (id && id !== "NA") { const P = PG[g + "|" + id] = PG[g + "|" + id] || { t: pos, td: 0, tch: 0 }; P.tch++ }
      if ((num(o.rush_touchdown) === 1 || num(o.pass_touchdown) === 1) && o.td_player_id && o.td_player_id !== "NA" && o.td_team === pos) { const P = PG[g + "|" + o.td_player_id] = PG[g + "|" + o.td_player_id] || { t: pos, td: 0, tch: 0 }; P.td++ }
    });
  }
  /* each team's games in order, with its numbers and what it allowed */
  const done = SG.filter(g => !open(g) && GI[g.id]).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const val = (g, t) => { const I = GI[g.id], H = t === g.home, x = TG[g.id + "|" + t] || acc(), me = H ? 0 : 1, op = 1 - me;
    const rz = Object.values(x.dr).filter(D => D.m <= 20);
    return { pts: I.fin[me], sf: I.fs ? ((I.fs === "H") === H ? 1 : 0) : null, h1: I.q2[me], q4: I.fin[me] - I.q3[me], epa: x.en ? x.e / x.en : null, pepa: x.pn ? x.pe / x.pn : null,
      repa: x.rn ? x.re / x.rn : null, succ: x.n ? x.su / x.n : null, ypp: x.n ? x.y / x.n : null, expl: x.n ? x.ex / x.n : null, sackr: x.db ? x.sk / x.db : null, give: x.gv,
      third: x.t3 ? x.t3c / x.t3 : null, rztd: rz.length ? rz.filter(D => D.r === "Touchdown").length / rz.length : null, longest: x.n ? x.lg : null, fga: x.fga, nonoff: x.nonoff, _op: op } };
  const H = {};   // team -> [{o, d}]
  for (const g of done) for (const [t, o] of [[g.home, g.away], [g.away, g.home]]) (H[t] = H[t] || []).push({ o: val(g, t), d: val(g, o), gid: g.id });
  const mean = (A, f) => { const v = A.map(f).filter(x => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  const last = {}; for (const t in H) { const A = H[t].slice(-16); last[t] = { n: A.length }; for (const m in M) { last[t]["o_" + m] = mean(A, x => x.o[m]); last[t]["d_" + m] = mean(A, x => x.d[m]) } }

  /* ── this week's team-sides and the week's biggest mismatch in each stat ── */
  const SIDES = []; for (const g of WK) for (const [t, o, h] of [[g.home, g.away, 1], [g.away, g.home, 0]]) { const L = last[t], O = last[o]; if (!L || !O || L.n < 8 || O.n < 8 || g.sp == null || g.tl == null) continue;
    const sp = h ? g.sp : -g.sp; SIDES.push({ g, t, o, sp, imp: (g.tl + sp) / 2, L, O }) }
  const z = arr => { const v = arr.filter(x => x != null), m = v.reduce((a, b) => a + b, 0) / (v.length || 1), s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)) || 1; return arr.map(x => x == null ? null : (x - m) / s) };
  for (const m in M) { const sg = M[m];
    const zo = z(SIDES.map(s => s.L["o_" + m] == null ? null : sg * s.L["o_" + m])), zd = z(SIDES.map(s => s.O["d_" + m] == null ? null : sg * s.O["d_" + m]));
    const zdd = z(SIDES.map(s => s.L["d_" + m] == null ? null : -sg * s.L["d_" + m])), zoo = z(SIDES.map(s => s.O["o_" + m] == null ? null : -sg * s.O["o_" + m]));
    SIDES.forEach((s, i) => { s["mo_" + m] = zo[i] == null || zd[i] == null ? null : zo[i] + zd[i]; s["md_" + m] = zdd[i] == null || zoo[i] == null ? null : zdd[i] + zoo[i] }) }
  const STK = ["pts", "sf", "h1", "q4", "epa", "pepa", "repa", "succ", "ypp", "expl", "sackr", "give", "third", "rztd"];
  SIDES.forEach(s => { s.stack = STK.filter(m => s["mo_" + m] != null && s["mo_" + m] >= 1.5).length });
  const f1 = v => v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1), pc = v => v == null ? "—" : Math.round(v * 100) + "%", sgn = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
  const why = (k, sd, s) => { const a = sd === "o" ? s.t : s.t, b = s.o, L = s.L, O = s.O;
    if (k === "nonoff") return `${a} D/ST scores ${L.o_nonoff.toFixed(2)} TDs a game · ${b} gives up ${O.d_nonoff.toFixed(2)}`;
    if (k === "epa") return `${a} offense ${sgn(L.o_epa)} EPA a play · ${b} allows ${sgn(O.d_epa)}`;
    if (k === "q4" && sd === "o") return `${a} scores ${f1(L.o_q4)} in the 4th · ${b} allows ${f1(O.d_q4)}`;
    if (k === "q4") return `${a} allows ${f1(L.d_q4)} in the 4th · ${b} scores ${f1(O.o_q4)}`;
    if (k === "third") return `${a} allows ${pc(L.d_third)} on 3rd down · ${b} converts ${pc(O.o_third)}`;
    if (k === "pts") return `${a} scores ${f1(L.o_pts)} · ${b} allows ${f1(O.d_pts)}`;
    if (k === "sf") return `${a} gives up the first score ${pc(L.d_sf)} · ${b} scores first ${pc(O.o_sf)}`;
    if (k === "longest") return `${a} longest play ${Math.round(L.o_longest)} yds a game · ${b} allows ${Math.round(O.d_longest)}`;
    if (k === "fga") return `${a} ${f1(L.o_fga)} FG tries a game · ${b} allows ${f1(O.d_fga)}`; return "" };
  const team = [];
  for (const A of TEAM_ANG) { const key = (A.side === "o" ? "mo_" : "md_") + A.k, c = SIDES.filter(s => s[key] != null).sort((a, b) => b[key] - a[key]);
    if (A.k === "nonoff") { c.sort((a, b) => (b.L.o_nonoff - a.L.o_nonoff) || (b[key] - a[key])) }   /* the D/ST TD result comes from the defense's own record (21.6% on its own) */
    const s = c[0]; if (!s) continue;
    const bet = A.bet === "dst" ? { t: "dst", side: s.t } : A.bet === "ats-other" ? { t: "ats", side: s.o, line: r2(s.sp) } : A.bet === "tot-under" ? { t: "tot", dir: "under", line: s.g.tl } : { t: "tt", side: s.t, dir: A.bet.endsWith("over") ? "over" : "under", line: r2(s.imp) };
    team.push({ k: A.k + (A.side === "d" ? "D" : ""), lab: A.lab, gid: s.g.id, team: s.t, opp: s.o, bet, why: why(A.k, A.side, s), hit: A.hit, h: A.h, base: A.base || null, z: r2(s[key]) }) }
  { const s = SIDES.slice().sort((a, b) => b.stack - a.stack || (b.mo_epa || 0) - (a.mo_epa || 0))[0];
    if (s && s.stack >= 2) team.push({ k: "stack", lab: STACK.lab, gid: s.g.id, team: s.t, opp: s.o, bet: { t: "tt", side: s.t, dir: "over", line: r2(s.imp) }, why: `${s.stack} big offensive mismatches in one game`, hit: STACK.hit, h: STACK.h, z: s.stack }) }

  /* ── running backs: TD rate over his last 16 games vs TDs the defense allowed to the position over its last 16 ── */
  const byGame = {}; for (const k in PG) { const [g, id] = k.split("|"); (byGame[g] = byGame[g] || []).push([id, PG[k]]) }
  const dal = { RB: {}, WR: {}, TE: {}, lg: {} };
  for (const p of ["RB", "WR", "TE"]) { for (const t in H) { const A = H[t].slice(-16); if (A.length < 8) continue; let s = 0;
      for (const x of A) for (const [id, P] of byGame[x.gid] || []) if (P.t !== t && posOf[id] === p) s += P.td;
      dal[p][t] = [r2(s / A.length), 0] }
    const ord = Object.keys(dal[p]).sort((a, b) => dal[p][b][0] - dal[p][a][0]); ord.forEach((t, i) => dal[p][t][1] = i + 1);
    dal.lg[p] = r2(ord.reduce((a, t) => a + dal[p][t][0], 0) / (ord.length || 1)) }
  const plays = {}; for (const g of done) for (const [id, P] of byGame[g.id] || []) (plays[id] = plays[id] || []).push({ gid: g.id, t: P.t, td: P.td, tch: P.tch, S: g.season });
  const oppNow = {}, gidNow = {}; for (const g of WK) { oppNow[g.home] = g.away; oppNow[g.away] = g.home; gidNow[g.home] = gidNow[g.away] = g.id }
  const RB = []; for (const id in plays) { if (posOf[id] !== "RB") continue; const A = plays[id].slice(-16), lastP = A[A.length - 1];
    if (A.length < 6 || lastP.S !== season || !oppNow[lastP.t]) continue; const tch = A.reduce((a, x) => a + x.tch, 0) / A.length; if (tch < 8) continue;
    const o = oppNow[lastP.t], d = dal.RB[o]; if (!d) continue;
    RB.push({ g: id, n: nameOf[id] || id, team: lastP.t, opp: o, gid: gidNow[lastP.t], gp: A.length, td: A.filter(x => x.td > 0).length, rate: r2(A.filter(x => x.td > 0).length / A.length), dal: d[0], rk: d[1], pm: r2(d[0] - dal.lg.RB) }) }
  const pr = (A, f) => { const v = A.map(f).sort((a, b) => a - b); return x => { let k = 0; while (k < v.length && v[k] <= x) k++; return k / v.length } };
  const prR = pr(RB, x => x.rate), prD = pr(RB, x => x.dal);
  RB.forEach(x => { const a = prR(x.rate), b = prD(x.dal); x.best = a >= 0.75 && b >= 0.75; x.tough = a >= 0.75 && b <= 0.25; x.sc = r2(a + b) });
  RB.sort((a, b) => b.rate - a.rate || b.sc - a.sc);

  /* ── from the schedule: teaser legs and teams that just lost as 7+ point favorites ── */
  const sched = [];
  for (const g of WK) { if (g.sp == null) continue; const a = Math.abs(g.sp); if (a >= 1.5 && a <= 2.5) { const dog = g.sp > 0 ? g.away : g.home; sched.push({ k: "tease", gid: g.id, team: dog, line: a, to: a + 6, hit: TEASE.hit, h: TEASE.h, need: TEASE.need }) } }
  for (const g of WK) for (const t of [g.home, g.away]) { const P = done.filter(x => x.season === season && (x.home === t || x.away === t)).slice(-1)[0]; if (!P || P.sp == null) continue;
    const fav = P.home === t ? P.sp : -P.sp, mg = P.home === t ? P.hs - P.as : P.as - P.hs; if (fav >= 7 && mg < 0) { const sp = g.home === t ? g.sp : -g.sp;
      sched.push({ k: "afterLoss", gid: g.id, team: t, line: r2(-sp), last: `lost as a ${fav}-point favorite`, hit: AFTER.hit, h: AFTER.h }) } }

  /* ── grade earlier weeks' angles (kept from the last pack) ── */
  const past = Object.assign({}, (prev && prev.past) || {});
  if (prev && prev.week != null && prev.season === season && prev.week !== week) past[prev.week] = { team: prev.team || [], rb: (prev.rb || []).filter(x => x.best), sched: prev.sched || [] };
  for (const w in past) gradeWeek(past[w], SG, GI, PG);

  log(`angles: ${season} week ${week} · ${WK.length} games · ${team.length} team angles · ${RB.filter(x => x.best).length} best RB matchups · ${sched.length} from the schedule · ${Object.keys(past).length} past weeks`);
  return { t: Date.now(), v: 1, season, week, games: WK.map(g => ({ id: g.id, away: g.away, home: g.home, sp: g.sp, tl: g.tl, date: g.date, time: g.time })), team, rb: RB, dal, sched, past, rbHit: RB_TD };
}
function acc() { return { n: 0, e: 0, en: 0, pe: 0, pn: 0, re: 0, rn: 0, su: 0, y: 0, ex: 0, lg: 0, db: 0, sk: 0, gv: 0, t3: 0, t3c: 0, dr: {}, fga: 0, nonoff: 0 } }

/* a bet's result once its game is final: 1 won, 0 lost, null push (or not final yet) */
export function gradeWeek(W, SG, GI, PG) {
  const byId = Object.fromEntries(SG.map(g => [g.id, g]));
  const res = (gid, f) => { const g = byId[gid]; if (!g || g.hs == null) return undefined; return f(g) };
  const ptsOf = (g, t) => t === g.home ? g.hs : g.as, marg = (g, t) => ptsOf(g, t) - ptsOf(g, t === g.home ? g.away : g.home);
  const cmp = (a, b) => a > b ? 1 : a < b ? 0 : null;
  for (const a of W.team || []) { if (a.r !== undefined && a.r !== null) continue; const b = a.bet;
    const r = res(a.gid, g => b.t === "ats" ? cmp(marg(g, b.side) + b.line, 0) : b.t === "tot" ? (b.dir === "under" ? cmp(g.tl, g.hs + g.as) : cmp(g.hs + g.as, g.tl)) :
      b.t === "tt" ? (b.dir === "under" ? cmp(b.line, ptsOf(g, b.side)) : cmp(ptsOf(g, b.side), b.line)) : b.t === "dst" ? (GI && GI[g.id] ? (dstTD(PG, GI, g.id, b.side) ? 1 : 0) : undefined) : undefined);
    if (r !== undefined) a.r = r }
  for (const x of W.rb || []) { if (x.r != null) continue; const g = byId[x.gid]; if (!g || g.hs == null || !GI || !GI[g.id]) continue; const P = PG[g.id + "|" + x.g]; x.r = P && P.td > 0 ? 1 : 0 }
  for (const x of W.sched || []) { if (x.r != null) continue; const r = res(x.gid, g => x.k === "tease" ? cmp(marg(g, x.team) + x.to, 0) : cmp(marg(g, x.team) + x.line, 0)); if (r !== undefined) x.r = r }
}
function dstTD(PG, GI, gid, t) { return !!(GI[gid] && GI[gid]["dst_" + t]) }

export async function uploadAngles({ api, season, data }) {
  const name = `p${season}_nfl-angles`;
  const gz = gzipSync(Buffer.from(JSON.stringify({ angles: data })));
  const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  await api("PUT", "/api/pack-index", { body: { [name]: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
  return { name, bytes: r.bytes };
}

/* this season's earlier weeks (Nov 19 — the owner: "i would just do everything you can now"): each worked out as if it were next (asOf), from
   the games before it only, kept in past with bf: 1 (worked out afterwards, never shown before kickoff), then graded on the next build */
export async function backfillAngles({ season, ang, log = console.log }) {
  if (!ang || ang.week == null) return 0; let n = 0;
  const first = Math.min(...Object.keys(ang.past || {}).map(Number).concat([ang.week]));
  for (let w = 1; w < ang.week; w++) { if ((ang.past || {})[w]) continue;
    try { const b = await buildAngles({ season, asOf: w, log: () => {} }); if (b.week !== w) continue;
      (ang.past = ang.past || {})[w] = { team: b.team || [], rb: (b.rb || []).filter(x => x.best), sched: b.sched || [], bf: 1 }; n++ } catch (e) { log(`angles: backfill week ${w}: ${e.message}`) } }
  log(`angles: ${n} earlier weeks worked out (first kept week was ${first})`); return n;
}
