/* MODE=study (Nov 1, 2026): pattern hunt 3's college pulls — STUDY ONLY, nothing here is written to the site's packs or shown on it.
   Sam, Oct 31 10:25 pm, on the study call budget: "as long as you make them worth it and dive through literally everything i do not care".

   What it does
   - Reads CFBD through the site's proxy (/api/cfbd, with the run's probe sign-in, so answers the proxy already keeps cost no call) and
     CBBD through the basketball door (/api/job/cbbd, job token). Path strings for plays, box scores, rosters, recruits and player
     stats are written exactly as the page's builders and job/prefetch.mjs write them, so already-kept answers are reused.
   - Writes NOTHING to packs. Each batch is gzipped and encrypted to the study's public key below (RSA-OAEP-SHA256 wrapping a random
     AES-256-GCM key) into study-out/, which the workflow uploads as a short-lived run artifact. This repo is public: the files are
     unreadable without the private key, which stays on the analysis machine. study-out/manifest.json (plain) holds only counts.
   - What the site stores anyway: the proxy keeps every finished-season answer under 20 MB in its KV for good (src/cfbd.js, "past:cfbd"),
     for every caller. The notices give, per batch, how many answers were new to KV and their size.
   - Budget: before each batch the pool's calls-left is read (/info, free). A batch is skipped when calls-left minus the batch's size would
     go under STUDY_FLOOR (default 46,000: 40,000 kept for the site's own runs + 6,000 for another job tonight), or when this run's calls
     would pass STUDY_CAP (default 20,000). Calls used per batch = the counter before minus after (CFBD and CBBD share one pool).
   STUDY = comma list of batch names (empty = all). */
