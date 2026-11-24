/* NFL GMScore worked out in the data job, not in the page (Nov 24, 2026 — the rest of the owner's Nov 5, 5:24 pm "yes a": "do the scoring on our
   server, so browsers only get the results, never the weights"; #59). The arithmetic moved here unchanged from the page's nflGmStats
   (public/index.html): drafting (class grades A–F, shrunk with 2 classes at C), regular-season win % (shrunk with 8 wins in 16 games) and
   playoff wins a season, combined and put on the fixed GMScore scale. Inputs are the ones the page reads: the games pack, the staff list
   (/api/nflstaff), public/data/nfl-gm-hires.json and the draft pack.
   Out: { team: [score, drafting grade letter or null] } — results only, kept on the games pack as `gm`. */
const FR = { STL: "LA", SD: "LAC", OAK: "LV" };
export function nflGmFirst(t, c, H) {
  const nm = x => String(x || "").toLowerCase().replace(/[^a-z]/g, ""), h = H && H.teams && H.teams[t], since = c.gmSince || null;
  if (h && nm(h.gm) === nm(c.gm)) return { first: h.first, skip: h.skip || [], hired: h.hired || null };
  const d1 = y => (H && H.draftDay1 && H.draftDay1[y]) || y + "-04-24";
  if (c.gmHired) { const y = +c.gmHired.slice(0, 4); return { first: c.gmHired < d1(y) ? y : y + 1, skip: [], hired: c.gmHired } }
  return { first: since, skip: [], hired: null };
}
export function nflGmScoresOf(G, ST, GH, DR, Y) {
  const ix = {}; G.cols.forEach((c, i) => ix[c] = i);
  const games = G.g.map(r => ({ season: r[ix.season], type: r[ix.type], home: FR[r[ix.home]] || r[ix.home], away: FR[r[ix.away]] || r[ix.away], homeScore: r[ix.homeScore], awayScore: r[ix.awayScore] }));
  const dx = {}; if (DR && DR.cols) DR.cols.forEach((k, i) => dx[k] = i);
  const L2G = g => g === "A" ? .9 : g === "B" ? .7 : g === "C" ? .5 : g === "D" ? .3 : g === "F" ? .1 : null;
  const out = [];
  for (const t of Object.keys(ST || {})) { const c = ST[t] || {}; if (!c.gm) continue; const since = c.gmSince || null, F = nflGmFirst(t, c, GH), from = Math.max(F.first || since || 0, 1999);
    const rec = { w: 0, l: 0, t: 0, pw: 0, ss: new Set() };
    for (const g of games) { if (g.homeScore == null || g.season < (since || from) || (g.home !== t && g.away !== t)) continue; const h = g.home === t, a = h ? g.homeScore : g.awayScore, b = h ? g.awayScore : g.homeScore; rec.ss.add(g.season);
      if (g.type === "REG") { if (a > b) rec.w++; else if (a < b) rec.l++; else rec.t++ } else if (a > b) rec.pw++ }
    let q = null, n = 0;
    if (DR && DR.p && F.first <= Y) { const gr = (DR.grades && DR.grades[t]) || {}; const mine = DR.p.filter(r => r[dx.team] === t && r[dx.year] >= from && !F.skip.includes(r[dx.year]));
      const qs = [...new Set(mine.map(r => r[dx.year]))].map(y => gr[y]).filter(x => x && x[3]).map(x => x[5] != null ? x[5] : L2G(x[3])); n = qs.length; if (n) q = qs.reduce((a, v) => a + v, 0) / n }
    const gp = rec.w + rec.l + rec.t, seas = Math.max(1, rec.ss.size);
    out.push({ t, q, dS: ((q ?? .5) * n + .5 * 2) / (n + 2), wS: (rec.w + rec.t / 2 + 8) / (gp + 16), pS: Math.min(1, rec.pw / seas) }) }
  const res = {};
  for (const x of out) { const raw = .5 * x.dS + .35 * x.wS + .15 * x.pS;
    res[x.t] = [Math.max(1, Math.min(99, Math.round(60 + 98.5 * (raw - .455)))), x.q == null ? null : x.q >= .8 ? "A" : x.q >= .6 ? "B" : x.q >= .4 ? "C" : x.q >= .2 ? "D" : "F"] }
  return res;
}
