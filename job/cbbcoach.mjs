/* Basketball head coaches (Oct 9 — Sam approved ESPN for the staff lists; CBBD has no coaches). ESPN's public core API lists each team's
   head coach by season (2016 on for most teams); every record is worked out from our own game results (CBBD), so the numbers match the
   rest of the site. ESPN team ids are CBBD's sourceId.

   Pack p2000_cbb-coachids (cache): { seasons: { year: { cbbdTeamId: espnCoachId } }, names: { espnCoachId: "First Last" }, at }
   The current season is re-read once a week (a coaching change shows up within a week); past seasons never change. */
import { noSR, srSkipped } from "./wikisr.mjs";
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
    /* a season that has ended keeps the coaches it had (Oct 13 — Sam: Michael Malone was shown coaching North Carolina's 2025–26 season):
       after mid-April ESPN files a spring hire under the season just played, so only teams with no coach yet are added */
    const ended = Date.now() > Date.UTC(y, 3, 15);
    if (Object.keys(map).length) C.seasons[y] = ended && C.seasons[y] ? { ...map, ...C.seasons[y] } : map;
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
/* undo a late hire filed under the season before he arrived (Oct 13 — Malone's 2025–26 at North Carolina was Hubert Davis's): when a
   team's coach changes between two seasons and the new man's Wikipedia stop at that school starts in or after the season's end year,
   the season goes back to the coach before him. W = the p2000_cbb-wiki pack's c ({ espnCoachId: { stops: [[years, team]] } });
   names = { cbbdTeamId: school }. Returns how many seasons were put back. */
export function repairLateHires(C, W, names) {
  const k = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); let n = 0;
  for (const y of Object.keys(C.seasons).map(Number).sort((a, b) => a - b)) { const m = C.seasons[y], pm = C.seasons[y - 1]; if (!pm) continue;
    for (const [t, c] of Object.entries(m)) { const p = pm[t]; if (!p || p === c) continue; const w = W && W[c]; if (!w || !w.stops) continue;
      const sch = k(names[t]); if (!sch) continue;
      const st = w.stops.find(([yy, nm]) => { const a = k(nm); return a && (a === sch || a.includes(sch) || sch.includes(a)) && /\d{4}/.test(yy) });
      if (!st) continue; const y0 = +(String(st[0]).match(/\d{4}/) || [0])[0];
      if (y0 >= y) { m[t] = p; n++ } } }
  return n }
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
/* midseason changes (Oct 13 audit — Sam: "did you audit all the other coaches and teams"): ESPN names one coach per team per season, so
   Jake Diebler had all of Ohio State's 2023–24 (Chris Holtmann coached 25 of those games). When the credited coach's Wikipedia record
   for that season has fewer games than the team played, and another coach's record has that team-season with the rest of the games,
   the season is split in date order: whoever coached the team the season before takes the first games. Returns { "y|tid": [[cid, n], [cid2, 999]] }. */
/* Wikipedia's school names next to ours — the same list as the coach page's (public/cbb/index.html). Exact match only: "Texas" must not
   land on Texas Tech (Oct 13: Beard's 2022–23 split went to Mark Adams that way). */
export const WIKI_SCH = { appalachianstate: "appstate", texasamcommerce: "easttexasam", southeasternlouisiana: "selouisiana", ipfw: "purduefortwayne", fortwayne: "purduefortwayne",
  dixiestate: "utahtech", texasarlington: "utarlington", umass: "massachusetts", arkansaslittlerock: "littlerock", ualr: "littlerock", collegeofcharleston: "charleston",
  nichollsstate: "nicholls", mcneesestate: "mcneese", texasriograndevalley: "utriograndevalley", utpa: "utriograndevalley", texaspanamerican: "utriograndevalley",
  missourikansascity: "kansascity", umkc: "kansascity", nebraskaomaha: "omaha", houstonbaptist: "houstonchristian",
  southcarolinaupstate: "uscupstate", louisianalafayette: "louisiana", louisianamonroe: "ulmonroe",
  miamioh: "miamioh", miamiohio: "miamioh", wisconsinmilwaukee: "milwaukee", wisconsingreenbay: "greenbay",
  illinoischicago: "uic", northcarolinastate: "ncstate", longislanduniversity: "longisland", liu: "longisland", connecticut: "uconn", mississippi: "olemiss", miamiohio: "miamioh", stjohnsny: "stjohns", saintmarysca: "saintmarys", hawaii: "hawaii",
  albany: "ualbany", seattle: "seattleu", oklahomasooners: "oklahoma", penn: "pennsylvania", samhoustonstate: "samhouston", stthomas: "stthomasminnesota",
  queens: "queensuniversity", american: "americanuniversity", gramblingstate: "grambling" };
