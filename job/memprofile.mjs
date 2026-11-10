/* Where a tab's memory goes (Nov 1 — the owner: "the website on my desktop was pulling 400-800MBs + each ... and at times up to 1.3 gbs", in Safari).
   Measurement only: signed in as the site's own probe, read-only (?ro=1), nothing saved to the site.
   A fresh browser opens a board, then visits every page in the menu twice, and after each page reads:
     - the tab's whole memory (the page's process, like Activity Monitor shows: PSS from /proc)
     - Chrome only: the JavaScript memory and the number of page elements
     - the size of every top-level variable the page's own code keeps (found by reading the page's scripts), and on football the
       in-memory saved-data store (MEM) grouped by family. Sizes are estimates from walking the data (text 2 bytes a letter,
       numbers 8, ~16 an entry for objects); a value shared between two variables is counted under both.
   Run: JOB_TOKEN=… BROWSER=chromium|webkit SITE=football|basketball node job/memprofile.mjs
   Prints the timeline and the biggest holders; posts nothing to the site. */
import { chromium, webkit } from "playwright";
import { readFileSync, readdirSync } from "node:fs";

const BROWSER = process.env.BROWSER || "chromium", SITE = process.env.SITE || "football", JOB = process.env.JOB_TOKEN;
const ROUNDS = +(process.env.ROUNDS || 2), WAIT = +(process.env.WAIT_MS || 6000), PAGE = process.env.PAGE_PATH || "/";
const URL0 = SITE === "basketball" ? (process.env.HOOPS_URL || "https://mycbbbigboard.com") : (process.env.FOOTBALL_URL || "https://mycfbbigboard.com");
const F = (process.env.FOOTBALL_URL || "https://mycfbbigboard.com").replace(/\/+$/, "");
const OUT = []; const log = (...a) => { const l = a.join(" "); OUT.push(l); console.log(l) };
const MB = b => (b / 1048576).toFixed(1);

