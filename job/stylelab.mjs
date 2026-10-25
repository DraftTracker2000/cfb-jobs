/* Style-matchup lab (Oct 25 — Sam: "when a team is over or under a league average by a noticeable amount in any category we should then be
   looking at how the team does against the other teams it faced with the over or under production in that specific category … account for
   things like game style and pace"). Research only, run as a data-job probe (MODE=probe, PROBE=stylelab): FBS vs FBS regular seasons
   2015–2026 from CollegeFootballData through the site's proxy (finished seasons are kept by the proxy, so a re-run costs only 2026's calls).

   Per team-game: garbage-time-free success rate / explosiveness / PPA / line yards / stuff rate / passing-down success (offense and defense,
   /stats/game/advanced?excludeGarbageTime=true), and from the box score: giveaways, takeaways, rush share, plays (pace), possession share,
   3rd-down rate (for and against), penalty yards, havoc proxy (TFL + passes defended + takeaways a snap).
   Every number is point-in-time: a team's profile before a game uses only its earlier games that season, blended with last season.

   Base pick (like the audit rebuild): pre-game Elo gap, home field, recruiting talent gap, success-rate net gap — logistic, trained 2015–22.
   Tested additions, one at a time, trained 2015–22, scored 2023–25 and 2026's weeks:
     · team-specific "vs this style" (Sam's idea): when the opponent is ≥1 SD off the FBS average in a category, the team's own record
       (margin vs expectation) against earlier opponents who were off the same way, shrunk n/(n+4); feature = home's minus away's;
     · generic style clashes: e.g. takeaways(D) × giveaways(O), each side;
     · pace / ball control: slower combined pace or a dog that controls the ball shrinks confidence. */

const Y0 = 2015, Y1 = 2026;
const num = v => v == null || v === "" ? null : +v;
const pairStat = v => { const m = String(v || "").match(/(\d+)\s*-\s*(\d+)/); return m ? [+m[1], +m[2]] : null };
const secs = v => { const m = String(v || "").match(/(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : null };
const mean = A => A.length ? A.reduce((a, b) => a + b, 0) / A.length : null;
const sd = A => { const m = mean(A); return A.length > 1 ? Math.sqrt(A.reduce((a, b) => a + (b - m) ** 2, 0) / (A.length - 1)) : null };
const sig = z => 1 / (1 + Math.exp(-z));

/* logistic regression, L2, Newton steps */
function fitLogit(X, y, l2 = 1e-3, it = 30) { const k = X[0].length; let w = new Array(k).fill(0);
  for (let t = 0; t < it; t++) { const g = new Array(k).fill(0), H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < X.length; i++) { const p = sig(X[i].reduce((a, x, j) => a + x * w[j], 0)), e = p - y[i], v = p * (1 - p);
      for (let a = 0; a < k; a++) { g[a] += e * X[i][a]; for (let b = 0; b < k; b++) H[a][b] += v * X[i][a] * X[i][b] } }
    for (let a = 1; a < k; a++) { g[a] += l2 * X.length * w[a]; H[a][a] += l2 * X.length }
    const d = solve(H, g); w = w.map((x, j) => x - d[j]); if (d.reduce((a, x) => a + Math.abs(x), 0) < 1e-7) break }
  return w }
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j] } }
  return M.map((r, i) => Math.abs(r[i]) < 1e-12 ? 0 : r[n] / r[i]) }
function fitOLS(X, y) { const k = X[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) for (let a = 0; a < k; a++) { b[a] += X[i][a] * y[i]; for (let c = 0; c < k; c++) A[a][c] += X[i][a] * X[i][c] }
  for (let a = 1; a < k; a++) A[a][a] += 1e-6; return solve(A, b) }