export const wikiSchoolKey = s => { const a = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]/g, ""); return WIKI_SCH[a] || a };
export function midseasonSplits({ C, seasons, R, names }) {
  const k = s => wikiSchoolKey(String(s || "").replace(/&amp;/g, "&"));
  const out = {}; if (!R || !R.c) return out; const recBy = {};
  for (const [cid, x] of Object.entries(R.c)) for (const r of x.r) (recBy[r[0]] = recBy[r[0]] || []).push([cid, r]);
  for (const [y, rows] of Object.entries(seasons)) { const map = C.seasons[y]; if (!map) continue; const N = {};
    for (const r of rows) { if (r[4] == null || r[5] == null) continue; N[r[2]] = (N[r[2]] || 0) + 1; N[r[3]] = (N[r[3]] || 0) + 1 }
    for (const [tid, A] of Object.entries(map)) { const tn = k(names[tid]); if (!tn || !N[tid]) continue; const same = r => k(r[1]) === tn;
      const ra = (recBy[y] || []).find(([cid, r]) => cid === A && same(r)); if (!ra) continue; const nA = ra[1][2] + ra[1][3]; if (N[tid] - nA <= 2 || nA < 1) continue;
      const busy = new Set(Object.entries(map).filter(([t]) => t !== tid).map(([, c]) => c));   /* a coach with his own team that season can't take these games */
      const rb = (recBy[y] || []).find(([cid, r]) => cid !== A && !busy.has(cid) && same(r) && Math.abs(nA + r[2] + r[3] - N[tid]) <= 3), prev = C.seasons[y - 1] || {};
      if (!rb) { /* the other coach has no Wikipedia record here (an interim, or a coach gone before 2014): only when the losses are short too —
          equal losses mean vacated wins or a few games missed (Self 2017–18, 2022–23), not a change — and then the rest go to no one, or to last year's coach */
        const lA = ra[1][3], my = rows.filter(r => r[4] != null && r[5] != null && (r[2] == tid || r[3] == tid)), lost = my.filter(r => r[2] == tid ? r[4] < r[5] : r[5] < r[4]).length;
        if (lost - lA <= 2) continue; const P = prev[tid] && prev[tid] !== A ? prev[tid] : null;
        /* which run of his games: the one whose wins match Wikipedia (Mack missed Louisville's first six in 2021–22, then was let go) — else first if he was there last year, last if he is new */
        const srt = [...my].sort((a, b) => String(a[1]).localeCompare(String(b[1]))), won = srt.map(r => (r[2] == tid ? r[4] > r[5] : r[5] > r[4]) ? 1 : 0), Nt = srt.length;
        const wAt = i => won.slice(i, i + nA).reduce((a, b) => a + b, 0), wA = ra[1][2], def = prev[tid] === A ? 0 : Nt - nA;
        let at = wAt(def) === wA ? def : wAt(0) === wA ? 0 : wAt(Nt - nA) === wA ? Nt - nA : -1; if (at < 0) for (let i = 0; i + nA <= Nt; i++) if (wAt(i) === wA) { at = i; break } if (at < 0) at = def;
        out[y + "|" + tid] = at === 0 ? [[A, nA], [null, 999]] : at + nA >= Nt ? [[P, at], [A, 999]] : [[null, at], [A, nA], [null, 999]]; continue }
      const B = rb[0], nB = rb[1][2] + rb[1][3];
      out[y + "|" + tid] = prev[tid] === B ? [[B, nB], [A, 999]] : [[A, nA], [B, 999]] } }
  return out }