const ss = await (await fetch(F + "/api/job/session", { method: "POST", headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" }, body: JSON.stringify({ who: "probe" }) })).json();
if (!ss.token) { console.error("no session", JSON.stringify(ss).slice(0, 200)); process.exit(1) }

/* the page's process memory: every process this browser started that renders pages, PSS in bytes */
function procMem() {
  let tot = 0, n = 0;
  for (const pid of readdirSync("/proc").filter(d => /^\d+$/.test(d))) {
    let cmd = ""; try { cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8") } catch { continue }
    const isPage = BROWSER === "webkit" ? /WebProcess/.test(cmd) : /--type=renderer/.test(cmd) && !/--extension-process/.test(cmd);
    if (!isPage) continue;
    try { const m = readFileSync(`/proc/${pid}/smaps_rollup`, "utf8").match(/^Pss:\s+(\d+) kB/m); if (m) { tot += +m[1] * 1024; n++ } } catch { }
  }
  return { tot, n };
}

/* top-level names the page's own scripts declare (let/const/var/function at the start of a line, or comma-chained after one) */
async function topNames(html) {
  const names = new Set();
  for (const m of html.matchAll(/(?:^|[;\n}])\s*(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  for (const m of html.matchAll(/(?:^|[;\n])\s*(?:let|var)\s+([A-Za-z_$][\w$]*(?:\s*=[^,;\n]{0,60})?(?:\s*,\s*[A-Za-z_$][\w$]*(?:\s*=[^,;\n]{0,60})?)+)\s*;/g))
    for (const part of m[1].split(",")) { const n = part.trim().match(/^([A-Za-z_$][\w$]*)/); if (n) names.add(n[1]) }
  return [...names];
}

/* runs in the page: estimated bytes held by each name, and (football) by MEM family */
const SIZER = (names) => {
  const est = (root, budget = 3e7) => {
    const seen = new Set(); let bytes = 0, steps = 0; const st = [root];
    while (st.length && steps < budget) {
      const v = st.pop(); steps++;
      if (v == null) continue;
      const t = typeof v;
      if (t === "string") { bytes += 12 + v.length * 2; continue }
      if (t === "number" || t === "boolean") { bytes += 8; continue }
      if (t !== "object") continue;
      if (seen.has(v)) continue; seen.add(v);
      if (v instanceof Node || v === window) { bytes += 64; continue }
      if (ArrayBuffer.isView(v)) { bytes += v.byteLength; continue }
      if (v instanceof ArrayBuffer) { bytes += v.byteLength; continue }
      if (v instanceof Map) { bytes += 32 + v.size * 24; for (const [a, b] of v) { st.push(a); st.push(b) } continue }
      if (v instanceof Set) { bytes += 32 + v.size * 16; for (const a of v) st.push(a); continue }
      if (Array.isArray(v)) { bytes += 16 + v.length * 8; for (let i = 0; i < v.length; i++) st.push(v[i]); continue }
      let ks; try { ks = Object.keys(v) } catch { continue }
      bytes += 16 + ks.length * 16; for (const k of ks) { bytes += 12 + k.length * 2; try { st.push(v[k]) } catch { } }
    }
    return { bytes, cut: steps >= budget };
  };
  const out = {};
  for (const n of names) { let v; try { v = (0, eval)(n) } catch { continue } if (v == null || typeof v === "function" || typeof v !== "object" && !(typeof v === "string" && v.length > 50000)) continue;
    const r = est(v); if (r.bytes > 256 * 1024) out[n] = Math.round(r.bytes) + (r.cut ? "+" : "") }
  let mem = null;
  try { const M = (0, eval)("MEM"); if (M && typeof M === "object") { mem = {}; for (const k of Object.keys(M)) { const fam = /^nf_/.test(k) ? k.slice(0, 28) : (k.match(/^[a-z]+[0-9]*_?/i) || ["?"])[0].replace(/\d+_?$/, "#_");   /* NFL packs one by one (Nov 10) */ const r = est(M[k], 5e6); mem[fam] = (mem[fam] || 0) + r.bytes } } } catch { }
  /* the board's own holders, key by key (Nov 1): D (the board), its grades and recruit index */
  const parts = {};
  for (const nm of ["D", "D.res", "D.resD", "D.recIdx", "D.byYear", "D.career", "D.pool"]) { let v; try { v = (0, eval)(nm) } catch { continue } if (!v || typeof v !== "object") continue;
    const ks = Object.keys(v); if (ks.length > 400) { const smp = ks.slice(0, 200), r = smp.reduce((a, k) => a + est(v[k], 2e5).bytes, 0); parts[nm + " (" + ks.length + " entries, est. from 200)"] = Math.round(r / smp.length * ks.length); continue }
    for (const k of ks) { const r = est(v[k], 1e7); if (r.bytes > 512 * 1024) parts[nm + "." + k] = r.bytes } }
  const css = [...document.styleSheets].reduce((a, s) => { try { return a + [...s.cssRules].reduce((b, r) => b + r.cssText.length, 0) } catch { return a } }, 0);
  let ls = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls += (k.length + (localStorage.getItem(k) || "").length) * 2 } } catch { }
  return { vars: out, mem, parts, nodes: document.getElementsByTagName("*").length, imgs: document.images.length, css: css * 2, ls };
};

const B = BROWSER === "webkit" ? webkit : chromium;
const browser = await B.launch(BROWSER === "chromium" ? { args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-site-check": "1" } });
const H = URL0.replace(/\/+$/, "");
await ctx.addCookies([{ name: "cfbs", value: ss.token, url: H }]);
await ctx.addInitScript(t => { try { localStorage.setItem("cfbTok", t) } catch (e) { } }, ss.token);
/* Nov 9 (memory hunt): START=pro opens on the pro side, as someone whose last visit was there (the Lab then holds the college board back) */
const START = process.env.START || "";
if (START === "pro" && SITE === "football") await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("mpStarted")) { sessionStorage.setItem("mpStarted", "1"); localStorage.setItem("cfbNav", JSON.stringify({ lg: "pro" })) } } catch (e) { } });
/* Nov 2 (the owner's Safari timeline: style, layout and paint on every frame while idle, ~30% CPU): count animation-frame callbacks */
await ctx.addInitScript(() => { window.__raf = 0; const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => { window.__raf++; return r(f) } });
/* (Nov 2, chasing football Leaders → This week: ~150 style recalcs a second with no animation running) who sets timers, which observers fire */
await ctx.addInitScript(() => { const T = window.__tmo = {}; const key = f => String(f).replace(/\s+/g, " ").slice(0, 90);
  const st = window.setTimeout.bind(window); window.setTimeout = (f, ms, ...a) => { if (typeof f === "function") { const k = (ms || 0) + "ms " + key(f); T[k] = (T[k] || 0) + 1 } return st(f, ms, ...a) };
  window.__obs = {}; for (const nm of ["ResizeObserver", "IntersectionObserver", "MutationObserver"]) { const O = window[nm]; if (!O) continue;
    window[nm] = class extends O { constructor(cb, ...a) { const k = nm + " " + key(cb); super((...x) => { window.__obs[k] = (window.__obs[k] || 0) + 1; return cb(...x) }, ...a) } } } });
/* Nov 1 (the owner: "when i open other sites it isn't nearly as much ... including sleeper"): the same browser on a blank page and on other sites
   first, so the board's number has something to stand next to. Each in its own fresh tab, closed before the next. */
if (process.env.COMPARE) for (const u of ["about:blank", ...process.env.COMPARE.split(",")]) {
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } }), q = await c2.newPage();
  try { await q.goto(u, { waitUntil: "load", timeout: 60000 }); await q.waitForTimeout(8000); const m = procMem(); log(`compare ${u.padEnd(40)} tab ${MB(m.tot).padStart(7)} MB (${m.n} page processes)`) } catch (e) { log(`compare ${u}: ${e.message.slice(0, 100)}`) }
  await c2.close(); await new Promise(r => setTimeout(r, 1500));
}
const p = await ctx.newPage();
let errs = []; p.on("pageerror", e => errs.push(e.message));
let netBytes = 0, NETBY = {}; p.on("requestfinished", async r => { try { const b = (await r.sizes()).responseBodySize; netBytes += b; const rs = await r.response(); const k = r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 70) + " " + (rs ? rs.status() : "?"); NETBY[k] = (NETBY[k] || 0) + b } catch { } });
const cdp = BROWSER === "chromium" ? await ctx.newCDPSession(p) : null;
if (cdp) await cdp.send("Performance.enable");


