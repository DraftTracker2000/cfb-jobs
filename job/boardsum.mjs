/* The board's summary, for pages that show the board without loading it (Nov 10 — the owner, 11:41 am, on the engine rebuild: "id love to figure
   out how to do it while keeping all the same data just structuring in a way that benefits everyone").

   Every college page loaded the whole college board (~145 MB in memory) before it drew anything — college Home included, which shows only
   the top of the board, your stars, the risers and the prospects on the field. This opens the page the way a visitor does (the probe's
   read-only session, no overrides of its own), lets the board build exactly as it does for everyone, and saves what the board computed —
   every row's id, name, position, team, conference, eligible, FBS, BoardScore, round band and whether a small-sample hold is on, in the board's order — as one small pack,
   p<Y>_board-sum, tagged with the shared-data version it was made from. A page uses it only when that version is the one it has, and only
   for someone with no overrides of their own (their board can differ); otherwise it loads the board as before.

   Run after a publish (job/build.mjs) or by hand: SITE_URL=… JOB_TOKEN=… node job/boardsum.mjs */
import { gzipSync } from "node:zlib";

export const BOARDSUM_V = 1;
export const BOARDSUM_COLS = ["id", "name", "pos", "team", "conf", "elig", "fbs", "score", "band", "held"];

/* runs in the page: the board as computed for a visitor, or why it can't be read */
export const READ_BOARD = () => {
  try {
    if (typeof D === "undefined" || !D.pool || !D.res) return { err: "board not built" };
    if (typeof OVR !== "undefined" && Object.keys(OVR).length) return { err: "this session has overrides" };
    if (year !== CURYEAR) return { err: "not this season" };
    const v = (window.CLOUD && CLOUD.snap && CLOUD.snap.current) || null; if (!v) return { err: "no shared-data version" };
    const R = computeBoard(); if (!R || R.length < 500) return { err: "only " + (R ? R.length : 0) + " rows" };
    return { v, y: year, rows: R.map(r => [r.p.id, r.p.name || "", r.p.pos || "", r.p.team || "", r.p.conf || "", r.p.elig ? 1 : 0, r.fbs === false ? 0 : 1, r.score, r.band || "", (typeof rfHeld === "function" && rfHeld(r.p)) ? 1 : 0]) };
  } catch (e) { return { err: e.message } }
};

export function boardsumProblem(P) {
  if (!P || P.v !== BOARDSUM_V || !Array.isArray(P.rows)) return "no pack";
  if (P.rows.length < 500) return `only ${P.rows.length} rows`;
  for (let i = 1; i < P.rows.length; i++) if (P.rows[i][7] > P.rows[i - 1][7]) return `out of order at row ${i}`;
  const ids = new Set(P.rows.map(r => r[0])); if (ids.size !== P.rows.length) return "a player twice";
  return null;
}

export async function boardSum({ site, jobToken, page = "/lab/", log = console.log, chromium, want = null }) {
  const api = async (method, path, { body, token = jobToken, headers = {}, raw } = {}) => {
    const r = await fetch(site + path, { method, body: raw ? body : body && JSON.stringify(body), headers: { Authorization: "Bearer " + token, ...(body && !raw ? { "Content-Type": "application/json" } : {}), ...headers } });
    const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { } if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 160)}`); return j };
  const ss = await api("POST", "/api/job/session", { body: { who: "probe" } }); if (!ss || !ss.token) throw new Error("no probe session");
  if (!chromium) ({ chromium } = await import("playwright"));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), H = site.replace(/\/+$/, "");
    await ctx.addCookies([{ name: "cfbs", value: ss.token, url: H }]);
    await ctx.addInitScript(t => { try { localStorage.setItem("cfbTok", t); localStorage.setItem("cfbNav", JSON.stringify({ lg: "col" })) } catch (e) { } }, ss.token);
    const p = await ctx.newPage();
    /* right after a publish the site's edge can still hand out the version before for a minute or two: the summary is only uploaded for
       the version just published (want), so a page never pairs it with other data */
    let B = null;
    for (let tries = 0; tries < 4; tries++) {
      if (tries) { log(`board summary: the page still has ${B && B.v} (want ${want}) — trying again in 60 s`); await p.waitForTimeout(60000) }
      await p.goto(H + page + (page.includes("?") ? "&" : "?") + "ro=1", { waitUntil: "domcontentloaded", timeout: 90000 });
      /* until the board has finished building (PERF.ready is set at the end of build) */
      let ok = false; for (let i = 0; i < 360 && !ok; i++) { ok = await p.evaluate(() => typeof PERF !== "undefined" && !!PERF.ready && typeof D !== "undefined" && !!D.pool && !!D.res).catch(() => false); if (!ok) await p.waitForTimeout(1000) }
      if (!ok) throw new Error("the board didn't finish building in 6 minutes");
      B = await p.evaluate(READ_BOARD);
      if (B.err) throw new Error(B.err);
      if (!want || B.v === want) break; B.stale = 1 }
    if (B.stale && want && B.v !== want) throw new Error(`the page never had the new version ${want} (had ${B.v})`);
    const P = { v: BOARDSUM_V, at: Date.now(), y: B.y, snap: B.v, cols: BOARDSUM_COLS, rows: B.rows };
    const bad = boardsumProblem(P); if (bad) throw new Error("not uploaded: " + bad);
    const nm = `p${B.y}_board-sum`, gz = gzipSync(Buffer.from(JSON.stringify(P)));
    const r = await api("PUT", `/api/pack/${nm}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
    await api("PUT", "/api/pack-index", { body: { [nm]: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
    log(`board summary: ${P.rows.length} rows · shared data ${P.snap} · ${(gz.length / 1024).toFixed(0)} KB`);
    return { rows: P.rows.length, snap: P.snap, kb: Math.round(gz.length / 1024) };
  } finally { await browser.close() }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  boardSum({ site: process.env.SITE_URL || "https://mycfbbigboard.com", jobToken: process.env.JOB_TOKEN, page: process.env.PAGE_PATH || "/lab/" })
    .then(r => console.log(JSON.stringify(r))).catch(e => { console.error("FAILED:", e.message); process.exit(1) });
}