import { gzipSync } from "node:zlib";
import { publicEncrypt, randomBytes, createCipheriv, constants } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const PUB = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArh3C8VbuQo906Fg1aUJQ
Y3GkTJ640gYFgMqTdO2BbDv1dI4WVIcZzLlzneYNiao4bLcMtvNHZixoCQrZFZFf
zX8nTvH7EsuzGQkPvIvcHW3MJMSFvYNY9su6FPPHpIDruZIuUf9S4/c3ecw+9XsM
N4SxSX5q6zBgxjup0XdZRBKbl6dODYmMTQ1cIcloQxv/kY+TldKQZ3u6jsSUzi6H
fCUs0mJv+J+KpnNRSe+/qdbDpxoY1+d6wg9KJVQzM7yoNFXuN3NWuIzoZwvpTmR5
L8NnIIr9HmZiKkmg+k88y2qxBD/8siRHMeDioR/AP+ntG0Rd/0jds4fd181gGOFi
ioBFfiNqy6FGrOHo0jXWU8Cbmn9Ze6SEZq/AxUDXoPZmlj5LRLVK0q+qDGsurv53
qG+/8JM9zOckuz9Yna5eJZVaL1Lm96ykeJVI15JP3AKZRj0zfH+mOiarD19nJ6H+
243rZKRdbvLj36jxQiaIBBNZWoi5O3NnsS6ALQNQqAvF1SSBT+2GJIR8PGf1w0Fo
lvjmj1Mg2Y6U5BJuSqazGSmYJzLEDJVCEO2l3ZddOLib742VrcAuhS/KXIhqaCfy
nq2Bsp5+6nkdZ/3SxvCX/s7qaeFKxKYVn/kTbfKXPY5UdCexcbrpSlCAfhy5Xfq4
nfbYxRX3TBhMiBySlcGzud0CAwEAAQ==
-----END PUBLIC KEY-----`;
export function seal(buf) {
  const k = randomBytes(32), iv = randomBytes(12), c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(buf), c.final()]), tag = c.getAuthTag();
  const wk = publicEncrypt({ key: PUB, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, k);
  const h = Buffer.alloc(2); h.writeUInt16BE(wk.length); return Buffer.concat([h, wk, iv, tag, body]) }

const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const W16 = R(1, 16);
/* compact rows for the two big ones */
const playRow = p => [p.gameId, p.driveId, p.offense, p.defense, p.home, p.offenseScore, p.defenseScore, p.period,
  p.clock ? (p.clock.minutes || 0) * 60 + (p.clock.seconds || 0) : null, p.yardsToGoal ?? p.yardline, p.down, p.distance, p.yardsGained, p.playType,
  p.ppa ?? null, p.scoring ? 1 : 0, p.offenseConference ?? null, p.defenseConference ?? null];
export const PLAY_COLS = ["gameId", "driveId", "offense", "defense", "home", "offenseScore", "defenseScore", "period", "clockSec", "yardsToGoal", "down",
  "distance", "yardsGained", "playType", "ppa", "scoring", "offenseConference", "defenseConference"];
const KEEP_CAT = new Set(["passing", "rushing", "receiving", "defensive", "interceptions", "fumbles"]);
const boxRows = L => { const out = [];
  for (const g of L || []) for (const t of g.teams || []) { const A = {};
    for (const c of t.categories || []) { if (!KEEP_CAT.has(c.name)) continue;
      for (const ty of c.types || []) for (const a of ty.athletes || []) { const x = A[a.id] || (A[a.id] = { n: a.name, s: {} }); x.s[c.name + "." + ty.name] = a.stat } }
    for (const [id, x] of Object.entries(A)) out.push([g.id, t.team ?? t.school, t.conference ?? null, t.homeAway ?? null, t.points ?? null, id, x.n, x.s]) }
  return out };

export function batches(cur) {
  /* every batch is written one season per file (memory stays small); cf_info and bb_coaches have no season and go in one file */
  const C = (name, paths, opt = {}) => ({ name, api: "cfbd", paths, perYear: true, ...opt }), B = (name, items, opt = {}) => ({ name, api: "cbbd", items, perYear: true, ...opt });
  const cbbRanges = y => { const L = []; let a = Date.UTC(y - 1, 10, 1); const end = Date.UTC(y, 3, 15);
    while (a <= end) { const b = Math.min(a + 30 * 864e5, end); L.push([new Date(a).toISOString().slice(0, 10), new Date(b).toISOString().slice(0, 10)]); a = b + 864e5 } return L };
  return [
    C("cf_info", ["/conferences", "/coaches?minYear=2000&maxYear=" + cur]),
    C("cf_teams", R(2004, cur).map(y => `/teams/fbs?year=${y}`)),
    C("cf_games", R(2004, cur).map(y => `/games?year=${y}&seasonType=both`)),
    C("cf_lines", R(2004, cur).map(y => `/lines?year=${y}&seasonType=regular`)),
    C("cf_records", R(2004, cur).map(y => `/records?year=${y}`)),
    C("cf_srs", R(2004, cur).map(y => `/ratings/srs?year=${y}`)),
    C("cf_sp", R(2004, cur).map(y => `/ratings/sp?year=${y}`)),
    C("cf_talent", R(2015, cur).map(y => `/talent?year=${y}`)),
    C("cf_rteams", R(2002, cur).map(y => `/recruiting/teams?year=${y}`)),
    C("cf_recruits", R(2002, cur).map(y => `/recruiting/players?year=${y}&classification=HighSchool`)),
    C("cf_roster", R(2011, cur).map(y => `/roster?year=${y}`)),
    C("cf_portal", R(2021, cur).map(y => `/player/portal?year=${y}`)),
    C("cf_tstats", R(2004, cur).map(y => `/stats/season?year=${y}`)),
    C("cf_adv", R(2014, cur).map(y => `/stats/season/advanced?year=${y}`)),
    C("cf_pstats", R(2004, cur).flatMap(y => ["passing", "rushing", "receiving", "defensive", "interceptions", "fumbles"].map(c => `/stats/player/season?year=${y}&category=${c}`))),
    C("cf_ppa", R(2014, cur).map(y => `/ppa/players/season?year=${y}`)),
    C("cf_usage", R(2013, cur).map(y => `/player/usage?year=${y}`)),
    C("cf_box", R(2004, cur).flatMap(y => [...W16.map(w => `/games/players?year=${y}&week=${w}&seasonType=regular`), `/games/players?year=${y}&week=1&seasonType=postseason`]),
      { compact: boxRows, perYear: true, stopEmpty: true }),
    C("cf_plays", R(2014, cur).flatMap(y => [...W16.map(w => `/plays?year=${y}&week=${w}&seasonType=regular`), `/plays?year=${y}&week=1&seasonType=postseason`]),
      { compact: L => (L || []).map(playRow), perYear: true, stopEmpty: true }),
    B("bb_stats", R(2008, cur + 1).map(y => ["/stats/player/season", { season: y }])),
    B("bb_roster", R(2008, cur + 1).map(y => ["/teams/roster", { season: y }])),
    B("bb_recruits", R(2007, cur + 1).map(y => ["/recruiting/players", { year: y }])),
    B("bb_portal", R(2019, cur + 1).map(y => ["/recruiting/portal", { year: y }])),
    B("bb_srs", R(2008, cur + 1).map(y => ["/ratings/srs", { season: y }])),
    B("bb_coaches", [["/coaches", { season: cur + 1 }], ["/coaches", { season: cur }]]),
    B("bb_games", R(2008, cur + 1).flatMap(y => cbbRanges(y).map(([a, b]) => ["/games", { season: y, startDateRange: a, endDateRange: b }]))),
  ];
}

export async function runStudy({ site, token, job, log = console.log, out = "study-out" }) {
  const want = String(process.env.STUDY || "").split(",").map(s => s.trim()).filter(Boolean);
  const FLOOR = +process.env.STUDY_FLOOR || 46000, CAP = +process.env.STUDY_CAP || 20000;
  const now = new Date(), cur = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;   // the proxy's season (src/cfbd.js)
  const H = { headers: { Authorization: "Bearer " + token } }, sleep = ms => new Promise(z => setTimeout(z, ms));
  let lastLeft = null;
  const cfGet = async path => { for (let k = 0; k < 4; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H);
        if (r.ok) { const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { }
          return { j, bytes: t.length, kept: !!r.headers.get("x-kept") || /^(hit|global)$/.test(r.headers.get("x-live-cache") || "") } }
        if (r.status === 400 || r.status === 404) return { j: null, status: r.status, err: (await r.text()).slice(0, 160) };
        if (r.status === 429) await sleep(20000) } catch (e) { } await sleep(2500 * (k + 1)) } return { j: null, status: 0, err: "failed 4 times" } };
  const bbGet = async ([path, params]) => { const q = new URLSearchParams({ path, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    for (let k = 0; k < 4; k++) { try { const r = await fetch(`${site}/api/job/cbbd?${q}`, { headers: { Authorization: "Bearer " + job } });
        const left = r.headers.get("x-calllimit-remaining"); if (left) lastLeft = +left;
        if (r.ok) { const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { } return { j, bytes: t.length, kept: false } }
        if (r.status === 400 || r.status === 404) return { j: null, status: r.status, err: (await r.text()).slice(0, 160) };
        if (r.status === 429) await sleep(20000) } catch (e) { } await sleep(2500 * (k + 1)) } return { j: null, status: 0, err: "failed 4 times" } };
  const left = async () => { const r = await cfGet("/info"); return r.j && r.j.remainingCalls != null ? +r.j.remainingCalls : null };
  mkdirSync(out, { recursive: true });
  const L0 = await left(); log(`::notice title=study start::${L0 != null ? L0.toLocaleString() : "?"} calls left in the pool · floor ${FLOOR.toLocaleString()} · cap ${CAP.toLocaleString()} this run`);
  const man = { started: Date.now(), left0: L0, floor: FLOOR, cap: CAP, batches: [] };
  let used = 0;
  for (const b of batches(cur).filter(b => !want.length || want.includes(b.name))) {
    const n = (b.paths || b.items).length, before = await left();
    if (before != null && before - n < FLOOR) { log(`::warning title=study ${b.name} skipped::${before} left − ${n} would pass the floor ${FLOOR}`); man.batches.push({ name: b.name, skipped: "floor" }); continue }
    if (used + n > CAP) { log(`::warning title=study ${b.name} skipped::this run's cap ${CAP} (used ${used})`); man.batches.push({ name: b.name, skipped: "cap" }); continue }
    const t0 = Date.now(), res = {}, errs = []; let kept = 0, fresh = 0, newKV = 0, bytes = 0, got = 0, rows = 0;
    const list = b.api === "cfbd" ? b.paths.map(p => [p, p]) : b.items.map(it => [it[0] + "?" + new URLSearchParams(Object.entries(it[1]).map(([k, v]) => [k, String(v)])), it]);
    const year = key => +((key.match(/[?&](?:year|season)=(\d{4})/) || [])[1] || 0);
    const flush = y => { const part = Object.fromEntries(Object.entries(res).filter(([k]) => !y || year(k) === y)); if (!Object.keys(part).length) return;
      const gz = gzipSync(Buffer.from(JSON.stringify({ v: 1, batch: b.name, cols: b.name === "cf_plays" ? PLAY_COLS : undefined, data: part })));
      writeFileSync(`${out}/${b.name}${y ? "_" + y : ""}.json.gz.enc`, seal(gz)); for (const k of Object.keys(part)) delete res[k] };
    const doneYear = new Set(); let emptyRun = {};
    for (let i = 0; i < list.length; i += 3) {
      const chunk = list.slice(i, i + 3);
      const R3 = await Promise.all(chunk.map(([key, arg]) => (b.api === "cfbd" ? cfGet(arg) : bbGet(arg)).then(r => [key, r])));
      for (const [key, r] of R3) {
        if (r.j == null) { errs.push(`${key} → ${r.status} ${r.err || ""}`.slice(0, 200)); continue }
        got++; bytes += r.bytes; if (r.kept) kept++; else { fresh++; const y = year(key); if (b.api === "cfbd" && y && y < cur && r.bytes > 2 && r.bytes < 20e6) newKV += r.bytes }
        const v = b.compact ? b.compact(r.j) : r.j; if (Array.isArray(v)) rows += v.length; res[key] = v }
      /* the season being played: stop asking for weeks that haven't happened */
      if (b.stopEmpty) { const y = year(chunk[0][0]); if (y === cur) { const empties = R3.filter(([k, r]) => /seasonType=regular/.test(k) && Array.isArray(r.j) && !r.j.length).length; emptyRun[y] = (emptyRun[y] || 0) + empties;
        if (emptyRun[y] >= 3) { const skip = list.slice(i + 3).filter(([k]) => year(k) === y && /seasonType=regular/.test(k)).map(([k]) => k); for (const k of skip) list.splice(list.findIndex(x => x[0] === k), 1) } } }
      /* per-season files for the big ones, so memory stays small */
      if (b.perYear) { const yNext = list[i + 3] ? year(list[i + 3][0]) : 0; for (const [k] of chunk) { const y = year(k); if (y !== yNext && !doneYear.has(y)) { flush(y); doneYear.add(y) } } }
    }
    flush(0);
    const after = await left(), calls = before != null && after != null ? before - after : fresh;
    used += calls;
    const line = `${n} asked · ${got} answered · ${kept} already kept (no call) · ${fresh} fresh · pool ${before ?? "?"} → ${after ?? "?"} = ${calls} calls · ${rows ? rows + " rows · " : ""}${(bytes / 1e6).toFixed(1)} MB read · ${(newKV / 1e6).toFixed(1)} MB newly kept in the site's KV by the proxy · ${((Date.now() - t0) / 60e3).toFixed(1)} min${errs.length ? ` · ${errs.length} errors: ${errs.slice(0, 4).join(" | ")}` : ""}`;
    log(`::notice title=study ${b.name}::${line}`);
    man.batches.push({ name: b.name, asked: n, got, kept, fresh, before, after, calls, rows, mb: +(bytes / 1e6).toFixed(2), newKVmb: +(newKV / 1e6).toFixed(2), errors: errs.slice(0, 20) });
  }
  const L1 = await left(); man.left1 = L1; man.used = used; man.cbbdLeft = lastLeft;
  writeFileSync(`${out}/manifest.json`, JSON.stringify(man, null, 1));
  log(`::notice title=study done::${used.toLocaleString()} calls this run · ${L1 != null ? L1.toLocaleString() : "?"} left · ${(man.batches.reduce((a, x) => a + (x.newKVmb || 0), 0)).toFixed(1)} MB newly kept in KV`);
  return { batches: man.batches.length, calls: used, keptMB: +man.batches.reduce((a, x) => a + (x.newKVmb || 0), 0).toFixed(1) };
}