const rows = []; let prevVars = {}, prevMem = {}, PK_SEEN = 0; const NAMES = [], SETTLE = [];
let prevTot = 0;
async function snap(label, full) {
  await p.waitForTimeout(500);
  if (cdp) { try { await cdp.send("HeapProfiler.collectGarbage") } catch { } }
  await p.waitForTimeout(300);
  const pm = procMem();
  let heap = null;
  if (cdp) { const m = (await cdp.send("Performance.getMetrics")).metrics; const g = k => (m.find(x => x.name === k) || {}).value || 0; heap = g("JSHeapUsedSize") }
  if (!full && pm.tot - prevTot > 40 * 1048576) full = true;   /* a big jump: size everything to see what grew */
  prevTot = pm.tot;
  let s = null;
  if (full) { try { s = await p.evaluate(SIZER, NAMES) } catch (e) { s = { vars: {}, err: e.message } } }
  else s = { nodes: await p.evaluate(() => document.getElementsByTagName("*").length).catch(() => "?") };
  if (!full) { rows.push({ label, pm, heap, s }); log(`${label.padEnd(34)} tab ${MB(pm.tot).padStart(7)} MB${heap != null ? ` · JS ${MB(heap).padStart(6)} MB` : ""} · ${String(s.nodes).padStart(6)} elements · downloaded ${MB(netBytes).padStart(6)} MB`); return }
  const grew = Object.entries(s.vars || {}).map(([k, v]) => [k, parseInt(v) - parseInt(prevVars[k] || 0)]).filter(([, d]) => d > 1048576).sort((a, b) => b[1] - a[1]).slice(0, 4);
  prevVars = s.vars || {};
  /* Nov 10: which saved-data families grew in memory on this page */
  const memGrew = Object.entries(s.mem || {}).map(([k, v]) => [k, v - (prevMem[k] || 0)]).filter(([, d]) => d > 2 * 1048576).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (s.mem) prevMem = s.mem;
  /* and which data packs this page asked for (the Lab's pack log), when it grew a lot */
  let pk = ""; try { const K = await p.evaluate(() => (window.__PKLOG || []).map(x => x[0])); const nw = K.slice(PK_SEEN); PK_SEEN = K.length; if (nw.length && memGrew.length) pk = " · packs: " + nw.slice(0, 12).join(", ") + (nw.length > 12 ? ` +${nw.length - 12}` : "") } catch { }
  rows.push({ label, pm, heap, s });
  log(`${label.padEnd(34)} tab ${MB(pm.tot).padStart(7)} MB${heap != null ? ` · JS ${MB(heap).padStart(6)} MB` : ""} · ${String(s.nodes || "?").padStart(6)} elements · downloaded ${MB(netBytes).padStart(6)} MB${grew.length ? " · grew: " + grew.map(([k, d]) => `${k} +${MB(d)}`).join(", ") : ""}${memGrew.length ? " · in MEM: " + memGrew.map(([k, d]) => `${k} +${MB(d)}`).join(", ") : ""}${pk}`);
}

