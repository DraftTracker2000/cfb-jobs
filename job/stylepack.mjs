/* Style matchups for the college game pages (Oct 25 — Sam: "when a team is over or under a league average by a noticeable amount in any
   category we should then be looking at how the team does against the other teams it faced with the over or under production in that
   specific category … account for things like game style and pace"). The research (job/stylelab.mjs, 8,297 FBS games 2015–26) found none of
   these move the pick out of sample, so they are shown as matchup notes — context, not a change to our number — and the weekly pick check
   keeps testing them (job/pcheck.mjs) so one that starts to hold up can be adopted.

   Built in the weekly data run (Mon/Tue) and by hand (MODE=style) → pack p2000_cfbstyle:
     { y, wk, at, cats: [[key, label, better(+1/−1/0)]], lg: { key: [mean, sd] },
       t: { team: { n, z: { key: z }, vs: { key: [nHigh, resHigh, nLow, resLow] } } } }
   z     the team's season so far (blended with last season's, worth 3 games) against last season's FBS team averages, in SDs
   vs    its margin against expectation (Elo gap, home field, talent, success rate — fit on the two seasons before) in games against
         opponents who were ≥1 SD above (High) or below (Low) average in that category before the game; this season and last.
   Garbage time is out of every efficiency number (CFBD's advanced stats with excludeGarbageTime). */

const num = v => v == null || v === "" ? null : +v;
const pairStat = v => { const m = String(v || "").match(/(\d+)\s*-\s*(\d+)/); return m ? [+m[1], +m[2]] : null };
const secs = v => { const m = String(v || "").match(/(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : null };
const mean = A => A.length ? A.reduce((a, b) => a + b, 0) / A.length : null;
const sd = A => { const m = mean(A); return A.length > 1 ? Math.sqrt(A.reduce((a, b) => a + (b - m) ** 2, 0) / (A.length - 1)) : null };
const r2 = x => x == null ? null : Math.round(100 * x) / 100;
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j] } }
  return M.map((r, i) => Math.abs(r[i]) < 1e-12 ? 0 : r[n] / r[i]) }
function fitOLS(X, y) { const k = X[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) for (let a = 0; a < k; a++) { b[a] += X[i][a] * y[i]; for (let c = 0; c < k; c++) A[a][c] += X[i][a] * X[i][c] }
  for (let a = 1; a < k; a++) A[a][a] += 1e-6; return solve(A, b) }

export const CATS = [["o_sr", "Offensive success rate", 1], ["d_sr", "Success rate allowed", -1], ["o_ex", "Explosive offense", 1], ["d_ex", "Explosive plays allowed", -1],
  ["o_ly", "Line yards (offense)", 1], ["d_ly", "Line yards allowed", -1], ["o_stuff", "Runs stuffed (offense)", -1], ["d_stuff", "Runs stuffed (defense)", 1], ["o_pd", "Passing-down success", 1], ["d_pd", "Passing-down success allowed", -1],
  ["give", "Giveaways", -1], ["take", "Takeaways", 1], ["rr", "Run share", 0], ["pace", "Pace (plays, both teams)", 0], ["top", "Time of possession", 0],
  ["o_3d", "3rd-down rate", 1], ["d_3d", "3rd-down rate allowed", -1], ["pen", "Penalty yards", -1], ["havoc", "Havoc (TFLs, PBUs, takeaways)", 1], ["havoc_a", "Havoc allowed", -1]];

