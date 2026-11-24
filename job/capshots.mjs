/* Site capabilities pictures (Nov 24 — the owner, Nov 23 5:47 pm: a "site capabilities" area "that has like a screen shot of the tour or a quick
   video of the tour showing a specific thing the site could do with like a tidbit like 'Follow players from your favorite college and track
   them into the pros' with a video of how to do that"; 1:47 am Nov 24: "build the site function area and some sample posts").
   Phone-size pictures of the real site (signed in as the probe, ?ro=1: nothing is saved), a few per capability, each with the tap or the spot
   it's about ringed and a one-line caption. Stars and board order are set in the page's memory only, for the picture. Each capability is saved
   as a pack p2000_cap-<id> ({ id, title, line, frames: [{ cap, img (JPEG data URL) }] }) and the list as p2000_caps, which the Lab's
   /lab/capabilities.html and the post studio's "What the site can do" posts read. Run: bc-shots workflow, script=capshots. */
import { chromium } from "playwright";
const F = (process.env.FOOTBALL_URL || "https://mycfbbigboard.com").replace(/\/+$/, ""), JOB = process.env.JOB_TOKEN;
const ss = await (await fetch(F + "/api/job/session", { method: "POST", headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" }, body: JSON.stringify({ who: "probe" }) })).json();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-site-check": "1" } });
await ctx.addCookies([{ name: "cfbs", value: ss.token, url: F }]);
await ctx.addInitScript(t => { try { localStorage.setItem("cfbTok", t) } catch (e) { } const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^cfbTour|^cfbPT_|^cfbH2hHint/.test(k) ? "1" : g.call(this, k) };
  document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "#wn{display:none!important}"; document.head.appendChild(st) }) }, ss.token);
const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
const ready = async (fn) => { for (let i = 0; i < 90; i++) { await p.waitForTimeout(500); if (await p.evaluate(fn).catch(() => false)) return true } return false };
/* the ring and the caption, drawn over the page for the picture */
const RING = `(sel, cap) => { document.querySelectorAll(".__cap").forEach(x => x.remove()); let el = null;
  try { el = typeof sel === "string" ? [...document.querySelectorAll(sel)].find(e => { const r = e.getBoundingClientRect(); return r.width && r.height && r.bottom > 60 && r.top < innerHeight - 40 }) : null } catch (e) { }
  if (el) { const r = el.getBoundingClientRect(), d = document.createElement("div"); d.className = "__cap"; Object.assign(d.style, { position: "fixed", left: (r.left - 6) + "px", top: (r.top - 6) + "px", width: (r.width + 12) + "px", height: (r.height + 12) + "px", border: "3px solid #ffcc33", borderRadius: "12px", boxShadow: "0 0 0 4000px rgba(0,0,0,.28), 0 0 18px #ffcc33", zIndex: 99999, pointerEvents: "none" }); document.body.appendChild(d) }
  if (cap) { const c = document.createElement("div"); c.className = "__cap"; c.textContent = cap; Object.assign(c.style, { position: "fixed", left: "14px", right: "14px", bottom: "22px", padding: "12px 14px", borderRadius: "14px", background: "rgba(10,14,20,.92)", color: "#fff", font: "700 16px/1.35 system-ui,sans-serif", textAlign: "center", zIndex: 100000, boxShadow: "0 6px 24px rgba(0,0,0,.4)" }); document.body.appendChild(c) }
  return !!el }`;
async function frame(cap, sel) { await p.waitForTimeout(500); const ok = await p.evaluate(`(${RING})(${JSON.stringify(sel || null)}, ${JSON.stringify(cap)})`).catch(() => false);
  const b = await p.screenshot({ type: "jpeg", quality: 62 }); await p.evaluate(() => document.querySelectorAll(".__cap").forEach(x => x.remove())).catch(() => { });
  return { cap, img: "data:image/jpeg;base64," + b.toString("base64"), ring: ok } }