await p.goto(H + PAGE + (PAGE.includes("?") ? "&" : "?") + "ro=1", { waitUntil: "domcontentloaded", timeout: 90000 });
/* until the board shows */
for (let i = 0; i < 240; i++) {
  const ok = await p.evaluate(SITE === "basketball"
    ? () => !document.querySelector("#panel .load") && document.querySelectorAll("#panel tbody tr").length > 10
    : START === "pro" ? () => { const L = document.getElementById("load"); return !(L && L.offsetParent) && !!window.__drawn }
    : () => { const L = document.getElementById("load"); return !(L && L.offsetParent) && typeof D !== "undefined" && D.pool && Object.keys(D.pool).length > 100 }).catch(() => false);
  if (ok) break; await p.waitForTimeout(500);
}
await p.waitForTimeout(WAIT);
/* the page's own code, as the browser loaded it: its inline scripts and the site's script files */
const html = await p.evaluate(async () => { let t = [...document.scripts].filter(s => !s.src).map(s => s.textContent).join("\n");
  for (const s of [...document.scripts].filter(s => s.src && new URL(s.src).origin === location.origin)) try { t += "\n" + await (await fetch(s.src)).text() } catch { }
  return t });
NAMES.push(...await topNames(html));
log(`${SITE} · ${BROWSER} · page code ${MB(html.length)} MB · ${NAMES.length} top-level names to size`);
await snap("opened (board showing)", true);
/* Nov 9 (memory hunt): which data packs the page asked for before the board showed, and from where (the Lab keeps window.__PKLOG) */
{ const K = await p.evaluate(() => (window.__PKLOG || []).slice(0, 60)).catch(() => []);
  for (const [nm, t, st] of K) log(`   pack at open: ${String(nm).padEnd(22)} ${String(t).padStart(6)} ms · ${st}`) }

/* Nov 9 (9:41 pm: "a quick flip back and forth could cause college to not load tho or get interrupted"): opened on the pros, flip
   College / Pros four times a third of a second apart, end on college, and time until the college Home is up with the board in */
