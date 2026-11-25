/* Award winners' seasons (Nov 24 — the owner, 11:36 pm, yes to the awards ideas: the reigning winner honored on each award card with his season,
   every past winner, what a winning season looks like, trophies by school, sweeps). The winners come from the site's own lists
   (public/data/col-awards.json — 16 national college awards, 2000 on; public/data/nfl-awards.json — the five AP awards, 1999 on); this job
   only adds each winner's season line and team:
   - college: CollegeFootballData's season totals (bowls in, holes filled by the proxy) for 2004 on, matched by name and school, plus the
     team's record that year; 2000–2003 winners keep no line (no season totals that far back);
   - NFL: our own game logs (regular season), the winner found by name among the players who played that season (the most games when two
     share a name), plus his team (most games).
   Output p2000_awards-hist: { v:1, at, col: { award: [[year, name, school, pos, line|null, "W-L"|""]] }, nfl: { award: [[year, name, gsis|"",
   team|"", pos|"", line|null]] }, miss: [...] }. line = { stat: value } with only the stats he has. Nothing else is read or changed. */

const nk = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const ALIAS = { "Patrick Surtain II": "Pat Surtain II" };

export async function buildAwHist({ site, token, getPack, cur, log = console.log }) {
  const H = { headers: { Authorization: "Bearer " + token } }, miss = [];
  const cf = async path => { for (let k = 0; k < 4; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) return r.json();
    if (r.status === 429) await new Promise(r => setTimeout(r, 5000)) } catch (e) { } await new Promise(r => setTimeout(r, 1500)) } return null };
  const CA = await (await fetch(site + "/data/col-awards.json")).json(), NA = await (await fetch(site + "/data/nfl-awards.json")).json();

  /* college */
  const MAP = { passing: { COMPLETIONS: "cmp", ATT: "att", YDS: "pyd", TD: "ptd", INT: "int" }, rushing: { CAR: "car", YDS: "ryd", TD: "rtd" }, receiving: { REC: "rec", YDS: "yds", TD: "td" },
    defensive: { TOT: "tkl", TFL: "tfl", SACKS: "sk", PD: "pd", "QB HUR": "hur", TD: "dtd" }, interceptions: { INT: "dint", TD: "pick6" }, kickReturns: { TD: "krtd" }, puntReturns: { TD: "prtd" } };
  const years = [...new Set(Object.values(CA.national).flatMap(L => L.map(w => w[0])))].filter(y => y >= 2004 && y <= cur).sort();
  const SY = {}, REC = {};
  for (const y of years) { const by = {};
    for (const cat of Object.keys(MAP)) { const L = await cf(`/stats/player/season?year=${y}&category=${cat}`) || [];
      for (const r of L) { const s = MAP[cat][r.statType]; if (!s) continue; const k = nk(r.player) + "|" + r.team, x = by[k] = by[k] || { n: r.player, t: r.team, v: {} }; x.v[s] = (x.v[s] || 0) + (+r.stat || 0) } }
    SY[y] = by; const R = await cf(`/records?year=${y}`) || []; REC[y] = Object.fromEntries(R.map(r => [r.team, `${r.total.wins}-${r.total.losses}`]));
    log(`awhist: college ${y} · ${Object.keys(by).length} player lines`) }
  const col = {};
  for (const [aw, L] of Object.entries(CA.national)) col[aw] = L.map(([y, n, sch, pos]) => { let line = null;
    if (SY[y]) { const k = nk(n) + "|" + sch; let x = SY[y][k]; if (!x) { const c = Object.entries(SY[y]).filter(([kk]) => kk.startsWith(nk(n) + "|")); if (c.length === 1) x = c[0][1] }
      /* a different first name in CFBD's list (Cam → Cameron Ward, Ugo → Ugochukwu Amadi, KC → Kevin Concepcion): the same school and last name, when only one fits */
      if (!x) { const ln = w => nk(String(w).replace(/\b(Jr|Sr|II|III|IV|V)\b\.?/g, "").trim().split(/\s+/).pop()), want = ln(n), alt = { "Miami (FL)": "Miami", "Miami (OH)": "Miami (OH)" };
        const c = Object.values(SY[y]).filter(v => (v.t === sch || v.t === alt[sch]) && ln(v.n) === want); if (c.length === 1) x = c[0] }
      if (x) line = Object.fromEntries(Object.entries(x.v).filter(([, v]) => v).map(([k, v]) => [k, Math.round(v * 10) / 10])); else miss.push(`col ${aw} ${y} ${n} (${sch})`) }
    return [y, n, sch, pos || "", line, (REC[y] && REC[y][sch]) || ""] });

  /* NFL */
  const PL = await getPack(`p${cur}_nfl-players`), DP = await getPack(`p${cur}_nfl-dplayers`);
  const iP = F => F && F.cols ? F.cols.indexOf("pos") : -1, nmOf = {}, posOf = {};
  for (const F of [PL, DP]) if (F && F.p) for (const [g, r] of Object.entries(F.p)) { nmOf[g] = nmOf[g] || r[0]; posOf[g] = posOf[g] || r[iP(F)] || "" }
  const byName = {}; for (const [g, n] of Object.entries(nmOf)) (byName[nk(n)] = byName[nk(n)] || []).push(g);
  const SEA = {};
  const season = async s => { if (SEA[s]) return SEA[s]; const out = {};
    for (const kind of ["logs", "def"]) { let L = null; try { L = await getPack(`p${cur}_nfl-${kind}-${s}`) } catch { } const T = L && (kind === "def" && L.def ? L.def : L); if (!T || !T.p || !T.cols) continue;
      const c = Object.fromEntries(T.cols.map((k, i) => [k, i]));
      for (const [g, rows] of Object.entries(T.p)) for (const r of rows) { if (r[c.type] !== "R") continue; const x = out[g] = out[g] || { gm: new Set(), tm: {}, v: {} }; x.gm.add(r[c.game]); x.tm[r[c.team]] = (x.tm[r[c.team]] || 0) + 1;
        const add = (k, v) => { if (+v) x.v[k] = (x.v[k] || 0) + (+v) };
        if (kind === "logs") { for (const k of ["cmp", "att", "pyd", "ptd", "int", "car", "ryd", "rtd", "rec", "yds", "td"]) add(k, r[c[k]]) }
        else { add("tkl", (+r[c.solo] || 0) + (+r[c.ast] || 0)); add("sk", r[c.sk]); add("tfl", r[c.tfl]); add("dint", r[c.int]); add("pd", r[c.pd]); add("ff", r[c.ff]); add("dtd", r[c.td]) } } }
    return SEA[s] = out };
  const nfl = {};
  for (const [aw, L] of Object.entries(NA.awards)) { nfl[aw] = [];
    for (const [y, n0] of L) { const n = ALIAS[n0] || n0, S = await season(y); const C = (byName[nk(n)] || []).filter(g => S[g]).sort((a, b) => S[b].gm.size - S[a].gm.size);
      const g = C[0]; if (!g) { miss.push(`nfl ${aw} ${y} ${n0}`); nfl[aw].push([y, n0, "", "", "", null]); continue }
      const x = S[g], tm = Object.entries(x.tm).sort((a, b) => b[1] - a[1])[0][0];
      nfl[aw].push([y, n0, g, tm, posOf[g] || "", Object.fromEntries(Object.entries(x.v).map(([k, v]) => [k, Math.round(v * 10) / 10]).concat([["g", x.gm.size]]))]) } }
  log(`awhist: ${Object.values(col).flat().length} college winners (${Object.values(col).flat().filter(r => r[4]).length} with a line) · ${Object.values(nfl).flat().length} NFL (${Object.values(nfl).flat().filter(r => r[2]).length} matched) · missed ${miss.length}`);
  for (const m of miss) log("  miss: " + m);
  return { v: 1, at: Date.now(), col, nfl, miss };
}