const go = async (url) => { await p.goto(F + url, { waitUntil: "domcontentloaded", timeout: 90000 }) };
const fbReady = () => ready(() => typeof NAV !== "undefined" && typeof navGo === "function" && !!document.getElementById("n2nav"));
const run = async (js, ms = 3500) => { try { await p.evaluate(js) } catch (e) { errs.push(String(e.message).slice(0, 120)) } await p.waitForTimeout(ms) };
const STARS = `(()=>{const ids=Object.keys(D.pool).filter(k=>D.pool[k].elig).slice(0,8);for(const id of ids){STAR.add(id);if(!ORDER.includes(id))ORDER.push(id)}})()`;
const CAPS = [
  { id: "college-pros", title: "Follow your school's players all the way to the pros", line: "Star a college player once — he stays on your board through the draft and into his NFL career.", async shots() {
    await go("/?ro=1"); await fbReady(); const F0 = [];
    await run(`navGo("col","PLAYERS","board")`, 3000); await ready(() => typeof D !== "undefined" && !!D.pool && !!document.querySelector("#tb tr[data-id]")); F0.push(await frame("Tap ☆ beside any college player", "#tb tr[data-id] td.st"));
    await run(`(()=>{const k=Object.keys(D.pool).find(k=>D.pool[k].pos==="WR"&&D.pool[k].elig)||Object.keys(D.pool)[0];profile(k)})()`, 6000); F0.push(await frame("His grade, his comps and his whole college career", "#md .phero, #md h2"));
    await run(`(async()=>{try{closeP()}catch(e){}const P=await nflPlayers();const k=Object.keys(P).find(k=>P[k].name==="Jaxon Smith-Njigba")||Object.keys(P).find(k=>P[k].pos==="WR"&&P[k].team);nflProfile(k)})()`, 7000); F0.push(await frame("…then the same player in the NFL, college line and all", "#md .phero, #md h2"));
    return F0 } },
  { id: "bigboard", title: "Build your own draft-day big board", line: "Drag your players into your order, draw tier lines, and play This or That to settle the close ones.", async shots() {
    await go("/?ro=1"); await fbReady(); const F0 = [];
    /* the board's players load with the board: open it first, then star a few in memory */
    await run(`navGo("col","PLAYERS","board")`, 3000); await ready(() => typeof D !== "undefined" && !!D.pool && Object.keys(D.pool).length > 100); await run(STARS, 500);
    await run(`navGo("col","REPORT","my")`); F0.push(await frame("★ My Board: your players, your order", "#tb tr[data-id]"));
    F0.push(await frame("Press and drag to move a player", "#tb tr[data-id] td.hd, #tb tr[data-id] [data-drag]"));
    F0.push(await frame("Tier lines and This or That for the tough calls", "#addTier, #totBtn"));
    return F0 } },
  { id: "dynasty", title: "Track your dynasty targets for draft day", line: "Rookies and college stars side by side with what they're worth in dynasty leagues.", async shots() {
    await go("/?ro=1"); await fbReady(); const F0 = [];
    await run(`navGo("pro","FANTASY","rook")`, 5000); F0.push(await frame("Rookies: who's earning a role right now", "#empty table, #tbl"));
    await run(`navGo("pro","FANTASY","lists")`, 5000); F0.push(await frame("Fantasy lists for every position", "#empty, #tbl"));
    return F0 } },
  { id: "startsit", title: "Know who to start every Sunday", line: "Every player ranked for the week — injuries, matchups and the betting line already counted.", async shots() {
    await go("/?ro=1"); await fbReady(); const F0 = [];
    await run(`navGo("pro","FANTASY","ss")`, 6000); F0.push(await frame("Start / sit: the week's ranks at every spot", ".ssg, .ssbar"));
    F0.push(await frame("Q, out and bye are flagged for you", ".ssr .injs, .ssr"));
    return F0 } },
  { id: "scout", title: "Scout any game in one tap", line: "Keys to the game, how each side scores, and the matchups that decide it.", async shots() {
    await go("/?ro=1"); await fbReady(); const F0 = [];
    await run(`navGo("col","H2H","games")`, 6000); F0.push(await frame("Every game this week", ".srcta, #empty"));
    await run(`(()=>{const b=[...document.querySelectorAll(".srcta")].find(b=>b.offsetParent);if(b)b.click()})()`, 8000); F0.push(await frame("The scout report: keys, matchups and the pick", "#md .sect, #md h2"));
    return F0 } },
  { id: "map", title: "See where every player comes from", line: "Hometowns on a map for the NFL, the NBA and every college roster — hotbeds and all.", async shots() {
    await go("/from.html"); await p.waitForTimeout(7000); const F0 = [];
    F0.push(await frame("Every active NFL player by hometown", "canvas, svg"));
    await p.evaluate(() => { const c = document.getElementById("hot"); if (c) c.scrollIntoView({ block: "center" }) }).catch(() => { }); F0.push(await frame("Hotbeds: the towns that turn out the most", "#hot li"));
    return F0 } },
  { id: "busters", title: "The studies behind the numbers", line: "Hundreds of experiments on what really wins — what held up and what got busted.", async shots() {
    await go("/studies/"); await p.waitForTimeout(6000); const F0 = [];
    F0.push(await frame("Data Busters: every study, held up or busted", "h1, h2"));
    return F0 } },
  { id: "hoops", title: "Basketball too — NBA and college", line: "Scout reports, rotations and the March picture, the same way as football.", async shots() {
    await go("/cbb/?ro=1"); await p.waitForTimeout(9000); const F0 = [];
    F0.push(await frame("BBall: tonight's games and what to watch", ".srcta, #panel"));
    await p.evaluate(() => { const b = [...document.querySelectorAll(".srcta")].find(b => b.offsetParent); if (b) b.click() }).catch(() => { }); await p.waitForTimeout(8000);
    F0.push(await frame("A basketball scout report", "#md .sect, #md h2, .sect"));
    return F0 } }
];
const out = [];
for (const C of CAPS) { let fr = []; try { fr = await C.shots() } catch (e) { errs.push(C.id + ": " + String(e.message).slice(0, 120)) }
  fr = fr.filter(Boolean); console.log(`cap ${C.id}: ${fr.length} frames, rings ${fr.filter(f => f.ring).length}`); if (!fr.length) continue;
  const body = JSON.stringify({ id: C.id, title: C.title, line: C.line, frames: fr.map(f => ({ cap: f.cap, img: f.img })), at: Date.now() });
  const r = await fetch(F + `/api/pack/p2000_cap-${C.id}`, { method: "PUT", headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" }, body }); console.log(`  PUT ${r.status} ${(body.length / 1024).toFixed(0)} KB`);
  out.push({ id: C.id, title: C.title, line: C.line, n: fr.length }) }
const r = await fetch(F + "/api/pack/p2000_caps", { method: "PUT", headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" }, body: JSON.stringify({ at: Date.now(), caps: out }) }); console.log(`caps index PUT ${r.status}: ${out.length} capabilities`);
/* sample posts: the post studio's "What the site can do" post for each one (wide for X, square for Instagram), drawn by the studio itself in the
   Lab (the probe can open /lab/), saved as p2000_cap-samples for the capabilities page */
try { const SP = { "college-pros": "cfb", bigboard: "cfb", dynasty: "nfl", startsit: "nfl", scout: "cfb", map: "nfl", busters: "cfb", hoops: "nba" }, samples = [];
  await go("/lab/?studio&cap=" + (out[0] && out[0].id || "")); await ready(() => window.STUDIO && window.STUDIO.state && window.STUDIO.state.type === "caps" && window.STUDIO.state.L.length > 0);
  for (const c of out) { for (const size of ["w", "s"]) { const img = await p.evaluate(async ([id, sp, size]) => { const S = window.STUDIO, ST = S.state, T = S.TYPES.find(t => t.id === "caps"), i = ST.L.findIndex(x => x.id === id && x.i === (id === "college-pros" ? 0 : ST.L.filter(y => y.id === id).length > 1 ? 1 : 0)), M = ST.L[i >= 0 ? i : ST.L.findIndex(x => x.id === id)]; if (!M) return null;
      ST.sport = sp; ST.F = T.fill(M); await new Promise(r => { const im = new Image(); im.onload = r; im.onerror = r; im.src = M.img }); const cv = document.createElement("canvas"); S.render(cv, size); await new Promise(r => setTimeout(r, 300)); S.render(cv, size); return cv.toDataURL("image/jpeg", .82) }, [c.id, SP[c.id] || "nfl", size]).catch(e => { errs.push("sample " + c.id + ": " + String(e.message).slice(0, 100)); return null });
      if (img) samples.push({ id: c.id, size, img }) } }
  const body = JSON.stringify({ at: Date.now(), samples }); const r = await fetch(F + "/api/pack/p2000_cap-samples", { method: "PUT", headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" }, body }); console.log(`samples PUT ${r.status}: ${samples.length} posts, ${(body.length / 1024).toFixed(0)} KB`) } catch (e) { errs.push("samples: " + String(e.message).slice(0, 120)) }
console.log("errors: " + JSON.stringify(errs.slice(0, 20)));
await browser.close();