if (START === "pro" && SITE === "football") {
  const st = await p.evaluate(() => ({ lg: NAV_LG, later: typeof COL_LATER !== "undefined" && COL_LATER, pool: !!(D && D.pool) })).catch(e => ({ err: e.message }));
  log(`pro start: side ${st.lg} · college board held back: ${st.later ? "yes" : "no"} · college players in: ${st.pool ? "yes" : "no"}${st.err ? " · " + st.err : ""}`);
  const t0 = Date.now();
  for (const lg of ["col", "pro", "col", "pro", "col"]) { await p.evaluate(l => navGo(l, "HOME"), lg).catch(() => { }); await p.waitForTimeout(330) }
  const look = () => p.evaluate(() => { const L = document.getElementById("load"); return { lg: NAV_LG, load: !!(L && L.offsetParent), loadTxt: L ? L.textContent.slice(0, 80) : "", pool: D && D.pool ? Object.keys(D.pool).length : 0,
    cards: document.querySelectorAll("#empty .hmc").length, rows: document.querySelectorAll("#empty .hmc .trr, #empty .hmc .hxg").length } }).catch(e => ({ err: e.message }));
  let up = null, L1 = null;
  for (let i = 0; i < 300; i++) { L1 = await look(); if (L1.lg === "col" && L1.pool && !L1.load && L1.rows > 0) { up = Date.now() - t0; break } await p.waitForTimeout(500) }
  log(`quick flips → college Home ${up != null ? `up in ${(up / 1000).toFixed(1)} s` : "NOT up after 150 s"} · ${L1.pool} college players · ${L1.cards} cards, ${L1.rows} rows · loading line ${L1.load ? `still showing ("${L1.loadTxt}")` : "gone"}${L1.err ? " · " + L1.err : ""}`);
  await snap("after the quick flips (college in)", true);
  /* back to the pros and to college once more: the board is in, nothing loads again */
  await p.evaluate(() => navGo("pro", "HOME")).catch(() => { }); await p.waitForTimeout(1500); const L2 = await look();
  await p.evaluate(() => navGo("col", "HOME")).catch(() => { }); await p.waitForTimeout(1500); const L3 = await look();
  log(`flip again: pros ${L2.cards} cards, loading line ${L2.load ? "up" : "gone"} · college ${L3.cards} cards, ${L3.rows} rows, loading line ${L3.load ? "up" : "gone"}`)
}

/* every page in the menu */
const pages = await p.evaluate(SITE === "basketball"
  ? () => Object.keys(TAB_OF).map(v => ({ v }))
  : () => { const o = [{ lg: "col", sec: "HOME" }]; for (const lg of Object.keys(NAV)) for (const [sec, chips] of Object.entries(NAV[lg])) for (const c of (Array.isArray(chips) ? chips : [])) o.push({ lg, sec, chip: c[0] }); return o });
