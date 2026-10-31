/* Basketball coach extras (Oct 13 — Sam: "yes do all 6 of the basketball coaches stuff and expand their style tabs").

   Built in the everyday basketball run from data the job already holds, plus the transfer portal by year (one CBBD call a season, finished
   seasons cached in p2000_cbb-portalyrs). Every season is credited to the coach of that team that season (p{S}_cbb-coaches bySeason):

   - rc   recruiting classes he brought in: a class of year Y plays from season Y+1, so it is credited to the coach of season Y+1. Per class:
          [season, team, commits, top-100, five-stars, four-stars, average rating, national class rank (by total rating that year),
          became NBA draft picks, best three [name, national rank, stars]].
   - pin  transfers in (portal year Y → playing season Y+1 at his school), with how each played there: [season, team, [[name, from team,
          games, points a game, win shares]] …]; pout the ones who left after season Y: [season, team, [[name, to team, next season's
          points a game, win shares]] …].
   - dev  player development: players who played two straight seasons at his school under him (200+ minutes both years). His players'
          jump in production per 40 (box score) and points per 40, minus the jump every Division I player of the same class made that year — how much
          more (or less) his players improved than everyone else's. { n, ws, pts, top: best five improvers }.
   - sh   shot diet by team-season (2020–21 on, from the shot charts): share of shots at the rim, other paint, mid-range, corner 3 and
          above-the-break 3, for his offense and against his defense; shAvg is the Division I average each season.

   Pack p{S}_cbb-coachx. */
const SH_FROM = 2021;

