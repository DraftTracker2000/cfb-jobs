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

