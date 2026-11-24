/* The full audit's pictures and checks (Nov 23 — the owner, 3:55 pm: "every table/chart/data input/data output/diagram/throw chart/run chart/target
   and reception chart every single number on the site needs to be checked and be sure it's in the correct place … missed ui design. overlapping.
   crunched spacing of two panels or words inside panels. literally everything … audits the way i said above before and after").
   One board (PAGES: "/" football or "/cbb/" basketball) at one width (WIDTH: 1280 computer, 390 phone), signed in as the site's probe, read-only
   (?ro=1). Every league × page × sub-view through the header's own navigation (NAV / navGo), then a set of deep views (profiles, scout reports).
   For each view: a picture (JPEG, the whole panel, cut at 5000 px) and these checks, all measured in the page:
   - words: "undefined", "NaN", "[object Object]", "Infinity", "null" as text; a percent over 100; a "Loading…" still showing after the wait
   - fit: text cut off inside its box (clipped or ellipsis), a button label that wraps, anything running off the right edge (phone)
   - overlap: two pieces of text drawn on top of each other (not one inside the other)
   - crunch: two cards or panels side by side or stacked with less than 4 px between them; text closer than 4 px to its card's edge
   - tables: a row with more or fewer cells than the header; a table with a header and no rows
   - charts: an <svg> chart or <canvas> with nothing drawn in it
   Pictures, audit.json and run.txt come back as the run's artifact (the bc-shots workflow with script=auditshots). */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const F = (process.env.FOOTBALL_URL || "https://mycfbbigboard.com").replace(/\/+$/, ""), JOB = process.env.JOB_TOKEN;
