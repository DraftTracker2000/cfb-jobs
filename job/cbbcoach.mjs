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
  const years = []; for (let y = from; y <= to; y++) if (!C.seasons[y] || (y === to && weekly)) years.push(y);   /* a finished season is never re-read: ESPN then lists the new coach for the old season too */
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
/* one team per coach per season. ESPN sometimes lists a coach at two teams in one season (his old team's page not yet updated). The
   team he is at the season after is where he went, so the other one was that season's; in the latest season, the team that's new
   to him is the real one. */
export function dedupeCoachSeasons(seasons) {
  const out = {}; const ys = Object.keys(seasons).map(Number).sort((a, b) => a - b);
  const teamOf = (y, cid) => { const m = seasons[y]; if (!m) return []; return Object.keys(m).filter(t => m[t] === cid) };
  for (const y of ys) { const m = seasons[y], by = {}; for (const [t, c] of Object.entries(m)) (by[c] = by[c] || []).push(t);
    const keep = {};
    for (const [c, ts] of Object.entries(by)) { if (ts.length === 1) { keep[ts[0]] = c; continue }
      const nxt = teamOf(y + 1, c), prv = teamOf(y - 1, c);
      const pick = seasons[y + 1] ? ts.find(t => !nxt.includes(t)) : ts.find(t => !prv.includes(t));
      if (pick) keep[pick] = c }
    out[y] = keep }
  return out;
}
export function coachRecords({ C, seasons, lines, adj, S }) {
  const out = {}, cur = {}; C = { ...C, seasons: dedupeCoachSeasons(C.seasons) };
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
  for (const [y, map] of Object.entries(C.seasons)) if (+y >= S) for (const [tid, cid] of Object.entries(map)) { cur[tid] = cid; if (!out[cid]) out[cid] = { nm: C.names[cid] || "Coach " + cid, seasons: {} } }   /* new hires: named, no record yet */
  /* CoachScore (0–100): percentiles among coaches with 3+ seasons, of his teams' average adjusted net rating (50%), win share (20%),
     NCAA tournament wins per season (20%) and covers (10%) */
  const rows = [];
  for (const [cid, X] of Object.entries(out)) {
    const ss = Object.entries(X.seasons); if (!ss.length) { X.tot = { seasons: 0, w: 0, l: 0, nw: 0, nl: 0, aw: 0, al: 0, net: null }; continue } let w = 0, l = 0, nw = 0, aw = 0, al = 0, netSum = 0, netN = 0;
    for (const [y, s] of ss) { s.net = ((adj[y] || {})[s.tm] || [])[0] ?? null; w += s.w; l += s.l; nw += s.nw; aw += s.aw; al += s.al; const a = ((adj[y] || {})[s.tm] || [])[0]; if (a != null) { netSum += a; netN++ } }
    X.tot = { seasons: ss.length, w, l, nw, nl: ss.reduce((a, [, s]) => a + s.nl, 0), aw, al, net: netN ? Math.round(10 * netSum / netN) / 10 : null };
    if (ss.length >= 3 && netN) rows.push([cid, netSum / netN, w / Math.max(1, w + l), nw / ss.length, aw / Math.max(1, aw + al)]);
  }
  const pctOf = (k) => { const v = rows.map(r => r[k]).sort((a, b) => a - b); return x => v.length ? 100 * v.filter(z => z < x).length / v.length : 50 };
  const P = [1, 2, 3, 4].map(pctOf);
  for (const r of rows) out[r[0]].score = Math.round(.5 * P[0](r[1]) + .2 * P[1](r[2]) + .2 * P[2](r[3]) + .1 * P[3](r[4]));
  return { coaches: out, current: cur };
}

/* ---- each team's style by season (Oct 10 — Sam: "coaches for pace of play for his team and all of that") ----
   Pack p2000_cbb-teamhist (cache): { seasons: { year: { teamId: [adjO, adjD, pace, 3PA rate, TO% forced, eFG%, opp eFG%, off. reb %] } } }
   Finished seasons are read once; the current one every run. Two CBBD calls a season. */
export async function buildTeamHist({ cb, getPack, putPack, log, S, from = 2008, full }) {
  let TH = full ? null : await getPack("p2000_cbb-teamhist").catch(() => null);
  if (!TH || !TH.seasons) TH = { seasons: {} };
  const r1 = x => x == null || isNaN(x) ? null : Math.round(10 * x) / 10, pc = x => x == null ? null : (x < 1 ? 100 * x : x);
  for (let y = from; y <= S; y++) { if (TH.seasons[y] && y < S) continue;
    const [adj, ts] = await Promise.all([cb("/ratings/adjusted", { season: y }).catch(() => []), cb("/stats/team/season", { season: y }).catch(() => [])]);
    const A = Object.fromEntries(adj.map(t => [t.teamId, t])), out = {};
    for (const t of ts) { const a = A[t.teamId] || {}, u = t.teamStats || {}, o = t.opponentStats || {}, fg = u.fieldGoals || {}, tp = u.threePointFieldGoals || {}, uf = u.fourFactors || {}, of = o.fourFactors || {};
      out[t.teamId] = [r1(a.offensiveRating), r1(a.defensiveRating), r1(t.pace), fg.attempted ? r1(100 * (tp.attempted || 0) / fg.attempted) : null, r1(pc(of.turnoverRatio)), r1(uf.effectiveFieldGoalPct), r1(of.effectiveFieldGoalPct), r1(uf.offensiveReboundPct)] }
    if (Object.keys(out).length) TH.seasons[y] = out }
  await putPack("p2000_cbb-teamhist", TH);
  log(`team history: ${Object.keys(TH.seasons).length} seasons`);
  return TH;
}