export function coachRecords({ C, seasons, lines, adj, S, split, rankAt }) {
  const out = {}, cur = {}, itm = {}, played = {}; C = { ...C, seasons: dedupeCoachSeasons(C.seasons) }; split = split || {};
  for (const [y, rows0] of Object.entries(seasons)) {
    const map = C.seasons[y]; if (!map) continue; const rows = [...rows0].sort((a, b) => String(a[1]).localeCompare(String(b[1]))), seen = {};
    for (const r of rows) if (r[4] != null && r[5] != null) for (const t of [r[2], r[3]]) if (split[y + "|" + t]) played[y + "|" + t] = (played[y + "|" + t] || 0) + 1;
    /* pass 1: who coached each side of each game (a split season hands its games out in date order) */
    const who = rows.map(r => ["h", "a"].map(side => {
      const tid = side === "h" ? r[2] : r[3]; let cid = map[tid]; if (!cid) return null;
      const sp = split[y + "|" + tid]; if (sp && r[4] != null && r[5] != null) { const i = seen[tid] = (seen[tid] || 0) + 1; let acc = 0; cid = null; for (const [c, n] of sp) { acc += n; if (i <= acc) { cid = c; break } }
        /* games of an interim we have no record for (Oct 13 — Sam: "putting an asterisk on those seasons and calling out the interim in the
           pop-up"): kept per team-season with the coach(es) around them; the name comes from Wikipedia (interimNames) */
        if (!cid) { const my = side === "h" ? r[4] : r[5], th = side === "h" ? r[5] : r[4], I = itm[y + "|" + tid] = itm[y + "|" + tid] || { w: 0, l: 0, by: sp.map(([c]) => c).filter(Boolean), first: null };
          if (I.first == null) I.first = i === 1; I.lastAt = i; my > th ? I.w++ : I.l++; return null } }
      return cid }));
    /* pass 2: the tallies — Oct 13 (Sam: "do all 6 of the basketball coaches stuff"): home / road / neutral, against AP-ranked teams, and
       head to head against the other coach */
    rows.forEach((r, gi) => { for (const [si, side] of [[0, "h"], [1, "a"]]) {
      const cid = who[gi][si]; if (!cid) continue; const tid = side === "h" ? r[2] : r[3], opp = side === "h" ? r[3] : r[2], oc = who[gi][1 - si];
      const my = side === "h" ? r[4] : r[5], th = side === "h" ? r[5] : r[4]; if (my == null || th == null) continue;
      const X = out[cid] = out[cid] || { nm: C.names[cid] || "Coach " + cid, seasons: {} };
      const s = X.seasons[y] = X.seasons[y] || { tm: tid, w: 0, l: 0, cw: 0, cl: 0, nw: 0, nl: 0, aw: 0, al: 0, ap: 0, close: [0, 0], fav: [0, 0], dog: [0, 0], hm: [0, 0], rd: [0, 0], nu: [0, 0], rk: [0, 0] };
      const won = my > th, k = won ? 0 : 1; won ? s.w++ : s.l++; if (r[7]) won ? s.cw++ : s.cl++;
      if (/NCAA/i.test(r[11] || "")) won ? s.nw++ : s.nl++;
      if (Math.abs(my - th) <= 5) s.close[k]++;
      (r[6] ? s.nu : side === "h" ? s.hm : s.rd)[k]++;
      if (rankAt && rankAt(+y, opp, r[1])) s.rk[k]++;
      if (oc && oc !== cid) { const h = (X.h2h = X.h2h || {})[oc] = (X.h2h || {})[oc] || [0, 0]; h[k]++ }
      const L = (lines[y] || {})[r[0]]; if (L && L[0] != null && L[0] !== 0) { const sp = side === "h" ? L[0] : -L[0], v = my - th + sp; if (v > 0) s.aw++; else if (v < 0) s.al++; else s.ap++; (sp < 0 ? s.fav : s.dog)[won ? 0 : 1]++ }
    } });
  }
  for (const X of Object.values(out)) if (X.h2h) for (const [k, v] of Object.entries(X.h2h)) if (v[0] + v[1] < 2) delete X.h2h[k];   /* head to head: coaches he met twice or more */
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
  for (const [k, I] of Object.entries(itm)) { const [y, tid] = k.split("|"); I.last = I.lastAt === (played[k] || 0); delete I.lastAt; for (const c of I.by) if (out[c] && out[c].seasons[y]) out[c].seasons[y].int = 1 }
  return { coaches: out, current: cur, interim: itm };
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
      const okR = v => v != null && v > 60 && v < 150 ? v : null;   /* broken source ratings (2020 CAA: 1148 adj offense) are left out */
      out[t.teamId] = [r1(okR(a.offensiveRating)), r1(okR(a.defensiveRating)), r1(t.pace), fg.attempted ? r1(100 * (tp.attempted || 0) / fg.attempted) : null, r1(pc(of.turnoverRatio)), r1(uf.effectiveFieldGoalPct), r1(of.effectiveFieldGoalPct), r1(uf.offensiveReboundPct)] }
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
  const stops = []; for (let i = 1; i <= 25; i++) { const yrs = clean(line("coach_years" + i)), tm = clean(line("coach_team" + i)); if (!yrs && !tm) continue; if (!tm || /assistant|associate|\bHS\b|high school|graduate|director|\(GA\)/i.test(tm)) continue;
    /* a role in brackets is kept only when it's a head job — Diebler's "Valparaiso (SA)" and "Ohio State (AHC)" are not stops; a state ("Miami (OH)") stays */
    { const p = (tm.match(/\(([^)]*)\)\s*$/) || [])[1]; if (p != null && !(/interim|head coach|\bHC\b/i.test(p) && !/AHC|associate/i.test(p)) && !(/^[A-Z]{2}$/.test(p) && !/^(SA|GA)$/.test(p))) continue } stops.push([yrs, tm.replace(/\s*\((?![A-Z]{2}\))[^)]*\)\s*$/, "")]) }
  return { ov, ncaa, titles, ff, stops };
}
/* Wikipedia's infobox can lag a season (Oct 10 audit: Greg Gard 237-128 there, 244-132 in our own Wisconsin games) or fail to parse
   (0-0). Its career and NCAA records are only used when they cover at least as many games as we can count ourselves. */