export async function buildStyle({ site, token, year, log = console.log }) {
  const H = { headers: { Authorization: "Bearer " + token } }; let calls = 0, kept = 0;
  const cf = async path => { for (let k = 0; k < 4; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H);
        if (r.ok) { if (r.headers.get("x-kept")) kept++; else calls++; return await r.json() } if (r.status === 429) await new Promise(z => setTimeout(z, 4000 * (k + 1))); else if (r.status >= 400 && r.status < 500) return null } catch (e) { } await new Promise(z => setTimeout(z, 1500)) } return null };
  const Y1 = year, Y0 = year - 2, G = [], TG = {};
  for (let y = Y0; y <= Y1; y++) {
    const games = (await cf(`/games?year=${y}&seasonType=regular`)) || [], adv = (await cf(`/stats/game/advanced?year=${y}&seasonType=regular&excludeGarbageTime=true`)) || [];
    const tal = (await cf(`/talent?year=${y}`)) || []; const TAL = {}; for (const t of tal) TAL[t.team || t.school] = num(t.talent);
    const A = {}; for (const r of adv) A[`${r.gameId}|${r.team}`] = r;
    const B = {}; const maxW = Math.max(0, ...games.filter(g => g.homePoints != null).map(g => g.week || 0));
    for (let w = 1; w <= maxW; w++) { const L = (await cf(`/games/teams?year=${y}&week=${w}&seasonType=regular`)) || [];
      for (const g of L) for (const t of g.teams || []) { const S = {}; for (const s of t.stats || []) S[s.category] = s.stat; B[`${g.id}|${t.team || t.school}`] = S } }
    for (const g of games) { const hc = g.homeClassification || g.home_division, ac = g.awayClassification || g.away_division;
      if (hc !== "fbs" || ac !== "fbs" || g.homePoints == null || g.awayPoints == null || g.completed === false) continue;
      const rec = { id: g.id, s: y, w: g.week, d: g.startDate, h: g.homeTeam, a: g.awayTeam, neu: !!g.neutralSite, hp: g.homePoints, ap: g.awayPoints, he: num(g.homePregameElo), ae: num(g.awayPregameElo), ht: TAL[g.homeTeam], at: TAL[g.awayTeam] };
      let ok = true; for (const [me, op] of [[g.homeTeam, g.awayTeam], [g.awayTeam, g.homeTeam]]) { const a = A[`${g.id}|${me}`], bx = B[`${g.id}|${me}`], bo = B[`${g.id}|${op}`]; if (!a || !bx || !bo) { ok = false; break }
        const o = a.offense || {}, dd = a.defense || {}, ra = num(bx.rushingAttempts), pa = (pairStat(bx.completionAttempts) || [0, 0])[1], ora = num(bo.rushingAttempts), opa = (pairStat(bo.completionAttempts) || [0, 0])[1];
        const plays = (ra || 0) + (pa || 0), oplays = (ora || 0) + (opa || 0), t3 = pairStat(bx.thirdDownEff), o3 = pairStat(bo.thirdDownEff), tp = secs(bx.possessionTime), op_ = secs(bo.possessionTime), pen = pairStat(bx.totalPenaltiesYards);
        const takes = num(bo.turnovers) ?? ((num(bo.fumblesLost) || 0) + (num(bo.interceptions) || 0)), gives = num(bx.turnovers) ?? ((num(bx.fumblesLost) || 0) + (num(bx.interceptions) || 0));
        const hav = ((num(bx.tacklesForLoss) || 0) + (num(bx.passesDeflected) || 0) + (takes || 0)) / Math.max(1, oplays), havA = ((num(bo.tacklesForLoss) || 0) + (num(bo.passesDeflected) || 0) + (gives || 0)) / Math.max(1, plays);
        TG[`${g.id}|${me}`] = { o_sr: num(o.successRate), d_sr: num(dd.successRate), o_ex: num(o.explosiveness), d_ex: num(dd.explosiveness), o_ly: num(o.lineYards), d_ly: num(dd.lineYards), o_stuff: num(o.stuffRate), d_stuff: num(dd.stuffRate),
          o_pd: num((o.passingDowns || {}).successRate), d_pd: num((dd.passingDowns || {}).successRate), give: gives, take: takes, rr: plays ? (ra || 0) / plays : null, pace: plays + oplays, top: tp && op_ ? tp / (tp + op_) : null,
          o_3d: t3 && t3[1] ? t3[0] / t3[1] : null, d_3d: o3 && o3[1] ? o3[0] / o3[1] : null, pen: pen ? pen[1] : null, havoc: hav, havoc_a: havA } }
      if (ok) G.push(rec) } }
  G.sort((p, q) => p.s - q.s || p.w - q.w || String(p.d).localeCompare(String(q.d)));
  const K = CATS.map(c => c[0]);
  const seasonMeans = s => { const T = {}; for (const g of G) if (g.s === s) for (const t of [g.h, g.a]) (T[t] = T[t] || []).push(TG[`${g.id}|${t}`]);
    const out = {}; for (const k of K) { const M = Object.values(T).map(L => mean(L.map(v => v[k]).filter(x => x != null))).filter(x => x != null); out[k] = [mean(M), sd(M)] } return out };
  const lg = {}; for (let s = Y0; s <= Y1; s++) lg[s] = seasonMeans(s > Y0 ? s - 1 : s);
  const prevMean = {}; for (let s = Y0; s <= Y1; s++) { prevMean[s] = {}; const T = {}; for (const g of G) if (g.s === s - 1) for (const t of [g.h, g.a]) (T[t] = T[t] || []).push(TG[`${g.id}|${t}`]);
    for (const t in T) { prevMean[s][t] = {}; for (const k of K) prevMean[s][t][k] = mean(T[t].map(v => v[k]).filter(x => x != null)) } }
  const cur = {}, prof = (s, t) => { const L = cur[`${s}|${t}`] || [], P = prevMean[s][t] || {}, out = {};
    for (const k of K) { const v = L.map(r => r[k]).filter(x => x != null), pm = P[k], w0 = pm != null ? 3 : 0; if (!v.length && !w0) { out[k] = 0; continue }
      const m = (v.reduce((a, b) => a + b, 0) + (pm != null ? pm * w0 : 0)) / (v.length + w0), [lm, ls] = lg[s][k]; out[k] = ls ? (m - lm) / ls : 0 } out.n = L.length; return out };
  const srNet = p => (p.o_sr || 0) - (p.d_sr || 0), R = [];
  for (const g of G) { const ph = prof(g.s, g.h), pa = prof(g.s, g.a);
    if (g.he != null && g.ae != null) R.push({ g, ph, pa, m: g.hp - g.ap, base: [1, (g.he - g.ae) / 100, g.neu ? 0 : 1, ((g.ht || 600) - (g.at || 600)) / 100, (srNet(ph) - srNet(pa)) / 2] });
    for (const t of [g.h, g.a]) (cur[`${g.s}|${t}`] = cur[`${g.s}|${t}`] || []).push(TG[`${g.id}|${t}`]) }
  /* expected margin, fit on the two seasons before this one (so this season's games are scored out of sample) */
  const tr = R.filter(r => r.g.s < Y1), ols = fitOLS(tr.map(r => r.base), tr.map(r => r.m)); for (const r of R) r.res = r.m - r.base.reduce((a, x, j) => a + x * ols[j], 0);
  const out = {}, T = new Set(G.filter(g => g.s === Y1).flatMap(g => [g.h, g.a]));
  for (const t of T) { const z = prof(Y1 + 0, t), L = []; for (const r of R) { if (r.g.s < Y1 - 1) continue; if (r.g.h === t) L.push([r.pa, r.res]); else if (r.g.a === t) L.push([r.ph, -r.res]) }
    const vs = {}; for (const k of K) { const hi = L.filter(x => x[0][k] >= 1), lo = L.filter(x => x[0][k] <= -1); if (hi.length || lo.length) vs[k] = [hi.length, r2(mean(hi.map(x => x[1]))), lo.length, r2(mean(lo.map(x => x[1])))] }
    out[t] = { n: z.n, z: Object.fromEntries(K.map(k => [k, r2(z[k])])), vs } }
  const wk = Math.max(0, ...G.filter(g => g.s === Y1).map(g => g.w));
  log(`style: ${G.length} games ${Y0}–${Y1}, ${T.size} teams, through week ${wk} · CFBD ${calls} calls (${kept} kept)`);
  return { y: Y1, wk, at: Date.now(), cats: CATS, lg: Object.fromEntries(K.map(k => [k, lg[Y1][k].map(r2)])), t: out, calls };
}