const score = (P, y) => { let acc = 0, ll = 0, br = 0; for (let i = 0; i < P.length; i++) { const p = Math.min(.999, Math.max(.001, P[i])); acc += (p > .5) === (y[i] === 1) ? 1 : 0; ll -= y[i] ? Math.log(p) : Math.log(1 - p); br += (p - y[i]) ** 2 } return { n: P.length, acc: +(acc / P.length * 100).toFixed(2), ll: +(ll / P.length).toFixed(4), br: +(br / P.length).toFixed(4) } };

/* the categories: [key, label, side ("o" a team's own offense / habit, "d" its defense), higher is better for that team?] */
const CATS = [["o_sr", "success rate (O)", 1], ["d_sr", "success rate allowed (D)", -1], ["o_ex", "explosiveness (O)", 1], ["d_ex", "explosiveness allowed (D)", -1],
  ["o_ly", "line yards (O)", 1], ["d_ly", "line yards allowed (D)", -1], ["o_stuff", "stuffed (O)", -1], ["d_stuff", "stuffs (D)", 1], ["o_pd", "passing-down success (O)", 1], ["d_pd", "passing-down success allowed (D)", -1],
  ["give", "giveaways", -1], ["take", "takeaways", 1], ["rr", "rush share", 0], ["pace", "plays a game (both teams)", 0], ["top", "possession share", 0],
  ["o_3d", "3rd-down rate (O)", 1], ["d_3d", "3rd-down rate allowed (D)", -1], ["pen", "penalty yards", -1], ["havoc", "havoc made (D)", 1], ["havoc_a", "havoc allowed (O)", -1]];
/* generic clashes: my offense habit × their defense habit (and the mirror) */
const CLASH = [["take", "give", "takeaways × giveaways"], ["d_sr", "o_sr", "SR allowed × SR"], ["d_ex", "o_ex", "explosiveness allowed × explosiveness"], ["d_ly", "o_ly", "line yards allowed × line yards"],
  ["havoc", "havoc_a", "havoc × havoc allowed"], ["d_3d", "o_3d", "3rd downs allowed × 3rd downs"], ["d_stuff", "o_stuff", "stuffs × stuffed"]];