const PAGE = process.env.PAGES || "/", W = +(process.env.WIDTH || 1280), TAG = process.env.TAG || "before", PH = W < 800;
const OUT = "bcshots"; mkdirSync(OUT, { recursive: true });
const ss = await (await fetch(F + "/api/job/session", { method: "POST", headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" }, body: JSON.stringify({ who: "probe" }) })).json();

/* everything measured inside the page for the view on screen */
const CHECK = () => {
  const root = document.querySelector("#panel") || document.querySelector("main") || document.body, Wd = document.documentElement.clientWidth, out = [];
  const vis = e => { if (!e.offsetParent && getComputedStyle(e).position !== "fixed") return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 };
  const nm = e => { let s = e.tagName.toLowerCase(); if (e.id) s += "#" + e.id; else if (e.classList.length) s += "." + [...e.classList].slice(0, 2).join("."); return s };
  const where = e => { const t = (e.textContent || "").replace(/\s+/g, " ").trim(); return nm(e) + (t ? " “" + t.slice(0, 60) + "”" : "") };
  /* (refined Nov 23, 6:55 pm) pinned layers (the bottom bar, the "What's new" pop-up) sit over the page on purpose; a word's lines are measured line by line */
  const pinned = e => { for (let p = e; p && p !== document.body; p = p.parentElement) { const ps = getComputedStyle(p).position; if (ps === "fixed" || ps === "sticky") return true } return false };
  const ownLines = e => { const tops = new Set(); let w = 0; for (const n of e.childNodes) { if (n.nodeType !== 3 || !n.nodeValue.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) { if (r.width > 1) { tops.add(Math.round(r.top / 4)); w = Math.max(w, r.width) } } } return { lines: tops.size, w } };
  const inScroller = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth + 2) return true } return false };
  /* words */
  const txt = (() => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && n.parentElement.closest("script,style,noscript,template") ? 2 : 1 }); let s = ""; while (w.nextNode()) { const p = w.currentNode.parentElement; if (p && vis(p)) s += w.currentNode.nodeValue + " " } return s.replace(/\s+/g, " ") })();
  for (const re of [/.{0,40}(?:^|[^A-Za-z])(undefined|NaN|\[object Object\]|Infinity)(?![A-Za-z]).{0,30}/g, /.{0,40}(?:^|[\s(:])null(?=[\s,)]|$).{0,30}/g]) for (const m of txt.matchAll(re)) out.push(["words", m[0].trim()]);
  for (const m of txt.matchAll(/.{0,30}(?<![\d.])(\d{3,}(?:\.\d+)?)%.{0,20}/g)) if (+m[1] > 100) out.push(["percent", m[0].trim()]);
  if (/Loading|Building|One moment/i.test(txt.slice(0, 4000))) { const m = txt.match(/.{0,30}(Loading|Building|One moment).{0,30}/i); if (m) out.push(["loading", m[0].trim()]) }
  /* fit */
  const all = [...root.querySelectorAll("*")].filter(vis);
  for (const e of all) {
    const cs = getComputedStyle(e), own = [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
    if (own && (cs.overflow === "hidden" || cs.overflowX === "hidden" || cs.textOverflow === "ellipsis") && e.scrollWidth > e.clientWidth + 2 && !inScroller(e)) { const inner = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); if (ownLines(e).w > inner + 1) out.push([cs.textOverflow === "ellipsis" ? "cut short (…)" : "clipped", where(e)]) }
    if (e.tagName === "BUTTON" && own && (e.textContent || "").trim().length < 30 && !pinned(e) && !e.querySelector("br,svg,img") && ownLines(e).lines > 1) out.push(["button wraps", where(e)]);
    if (PH_) { const r = e.getBoundingClientRect(); if (r.right > Wd + 2 && !inScroller(e) && !e.closest("[data-offscreen-ok]")) out.push(["off the edge", where(e) + ` (${Math.round(r.right - Wd)} px)`]) }
  }
  /* overlap: two runs of words drawn over each other — text nodes only (a select's options and hidden copies don't count) */
  const shown = e => { try { return e.checkVisibility ? e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true } catch (x) { return true } };
  const clipBox = e => { let r = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 }; for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflow !== "visible" || cs.overflowX !== "visible") { const b = p.getBoundingClientRect(); r = { left: Math.max(r.left, b.left), top: Math.max(r.top, b.top), right: Math.min(r.right, b.right), bottom: Math.min(r.bottom, b.bottom) } } } return r };
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => !n.nodeValue.trim() || !n.parentElement || n.parentElement.closest("script,style,noscript,template,select,option,datalist,textarea") ? 2 : 1 });
  const leaves = []; while (tw.nextNode() && leaves.length < 1500) { const e = tw.currentNode.parentElement; if (!vis(e) || !shown(e) || inScroller(e) || pinned(e)) continue; const rg = document.createRange(); rg.selectNodeContents(tw.currentNode); const c = clipBox(e);
    for (const r0 of rg.getClientRects()) { const r = { left: Math.max(r0.left, c.left), top: Math.max(r0.top, c.top), right: Math.min(r0.right, c.right), bottom: Math.min(r0.bottom, c.bottom) }; r.width = r.right - r.left; r.height = r.bottom - r.top; if (r.width > 2 && r.height > 2) leaves.push({ e, r }) } }
  const B = new Map(); for (const [i, x] of leaves.entries()) { const k = Math.floor(x.r.top / 60); if (!B.has(k)) B.set(k, []); B.get(k).push(i) }
  const seen = new Set();
  for (const [k, ids] of B) for (const i of ids) for (const j of [...(B.get(k) || []), ...(B.get(k + 1) || [])]) {
    if (j <= i) continue; const a = leaves[i], b = leaves[j]; if (a.e === b.e || a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ix > .4 * Math.min(a.r.width, b.r.width) && iy > .45 * Math.min(a.r.height, b.r.height) && ix > 3 && iy > 3) { const key = where(a.e) + "|" + where(b.e); if (!seen.has(key)) { seen.add(key); out.push(["overlap", where(a.e) + "  ⟷  " + where(b.e)]) } } }
  /* (Nov 23, 10:11 pm — the owner's phone screenshots: an icon button under the ‹ button, a score running out of its card in the score strip,
     both missed because only words were compared and scrollers were skipped) controls drawn over controls, icon buttons included, and
     words running past the card they sit in — inside scrollers too, judged against the card, not the screen */
  { const ctl = all.filter(e => e.matches("button,a[href],input,select,[role=button],[role=tab]") && shown(e) && !pinned(e)).slice(0, 1500);
    const CB = new Map(); for (const [i, e] of ctl.entries()) { const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue; const k = Math.floor(r.top / 60); if (!CB.has(k)) CB.set(k, []); CB.get(k).push([i, r]) }
    const sn = new Set();
    for (const [k, L] of CB) for (const [i, a] of L) for (const [j, b] of [...(CB.get(k) || []), ...(CB.get(k + 1) || [])]) {
      if (j <= i) continue; const A = ctl[i], Bx = ctl[j]; if (A.contains(Bx) || Bx.contains(A)) continue;
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 3 && iy > 3) { const key = where(A) + "|" + where(Bx); if (!sn.has(key)) { sn.add(key); out.push(["controls overlap", where(A).slice(0, 60) + "  ⟷  " + where(Bx).slice(0, 60) + ` (${Math.round(ix)} px)`]) } } } }
  { const cardOf = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.borderRadius !== "0px" && (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || (cs.borderLeftWidth !== "0px" && cs.borderRightWidth !== "0px")) && p.getBoundingClientRect().width > 40) return p } return null };
    const tw2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => !n.nodeValue.trim() || !n.parentElement || n.parentElement.closest("script,style,noscript,template,select,option,datalist,textarea") ? 2 : 1 });
    const sn2 = new Set(); let k2 = 0;
    while (tw2.nextNode() && k2++ < 4000) { const e = tw2.currentNode.parentElement; if (!vis(e) || !shown(e) || pinned(e)) continue; const c = cardOf(e); if (!c) continue;
      const cr = c.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(tw2.currentNode);
      for (const r of rg.getClientRects()) { const d = Math.max(r.right - cr.right, cr.left - r.left); if (r.width > 2 && d > 1) { const key = where(e); if (!sn2.has(key)) { sn2.add(key); out.push(["runs out of its card", where(e).slice(0, 70) + " in " + nm(c) + ` (${Math.round(d)} px)`]) } break } } } }
  /* crunch: card-like siblings too close; text against its card's edge */
  const card = e => { const cs = getComputedStyle(e); return (cs.borderRadius !== "0px" && (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.boxShadow !== "none" || (cs.borderLeftWidth !== "0px" && cs.borderRightWidth !== "0px"))) && e.getBoundingClientRect().width > 60 && e.getBoundingClientRect().height > 30 && !pinned(e) };
  const cards = all.filter(card);
  for (const c of cards) { const p = c.parentElement; if (!p) continue; const sib = [...p.children].filter(x => x !== c && cards.includes(x));
    for (const s of sib) { const a = c.getBoundingClientRect(), b = s.getBoundingClientRect(); if (b.left - a.right >= 1 && b.left - a.right < 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 10) out.push(["crunched side by side", where(c).slice(0, 50) + " | " + where(s).slice(0, 50) + ` (${Math.round(b.left - a.right)} px)`]);
      if (b.top - a.bottom >= 1 && b.top - a.bottom < 4 && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 30) out.push(["crunched stacked", where(c).slice(0, 50) + " | " + where(s).slice(0, 50) + ` (${Math.round(b.top - a.bottom)} px)`]) }
    const cr = c.getBoundingClientRect(); for (const x of leaves) { if (!c.contains(x.e)) continue; const d = Math.min(x.r.left - cr.left, cr.right - x.r.right); if (d < 3 && d > -1 && x.r.width < cr.width - 8) { out.push(["text against the edge", where(x.e) + " in " + nm(c)]); break } } }
  /* tables */
  for (const t of root.querySelectorAll("table")) { if (!vis(t)) continue; const hr = t.tHead && t.tHead.rows[t.tHead.rows.length - 1], hc = hr ? [...hr.cells].reduce((s, c) => s + (c.colSpan || 1), 0) : 0;
    const rows = [...(t.tBodies[0] ? t.tBodies[0].rows : [])].filter(r => vis(r));
    if (hc && !rows.length) out.push(["empty table", where(t).slice(0, 80)]);
    if (hc) for (const r of rows.slice(0, 200)) { const n = [...r.cells].reduce((s, c) => s + (c.colSpan || 1), 0); if (n !== hc && n > 1) { out.push(["row cells ≠ header", where(t).slice(0, 60) + ` (${n} vs ${hc})`]); break } } }
  /* charts */
  for (const s of root.querySelectorAll("svg")) { if (!vis(s)) continue; const r = s.getBoundingClientRect(); if (r.width < 120 || r.height < 60) continue; if (!s.querySelector("path,rect,circle,line,polyline,polygon,text,use,image")) out.push(["empty chart", where(s.parentElement || s).slice(0, 80)]) }
  for (const c of root.querySelectorAll("canvas")) { if (!vis(c) || c.width < 100) continue; try { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let on = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i]) { on++; break } if (!on) out.push(["empty canvas", where(c.parentElement || c).slice(0, 80)]) } catch (e) { } }
  return out;
};

