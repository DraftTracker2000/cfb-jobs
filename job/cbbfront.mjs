/* The NBA front offices (Oct 17 — Phase 6, the owner: "push forward with the plan"; "im going to assume theres not contract data"). Weekly:
   - each team's general manager and the year he was hired, from Wikipedia's "List of NBA general managers" table (names only; Wikipedia's
     text is CC BY-SA). The admin can correct a row on the site; the same way the NFL GM list works.
   - every rostered player's contract this season from ESPN's public NBA API (sports.core.api.espn.com …/athletes/{id}/contracts/{season}):
     salary, years left after this one, option (0 none, 1 team, 2 player), Bird rights, and whether it's a minimum deal. ESPN lists the
     current and past seasons only, so future years aren't shown as dollars — only how many are left.
   Saved as p{S}_cbb-nbafront = { at, season, gms: { ab: [name, since] }, con: { espnId: [salary, yearsLeft, option, bird, min, teamAb] } }.
   Skipped when the pack is under six days old (the owner: never re-fetch what hasn't changed). */
const UA = { "User-Agent": "mycbbbigboard.com data job (NBA front offices)" };
export function parseNbaGMs(wt, nameToAb) {
  const out = {}; const rows = wt.split(/\n\|-\s*\n/);
  for (const r of rows) {
    const L = r.split("\n").map(x => x.trim()).filter(Boolean); if (L.length < 5) continue;
    const tm = (L[0].match(/\[\[([^\]|]+)/) || [])[1]; const ab = tm && nameToAb[tm.trim()]; if (!ab) continue;
    let g = L[1].replace(/^!\s*(scope="row"\s*\|)?/, "").replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, "").trim();
    const m = g.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/); g = (m ? (m[2] || m[1].replace(/\s*\([^)]*\)\s*$/, "")) : g).replace(/'''?/g, "").trim();
    const since = +(L.slice(2).map(x => (x.match(/^\|\s*(\d{4})\b/) || [])[1]).find(Boolean) || 0);
    if (g) out[ab] = [g, since || null];
  }
  return out;
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) } })); return out }
export async function buildNbaFront({ getPack, putPack, log, S, curNba }) {
  const old = await getPack(`p${S}_cbb-nbafront`).catch(() => null);
  /* contracts are checked daily (Oct 26 — the owner: rookies, two-ways and new deals were "unknown" for days); the GM list stays weekly */
  if (old && old.at && Date.now() - old.at < 20 * 36e5 && old.season === curNba && old.v === 3) { log("nba front offices: kept (checked today)"); return old }
  const G = await getPack(`p${S}_cbb-nbagames`).catch(() => null); if (!G || !G.teams) { log("nba front offices: no team list yet"); return null }
  const nameToAb = {}; for (const [ab, t] of Object.entries(G.teams)) if (t.nm) nameToAb[t.nm] = ab; nameToAb["LA Clippers"] = nameToAb["LA Clippers"] || "LAC"; nameToAb["Los Angeles Clippers"] = "LAC";
  let gms = (old && old.gms) || {}, gmsAt = (old && old.gmsAt) || 0;
  if (Object.keys(gms).length >= 25 && Date.now() - gmsAt < 6 * 864e5) log("nba GMs: kept (under a week old)"); else try { const r = await fetch("https://en.wikipedia.org/w/api.php?action=parse&page=List_of_NBA_general_managers&prop=wikitext&format=json&formatversion=2&redirects=1", { headers: UA });
    const j = await r.json(); const got = parseNbaGMs(j.parse.wikitext, nameToAb); if (Object.keys(got).length >= 25) { gms = got; gmsAt = Date.now() } log(`nba GMs: ${Object.keys(got).length} from Wikipedia`) } catch (e) { log("nba GMs: " + e.message) }
  /* the team is the one ESPN has the contract with this season (v2, Oct 17 — rosters can lag a trade) */
  const abOfId = {}; for (const [ab, t] of Object.entries(G.teams)) if (t.id != null) abOfId[String(t.id)] = ab;
  const ids = Object.entries(G.allp || {}).filter(([, a]) => a.tm).map(([id, a]) => [id, a.tm]);
  const con = {}; let ok = 0;
  /* Oct 26 (#47 — 301 rostered players had no contract): ESPN often has no record for this season yet but does for last season; a deal with
     years left then carries on (same salary, one year fewer; marked "py"). A deal that ended last season — re-signed or signed elsewhere —
     stays unknown. */
  let carried = 0;
  await pool(ids, 6, async ([id, tm]) => { let r = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/${id}/contracts/${curNba}`), py = false;
    if (!r.ok) { r = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/${id}/contracts/${curNba - 1}`); py = true; if (!r.ok) return }
    const c = await r.json(); if (!c || c.salary == null) return; if (py && !(c.yearsRemaining >= 1)) return;
    const tid = ((c.team && c.team.$ref) || "").match(/teams\/(\d+)/); con[id] = [c.salary, py ? c.yearsRemaining - 1 : c.yearsRemaining ?? null, c.optionType ?? 0, c.birdStatus ?? null, c.minimumSalaryException ? 1 : 0, py ? tm : (tid && abOfId[tid[1]]) || tm, ...(py ? ["py"] : [])]; ok++; if (py) carried++ });
  log(`nba contracts: ${carried} carried over from last season's records`);
  log(`nba contracts: ${ok} of ${ids.length} players (ESPN, ${curNba - 1}–${String(curNba).slice(2)})`);
  const out = { v: 3, at: Date.now(), season: curNba, gms, gmsAt, con: ok >= 200 ? con : (old && old.con) || con };
  try { out.gmsc = await nbaGmScoresJob({ getPack, S, G, gms }); log(`nba GMScore: ${Object.keys(out.gmsc).length} GMs`) } catch (e) { log("nba GMScore: " + e.message) }
  try { const [KS, TH] = await Promise.all([getPack("p2000_cbb-nbastats").catch(() => null), getPack("p2000_cbb-nbateamhist").catch(() => null)]);
    if (KS && KS.coh && Object.keys(KS.coh).length) { out.cosc = nbaCoachScoresJob(KS, TH, G); log(`nba CoachScore: ${Object.values(out.cosc).filter(x => !x.short).length} coaches scored`) } } catch (e) { log("nba CoachScore: " + e.message) }
  await putPack(`p${S}_cbb-nbafront`, out); return out;
}

/* NBA GMScore worked out here (Nov 24 — weights off the members' page, task #59): the basketball page's nbaGmScores, the same formula —
   drafting half (each graded class's first-four-season NBA minutes against what its slots usually get, 2008+ drafts with four seasons
   behind them), winning a third, playoff wins the rest, a new GM pulled toward average; 60 = an average GM. Saved as gmsc in the front-office
   pack; the page reads it and works it out itself only when it's missing. */
const NBA_OLDNM = { "Seattle SuperSonics": "OKC", "New Jersey Nets": "BKN", "Charlotte Bobcats": "CHA", "New Orleans Hornets": "NO", "New Orleans/Oklahoma City Hornets": "NO", "Vancouver Grizzlies": "MEM", "LA Clippers": "LAC", "Los Angeles Clippers": "LAC" };
const ENT = { "&amp;": "&", "&#39;": "'", "&apos;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" };
const pNk = nm => String(nm || "").replace(/&(amp|#39|apos|quot|lt|gt);/g, m => ENT[m]).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/\bronald\b/g, "ron").replace(/[^a-z]/g, "");
export async function nbaGmScoresJob({ getPack, S, G, gms }) {
  const [TH, N0, ALL, D] = await Promise.all([getPack("p2000_cbb-nbateamhist").catch(() => null), getPack(`p${S}_cbb-nba`).catch(() => null), getPack(`p${S}_cbb-nbaall`).catch(() => ({ p: {} })), getPack(`p${S}_cbb-draft`).catch(() => null)]);
  const N = N0 || { players: {} }; if (!D || !D.picks) throw new Error("no draft pack");
  const T = G.teams, nmAb = { ...NBA_OLDNM }; for (const [ab, t] of Object.entries(T)) nmAb[t.nm] = ab;
  const cid2e = {}; for (const [e, x] of Object.entries(N.players || {})) if (x.cid) cid2e[x.cid] = e; const byNm = {}; for (const [e, a] of Object.entries(G.allp || {})) if (a.nm) byNm[pNk(a.nm)] = a.s || []; for (const [e, a] of Object.entries((ALL && ALL.p) || {})) if (a.nm && !byNm[pNk(a.nm)]) byNm[pNk(a.nm)] = a.s || [];
  const rowsOf = d => { const e = d.id && cid2e[d.id]; if (e && N.players[e]) return N.players[e].seasons || []; return byNm[pNk(d.nm)] || [] };
  const lastY = Math.max(...Object.keys((TH && TH.s) || { 2026: 1 }).map(Number)), gradeTo = lastY - 4;
  const val = d => rowsOf(d).filter(r => r[0] > d.y && r[0] <= d.y + 4).reduce((a, r) => a + (+r[4] || 0), 0);
  const P = D.picks.map(d => ({ ...d, v: val(d), ab: nmAb[d.nba] || null })), base = {}; for (const d of P) if (d.y >= 2008 && d.y <= gradeTo) (base[d.pk] = base[d.pk] || []).push(d.v);
  const avg = A => A && A.length ? A.reduce((a, b) => a + b, 0) / A.length : 0, exp = pk => { const A = []; for (let k = pk - 2; k <= pk + 2; k++) if (base[k]) A.push(...base[k]); return Math.max(150, avg(A)) };
  const out = {};
  for (const [ab, [nm, since]] of Object.entries(gms || {})) { if (!T[ab] || !since) continue;
    const mine = P.filter(d => d.ab === ab && d.y >= since), graded = mine.filter(d => d.y >= 2008 && d.y <= gradeTo), cls = {};
    for (const d of graded) { const c = cls[d.y] = cls[d.y] || [0, 0, []]; c[0] += d.v; c[1] += exp(d.pk); c[2].push(d) }
    const C = Object.entries(cls).map(([y, c]) => ({ y: +y, r: c[0] / c[1], picks: c[2] })), sv = C.reduce((a, c) => a + cls[c.y][0], 0), se = C.reduce((a, c) => a + cls[c.y][1], 0), dr = C.length ? sv / se : null;
    const tid = T[ab].id, S0 = Object.entries((TH && TH.s) || {}).filter(([y]) => +y > since).map(([, o]) => o[tid]).filter(Boolean);
    const w = S0.reduce((a, r) => a + r[0], 0), l = S0.reduce((a, r) => a + r[1], 0), pw = S0.reduce((a, r) => a + (r[6] || 0), 0), ns = S0.length;
    const d1 = dr == null ? 1 : 1 + (dr - 1) * C.length / (C.length + 2), w1 = ns ? .5 + (w / Math.max(1, w + l) - .5) * ns / (ns + 2) : .5, p1 = ns ? 2 + (pw / ns - 2) * ns / (ns + 2) : 2;
    const sc = Math.round(Math.max(1, Math.min(99, 60 + 32 * (.5 * (d1 - 1) / .3 + .33 * (w1 - .5) / .15 + .17 * (p1 - 2) / 4))));
    const hits = graded.filter(d => d.v >= 1.15 * exp(d.pk)).length, miss = graded.filter(d => d.v < .85 * exp(d.pk)).length;
    out[ab] = { nm, since, sc, dr, C, n: graded.length, all: mine.length, hits, miss, w, l, pw, ns, still: mine.filter(d => { const e = d.id && cid2e[d.id]; const a = e && G.allp[e]; return a && a.tm === ab }).length } }
  return out;
}

/* NBA CoachScore worked out here (Nov 25 — weights off the members' page, task #59): the basketball page's nbaCoachScores, the same
   formula and tags (win % pulled toward .500, playoff wins, titles and Finals, the lift over the team's season before; 60 = an average coach).
   Saved as cosc in the front-office pack; the page reads it and works it out itself only when it's missing. Keep the two in step
   (tests/run.mjs checks they give the same answer). */
export function nbaCoachScoresJob(KS, TH, G) { const coh = (KS && KS.coh) || {}, rec = {};
  for (const c of Object.values(coh)) for (const r of c.r) { const k = r[1] + "|" + r[0], x = rec[k] = rec[k] || [0, 0]; x[0] += r[2]; x[1] += r[3] }
  if (TH && TH.s && G && G.teams) { const ab = {}; for (const [a, t] of Object.entries(G.teams)) ab[t.id] = a; for (const [y, T] of Object.entries(TH.s)) for (const [id, v] of Object.entries(T)) if (ab[id]) rec[ab[id] + "|" + y] = [v[0], v[1]] }
  const pc = x => x && x[0] + x[1] ? x[0] / (x[0] + x[1]) : null, note = r => String(r[6] || "");
  const out = {}; for (const [nm, c] of Object.entries(coh)) { const R = [...c.r].sort((a, b) => a[0] - b[0]); const w = R.reduce((a, r) => a + r[2], 0), l = R.reduce((a, r) => a + r[3], 0); if (w + l < 82) { out[nm] = { short: 1 }; continue }
    const pw = R.reduce((a, r) => a + r[4], 0), pl = R.reduce((a, r) => a + r[5], 0), seasons = new Set(R.map(r => r[0])).size;
    const titles = R.filter(r => /won\s+nba\s+(championship|finals)/i.test(note(r))).length, finals = R.filter(r => /nba finals/i.test(note(r)) && !/won\s+nba/i.test(note(r))).length;
    const po = new Set(R.filter(r => r[4] + r[5] > 0).map(r => r[0])).size, wins60 = R.filter(r => r[2] >= 60).length;
    /* stints: consecutive seasons with one team */
    const st = []; for (const r of R) { const L = st[st.length - 1]; if (L && L.t === r[1] && r[0] - L.y1 <= 1) { L.y1 = r[0]; L.r.push(r) } else st.push({ t: r[1], y0: r[0], y1: r[0], r: [r] }) }
    const lifts = [], turns = []; for (const S of st) { const before = pc(rec[S.t + "|" + (S.y0 - 1)]); if (before == null) continue; const first = S.r.slice(0, 3), fw = first.reduce((a, r) => a + r[2], 0), fl = first.reduce((a, r) => a + r[3], 0); if (!(fw + fl)) continue;
      lifts.push([fw / (fw + fl) - before, first.length]); if (before <= .4) { const best = Math.max(...S.r.slice(1, 3).map(r => r[2] / Math.max(1, r[2] + r[3])), 0); if (best - before >= .15) turns.push(S.t) } }
    /* each stint's lift counts by the seasons it covers (up to 3), pulled toward 0 by six seasons, so two good years can't outweigh a career */
    const lift = lifts.length ? lifts.reduce((a, [v, n]) => a + v * n, 0) / (lifts.reduce((a, [, n]) => a + n, 0) + 6) : 0;
    out[nm] = { w, l, pw, pl, seasons, titles, finals, po, wins60, lift, turns, wpS: (w + 61.5) / (w + l + 123), poS: pw / (seasons + 3), tf: titles * 3 + finals } }
  const F = Object.values(out).filter(x => !x.short), z = k => { const v = F.map(x => x[k]), m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1; for (const x of F) x["z_" + k] = (x[k] - m) / sd };
  ["wpS", "poS", "tf", "lift"].forEach(z);
  for (const x of F) { const raw = .30 * x.z_wpS + .15 * x.z_poS + .35 * x.z_tf + .20 * x.z_lift; x.raw = raw }
  const sdR = Math.sqrt(F.reduce((a, x) => a + x.raw ** 2, 0) / F.length) || 1;
  for (const x of F) x.score = Math.max(1, Math.min(99, Math.round(60 + 14 * x.raw / sdR)));
  /* tags behind +N */
  for (const x of F) { const T = []; if (x.finals + x.titles >= 3) T.push(["Finals regular", `${x.finals + x.titles} trips to the NBA Finals`]);
    if (x.seasons >= 4 && x.po / x.seasons >= .6) T.push(["Playoff regular", `playoffs in ${x.po} of his ${x.seasons} seasons`]);
    if (x.pw + x.pl >= 20 && x.pw / (x.pw + x.pl) >= .6) T.push(["Big-game coach", `${x.pw}–${x.pl} in the playoffs (${(x.pw / (x.pw + x.pl)).toFixed(3).replace(/^0/, "")})`]);
    if (x.turns.length) T.push(["Turnaround", `took over ${x.turns.join(", ")} at .400 or worse and was 15+ points better by year 2 or 3`]);
    if (x.wins60) T.push(["60-win season", `${x.wins60} season${x.wins60 > 1 ? "s" : ""} with 60+ wins`]);
    x.tags = T }
  return out }
