/* Combine backtest (Oct 25, task #15 — research only, run as a data-job probe: MODE=probe, PROBE=combtest). Does the NBA draft combine
   (what the basketball lab's athletic profile shows: drills → athletic score, size and length, each a percentile within guards / wings /
   bigs) add anything beyond what we already know?
     1. Draft outcome (drafted, first round, lottery) for combine attendees whose final college season is in a p{y}_cbb-past pack: base =
        the board model's own pD / pR1 / pL for that season (+ BoardScore); test = base + combine. Train on older classes, score the newest.
     2. NBA success after the draft (log of minutes in his first three NBA seasons, p2000_cbb-nbahist) for drafted attendees: base = draft
        slot (and, from 2016, the board model); test = base + combine.
   Reported overall, by position group, and for shooters vs non-shooters (college: 3+ threes tried a game at 35%+). Our own packs only. */
const mean = A => A.length ? A.reduce((a, b) => a + b, 0) / A.length : null;
const sig = z => 1 / (1 + Math.exp(-z));
const lg = p => Math.log(Math.min(.999, Math.max(.001, p)) / (1 - Math.min(.999, Math.max(.001, p))));
const nk = n => String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j] } }
  return M.map((r, i) => Math.abs(r[i]) < 1e-12 ? 0 : r[n] / r[i]) }
function fitLogit(X, y, l2 = .02) { const k = X[0].length; let w = new Array(k).fill(0);
  for (let t = 0; t < 40; t++) { const g = new Array(k).fill(0), H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < X.length; i++) { const p = sig(X[i].reduce((a, x, j) => a + x * w[j], 0)), e = p - y[i], v = p * (1 - p);
      for (let a = 0; a < k; a++) { g[a] += e * X[i][a]; for (let b = 0; b < k; b++) H[a][b] += v * X[i][a] * X[i][b] } }
    for (let a = 1; a < k; a++) { g[a] += l2 * X.length * w[a]; H[a][a] += l2 * X.length }
    const d = solve(H, g); w = w.map((x, j) => x - d[j]); if (d.reduce((a, x) => a + Math.abs(x), 0) < 1e-8) break } return w }
function fitRidge(X, y, l2 = 1) { const k = X[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) for (let a = 0; a < k; a++) { b[a] += X[i][a] * y[i]; for (let c = 0; c < k; c++) A[a][c] += X[i][a] * X[i][c] }
  for (let a = 1; a < k; a++) A[a][a] += l2; return solve(A, b) }
const dot = (x, w) => x.reduce((a, v, j) => a + v * w[j], 0);
function auc(s, y) { const P = s.map((v, i) => [v, y[i]]).sort((a, b) => a[0] - b[0]); let r = 0, np = 0, nn = 0, i = 0;
  while (i < P.length) { let j = i; while (j < P.length && P[j][0] === P[i][0]) j++; const rk = (i + j + 1) / 2; for (let k = i; k < j; k++) if (P[k][1]) { r += rk; np++ } else nn++; i = j }
  return np && nn ? +((r - np * (np + 1) / 2) / (np * nn)).toFixed(3) : null }
const ll = (p, y) => +(-mean(p.map((q, i) => { q = Math.min(.999, Math.max(.001, q)); return y[i] ? Math.log(q) : Math.log(1 - q) }))).toFixed(4);
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2 } return sa && sb ? +(s / Math.sqrt(sa * sb)).toFixed(3) : null };
const mae = (a, b) => +mean(a.map((v, i) => Math.abs(v - b[i]))).toFixed(3);