export async function buildCoachX({ cb, getPack, putPack, log, S, ALL, H, DRAFTED, normName, bySeason, D1, teams, schoolKey }) {
  /* who coached a team each season: our coach list (2013–14 on), and before that each coach's Wikipedia record table matched to the school
     (Oct 13 — Sam: "we now go back to when izzo was coaching … so we gotta pick a lane": every section reaches as far back as its data) */
  const wiki = {}; try { const WR = await getPack("p2000_cbb-wikirec"); const idOf = {}; for (const t of teams || []) idOf[schoolKey(t.school)] = t.id;
    const first = Math.min(...Object.keys(bySeason).map(Number));
    for (const [cid, x] of Object.entries((WR && WR.c) || {})) for (const r of x.r) { if (r[0] >= first) continue; const id = idOf[schoolKey(r[1])]; if (id != null) (wiki[r[0]] = wiki[r[0]] || {})[id] = cid } } catch (e) { log("coach extras: wikipedia tenure " + e.message) }
  const coachOf = (tid, y) => (bySeason[y] || {})[tid] || (wiki[y] || {})[tid] || null;
  const out = { v: 1, S, rc: {}, pin: {}, pout: {}, dev: {}, fr: {}, frBase: {}, tr: {}, prev: {}, sh: {}, shAvg: {} };
  const push = (k, cid, v) => { (out[k][cid] = out[k][cid] || []).push(v) };
  const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10, r3 = x => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;

  /* a recruit's display name: his college rows (the recruiting list keeps names squeezed for matching) */
  const nmOf = {}, nmAt = {}; for (const rows of Object.values(ALL)) for (const r of rows) if (r.nm) { nmOf[r.id] = r.nm; nmAt[normName(r.nm) + "|" + r.tm] = r.nm }
  const recName = (r, t) => (r[6] != null && nmOf[r[6]]) || nmAt[r[0] + "|" + t] || null;   /* no athlete id (Gary Harris, 2012): his name at that school */
  /* ---- recruiting classes ---- */
  for (const [Y, list] of Object.entries(H.rec || {})) {
    const byT = {}; for (const r of list) if (r[1] != null) (byT[r[1]] = byT[r[1]] || []).push(r);
    const order = Object.entries(byT).map(([t, L]) => [t, L.reduce((a, r) => a + (r[2] || 0), 0)]).sort((a, b) => b[1] - a[1]);
    const rank = Object.fromEntries(order.map(([t], i) => [t, i + 1]));
    for (const [t, L] of Object.entries(byT)) { const cid = coachOf(t, +Y + 1); if (!cid) continue;
      const rated = L.filter(r => r[2]), best = [...L].sort((a, b) => (a[4] || 999) - (b[4] || 999)).slice(0, 3);
      push("rc", cid, [+Y + 1, +t, L.length, L.filter(r => r[4] && r[4] <= 100).length, L.filter(r => r[3] === 5).length, L.filter(r => r[3] === 4).length,
        rated.length ? r3(rated.reduce((a, r) => a + r[2], 0) / rated.length) : null, rank[t], L.filter(r => r[6] != null && DRAFTED[r[6]]).length, best.map(r => [recName(r, t), r[4] || null, r[3] || null])]) } }

  /* the rows we look players up in */
  const rowOf = {}; for (const [y, rows] of Object.entries(ALL)) for (const r of rows) { const k = r.id + "|" + y; if (!rowOf[k] || r.min > rowOf[k].min) rowOf[k] = r }
  const byNT = {}; for (const [y, rows] of Object.entries(ALL)) for (const r of rows) (byNT[normName(r.nm) + "|" + r.tm] = byNT[normName(r.nm) + "|" + r.tm] || new Set()).add(r.id);
  const pg = r => r && r.g ? r1(r.pts / r.g) : null;

  /* ---- transfer portal ---- */
  /* Oct 31: own pack. job/cbb.mjs writes p2000_cbb-portal as { y: 2026, at, rows } (Oct 26), so P.y was a number here and
     P.y[2021] = … threw in strict mode — every run since Oct 26 15:03 UTC failed at "coach extras" and p2026_cbb-coachx stopped updating */
  let P = await getPack("p2000_cbb-portalyrs").catch(() => null); if (!P || !P.y || typeof P.y !== "object") P = { y: {} }; let calls = 0;
  for (let y = 2021; y <= S; y++) { if (P.y[y] && y < S) continue;
    const R = await cb("/recruiting/portal", { year: y }).catch(() => null); calls++; if (!R || !R.length) continue;
    P.y[y] = R.map(p => [`${p.firstName || ""} ${p.lastName || ""}`.trim(), (p.origin || {}).id ?? null, (p.destination || {}).id ?? null, p.stars ?? null, p.rating ?? null]) }
  if (calls) await putPack("p2000_cbb-portalyrs", P);
  const inn = {}, outn = {};
  for (const [Y, rows] of Object.entries(P.y)) { const y = +Y;
    for (const [nm, from, to] of rows) {
      const ids = byNT[normName(nm) + "|" + from], pid = ids && ids.size === 1 ? [...ids][0] : null;
      const after = pid && to != null ? rowOf[pid + "|" + (y + 1)] : null;
      if (to != null) { const c = coachOf(to, y + 1); if (c) { const k = c + "|" + (y + 1) + "|" + to; (inn[k] = inn[k] || []).push([nm, from, after && after.tm === to ? after.g : null, after && after.tm === to ? pg(after) : null, after && after.tm === to ? r1(after.ws) : null]) } }
      if (from != null) { const c = coachOf(from, y); if (c) { const k = c + "|" + y + "|" + from, before = pid ? rowOf[pid + "|" + y] : null; (outn[k] = outn[k] || []).push([nm, to, after ? pg(after) : null, after ? r1(after.ws) : null, before ? pg(before) : null]) } } } }
  const byWs = (a, b) => (b[4] ?? b[3] ?? -1) - (a[4] ?? a[3] ?? -1);
  for (const [k, L] of Object.entries(inn)) { const [c, y, t] = k.split("|"); push("pin", c, [+y, +t, L.sort((a, b) => (b[4] ?? -1) - (a[4] ?? -1)).slice(0, 12)]) }
  for (const [k, L] of Object.entries(outn)) { const [c, y, t] = k.split("|"); push("pout", c, [+y, +t, L.sort((a, b) => (b[3] ?? -1) - (a[3] ?? -1)).slice(0, 12)]) }

  /* ---- player development ---- */
  const yrOf = {}; for (const y of Object.keys(ALL).sort()) for (const r of ALL[y]) if (r.min > 0) { const k = r.id; yrOf[k + "|" + y] = (yrOf[k + "|last"] || 0) + 1; yrOf[k + "|last"] = yrOf[k + "|" + y] }
  const eff40 = r => 40 * ((r.pts || 0) + (r.reb || 0) + (r.ast || 0) + (r.stl || 0) + (r.blk || 0) - ((r.fga || 0) - (r.fgm || 0)) - ((r.fta || 0) - (r.ftm || 0)) - (r.tov || 0)) / Math.max(1, r.min);
  const pairs = [];
  for (const [y, rows] of Object.entries(ALL)) { const y2 = +y + 1; if (!ALL[y2]) continue;
    /* production per 40 from the box score (points + rebounds + assists + steals + blocks − missed shots − turnovers): the same math every
       season — CollegeBasketballData's win shares run on a different, broken scale before 2013–14 (median −0.15 WS/40 in 2007–08) */
    for (const r of rows) { if (r.min < 200) continue; const n = rowOf[r.id + "|" + y2]; if (!n || n.tm !== r.tm || n.min < 200) continue;
      if (rowOf[r.id + "|" + y] !== r) continue;
      pairs.push({ id: r.id, nm: n.nm, tm: r.tm, y: y2, cls: Math.min(4, yrOf[r.id + "|" + y] || 1), dws: eff40(n) - eff40(r), dpts: 40 * n.pts / n.min - 40 * r.pts / r.min, a: r, b: n, c: coachOf(r.tm, y2), c0: coachOf(r.tm, +y) }) } }
  const base = {}; for (const p of pairs) { const k = p.y + "|" + p.cls, b = base[k] = base[k] || [0, 0, 0]; b[0] += p.dws; b[1] += p.dpts; b[2]++ }
  const byC = {}; for (const p of pairs) { if (!p.c || p.c !== p.c0) continue; const b = base[p.y + "|" + p.cls]; const ex = { ...p, xws: p.dws - b[0] / b[2], xpts: p.dpts - b[1] / b[2] }; (byC[p.c] = byC[p.c] || []).push(ex) }
  for (const [c, L] of Object.entries(byC)) { const n = L.length;
    out.dev[c] = { n, ws: r1(L.reduce((a, p) => a + p.xws, 0) / n), pts: r1(L.reduce((a, p) => a + p.xpts, 0) / n), up: L.filter(p => p.xws > 0).length,
      top: [...L].sort((a, b) => b.xws - a.xws).slice(0, 5).map(p => [p.nm, p.y, p.tm, pg(p.a), pg(p.b), r1(eff40(p.a)), r1(eff40(p.b))]) } }

  /* ---- freshmen minutes (Oct 24 — Sam: "see what type of recruits typically play early for coaches or take time to develop"): every
     rated recruit we can find in his first season at the school he signed with, his minutes a game against every D-I freshman of the same
     star rating that year. fr[coach] = { n, x: extra minutes a game, by: { stars: [n, x] } }; frBase[stars] = D-I minutes a game (last 3
     classes), for the site's roster estimates */
  { const F = []; for (const [Y, list] of Object.entries(H.rec || {})) { const y = +Y + 1; for (const r of list) { if (r[6] == null || r[1] == null || !r[3]) continue;
      const row = rowOf[r[6] + "|" + y]; if (!row || row.tm !== r[1] || !row.g) continue; F.push({ y, st: Math.max(2, Math.min(5, r[3])), mpg: row.min / row.g, c: coachOf(r[1], y) }) } }
    const B = {}; for (const f of F) { const k = f.y + "|" + f.st, b = B[k] = B[k] || [0, 0]; b[0] += f.mpg; b[1]++ }
    const byC = {}; for (const f of F) { if (!f.c) continue; const b = B[f.y + "|" + f.st]; (byC[f.c] = byC[f.c] || []).push({ st: f.st, x: f.mpg - b[0] / b[1] }) }
    for (const [c, L] of Object.entries(byC)) { const by = {}; for (const f of L) { const z = by[f.st] = by[f.st] || [0, 0]; z[0]++; z[1] += f.x }
      out.fr[c] = { n: L.length, x: r1(L.reduce((a, f) => a + f.x, 0) / L.length), by: Object.fromEntries(Object.entries(by).map(([k, [n, x]]) => [k, [n, r1(x / n)]])) } }
    const ys = [...new Set(F.map(f => f.y))].sort((a, b) => b - a).slice(0, 3); for (const st of [2, 3, 4, 5]) { const L = F.filter(f => f.st === st && ys.includes(f.y)); if (L.length) out.frBase[st] = [L.length, r1(L.reduce((a, f) => a + f.mpg, 0) / L.length)] } }

  /* ---- transfers in, and players coming back (Oct 24 — Sam: "there is history of transfers on to teams from coaches and there are for
     sure data on how they use them along with players they've been developing or missed the prior season due to injury but had good
     numbers the season prior, wherever they played"):
     tr[coach] = { n, dm, de }: his incoming transfers' minutes a game and production per 40 at his school against their last season
     before the move, minus the same change for every D-I transfer that year — how much more (or less) he plays and gets out of them.
     prev[player] = his most recent full season (300+ minutes, the last three) when the season just finished was under 100 minutes —
     an injury or a redshirt — so the site can count him at those numbers: [season, team, g, min, pts, orb, ast, stl, blk, tov, fga, fgm,
     tpa, tpm, fta, ftm, reb] */
  { const T = []; for (const [Y, rows] of Object.entries(P.y)) { const y = +Y;
      for (const [nm, from, to] of rows) { if (from == null || to == null) continue; const ids = byNT[normName(nm) + "|" + from], pid = ids && ids.size === 1 ? [...ids][0] : null; if (!pid) continue;
        const a = rowOf[pid + "|" + y], b = rowOf[pid + "|" + (y + 1)]; if (!a || !b || a.tm !== from || b.tm !== to || a.min < 150 || !a.g || !b.g) continue;
        T.push({ y: y + 1, c: coachOf(to, y + 1), dm: b.min / b.g - a.min / a.g, de: eff40(b) - eff40(a) }) } }
    const B = {}; for (const t of T) { const z = B[t.y] = B[t.y] || [0, 0, 0]; z[0] += t.dm; z[1] += t.de; z[2]++ }
    const byC = {}; for (const t of T) { if (!t.c) continue; const z = B[t.y]; (byC[t.c] = byC[t.c] || []).push([t.dm - z[0] / z[2], t.de - z[1] / z[2]]) }
    for (const [c, L] of Object.entries(byC)) out.tr[c] = { n: L.length, dm: r1(L.reduce((a, x) => a + x[0], 0) / L.length), de: r1(L.reduce((a, x) => a + x[1], 0) / L.length) };
    const last = {}; for (const r of ALL[S] || []) last[r.id] = Math.max(last[r.id] || 0, r.min || 0);
    for (const y of [S - 1, S - 2, S - 3]) for (const r of ALL[y] || []) { if ((last[r.id] || 0) >= 100 || out.prev[r.id] || r.min < 300 || !r.g) continue;
      out.prev[r.id] = [y, r.tm, r.g, Math.round(r.min), r.pts || 0, r.orb || 0, r.ast || 0, r.stl || 0, r.blk || 0, r.tov || 0, r.fga || 0, r.fgm || 0, r.tpa || 0, r.tpm || 0, r.fta || 0, r.ftm || 0, r.reb || 0] } }

  /* ---- shot diet ---- */
  const share = z => { const a = z.map(v => v[1]), t = a.reduce((x, v) => x + v, 0); if (t < 200) return null;
    return [a[0] / t, a[1] / t, (a[2] + a[3] + a[4] + a[5] + a[6]) / t, (a[7] + a[11]) / t, (a[8] + a[9] + a[10]) / t].map(r3) };
  for (let y = SH_FROM; y <= S; y++) { const SP = await getPack(`p${y}_cbb-shots`).catch(() => null); if (!SP || !SP.teams) continue; const acc = [0, 0, 0, 0, 0]; let n = 0;
    for (const [t, T] of Object.entries(SP.teams)) { if (D1 && !D1.has(+t)) continue; const o = T.o && share(T.o.z), d = T.d && share(T.d.z); if (!o && !d) continue;
      out.sh[y + "|" + t] = [o, d]; if (o) { o.forEach((v, i) => acc[i] += v); n++ } }
    if (n) out.shAvg[y] = acc.map(v => r3(v / n)) }

  await putPack(`p${S}_cbb-coachx`, out);
  log(`coach extras: ${Object.keys(out.rc).length} with classes, ${Object.keys(out.pin).length} with transfers in, ${Object.keys(out.dev).length} with development (${pairs.length} player pairs), ${Object.keys(out.fr).length} with freshmen minutes, ${Object.keys(out.tr).length} with transfer use, ${Object.keys(out.prev).length} players back from a missed season, ${Object.keys(out.sh).length} team shot diets · ${calls} portal calls`);
  return out;
}