export async function run({ site, token, log = console.log }) {
  const H = { headers: { Authorization: "Bearer " + token } }; let calls = 0, kept = 0, fail = 0;
  const cf = async path => { for (let k = 0; k < 4; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H);
        if (r.ok) { if (r.headers.get("x-kept")) kept++; else calls++; return await r.json() } if (r.status === 429) await new Promise(z => setTimeout(z, 4000 * (k + 1))); else if (r.status >= 400 && r.status < 500) { fail++; return null } } catch (e) {} await new Promise(z => setTimeout(z, 1500)) } fail++; return null };
  const note = (t, o) => { const s = typeof o === "string" ? o : JSON.stringify(o); for (let i = 0; i < s.length; i += 3800) log(`::notice title=stylelab ${t}${i ? " +" + i / 3800 : ""}::${s.slice(i, i + 3800).replace(/[\r\n]+/g, " ")}`) };

  /* ---- data ---- */
  const G = [], TG = {}; /* games; team-game rows keyed `${gid}|${team}` */
  const shapes = {};
  for (let y = Y0; y <= Y1; y++) {
    const games = (await cf(`/games?year=${y}&seasonType=regular`)) || [];
    const adv = (await cf(`/stats/game/advanced?year=${y}&seasonType=regular&excludeGarbageTime=true`)) || [];
    const tal = (await cf(`/talent?year=${y}`)) || []; const TAL = {}; for (const t of tal) TAL[t.team || t.school] = num(t.talent);
    if (y === Y1) { shapes.game = Object.keys(games[0] || {}).join(","); shapes.adv = Object.keys(((adv[0] || {}).offense) || {}).join(","); }
    const A = {}; for (const r of adv) A[`${r.gameId}|${r.team}`] = r;
    const B = {}; const maxW = Math.max(1, ...games.filter(g => g.homePoints != null).map(g => g.week || 0));
    for (let w = 1; w <= maxW; w++) { const L = (await cf(`/games/teams?year=${y}&week=${w}&seasonType=regular`)) || [];
      for (const g of L) for (const t of g.teams || []) { const S = {}; for (const s of t.stats || []) S[s.category] = s.stat; B[`${g.id}|${t.team || t.school}`] = S; if (y === Y1 && !shapes.box) shapes.box = Object.keys(S).join(",") } }
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
  note("data", { games: G.length, bySeason: Object.fromEntries([...new Set(G.map(g => g.s))].map(s => [s, G.filter(g => g.s === s).length])), calls, kept, fail, shapes });

  /* ---- point-in-time profiles ---- */
  const K = CATS.map(c => c[0]), hist = {}; /* team → [{s,w,v:{…}, opp, oppZ:{…}, res}] */
  const lg = {}; /* league per-season team means sd, from the season before (so it's known before the games) */
  const seasonMeans = s => { const T = {}; for (const g of G) if (g.s === s) for (const t of [g.h, g.a]) { const v = TG[`${g.id}|${t}`]; (T[t] = T[t] || []).push(v) }
    const out = {}; for (const k of K) { const M = Object.values(T).map(L => mean(L.map(v => v[k]).filter(x => x != null))).filter(x => x != null); out[k] = [mean(M), sd(M)] } return out };
  for (let s = Y0; s <= Y1; s++) lg[s] = seasonMeans(s - 1 >= Y0 ? s - 1 : s);
  const prevMean = {}; for (let s = Y0; s <= Y1; s++) { prevMean[s] = {}; const T = {}; for (const g of G) if (g.s === s - 1) for (const t of [g.h, g.a]) (T[t] = T[t] || []).push(TG[`${g.id}|${t}`]);
    for (const t in T) { prevMean[s][t] = {}; for (const k of K) prevMean[s][t][k] = mean(T[t].map(v => v[k]).filter(x => x != null)) } }
  const cur = {}; /* `${s}|${team}` → list of this season's rows so far */
  const prof = (s, t) => { const L = cur[`${s}|${t}`] || [], P = prevMean[s][t] || {}, out = {}, n = L.length;
    for (const k of K) { const v = L.map(r => r[k]).filter(x => x != null), pm = P[k], w0 = pm != null ? 3 : 0, m = (v.reduce((a, b) => a + b, 0) + (pm != null ? pm * w0 : 0)) / Math.max(1e-9, v.length + w0);
      const [lm, ls] = lg[s][k]; out[k] = v.length + w0 ? (ls ? (m - lm) / ls : 0) : 0 } out.n = n; return out };
  const srNet = p => (p.o_sr || 0) - (p.d_sr || 0);

  /* rows for modeling */
  const R = [];
  for (const g of G) { const ph = prof(g.s, g.h), pa = prof(g.s, g.a);
    if (g.he != null && g.ae != null) R.push({ g, ph, pa, y: g.hp > g.ap ? 1 : 0, m: g.hp - g.ap, base: [1, (g.he - g.ae) / 100, g.neu ? 0 : 1, ((g.ht || 600) - (g.at || 600)) / 100, (srNet(ph) - srNet(pa)) / 2] });
    for (const t of [g.h, g.a]) (cur[`${g.s}|${t}`] = cur[`${g.s}|${t}`] || []).push(TG[`${g.id}|${t}`]) }
  const tr = R.filter(r => r.g.s <= 2022), te = R.filter(r => r.g.s >= 2023 && r.g.s <= 2025), lv = R.filter(r => r.g.s === 2026);
  /* expected margin (for "how a team does vs a style": its margin against expectation) */
  const ols = fitOLS(tr.map(r => r.base), tr.map(r => r.m)); for (const r of R) r.exp = r.base.reduce((a, x, j) => a + x * ols[j], 0);

  /* team-specific "vs this style": walk the games in order, keeping each team's residuals against opponents by the opponent's pre-game z */
  const TH = {}; /* team → [{s, z:{k:z}, res}] */
  const vsStyle = (s, me, oppP, k) => { const zo = oppP[k]; if (Math.abs(zo) < 1) return [0, 0]; const L = (TH[me] || []).filter(x => x.s >= s - 1 && Math.abs(x.z[k]) >= 1 && Math.sign(x.z[k]) === Math.sign(zo));
    if (!L.length) return [0, 0]; const n = L.length, m = mean(L.map(x => x.res)); return [m * n / (n + 4), n] };
  for (const r of R) { const { g, ph, pa } = r; r.vs = {}; for (const k of K) { const [hv] = vsStyle(g.s, g.h, pa, k), [av] = vsStyle(g.s, g.a, ph, k); r.vs[k] = (hv - av) / 10 }
    (TH[g.h] = TH[g.h] || []).push({ s: g.s, z: pa, res: r.m - r.exp }); (TH[g.a] = TH[g.a] || []).push({ s: g.s, z: ph, res: -(r.m - r.exp) }) }
  /* generic clashes and pace */
  for (const r of R) { const { ph, pa } = r; r.cl = {}; for (const [dk, ok] of CLASH) r.cl[dk + "×" + ok] = (ph[dk] * pa[ok] - pa[dk] * ph[ok]) / 2;
    r.pace = (ph.pace + pa.pace) / 2; r.top = (ph.top - pa.top) / 2 }

  /* ---- tests ---- */
  const evalF = (name, f, mode = "add") => { const X = d => d.map(r => mode === "add" ? [...r.base, ...f(r)] : r.base), w = fitLogit(X(tr), tr.map(r => r.y));
    const pr = d => d.map(r => { let z = X([r])[0].reduce((a, x, j) => a + x * w[j], 0); return sig(z) });
    return { name, w: w.slice(5).map(x => +x.toFixed(3)), test: score(pr(te), te.map(r => r.y)), live: score(pr(lv), lv.map(r => r.y)), pr };
  };
  const base = evalF("base", () => [], "base");
  /* confidence scaled by pace / dog ball control: z' = z · (1 + a·pace + b·(dog's possession edge)) — fit a,b on training by grid */
  const scaled = (() => { const wb = fitLogit(tr.map(r => r.base), tr.map(r => r.y)), zb = r => r.base.reduce((a, x, j) => a + x * wb[j], 0); let best = null;
    for (const a of [-.3, -.2, -.1, -.05, 0, .05, .1]) for (const b of [-.6, -.4, -.2, 0, .2]) { const f = r => { const z = zb(r), dogTop = z > 0 ? -r.top : r.top; return sig(z * Math.max(.3, 1 + a * r.pace + b * dogTop)) };
      const sc = score(tr.map(f), tr.map(r => r.y)); if (!best || sc.ll < best.sc.ll) best = { a, b, sc, f } }
    return { name: `pace/ball-control scale (a=${best.a}, b=${best.b})`, test: score(te.map(best.f), te.map(r => r.y)), live: score(lv.map(best.f), lv.map(r => r.y)), pr: d => d.map(best.f) } })();
  const res = [{ name: base.name, test: base.test, live: base.live }, { name: scaled.name, test: scaled.test, live: scaled.live }];
  const winners = [];
  for (const k of K) { const e = evalF("vs-style: " + k, r => [r.vs[k]]); res.push({ name: e.name, w: e.w, test: e.test, live: e.live }); if (e.test.acc > base.test.acc && e.test.ll < base.test.ll) winners.push(["vs", k]) }
  for (const [dk, ok, lab] of CLASH) { const key = dk + "×" + ok, e = evalF("clash: " + lab, r => [r.cl[key]]); res.push({ name: e.name, w: e.w, test: e.test, live: e.live }); if (e.test.acc > base.test.acc && e.test.ll < base.test.ll) winners.push(["cl", key]) }
  const allVs = evalF("all vs-style together", r => K.map(k => r.vs[k])); res.push({ name: allVs.name, test: allVs.test, live: allVs.live });
  const allCl = evalF("all clashes together", r => CLASH.map(([d, o]) => r.cl[d + "×" + o])); res.push({ name: allCl.name, test: allCl.test, live: allCl.live });
  let comb = null; if (winners.length) { comb = evalF("winners combined", r => winners.map(([t, k]) => t === "vs" ? r.vs[k] : r.cl[k])); res.push({ name: comb.name + " (" + winners.map(x => x[1]).join(", ") + ")", w: comb.w, test: comb.test, live: comb.live }) }
  note("tests", { trainN: tr.length, testN: te.length, liveN: lv.length, res: res.map(r => [r.name, r.test.acc, r.test.ll, r.test.br, r.live.acc, r.live.ll, r.w || ""]) });

  /* ---- base-rate check of Sam's turnover question: do high-takeaway defenses beat expectation more vs high-giveaway offenses? ---- */
  const bucket = (fn) => { const L = R.filter(r => r.g.s <= 2025).flatMap(r => [[r.ph, r.pa, r.m - r.exp], [r.pa, r.ph, -(r.m - r.exp)]]).filter(([a, b]) => fn(a, b)); return { n: L.length, res: +(mean(L.map(x => x[2])) || 0).toFixed(2) } };
  note("turnovers", { takeHi_vs_giveHi: bucket((a, b) => a.take >= 1 && b.give >= 1), takeHi_vs_giveLo: bucket((a, b) => a.take >= 1 && b.give <= -1), takeHi_all: bucket(a => a.take >= 1), giveHi_all: bucket(a => a.give >= 1), slowDog: bucket((a, b) => a.top >= 1 && a.pace <= -1) });

  /* ---- the 10 upsets ---- */
  const UP = [["Georgia", "Auburn"], ["Texas Tech", "Cincinnati"], ["Temple", "Charlotte"], ["Troy", "UL Monroe"], ["South Florida", "Temple"], ["Florida International", "Middle Tennessee"], ["Toledo", "Buffalo"], ["Notre Dame", "BYU"], ["TCU", "West Virginia"], ["Texas", "Florida"]];
  const wb = fitLogit(tr.map(r => r.base), tr.map(r => r.y)), out = [];
  for (const [fav, dog] of UP) { const r = lv.find(r => (r.g.h === fav && r.g.a === dog) || (r.g.a === fav && r.g.h === dog)); if (!r) { out.push([fav, dog, "not found"]); continue }
    const favHome = r.g.h === fav, pf = p => +(100 * (favHome ? p : 1 - p)).toFixed(1), pfav = pf(sig(r.base.reduce((a, x, j) => a + x * wb[j], 0)));
    const F = favHome ? r.ph : r.pa, D = favHome ? r.pa : r.ph, ext = (P) => K.filter(k => Math.abs(P[k]) >= 1).map(k => `${k} ${P[k] > 0 ? "+" : ""}${P[k].toFixed(1)}`);
    const sigs = []; for (const k of K) { const v = favHome ? r.vs[k] : -r.vs[k]; if (Math.abs(v) >= .05) sigs.push(`${k} ${v > 0 ? "+" : ""}${(v * 10).toFixed(1)}pts`) }
    out.push({ g: `${dog} over ${fav}`, wk: r.g.w, base: pfav, scaled: pf(scaled.pr([r])[0]), allVs: pf(allVs.pr([r])[0]), allCl: pf(allCl.pr([r])[0]), comb: comb ? pf(comb.pr([r])[0]) : null, favExtremes: ext(F), dogExtremes: ext(D), vsSignals: sigs, favTO: [F.give.toFixed(1), F.take.toFixed(1)], dogTO: [D.give.toFixed(1), D.take.toFixed(1)] }) }
  note("upsets", out);
  return { ok: true, calls, kept, fail, games: G.length, winners };
}
