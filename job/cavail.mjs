/* College availability reports (Oct 15). The conferences post who's out before each conference game:
   - ACC, Big 12 and SEC through the public report page their sites embed (app.hdintelligence.com, one POST per conference; the answer
     lists every player, most "Available", plus team logos as images we skip). Initial report the night before game week's travel
     (ACC/SEC Wednesday 8 pm ET, Big 12 Wednesday 9 pm CT), updated through game day.
   - Pac-12 and Sun Belt as plain JSON files (sbcautostorage …/availability-reports/{conf}-football/prod/report.json).
   Big Ten and the rest don't publish one we can read (the Big Ten site is behind a bot wall).
   Pack p{year}_cavail: { v, at, src: {conf: "ok N teams" | "error …"}, t: { team: { opp, d (game date), k (kickoff), conf, type, up, p: [[name, pos, num, status]] } } }
   Only players who aren't Available (Out, Out – 1st half, Doubtful, Questionable, Probable, Out for season). */
import { gzipSync } from "node:zlib";

const UA = "Mozilla/5.0 (mycfbbigboard.com data job; availability reports)";
const HD = "https://app.hdintelligence.com/api/get-publish-public";
const HD_CONF = { ACC: "ACC", B12: "Big 12", SEC: "SEC" };
const SBC_CONF = { pac12: "Pac-12", sunbelt: "Sun Belt" };
const SKIP = /^(available|exempt|)$/i;

/* the reports' school names → the site's (CollegeFootballData) names */
const ALIAS = { "Miami (FL)": "Miami", "Miami (Fla.)": "Miami", "Ole Miss": "Ole Miss", "Mississippi": "Ole Miss", "NC State": "NC State", "N.C. State": "NC State",
  "Pitt": "Pittsburgh", "UL Monroe": "UL Monroe", "Louisiana-Monroe": "UL Monroe", "ULM": "UL Monroe", "App State": "App State", "Appalachian State": "App State",
  "Southern Miss": "Southern Miss", "Southern Mississippi": "Southern Miss", "Texas A&M": "Texas A&M", "TCU": "TCU", "BYU": "BYU", "UCF": "UCF", "SMU": "SMU",
  "Hawaii": "Hawai'i", "San Jose State": "San José State", "Louisiana": "Louisiana", "Louisiana-Lafayette": "Louisiana", "UConn": "UConn" };