log(`${pages.length} pages in the menu`);
for (let r = 1; r <= ROUNDS; r++) {
  for (const pg of pages) {
    const label = `r${r} ` + (pg.v || `${pg.lg} ${pg.sec}${pg.chip ? " " + pg.chip : ""}`);
    try {
      const t0 = Date.now();
      /* Nov 10 (7:25 am: "6 seconds to load a page too?"): a page whose name matches CPU_PAGE gets a Chrome CPU profile of its load —
         where the time went, function by function */
      const prof = cdp && process.env.CPU_PAGE && label.includes(process.env.CPU_PAGE);
      if (prof) { try { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start") } catch (e) { log("profiler: " + e.message) } }
      await p.evaluate(SITE === "basketball" ? (pg) => go(pg.v) : (pg) => navGo(pg.lg, pg.sec, pg.chip), pg);
      /* how quick: until the page stops changing (element count steady for 0.6 s, no loading line) */
      let last = -1, steady = 0, settle = null;
      while (Date.now() - t0 < WAIT + 20000) { await p.waitForTimeout(100);
        const n = await p.evaluate(() => { const L = document.querySelector("#load,#panel .load"); return (L && L.offsetParent ? -1 : 1) * document.getElementsByTagName("*").length }).catch(() => -1);
        if (n > 0 && n === last) { if (++steady >= 6) { settle = Date.now() - t0 - 600; break } } else steady = 0; last = n }
      SETTLE.push([r, label, settle]);
      if (prof) { try { const { profile: P } = await cdp.send("Profiler.stop"); const self = {}, byId = {}; for (const n of P.nodes) byId[n.id] = n;
          const dt = P.timeDeltas || [], tot = (P.endTime - P.startTime) / 1000; const hit = {}; (P.samples || []).forEach((id, i) => { hit[id] = (hit[id] || 0) + (dt[i] || 0) });
          for (const id in hit) { const n = byId[id], f = n.callFrame, k = `${f.functionName || "(anon)"} ${String(f.url || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 30)}:${f.lineNumber + 1}`; self[k] = (self[k] || 0) + hit[id] / 1000 }
          log(`   CPU on ${label} (${tot.toFixed(0)} ms profiled): ` + Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(" · ")) } catch (e) { log("profiler: " + e.message) } }
      await p.waitForTimeout(Math.max(0, WAIT - (Date.now() - t0)));
      await snap(label + (settle != null ? ` (${(settle / 1000).toFixed(1)} s)` : " (slow)"), false);
      if (process.env.IDLE && r === 1) {   /* sit still 2 s: what keeps redrawing? */
        const m0 = cdp ? (await cdp.send("Performance.getMetrics")).metrics : null, raf0 = await p.evaluate(() => window.__raf);
        await p.waitForTimeout(2000);
        const m1 = cdp ? (await cdp.send("Performance.getMetrics")).metrics : null, raf1 = await p.evaluate(() => window.__raf);
        const g = (m, k) => m ? ((m.find(x => x.name === k) || {}).value || 0) : 0;
        const an = await p.evaluate(() => { const A = document.getAnimations().filter(a => a.playState === "running"); const by = {};
          for (const a of A) { const t = a.effect && a.effect.target, nm = (a.animationName || a.transitionProperty || "anim") + " on " + (t ? (typeof t.className === "string" && t.className ? "." + t.className.split(" ")[0] : t.tagName) + (a.effect.pseudoElement || "") : "?"); by[nm] = (by[nm] || 0) + 1 }
          return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => v + "× " + k).join(", ") });
        if (g(m1, "RecalcStyleCount") - g(m0, "RecalcStyleCount") > 30) {   /* busy while idle: what's doing it */
          await p.evaluate(() => { window.__tmo0 = { ...window.__tmo }; window.__obs0 = { ...window.__obs }; window.__mut = {}; window.__mo2 = new (Object.getPrototypeOf(window.MutationObserver))(L => { for (const m of L) { const t = m.target, d = (t.id ? "#" + t.id : t.className && typeof t.className === "string" ? "." + t.className.split(" ")[0] : t.nodeName) + " " + m.type + (m.attributeName ? ":" + m.attributeName : ""); window.__mut[d] = (window.__mut[d] || 0) + 1 } }); window.__mo2.observe(document, { subtree: true, attributes: true, childList: true, characterData: true }) }).catch(() => { });
          await p.waitForTimeout(2000);
          const why = await p.evaluate(() => { const top = (A, B) => Object.entries(A).map(([k, v]) => [k, v - ((B || {})[k] || 0)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => v + "× " + k).join(" | ");
            return { timers: top(window.__tmo, window.__tmo0), observers: top(window.__obs, window.__obs0), mutations: top(window.__mut, {}), hover: document.querySelectorAll(":hover").length } }).catch(e => ({ err: e.message }));
          log(`   busy while idle → timers: ${why.timers || "none"} · observers: ${why.observers || "none"} · DOM changes: ${why.mutations || "none"}${why.err ? " · " + why.err : ""}`) }
        log(`   idle 2 s: ${raf1 - raf0} frame callbacks · ${g(m1, "LayoutCount") - g(m0, "LayoutCount")} layouts · ${g(m1, "RecalcStyleCount") - g(m0, "RecalcStyleCount")} style recalcs${an ? " · running: " + an : ""}`) }
    } catch (e) { log(`${label}: ${e.message.slice(0, 160)}`) }
  }
  await snap(`end of round ${r}`, true);
  /* the let-go (Nov 1): let go right away instead of waiting 3 minutes, to see what it frees; the next round shows how quick pages come back */
  if (r < ROUNDS) { const n = await p.evaluate(() => typeof window.__letGo === "function" ? window.__letGo() : null).catch(() => null);
    if (n != null) { await p.waitForTimeout(1500); await snap(`after the let-go (${n} files)`, true) } }
}
await p.waitForTimeout(120000); await snap("after 2 idle minutes", true);
/* a return visit (Nov 1): the same browser opens the board again, with everything already saved, like the owner's own tab after the first day */
if (process.env.REOPEN !== "0") { netBytes = 0; NETBY = {};
  /* Nov 10: the return visit opens on the college side, like the first open (the Lab holds the college board back on a pro-side open, and
     the menu's last page is a pro page — the return visits measured Nov 9–10 had opened there, without the college board) */
  if (SITE === "football") await p.evaluate(() => { try { const n = JSON.parse(localStorage.getItem("cfbNav") || "{}"); n.lg = "col"; localStorage.setItem("cfbNav", JSON.stringify(n)) } catch (e) { } }).catch(() => { });
  await p.goto(H + PAGE + (PAGE.includes("?") ? "&" : "?") + "ro=1", { waitUntil: "domcontentloaded", timeout: 90000 });
  for (let i = 0; i < 240; i++) { const ok = await p.evaluate(SITE === "basketball" ? () => !document.querySelector("#panel .load") && document.querySelectorAll("#panel tbody tr").length > 10
      : () => { const L = document.getElementById("load"); return !(L && L.offsetParent) && typeof D !== "undefined" && D.pool && Object.keys(D.pool).length > 100 }).catch(() => false); if (ok) break; await p.waitForTimeout(500) }
  await p.waitForTimeout(WAIT); await snap("return visit: board showing", true);
  log(`=== ${SITE} · ${BROWSER}: return visit, board showing: tab ${MB(rows[rows.length - 1].pm.tot)} MB (downloaded ${MB(netBytes)} MB) ===`);
  /* Nov 10: what the return visit downloaded (address and status), biggest first */
  log("   return visit downloads: " + Object.entries(NETBY).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, b]) => `${k} ${MB(b)} MB`).join(" · "));
  /* and, on that return visit, how quick pro Legacy opens (Nov 10, 7:25 am: "6 seconds to load a page too?") */
  if (SITE === "football") { const t0 = Date.now(); await p.evaluate(() => navGo("pro", "PLAYERS", "legacy")).catch(() => { }); let last = -1, steady = 0, st = null;
    while (Date.now() - t0 < 30000) { await p.waitForTimeout(100); const n = await p.evaluate(() => { const L = document.querySelector("#load"); return (L && L.offsetParent ? -1 : 1) * document.getElementsByTagName("*").length }).catch(() => -1);
      if (n > 0 && n === last) { if (++steady >= 6) { st = Date.now() - t0 - 600; break } } else steady = 0; last = n }
    log(`=== ${SITE} · ${BROWSER}: return visit, pro Legacy: ${st != null ? (st / 1000).toFixed(1) + " s" : "not settled in 30 s"} ===`) } }