const LOG = [], RES = [], errs = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: PH ? 844 : 900 }, deviceScaleFactor: 1, isMobile: PH, hasTouch: PH, extraHTTPHeaders: { "x-site-check": "1" } });
await ctx.addCookies([{ name: "cfbs", value: ss.token, url: F }]);
await ctx.addInitScript(t => { try { localStorage.setItem("cfbTok", t) } catch (e) { } const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^cfbTour|^cfbPT_|^cfbH2hHint/.test(k) ? "1" : g.call(this, k) };
  document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "#wn{display:none!important}"; document.head.appendChild(st) });   /* the "What's new" pop-up lay over every view in the first runs */
  window.__auditErr = []; addEventListener("error", e => window.__auditErr.push(String(e.message).slice(0, 160))); addEventListener("unhandledrejection", e => window.__auditErr.push("unhandled: " + String(e.reason && e.reason.message || e.reason).slice(0, 160))) }, ss.token);
const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
const site = PAGE.startsWith("/cbb") ? "bb" : "fb";
let n = 0;
async function view(name) {
  await p.waitForTimeout(400); n++;
  const file = `${site}-${PH ? "phone" : "desk"}-${String(n).padStart(3, "0")}.jpg`;
  let probs = []; try { probs = await p.evaluate(`(${CHECK.toString().replace("PH_", PH ? "true" : "false")})()`) } catch (e) { probs = [["check failed", String(e.message).slice(0, 120)]] }
  const pe = await p.evaluate(() => (window.__auditErr || []).splice(0)).catch(() => []);
  for (const e of pe) probs.push(["script error", e]);
  try { const h = await p.evaluate(() => Math.min(5000, document.documentElement.scrollHeight));
    await p.screenshot({ path: `${OUT}/${file}`, type: "jpeg", quality: 55, fullPage: true, clip: { x: 0, y: 0, width: W, height: Math.max(PH ? 844 : 900, h) } }) } catch (e) { probs.push(["picture failed", e.message.slice(0, 80)]) }
  RES.push({ n, name, file, probs }); console.log("AUD|" + JSON.stringify({ n, name, probs: probs.slice(0, 40) })); LOG.push(`${n} ${name}: ${probs.length} ${probs.slice(0, 3).map(x => x[0] + ": " + x[1]).join(" · ").slice(0, 200)}`); console.log(LOG[LOG.length - 1]);
}
await p.goto(`${F}${PAGE}?ro=1`, { waitUntil: "domcontentloaded", timeout: 90000 });
for (let i = 0; i < 90; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => typeof NAV !== "undefined" && typeof navGo === "function" && !!document.getElementById("n2nav")).catch(() => false)) break }
await p.waitForTimeout(6000);
const clean = t => String(t || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
const NAVL = await p.evaluate(() => { const o = {}; for (const lg of Object.keys(NAV)) { o[lg] = {}; for (const sec of Object.keys(NAV[lg] || {})) o[lg][sec] = (NAV[lg][sec] || []).map(x => [x[0], String(x[1])]) } return o });
for (const lg of Object.keys(NAVL)) {
  const lv = lg === "pro" ? "Pros" : lg === "col" ? "College" : lg;
  await p.evaluate(lg => { try { navGo(lg, "HOME") } catch (e) { } }, lg).catch(() => {}); await p.waitForTimeout(3000); await view(`${lv} · Home`);
  for (const sec of Object.keys(NAVL[lg])) for (const [c, lab] of NAVL[lg][sec]) {
    const nmv = `${lv} · ${sec} → ${clean(lab)}`;
    const ok = await p.evaluate(([lg, sec, c]) => { try { navGo(lg, sec, c); return true } catch (e) { return String(e.message) } }, [lg, sec, c]).catch(e => String(e.message));
    if (ok !== true) { RES.push({ n: ++n, name: nmv, probs: [["couldn't open", String(ok).slice(0, 120)]] }); continue }
    await p.waitForTimeout(3200); await view(nmv);
    const subs = await p.evaluate(() => [...document.querySelectorAll("#vseg button")].filter(b => b.offsetParent).map(b => b.textContent.trim()).filter(t => t && !/run again|↻|🔍|🔔|👤|🧰/i.test(t)).slice(1, 14)).catch(() => []);
    for (const sn of subs) { const did = await p.evaluate(sn => { const b = [...document.querySelectorAll("#vseg button")].find(b => b.offsetParent && b.textContent.trim() === sn); if (b) { b.click(); return true } return false }, sn).catch(() => false);
      if (did) { await p.waitForTimeout(2600); await view(`${nmv} → ${sn}`) } }
  }
}
/* deep views: a profile or two and a scout report, opened through the page's own functions */
const DEEP = site === "fb" ? [
  ["NFL profile (QB)", `(async()=>{const P=await nflPlayers();const k=Object.keys(P).find(k=>P[k].pos==="QB"&&P[k].team&&P[k].name==="Patrick Mahomes")||Object.keys(P).find(k=>P[k].pos==="QB"&&P[k].team);nflProfile(k)})()`],
  ["NFL profile (WR)", `(async()=>{const P=await nflPlayers();const k=Object.keys(P).find(k=>P[k].name==="Justin Jefferson")||Object.keys(P).find(k=>P[k].pos==="WR"&&P[k].team);nflProfile(k)})()`],
  ["NFL profile (RB)", `(async()=>{const P=await nflPlayers();const k=Object.keys(P).find(k=>P[k].name==="Saquon Barkley")||Object.keys(P).find(k=>P[k].pos==="RB"&&P[k].team);nflProfile(k)})()`],
  ["College profile (top board QB)", `(()=>{const k=Object.keys(D.pool).find(k=>D.pool[k].pos==="QB")||Object.keys(D.pool)[0];profile(k)})()`],
  ["College profile (top board WR)", `(()=>{const k=Object.keys(D.pool).find(k=>D.pool[k].pos==="WR")||Object.keys(D.pool)[1];profile(k)})()`]
] : [
  ["NBA profile", `(()=>{const t=Object.values(window.NBA_P||{})[0];if(typeof openPro==="function"&&t)openPro(t.id||t.pid)})()`]
];
for (const [name, js] of DEEP) { try { await p.evaluate(js) } catch (e) { RES.push({ n: ++n, name, probs: [["couldn't open", e.message.slice(0, 120)]] }); continue } await p.waitForTimeout(6000);
  /* profile tabs */
  const tabs = await p.evaluate(() => [...document.querySelectorAll("#md [role=tab], #md .ptab, #md .tabs button")].filter(b => b.offsetParent).map(b => b.textContent.trim()).slice(0, 10)).catch(() => []);
  await view(name);
  for (const t of tabs.slice(1)) { const did = await p.evaluate(t => { const b = [...document.querySelectorAll("#md [role=tab], #md .ptab, #md .tabs button")].find(b => b.offsetParent && b.textContent.trim() === t); if (b) { b.click(); return true } return false }, t).catch(() => false); if (did) { await p.waitForTimeout(2500); await view(`${name} → ${t}`) } }
  await p.evaluate(() => { const x = document.querySelector("#md .x, #md [aria-label=Close], .mclose"); if (x) x.click() }).catch(() => {}) }
await browser.close();
const sum = {}; for (const r of RES) for (const [k] of r.probs) sum[k] = (sum[k] || 0) + 1;
writeFileSync(`${OUT}/audit.json`, JSON.stringify({ tag: TAG, page: PAGE, width: W, at: new Date().toISOString(), views: RES.length, sum, errs: errs.slice(0, 40), res: RES }, null, 1));
console.log(`audit ${TAG} ${PAGE} ${W}px: ${RES.length} views; ${Object.entries(sum).map(([k, v]) => k + " " + v).join(" · ")}; page errors ${errs.length}`);