export function teamName(n) {
  n = String(n || "").replace(/\s+/g, " ").trim();
  if (ALIAS[n]) return ALIAS[n];
  return n.replace(/\bSt\.$/, "State").replace(/\bSt\. /, "State ");
}
/* "WR #11 Rico Flores Jr." → ["Rico Flores Jr.", "WR", 11] */
export function splitRow(s) {
  const m = String(s || "").trim().match(/^([A-Z/]{1,6})\s+#(\d{1,2})\s+(.+)$/);
  return m ? [m[3].trim(), m[1], +m[2]] : [String(s || "").trim(), "", null];
}
const status = s => String(s || "").replace(/\s+/g, " ").trim();

/* one hdintelligence answer → entries */
export function parseHd(j, conf) {
  const out = [];
  for (const g of Object.values(j || {})) {
    if (!g || typeof g !== "object" || !Array.isArray(g.games) || g.games.length !== 2) continue;
    const f = g.footer || {}, T = g.games.map(t => teamName(t.teamName || t.teamDisplayName));
    g.games.forEach((t, i) => out.push({ team: T[i], opp: T[1 - i], d: f.date || null, k: f.time ? `${f.time.slice(0, 5)} ${g.conferenceTimeZone || ""}`.trim() : null, conf,
      type: g.ReportType || "", up: g.publishDate ? `${g.publishDate} ${g.postedTime || ""}`.trim() : null,
      p: (t.rows || []).filter(r => !SKIP.test(status(r.status))).map(r => { const [n, pos, num] = splitRow(r.name); return [n, pos, num, status(r.status)] }) }));
  }
  return out;
}
/* one Pac-12 / Sun Belt file → entries */
export function parseSbc(j, conf) {
  const out = [];
  for (const g of (j && j.games) || []) {
    const H = g.home || {}, A = g.away || {}, T = [teamName(A.name), teamName(H.name)];
    [A, H].forEach((t, i) => out.push({ team: T[i], opp: T[1 - i], d: g.dateISO || null, k: g.kickoffUTC || null, conf, type: g.notes || "", up: g.updatedAtUTC || null,
      p: (t.players || []).filter(p => !SKIP.test(status(p.status))).map(p => [String(p.name || "").trim(), p.position || "", null, status(p.status)]) }));
  }
  return out;
}

/* `all` (optional, Oct 28): pass an array and it gets every report read this run — every game the sources still list, not only each
   team's next one — for the permanent archive below. The pack this returns is the same as before. */
export async function buildCollegeAvail({ fetchFn = fetch, today = new Date(), all = [] } = {}) {
  const src = {};
  for (const [org, conf] of Object.entries(HD_CONF)) {
    try { const r = await fetchFn(HD, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", referer: "https://app.hdintelligence.com/", "user-agent": UA }, body: JSON.stringify({ sport: "Football", organization: org, conference: org }) });
      if (!r.ok) { src[conf] = "error " + r.status; continue }
      const E = parseHd(await r.json(), conf); all.push(...E); src[conf] = `ok ${E.length} teams` } catch (e) { src[conf] = "error " + e.message }
  }
  for (const [c, conf] of Object.entries(SBC_CONF)) {
    try { const r = await fetchFn(`https://sbcautostorage.blob.core.windows.net/availability-reports/${c}-football/prod/report.json?ts=${Date.now()}`, { headers: { "user-agent": UA } });
      if (!r.ok) { src[conf] = "error " + r.status; continue }
      const E = parseSbc(await r.json(), conf); all.push(...E); src[conf] = `ok ${E.length} teams` } catch (e) { src[conf] = "error " + e.message }
  }
  /* each team's next game (a report drops off the day after its game) */
  const day = new Date(today.getTime() - 5 * 3600e3).toISOString().slice(0, 10), t = {};   /* today in Eastern time: game-day reports stay up through the night */
  for (const e of all) { if (!e.team || (e.d && e.d < day)) continue; const cur = t[e.team]; if (cur && cur.d && e.d && cur.d <= e.d) continue; const { team, ...x } = e; t[team] = x }
  return { v: 1, at: Date.now(), src, t };
}

/* every report kept for good (Oct 28 — Sam: "once data is complete, we keep our own copy forever and stop asking for it"). The pack
   above holds only each team's next game and is replaced every run; p{year}_cavail-arc keeps every version of every report we read:
   { v, season, cols, g: { "<game date>|<team>": { opp, conf, k, r: [[type, up (as posted), first seen (ms), p: [[name, pos, num, status]]]] } } }.
   A version is added when the report type, its posted time or its player list differs from the last one kept for that game; nothing
   kept is ever changed or removed. readPack(name) → { status, j }; the archive is started fresh only on a 404 (no such pack yet) — any
   other failed read skips the archive this run, so a bad read never writes an empty archive over a full one. */
export const ARC_V = 1;
export function mergeAvailArchive(A, all, now = Date.now()) {
  let added = 0;
  for (const e of all || []) { if (!e || !e.team) continue;
    const key = `${e.d || ""}|${e.team}`, G = A.g[key] = A.g[key] || { opp: e.opp || null, conf: e.conf || null, k: e.k || null, r: [] };
    const last = G.r[G.r.length - 1], p = e.p || [];
    if (last && last[0] === (e.type || "") && last[1] === (e.up || null) && JSON.stringify(last[3]) === JSON.stringify(p)) continue;
    G.r.push([e.type || "", e.up || null, now, p]); added++ }
  return added;
}
export async function archiveCollegeAvail({ api, readPack, season, all, log = console.log, now = Date.now() }) {
  const name = `p${season}_cavail-arc`;
  let st = null, A = null; try { const x = await readPack(name); st = x && x.status; A = x && x.j } catch (e) { st = "error " + e.message }
  if (!A || A.v !== ARC_V || A.season !== season || !A.g) {
    if (A || st !== 404) { log(`college availability archive: ${name} not read (${A ? "unexpected shape" : "status " + st}) — not written this run`); return null }
    A = { v: ARC_V, season, cols: ["name", "pos", "num", "status"], g: {} } }
  const added = mergeAvailArchive(A, all, now);
  if (!added) return { name, added: 0, games: Object.keys(A.g).length };
  A.at = now;
  const gz = gzipSync(Buffer.from(JSON.stringify(A)));
  const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  await api("PUT", "/api/pack-index", { body: { [name]: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
  return { name, added, games: Object.keys(A.g).length, bytes: r.bytes };
}

export async function uploadCollegeAvail({ api, season, data }) {
  const name = `p${season}_cavail`;
  const gz = gzipSync(Buffer.from(JSON.stringify(data)));
  const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  await api("PUT", "/api/pack-index", { body: { [name]: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
  return { name, bytes: r.bytes };
}