/* the lab's athletic profile, the same way (public/cbb/lab/index.html NATH_*): percentiles within position group over every combine row */
const GRP = p => { p = String(p || ""); return !p ? null : /^(PG|SG|G|PG-SG|SG-PG)$/.test(p) ? "G" : /C/.test(p) || /^(PF|PF-SF)$/.test(p) ? "B" : "W" };
const M = [["vMax", r => r[13], 0], ["vStand", r => r[12], 0], ["lane", r => r[14], 1], ["sprint", r => r[15], 1], ["len", r => r[7] != null && r[5] != null ? r[7] - r[5] : null, 0], ["reach", r => r[8], 0], ["ht", r => r[5], 0], ["wing", r => r[7], 0], ["wt", r => r[6], 0]];
const DR = ["vMax", "vStand", "lane", "sprint"];

export async function run({ site, token, log = console.log }) {
  const note = (t, o) => { const s = typeof o === "string" ? o : JSON.stringify(o); for (let i = 0; i < s.length; i += 3700) log(`::notice title=combtest ${t}${i ? " +" + i / 3700 : ""}::${s.slice(i, i + 3700).replace(/[\r\n]+/g, " ")}`) };
  const H = { headers: { Authorization: "Bearer " + token } };
  const gp = async n => { const r = await fetch(`${site}/api/pack/${n}`, H); return r.ok ? r.json() : null };
  const ix = await fetch(`${site}/api/pack-index`, H).then(r => r.ok ? r.json() : {}).then(j => j.packs || j).catch(() => ({}));
  const C = await gp("p2000_cbb-combine"), NH = await gp("p2000_cbb-nbahist");
  const dn = Object.keys(ix).filter(k => /^p\d{4}_cbb-draft$/.test(k)).sort().pop(), DP = dn ? await gp(dn) : null;
  const pastNames = Object.keys(ix).filter(k => /^p\d{4}_cbb-past$/.test(k)).sort();
  const PAST = {}; for (const n of pastNames) { const P = await gp(n); if (P && P.players) PAST[P.season] = P }
  if (!C || !C.rows || !NH || !DP) return { ok: false, error: `missing: ${!C ? "combine " : ""}${!NH ? "nbahist " : ""}${!DP ? "draft" : ""}` };
  note("data", { combine: C.rows.length, years: [Math.min(...C.rows.map(r => r[0])), Math.max(...C.rows.map(r => r[0]))], draftPack: dn, picks: (DP.picks || []).length, past: Object.keys(PAST), nbaSeasons: Object.keys(NH.seasons || {}).length });

  /* percentiles */
  const D = {}; for (const g of ["G", "W", "B"]) { D[g] = {}; const G = C.rows.filter(r => GRP(r[4]) === g); for (const [k, f] of M) D[g][k] = G.map(f).filter(v => v != null).sort((a, b) => a - b) }
  const pct = (g, k, v) => { if (v == null || !g) return null; const a = D[g][k]; if (!a || a.length < 50) return null; let lo = 0, eq = 0; for (const x of a) { if (x < v) lo++; else if (x === v) eq++ } const p = (lo + eq / 2) / a.length; return M.find(m => m[0] === k)[2] ? 1 - p : p };
  const prof = r => { const g = GRP(r[4]), P = {}; for (const [k, f] of M) P[k] = pct(g, k, f(r)); const d = DR.filter(k => P[k] != null); return { g, P, ath: d.length >= 3 ? mean(d.map(k => P[k])) : null } };

  /* draft picks by name+year */
  const PK = {}; for (const p of DP.picks || []) PK[nk(p.nm) + "|" + p.y] = p;
  const mins3 = (eid, y) => { let m = 0, any = 0; for (let s = y + 1; s <= y + 3; s++) { const S = NH.seasons[s]; if (!S) return null; const row = S[eid]; if (row) { m += row[4] || 0; any = 1 } } return m };
  const nbaMax = Math.max(...Object.keys(NH.seasons).map(Number));

  /* every attendee: profile, pick, college line, NBA minutes */
  const A = [];
  for (const r of C.rows) { const y = r[0]; if (y < 2009) continue; const pr = prof(r), pk = PK[nk(r[3]) + "|" + y] || null;
    const P = PAST[y], ci = P ? Object.fromEntries(P.cols.map((c, i) => [c, i])) : null, cr = P ? P.players.find(z => nk(z[ci.nm]) === nk(r[3])) : null;
    const col = cr ? Object.fromEntries(P.cols.map((c, i) => [c, cr[i]])) : null;
    const shooter = col ? (col.g ? col.tpa / col.g >= 3 : false) && (col.tpa ? col.tpm / col.tpa >= .35 : false) : null;
    A.push({ y, nm: r[3], eid: r[2] ? String(r[2]) : null, g: pr.g, ath: pr.ath, P: pr.P, pk, col, shooter, m3: r[2] && y + 3 <= nbaMax ? mins3(String(r[2]), y) : null }) }
  note("matched", { attendees: A.length, withCollege: A.filter(a => a.col).length, drafted: A.filter(a => a.pk).length, withMins: A.filter(a => a.m3 != null && a.pk).length, byYear: Object.fromEntries([...new Set(A.map(a => a.y))].sort().map(y => [y, [A.filter(a => a.y === y).length, A.filter(a => a.y === y && a.col).length, A.filter(a => a.y === y && a.pk).length]])) });

  /* combine features: athletic score, length, reach, height, weight (percentiles; missing → .5 plus a flag) */
  const cf = a => { const v = k => a.P[k] == null ? .5 : a.P[k]; return [a.ath == null ? .5 : a.ath, a.ath == null ? 1 : 0, v("len"), v("reach"), v("ht"), v("wt")] };
  const sets = { athletic: a => cf(a).slice(0, 2), size: a => cf(a).slice(2), all: cf };
  const grp = { all: () => true, guards: a => a.g === "G", wings: a => a.g === "W", bigs: a => a.g === "B", shooters: a => a.shooter === true, nonShooters: a => a.shooter === false };

  /* ---- 1. draft outcome, college attendees with the board model's numbers ---- */
  const T1 = A.filter(a => a.col && a.col.pD != null), yrs1 = [...new Set(T1.map(a => a.y))].sort(), cut1 = yrs1[Math.floor(yrs1.length * .6)];
  const base1 = a => [1, lg(a.col.pD), lg(a.col.pR1), lg(a.col.pL)];
  const out1 = {};
  for (const [lab, key] of [["drafted", a => a.pk ? 1 : 0], ["firstRound", a => a.pk && a.pk.pk <= 30 ? 1 : 0], ["lottery", a => a.pk && a.pk.pk <= 14 ? 1 : 0]]) {
    const tr = T1.filter(a => a.y < cut1), te = T1.filter(a => a.y >= cut1), yv = te.map(key);
    const run1 = f => { const w = fitLogit(tr.map(f), tr.map(key)); return te.map(a => sig(dot(f(a), w))) };
    const pb = run1(base1), R = { n: [tr.length, te.length], pos: yv.reduce((a, b) => a + b, 0), base: { auc: auc(pb, yv), ll: ll(pb, yv) } };
    for (const [sn, sf] of Object.entries(sets)) { const p = run1(a => [...base1(a), ...sf(a)]); R[sn] = { auc: auc(p, yv), ll: ll(p, yv) } }
    /* by group: the "all" model, scored on each group */
    const pAll = run1(a => [...base1(a), ...cf(a)]); R.byGroup = {};
    for (const [gn, gf] of Object.entries(grp)) { const I = te.map((a, i) => gf(a) ? i : -1).filter(i => i >= 0); if (I.length < 15) continue; const yy = I.map(i => yv[i]); R.byGroup[gn] = { n: I.length, pos: yy.reduce((a, b) => a + b, 0), base: [auc(I.map(i => pb[i]), yy), ll(I.map(i => pb[i]), yy)], comb: [auc(I.map(i => pAll[i]), yy), ll(I.map(i => pAll[i]), yy)] } }
    out1[lab] = R }
  note("draft", { train: `${yrs1[0]}–${cut1 - 1}`, test: `${cut1}–${yrs1[yrs1.length - 1]}`, out1 });

  /* pick number among the drafted (lower is better): correlation of predicted vs actual on the test classes */
  { const T = T1.filter(a => a.pk), tr = T.filter(a => a.y < cut1), te = T.filter(a => a.y >= cut1), yv = te.map(a => Math.log(a.pk.pk));
    const fitp = f => { const w = fitRidge(tr.map(f), tr.map(a => Math.log(a.pk.pk))); return te.map(a => dot(f(a), w)) };
    const pb = fitp(base1), pc = fitp(a => [...base1(a), ...cf(a)]);
    note("pick", { n: [tr.length, te.length], base: { corr: corr(pb, yv), mae: mae(pb, yv) }, combine: { corr: corr(pc, yv), mae: mae(pc, yv) } }) }

  /* ---- 2. NBA minutes in his first three seasons, drafted attendees ---- */
  const T2 = A.filter(a => a.pk && a.m3 != null && a.eid), yrs2 = [...new Set(T2.map(a => a.y))].sort(), cut2 = yrs2[Math.floor(yrs2.length * .65)];
  const y2 = a => Math.log1p(a.m3), b2 = a => [1, Math.log(a.pk.pk), a.pk.pk <= 30 ? 1 : 0];
  const res2 = (rows, base, label) => { const tr = rows.filter(a => a.y < cut2), te = rows.filter(a => a.y >= cut2); if (tr.length < 40 || te.length < 20) return { label, n: [tr.length, te.length], skip: 1 };
    const fitm = f => { const w = fitRidge(tr.map(f), tr.map(y2)); return te.map(a => dot(f(a), w)) }, yv = te.map(y2);
    const pb = fitm(base), R = { label, n: [tr.length, te.length], base: { corr: corr(pb, yv), mae: mae(pb, yv) } };
    for (const [sn, sf] of Object.entries(sets)) { const p = fitm(a => [...base(a), ...sf(a)]); R[sn] = { corr: corr(p, yv), mae: mae(p, yv) } }
    const pAll = fitm(a => [...base(a), ...cf(a)]); R.byGroup = {};
    for (const [gn, gf] of Object.entries(grp)) { const I = te.map((a, i) => gf(a) ? i : -1).filter(i => i >= 0); if (I.length < 12) continue; const yy = I.map(i => yv[i]); R.byGroup[gn] = { n: I.length, base: [corr(I.map(i => pb[i]), yy), mae(I.map(i => pb[i]), yy)], comb: [corr(I.map(i => pAll[i]), yy), mae(I.map(i => pAll[i]), yy)] } }
    return R };
  note("nba-pick", { train: `${yrs2[0]}–${cut2 - 1}`, test: `${cut2}–${yrs2[yrs2.length - 1]}`, r: res2(T2, b2, "base = draft slot") });
  const T3 = T2.filter(a => a.col && a.col.pD != null); note("nba-model", res2(T3, a => [...b2(a), lg(a.col.pR1), a.col.score || 0], "base = slot + board model (2016+)"));
  /* simple look: athletic-score tertiles vs first-3-season minutes, inside pick bands (is there anything there at all?) */
  const band = a => a.pk.pk <= 14 ? "1-14" : a.pk.pk <= 30 ? "15-30" : "31-60", tert = a => a.ath == null ? null : a.ath < 1 / 3 ? "low" : a.ath < 2 / 3 ? "mid" : "high", L = {};
  for (const a of T2) { const t = tert(a); if (!t) continue; const k = band(a) + " " + t + (a.shooter === true ? " shooter" : ""); (L[k] = L[k] || []).push(a.m3) }
  note("tertiles", Object.fromEntries(Object.entries(L).sort().map(([k, v]) => [k, [v.length, Math.round(mean(v))]])));
  return { ok: true, n1: T1.length, n2: T2.length };
}