/* ---- full coaching careers from Wikipedia (CBBD has no coaches; ESPN's staff lists start in 2014) ----
   One page per coach (found by search, checked to be a basketball coach at his current school), read from the infobox: overall record,
   NCAA tournament record, national titles, Final Fours, head-coaching stops. Cached in p2000_cbb-wiki, re-read after 7 days.
   Shown on the site as "career", credited to Wikipedia with a link. */
const WUA = { "User-Agent": "mycbbbigboard.com data job (college basketball stats site; contact via the site)" };
const clean = s => String(s || "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/\{\{[^}]*\}\}/g, "").replace(/<[^>]+>/g, "").replace(/'''?/g, "").trim();
export function parseCoachInfobox(w) {
  const line = k => { const m = w.match(new RegExp("\\|\\s*" + k + "\\s*=\\s*([^\\n]*)")); return m ? m[1] : "" };
  const wl = s => { let m = s.match(/\{\{\s*(?:Winning percentage|winpct|Win percentage)\s*\|\s*(\d+)\s*\|\s*(\d+)/i); if (m) return [+m[1], +m[2]]; m = clean(s).match(/(\d+)\s*[–-]\s*(\d+)/); return m ? [+m[1], +m[2]] : null };
  const ov = wl(line("overall_record")), tr = line("tournament_record"); let ncaa = null; { const m = tr.match(/(\d+)\s*[–-]\s*(\d+)\s*\(\s*\[\[NCAA Division I/i) || tr.match(/(\d+)\s*[–-]\s*(\d+)\s*\(\s*NCAA/i); if (m) ncaa = [+m[1], +m[2]] }
  const champ = (w.match(/\|\s*championships\s*=([\s\S]*?)\n\s*\|\s*[a-z_]+\s*=|\|\s*championships\s*=([\s\S]*?)\n\}\}/i) || [])[1] || "";
  let titles = 0, ff = 0; for (const l of champ.split(/\n|<br\s*\/?>/)) { const t = clean(l); const years = (t.match(/\b(19|20)\d{2}\b/g) || []).length;
    if (/Final Four/i.test(t)) { const n = t.match(/^\*?\s*(\d+)\s*[×x]?\s/); ff += n ? +n[1] : years }
    else if (/NCAA Division I (men's basketball )?(tournament|champion)/i.test(t) && !/regional|Elite|Sweet/i.test(t)) { const n = t.match(/^\*?\s*(\d+)\s*[×x]?\s/); titles += n ? +n[1] : Math.max(1, years) } }
  const stops = []; for (let i = 1; i <= 25; i++) { const yrs = clean(line("coach_years" + i)), tm = clean(line("coach_team" + i)); if (!yrs && !tm) continue; if (!tm || /assistant|associate|\bHS\b|high school|graduate|director|\(GA\)/i.test(tm)) continue; stops.push([yrs, tm.replace(/\s*\(.*?\)\s*$/, "")]) }
  return { ov, ncaa, titles, ff, stops };
}
export async function wikiCoaches({ getPack, putPack, log, coaches, full }) {
  let W = full ? null : await getPack("p2000_cbb-wiki").catch(() => null); if (!W || !W.c || W.v !== 2) W = { v: 2, c: {} };   /* v2: the first pass was rate-limited and cached its misses */
  const todo = coaches.filter(c => !W.c[c.cid] || Date.now() - (W.c[c.cid].at || 0) > 7 * 864e5);
  let n = 0, found = 0;
  /* one request at a time with a short pause (Wikimedia's API etiquette); a 429 or 403 backs off and retries */
  /* a refusal (403) or repeated rate limits stop the whole pass for this run, so a blocked job can't stall for hours; the time box is 4 minutes */
  let fails = 0, stop = false; const t0 = Date.now(), codes = {};
  const get = async u => { if (stop) return null; for (let k = 0; k < 3; k++) { try { await new Promise(r => setTimeout(r, 150)); const r = await fetch(u, { headers: WUA }); codes[r.status] = (codes[r.status] || 0) + 1; if (r.ok) { fails = 0; return await r.json() } if (r.status === 404) return null; if (r.status === 403) { stop = true; return null } } catch (e) { codes.err = (codes.err || 0) + 1 } await new Promise(r => setTimeout(r, 2000 * (k + 1))) }
    if (++fails >= 5 || Date.now() - t0 > 240e3) stop = true; return null };
  let i = 0; await Promise.all(Array.from({ length: 1 }, async () => { while (i < todo.length) { const c = todo[i++];
    const q = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(c.nm + " basketball coach " + (c.school || ""))}&srlimit=3&format=json`); n++;
    if (!q) continue;   /* the lookup failed: try again next run, don't remember a miss */
    let rec = { at: Date.now() };
    for (const hit of ((q || {}).query || {}).search || []) { const pg = await get(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(hit.title)}&prop=wikitext&section=0&format=json&redirects=1`); n++;
      const w = pg && pg.parse && pg.parse.wikitext ? pg.parse.wikitext["*"] : ""; if (!/coach_team|overall_record/.test(w)) continue;
      const last = String(c.nm).split(" ").pop(); if (!new RegExp(last, "i").test(hit.title) || (c.school && !w.includes(c.school.split(" ")[0]))) continue;
      rec = { at: Date.now(), t: pg.parse.title, ...parseCoachInfobox(w) }; found++; break }
    W.c[c.cid] = rec } }));
  await putPack("p2000_cbb-wiki", W);
  W.lastRun = { at: Date.now(), calls: n, found, codes, stopped: stop };   /* visible in the pack, since the job's log isn't */
  log(`wikipedia coaches: ${todo.length} to look up (${n} calls), ${found} found · ${Object.values(W.c).filter(x => x.t).length} on file · ${JSON.stringify(codes)}${stop ? " · stopped early" : ""}`);
  return W;
}