export function trustWiki(w, seasons) {
  if (!w || !w.t) return null;
  const S = Object.values(seasons || {}), ours = S.reduce((a, x) => a + (x.w || 0) + (x.l || 0), 0), oursN = S.reduce((a, x) => a + (x.nw || 0) + (x.nl || 0), 0);
  const ov = w.ov && w.ov[0] + w.ov[1] > 0 && w.ov[0] + w.ov[1] >= ours ? w.ov : null, ncaa = w.ncaa && w.ncaa[0] + w.ncaa[1] >= oursN ? w.ncaa : null;
  return { t: w.t, ov, ncaa, titles: w.titles, ff: w.ff, stops: w.stops };
}
export async function wikiCoaches({ getPack, putPack, log, coaches, full }) {
  let W = full ? null : await getPack("p2000_cbb-wiki").catch(() => null); if (!W || !W.c || W.v !== 3) W = { v: 3, c: {} };   /* v3: batched */
  /* every coach since 2013–14, not just this season's (Oct 13 — Sam: "just finish coaches"): past coaches' pages are re-read every 90 days, current ones weekly */
  const reparse = W.pv !== 2;   /* parser v2 (Oct 13): every page read again once */
  const todo = coaches.filter(c => reparse || !W.c[c.cid] || (!W.c[c.cid].t && !W.c[c.cid].m) || Date.now() - (W.c[c.cid].at || 0) > (c.cur === false ? 90 : 7) * 864e5);
  /* Wikipedia rate-limits the shared GitHub runners hard (109 of 199 calls refused on Oct 10), so pages are read 40 at a time:
     one query returns every page's top section. Titles tried in turn: "Name", "Name (basketball)", "Name (basketball coach)". */
  const t0 = Date.now(), codes = {}; let n = 0, found = 0;
  const get = async u => { for (let k = 0; k < 4; k++) { try { const r = await fetch(u, { headers: WUA }); codes[r.status] = (codes[r.status] || 0) + 1; n++; if (r.ok) return noSR(await r.json()); if (r.status === 404 || r.status === 403) return null } catch { codes.err = (codes.err || 0) + 1 } await new Promise(r => setTimeout(r, 4000 * (k + 1))) } return null };
  let left = todo.slice(); const tried = new Set();
  for (const suffix of ["", " (basketball)", " (basketball coach)"]) {
    for (let b = 0; b < left.length && Date.now() - t0 < 480e3; b += 40) { const batch = left.slice(b, b + 40); const titles = batch.map(c => c.nm + suffix);
      const j = await get(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&rvsection=0&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(titles.join("|"))}`);
      if (!j || !j.query) continue; batch.forEach(c => tried.add(c.cid)); const map = {}; for (const x of j.query.normalized || []) map[x.from] = x.to; for (const x of j.query.redirects || []) map[x.from] = x.to;
      const pages = Object.fromEntries((j.query.pages || []).map(p => [p.title, p]));
      for (const c of batch) { let t = c.nm + suffix; t = map[t] || t; t = map[t] || t; const pg = pages[t]; const w = pg && pg.revisions && pg.revisions[0] ? (pg.revisions[0].slots ? pg.revisions[0].slots.main.content : pg.revisions[0].content) : "";
        /* a former player's page has the basketball biography infobox, not the coach one (Danny Manning) — accepted too; the record
           reader then keeps the page only if its season table matches our seasons */
        if (!w || !(/coach_team|overall_record/.test(w) || /\{\{\s*Infobox (basketball biography|NBA biography)/i.test(w) && /coach/i.test(w)) || (c.school && !w.includes(c.school.split(" ")[0]))) continue;
        W.c[c.cid] = { at: Date.now(), t, ...parseCoachInfobox(w) }; found++ }
      await new Promise(r => setTimeout(r, 1000)) }
    left = left.filter(c => !(W.c[c.cid] && W.c[c.cid].t && Date.now() - W.c[c.cid].at < 60e3)) }
  for (const c of left) if ((!W.c[c.cid] || !W.c[c.cid].t) && tried.has(c.cid)) W.c[c.cid] = { at: Date.now(), m: 1 };   /* no page found: looked again later — but not when Wikipedia turned the call away (429) */
  W.lastRun = { at: Date.now(), calls: n, found, codes, secs: Math.round((Date.now() - t0) / 1000) }; if (left.length < todo.length / 2) W.pv = 2;
  await putPack("p2000_cbb-wiki", W);
  log(`wikipedia coaches: ${todo.length} to look up, ${found} found in ${n} calls · ${Object.values(W.c).filter(x => x.t).length} on file · ${JSON.stringify(codes)}`);
  return W;
}
/* each coach's whole head-coaching record, season by season (Oct 13 — Sam: "the basketball coach data would also be good"; our games
   start in 2013–14, so Tom Izzo showed 13 of his 31 seasons). Read from the {{CBB Yearly Record Entry}} templates in his Wikipedia
   page's head coaching record (season, team, overall and conference record, postseason). Kept only when a row's team and season match
   a season our own data has him coaching (namesakes ruled out). A coach still coaching is re-read once a month; others never again.
   Pack p2000_cbb-wikirec: { v, c: { espnCoachId: { r: [[season end, team, W, L, conf W, conf L, postseason]], at } }, miss: [ids] } */
export function parseCbbRecord(w) {
  const out = [], cl = s => String(s || "").replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/\{\{[^{}]*\}\}/g, "").replace(/'{2,3}/g, "").replace(/\s+/g, " ").trim();
  for (const m of w.matchAll(/\{\{\s*CBB Yearly Record Entry([\s\S]*?)\n\s*\}\}/gi)) {
    const f = {}; for (const p of m[1].split(/\n\s*\|/)) { const i = p.indexOf("="); if (i > 0) f[p.slice(0, i).replace(/^\s*\|?\s*/, "").trim().toLowerCase()] = p.slice(i + 1).trim() }
    const sy = (f.season || "").match(/(\d{4})[–-](\d{2,4})/); if (!sy) continue;
    const ov = cl(f.overall).match(/(\d+)\s*[–-]\s*(\d+)/); if (!ov) continue;
    const cf = cl(f.conference).match(/(\d+)\s*[–-]\s*(\d+)/);
    out.push([+sy[1] + 1, cl(f.name), +ov[1], +ov[2], cf ? +cf[1] : null, cf ? +cf[2] : null, cl(f.postseason).slice(0, 70)]) }
  return out }
/* the interim's name for a split season (Oct 13 — Sam: "if they didnt become head coaches im fine just putting an asterisk on those
   seasons and calling out the interim in the pop-up … they don't need profiles"): Wikipedia's page for that team-season, found by search
   ("2021–22 Louisville men's basketball team"), whose infobox coach line names him. Kept in p2000_cbb-interim, read once per season. */
export function interimFromInfobox(w, known) {
  /* every head-coach line of the infobox (head_coach, head_coach2, coach …), linked or plain text: "[[Mike Pegues]] (interim)", "Peter Thomas" */
  const vals = [...String(w || "").matchAll(/\|\s*(?:head_coach\d*|coach\d*)\s*=([^\n]*)/gi)].flatMap(m => m[1].split(/<br\s*\/?>|\s*\/\s*(?=\[\[)/i));
  const names = vals.map(v => { const t = v.match(/\(([^)]*)\)/), l = v.match(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/); const n = (l ? l[1] : v.replace(/\([^)]*\)/g, "").replace(/<[^>]*>|\{\{[^}]*\}\}|'{2,}/g, "")).trim(); return [n, t ? t[1] : ""] }).filter(([n]) => n && /^[A-Z][\w.'’ -]+$/.test(n));
  const kn = String(known || "").toLowerCase(), cand = names.filter(([n]) => n.toLowerCase() !== kn);
  const pick = cand.find(([, t]) => /interim|acting/i.test(t)) || (cand.length === 1 ? cand[0] : null);
  return pick ? pick[0] : null }
export async function interimNames({ getPack, putPack, log, itm, names, coachNames }) {
  let P = await getPack("p2000_cbb-interim").catch(() => null); if (!P || !P.k) P = { k: {} }; let n = 0, got = 0;
  P.t = P.t || {};
  for (const [key, I] of Object.entries(itm)) { if (P.k[key] || (key in P.k && Date.now() - (P.t[key] || 0) < 30 * 864e5)) { I.n = P.k[key]; continue }
    const [y, tid] = key.split("|"), school = names[tid]; if (!school) continue; const szn = `${+y - 1}–${String(y).slice(2)}`;
    try { const q = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&format=json&formatversion=2&srsearch=${encodeURIComponent(`${szn} ${school} men's basketball team`)}`, { headers: WUA })).json(); n++;
      const hit = ((q.query || {}).search || []).find(r => r.title.startsWith(szn) && /men's basketball/i.test(r.title) && r.title.toLowerCase().includes(school.toLowerCase().split(" ")[0]));
      let nm = null; if (hit) { const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&rvsection=0&format=json&formatversion=2&titles=${encodeURIComponent(hit.title)}`, { headers: WUA })).json(); noSR(j); n++;
        const pg = (j.query.pages || [])[0], w = pg && pg.revisions ? pg.revisions[0].slots.main.content : ""; nm = interimFromInfobox(w, coachNames[I.by[0]]) }
      P.k[key] = nm; P.t[key] = Date.now(); I.n = nm; if (nm) got++ } catch (e) { await new Promise(r => setTimeout(r, 5000)) }   /* refused (429): left for the next run */
    await new Promise(r => setTimeout(r, 1200)) }
  if (n) await putPack("p2000_cbb-interim", P);
  log(`interims: ${Object.keys(itm).length} split seasons, ${Object.values(itm).filter(I => I.n).length} named (${got} new, ${n} Wikipedia calls)`);
  return itm }
export async function wikiRecords({ getPack, putPack, log, coaches, W, S }) {
  let R = await getPack("p2000_cbb-wikirec").catch(() => null); if (!R || !R.c || R.v !== 1) R = { v: 1, c: {}, miss: [] };
  const k = s => String(s || "").toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]/g, "").replace(/university|college|of|the/g, "");
  const todo = coaches.filter(c => W && W.c[c.cid] && W.c[c.cid].t && !R.miss.includes(c.cid) && (!R.c[c.cid] || (c.cur && Date.now() - (R.c[c.cid].at || 0) > 30 * 864e5)));
  let n = 0, kept = 0;
  for (let i = 0; i < todo.length; i += 15) { const B = todo.slice(i, i + 15), titles = B.map(c => W.c[c.cid].t);
    let j = null; for (let a = 0; a < 4 && !j; a++) { try { const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(titles.join("|"))}`, { headers: WUA }); n++;
        if (r.ok) j = noSR(await r.json()); else await new Promise(z => setTimeout(z, 5000 * (a + 1))) } catch { await new Promise(z => setTimeout(z, 3000)) } }
    if (!j || !j.query) continue;
    const norm = {}; for (const x of j.query.normalized || []) norm[x.from] = x.to; const red = {}; for (const x of j.query.redirects || []) red[x.from] = x.to;
    const byTitle = {}; for (const p of j.query.pages || []) if (p.revisions) byTitle[p.title] = p.revisions[0].slots.main.content;
    for (const c of B) { let t = W.c[c.cid].t; t = norm[t] || t; t = red[t] || t; const w = byTitle[t]; if (!w) continue;
      const rows = parseCbbRecord(w), ours = c.seasons || {};
      const ok = rows.some(([y, tm]) => ours[y] && (k(tm).includes(k(c.names[ours[y].tm])) || k(c.names[ours[y].tm]).includes(k(tm))));
      if (rows.length && ok) { R.c[c.cid] = { r: rows, at: Date.now() }; kept++ } else if (!R.c[c.cid]) R.miss.push(c.cid) }
    await new Promise(z => setTimeout(z, 1500)) }
  if (n) await putPack("p2000_cbb-wikirec", R);
  log(`wikipedia coach records: ${todo.length} to read, ${kept} kept in ${n} calls · ${Object.keys(R.c).length} on file`);
  return R }