/* real sizes, Chrome only (Nov 1): the estimates above count a shared value twice, so at the very end each big holder is dropped in turn
   and the JavaScript memory freed is read after a clean-up. Done last, because it breaks the page. */
if (cdp && SITE === "football" && process.env.WHATIF !== "0") {
  const heap = async () => { await cdp.send("HeapProfiler.collectGarbage"); await p.waitForTimeout(300); await cdp.send("HeapProfiler.collectGarbage"); const m = (await cdp.send("Performance.getMetrics")).metrics; return (m.find(x => x.name === "JSHeapUsedSize") || {}).value || 0 };
  const STEPS = [
    ["recruit index", `D.recIdx=null;for(const k in MEM)if(/^recidx_/.test(k))delete MEM[k]`],
    ["grades (board results)", `D.res=null;D.cohort=null;for(const k in RES_P)delete RES_P[k];for(const k in MEM)if(/^rs_/.test(k))delete MEM[k]`],
    ["grades detail + combine curves", `D.resD=null;D.resDP=null;D.resC=null`],
    ["this season's roster (D.ros)", `D.ros=null;for(const k in MEM)if(/^ro_/.test(k))delete MEM[k]`],
    ["past seasons by year (D.byYear)", `D.byYear=null`],
    ["careers (D.career)", `D.career=null`],
    ["roster seasons (D.hist)", `D.hist=null`],
    ["transfers (D.xfer)", `D.xfer=null;for(const k in MEM)if(/^xfer_/.test(k))delete MEM[k]`],
    ["NFL data (D.nflp, nfld, nfldX, pd)", `D.nflp=null;D.nfld=null;D.nfldX=null;D.pd=null;for(const k in MEM)if(/^nfl_/.test(k))delete MEM[k]`],
    ["legacy results (D.legRes)", `D.legRes=null`],
    ["combine (D.comb)", `D.comb=null;for(const k in MEM)if(/^comb_/.test(k))delete MEM[k]`],
    ["season stats (ss5_ and D.season)", `D.season=null;for(const k in MEM)if(/^ss\d*_/.test(k))delete MEM[k]`],
    ["the rest of saved data (MEM)", `for(const k in MEM)delete MEM[k]`],
    ["the player pool (D.pool)", `D.pool=null`],
    ["everything else in D", `for(const k in D)D[k]=null`],
    ["the page's drawing (panel)", `const e=document.getElementById("panel")||document.querySelector("main");if(e)e.innerHTML=""`],
  ];
  let h0 = await heap(); log(`\nreal sizes (Chrome, JavaScript memory freed by dropping each in turn; start ${MB(h0)} MB):`);
  for (const [nm, code] of STEPS) { try { await p.evaluate(c => { (0, eval)(c) }, code) } catch (e) { log(`  ${nm}: ${e.message.slice(0, 80)}`); continue } const h = await heap(); log(`  ${nm.padEnd(40)} ${MB(h0 - h).padStart(7)} MB`); h0 = h }
  log(`  left (page code, other caches)            ${MB(h0).padStart(7)} MB · whole tab now ${MB(procMem().tot)} MB`);
}
/* the biggest holders at the end */
const full = rows.filter(r => r.s && r.s.vars), last = full[full.length - 1], first = full[0];
log(`\n=== ${SITE} · ${BROWSER}: tab ${MB(first.pm.tot)} MB when opened → ${MB(Math.max(...rows.map(r => r.pm.tot)))} MB at most → ${MB(last.pm.tot)} MB at the end (${pages.length} pages × ${ROUNDS}) ===`);
log("biggest variables at the end (estimated MB):");
for (const [k, v] of Object.entries(last.s.vars || {}).sort((a, b) => parseInt(b[1]) - parseInt(a[1])).slice(0, 30)) log(`  ${k.padEnd(24)} ${MB(parseInt(v)).padStart(7)}${String(v).endsWith("+") ? "+ (stopped counting)" : ""}   (opened: ${MB(parseInt(first.s.vars[k] || 0))})`);
if (last.s.parts) { log("the board's holders, MB:"); for (const [k, v] of Object.entries(last.s.parts).sort((a, b) => b[1] - a[1]).slice(0, 40)) log(`  ${k.padEnd(44)} ${MB(v).padStart(7)}`) }
if (last.s.mem) { log("MEM (saved data held in memory) by family, MB:"); for (const [k, v] of Object.entries(last.s.mem).sort((a, b) => b[1] - a[1]).slice(0, 25)) log(`  ${k.padEnd(14)} ${MB(v).padStart(7)}   (opened: ${MB((first.s.mem || {})[k] || 0)})`) }
log(`styles ${MB(last.s.css || 0)} MB · localStorage ${MB(last.s.ls || 0)} MB · page errors: ${errs.length}${errs.length ? " — " + [...new Set(errs)].slice(0, 5).join(" | ").slice(0, 400) : ""}`);
for (let r = 1; r <= ROUNDS; r++) { const v = SETTLE.filter(x => x[0] === r && x[2] != null).map(x => x[2]).sort((a, b) => a - b), slow = SETTLE.filter(x => x[0] === r && x[2] == null).length;
  if (v.length) log(`=== round ${r} speed: median ${(v[v.length >> 1] / 1000).toFixed(2)} s · slowest ${(v[v.length - 1] / 1000).toFixed(1)} s · ${slow} pages never settled · slowest pages: ${SETTLE.filter(x => x[0] === r).sort((a, b) => (b[2] ?? 1e9) - (a[2] ?? 1e9)).slice(0, 4).map(x => x[1].replace(/^r\d /, "") + " " + (x[2] == null ? "slow" : (x[2] / 1000).toFixed(1) + "s")).join(", ")}`) }
await browser.close();
for (const l of OUT.filter(l => /^=== /.test(l))) console.log(`::notice title=memory ${SITE} ${BROWSER}::${l}`);
