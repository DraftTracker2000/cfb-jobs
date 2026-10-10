/* Basketball head coaches (Oct 9 — Sam approved ESPN for the staff lists; CBBD has no coaches). ESPN's public core API lists each team's
   head coach by season (2016 on for most teams); every record is worked out from our own game results (CBBD), so the numbers match the
   rest of the site. ESPN team ids are CBBD's sourceId.

   Pack p2000_cbb-coachids (cache): { seasons: { year: { cbbdTeamId: espnCoachId } }, names: { espnCoachId: "First Last" }, at }
   The current season is re-read once a week (a coaching change shows up within a week); past seasons never change. */
const BASE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url) {
  for (let k = 0; k < 4; k++) {
    try { const r = await fetch(url, { headers: { "User-Agent": "mycbbbigboard data job" } }); if (r.status === 404) return null; if (r.ok) return await r.json(); if (r.status < 500 && r.status !== 429) return null } catch { }
    await sleep(1500 * (k + 1));
  }
  return null;
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]) } })) }

export async function buildCoachIds({ getPack, putPack, log, teams, from = 2013, to, full }) {
  let C = full ? null : await getPack("p2000_cbb-coachids").catch(() => null);
  if (!C || !C.seasons) C = { seasons: {}, names: {}, at: 0 };
  const weekly = Date.now() - (C.at || 0) > 6 * 864e5;
  const years = []; for (let y = from; y <= to; y++) if (!C.seasons[y] || (y >= to - 1 && weekly)) years.push(y);
  if (!years.length) { log(`coaches: cached (${Object.keys(C.names).length} coaches)`); return C }
  let calls = 0;
  for (const y of years) {
    const map = {};
    await pool(teams.filter(t => t.sourceId), 8, async t => {
      const j = await getJSON(`${BASE}/seasons/${y}/teams/${t.sourceId}/coaches`); calls++;
      const ref = j && j.items && j.items[0] && j.items[0].$ref; if (!ref) return;
      const cid = (ref.match(/coaches\/(\d+)/) || [])[1]; if (!cid) return; map[t.id] = cid;
      if (!C.names[cid]) { const c = await getJSON(`${BASE}/seasons/${y}/coaches/${cid}`); calls++; if (c) C.names[cid] = [c.firstName, c.lastName].filter(Boolean).join(" ") }
    });
    if (Object.keys(map).length) C.seasons[y] = map;
  }
  C.at = Date.now();
  await putPack("p2000_cbb-coachids", C);
  log(`coaches: ${years.join(", ")} read (${calls} ESPN calls) · ${Object.keys(C.names).length} coaches`);
  return C;
}

/* every head coach's record from our results. rows: past seasons' game rows from the ghist cache plus this season's, each
   [id, date, home, away, hs, as, neutral, conf, eloH, eloA, post, tournament]; lines: { year: { gid: [spread, total] } } */
export function coachRecords({ C, seasons, lines, adj, S }) {
  const out = {}, cur = {};
  for (const [y, rows] of Object.entries(seasons)) {
    const map = C.seasons[y]; if (!map) continue;
    for (const r of rows) for (const side of ["h", "a"]) {
      const tid = side === "h" ? r[2] : r[3], cid = map[tid]; if (!cid) continue;
      const my = side === "h" ? r[4] : r[5], th = side === "h" ? r[5] : r[4]; if (my == null || th == null) continue;
      const X = out[cid] = out[cid] || { nm: C.names[cid] || "Coach " + cid, seasons: {} };
      const s = X.seasons[y] = X.seasons[y] || { tm: tid, w: 0, l: 0, cw: 0, cl: 0, nw: 0, nl: 0, aw: 0, al: 0, ap: 0, close: [0, 0], fav: [0, 0], dog: [0, 0] };
      const won = my > th; won ? s.w++ : s.l++; if (r[7]) won ? s.cw++ : s.cl++;
      if (/NCAA/i.test(r[11] || "")) won ? s.nw++ : s.nl++;
      if (Math.abs(my - th) <= 5) s.close[won ? 0 : 1]++;
      const L = (lines[y] || {})[r[0]]; if (L && L[0] != null && L[0] !== 0) { const sp = side === "h" ? L[0] : -L[0], v = my - th + sp; if (v > 0) s.aw++; else if (v < 0) s.al++; else s.ap++; (sp < 0 ? s.fav : s.dog)[won ? 0 : 1]++ }
    }
  }
  for (const [y, map] of Object.entries(C.seasons)) if (+y >= S) for (const [tid, cid] of Object.entries(map)) cur[tid] = cid;
  /* CoachScore (0–100): percentiles among coaches with 3+ seasons, of his teams' average adjusted net rating (50%), win share (20%),
     NCAA tournament wins per season (20%) and covers (10%) */
  const rows = [];
  for (const [cid, X] of Object.entries(out)) {
    const ss = Object.entries(X.seasons); let w = 0, l = 0, nw = 0, aw = 0, al = 0, netSum = 0, netN = 0;
    for (const [y, s] of ss) { s.net = ((adj[y] || {})[s.tm] || [])[0] ?? null; w += s.w; l += s.l; nw += s.nw; aw += s.aw; al += s.al; const a = ((adj[y] || {})[s.tm] || [])[0]; if (a != null) { netSum += a; netN++ } }
    X.tot = { seasons: ss.length, w, l, nw, nl: ss.reduce((a, [, s]) => a + s.nl, 0), aw, al, net: netN ? Math.round(10 * netSum / netN) / 10 : null };
    if (ss.length >= 3 && netN) rows.push([cid, netSum / netN, w / Math.max(1, w + l), nw / ss.length, aw / Math.max(1, aw + al)]);
  }
  const pctOf = (k) => { const v = rows.map(r => r[k]).sort((a, b) => a - b); return x => v.length ? 100 * v.filter(z => z < x).length / v.length : 50 };
  const P = [1, 2, 3, 4].map(pctOf);
  for (const r of rows) out[r[0]].score = Math.round(.5 * P[0](r[1]) + .2 * P[1](r[2]) + .2 * P[2](r[3]) + .1 * P[3](r[4]));
  return { coaches: out, current: cur };
}
