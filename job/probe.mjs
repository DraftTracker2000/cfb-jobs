/* Probe (Oct 11): checks of single features, run by the data job (MODE=probe) when a browser on Sam's Mac isn't reachable.
   Each probe opens a page at phone and desktop width in look-only mode (?ro=1), runs its steps inside the page and returns a short
   result. Results go on the GitHub run as notices (a warning when a probe throws or returns ok:false), so they can be read from the
   run itself. The probes live in job/probes.mjs; PROBE picks a set by name (all of them when empty). */
import { PROBES } from "./probes.mjs";

export async function runProbes({ browser, site, token, only = "", log = console.log }) {
  const out = [];
  const want = String(only || "").split(",").map(s => s.trim()).filter(Boolean);
  for (const P of PROBES.filter(p => !want.length || want.some(w => p.name.startsWith(w)))) {
    /* a probe with `node` runs in the job itself (no browser): plain fetches of public pages, e.g. to find where a source posts */
    /* a probe with `mod` runs that job module's run() (no browser), e.g. the win-probability fit */
    if (P.mod) { let r; try { if (P.env) Object.assign(process.env, P.env); const m = await import(`./${P.mod}.mjs`); r = await m.run({ site, token, log }) } catch (e) { r = { ok: false, error: String(e.message || e).slice(0, 300) } }
      out.push({ name: P.name, ...r }); log(`::${r && r.ok === false ? "warning" : "notice"} title=probe ${P.name}::${JSON.stringify(r).replace(/[\r\n]+/g, " ").slice(0, 6000)}`); continue }
    /* a probe with `url` opens an outside page in the browser and lists the data it loads (to find where a page gets its numbers) */
    if (P.url) { const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 mycfbbigboard-data-job" }); const p = await ctx.newPage();
      /* data first: every fetch/XHR answer (with the start of its body), then page scripts — libraries and CDN bundles left out (Oct 15) */
      const LIB = /google|facebook|doubleclick|onetrust|cookielaw|rlcdn|adsrvr|chartbeat|newrelic|sentry|twitter|tiktok|adobe|demdex|scorecard|segment|jquery|bootstrap|polyfill|cdnjs|jsdelivr|unpkg|cloudflareinsights|recaptcha|gstatic|vendor|runtime|chunk-vendors|lodash|moment|swiper|slick|modernizr|cdn\.sidearmsports\.com\/(?:common|responsive)|sidearm\.sites\/(?:common|js\/common)|ads?[./]|analytics|gtm|pixel|beacon|consent|taboola|outbrain|quantserve|krxd|amazon-adsystem|criteo|braze|optimizely/i;
      const data = [], scripts = [];
      p.on("response", async r => { const u = r.url(), ct = r.headers()["content-type"] || "", rt = r.request().resourceType(); if (LIB.test(u)) return;
        if (rt === "xhr" || rt === "fetch" || /json/.test(ct)) { let head = ""; try { head = (await r.text()).slice(0, 600) } catch (e) { } data.push(r.status() + " " + u.slice(0, 240) + (head ? " :: " + head.replace(/\s+/g, " ") : "")) }
        else if (/javascript/.test(ct)) scripts.push(r.status() + " " + u.slice(0, 200)) });
      let r; try { await p.goto(P.url, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForTimeout(P.settle || 9000);
        const text = await p.evaluate(() => { const t = document.body.innerText.replace(/\s+/g, " "); const k = t.search(/\b(Out|Questionable|Doubtful|Probable|Available)\b/); return k < 0 ? "" : t.slice(Math.max(0, k - 300), k + 500) }).catch(() => "");
        r = { ok: true, title: await p.title(), data: data.slice(0, 20), scripts: scripts.slice(0, 12), text } } catch (e) { r = { ok: false, error: String(e.message || e).slice(0, 300), data: data.slice(0, 10), scripts: scripts.slice(0, 8) } }
      out.push({ name: P.name, ...r }); log(`::notice title=probe ${P.name}::${JSON.stringify(r).replace(/[\r\n]+/g, " ").slice(0, 6000)}`); await ctx.close(); continue }
    if (P.node) { let r; try { r = await (new Function("fetch", "SITE", "TOKEN", `return (async () => { ${P.node} })()`))(fetch, site, token) } catch (e) { r = { ok: false, error: String(e.message || e).slice(0, 300) } }
      out.push({ name: P.name, ...r }); log(`::${r && r.ok === false ? "warning" : "notice"} title=probe ${P.name}::${JSON.stringify(r).replace(/[\r\n]+/g, " ").slice(0, 3500)}`); continue }
    for (const W of P.widths || [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width: W, height: W < 800 ? 844 : 900 }, isMobile: W < 800, hasTouch: W < 800 });
      const p = await ctx.newPage(); const errs = [];
      p.on("pageerror", e => errs.push(e.message));
      const nav = []; p.on("framenavigated", f => { if (f === p.mainFrame()) nav.push(f.url().replace(site, "")) }); p.on("request", q => { if (q.isNavigationRequest() && q.frame() === p.mainFrame()) nav.push("req " + q.url().replace(site, "") + (q.redirectedFrom() ? " from " + q.redirectedFrom().url().replace(site, "") : "") + " ref=" + (q.headers().referer || "").replace(site, "")) });
      p.on("response", r => { if (r.request().isNavigationRequest() && r.frame() === p.mainFrame()) nav.push(r.status() + " " + r.url().replace(site, "") + (r.headers().location ? " → " + r.headers().location : "")) });
      try { const cdp = await ctx.newCDPSession(p); await cdp.send("Page.enable"); cdp.on("Page.frameRequestedNavigation", e => nav.push(`asked: ${e.reason} ${e.disposition} ${String(e.url).replace(site, "")}`)); cdp.on("Page.frameScheduledNavigation", e => nav.push(`scheduled: ${e.reason} ${String(e.url).replace(site, "")}`)) } catch (e) { }
      /* the page cookie the sign-in page would trade the token for, so the first visit lands on the page asked for (Oct 11) */
      await ctx.addCookies([{ name: "cfbs", value: token, url: site }]);
      await ctx.addInitScript(t => {
        try { localStorage.setItem("cfbTok", t) } catch (e) { }
        const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^cfbTour|^cfbPT_|^cfbH2hHint/.test(k) ? "1" : g.call(this, k) };
      }, token);
      /* who sends the page away: the stack at beforeunload names the script that asked (Oct 11 hunt) */
      await ctx.addInitScript(() => { addEventListener("beforeunload", () => console.log("[nav] " + (new Error().stack || "").split("\n").slice(1, 8).join(" | "))) });
      p.on("console", m => { const t = m.text(); if (t.startsWith("[nav]")) nav.push(t.slice(0, 600)) });
      let r;
      try {
        await p.goto(`${site}${P.page}${P.noro ? "" : "?ro=1"}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        /* a first visit has no sign-in cookie yet: the sign-in page sets it from the token and sends the browser to the front page, so
           go again when we didn't land on the page asked for (Oct 11: the lab probes were reading the live page) */
        for (let k = 0; k < 3 && new URL(p.url()).pathname !== P.page; k++) { await p.waitForTimeout(2500); await p.goto(`${site}${P.page}?ro=1`, { waitUntil: "domcontentloaded", timeout: 60000 }) }
        if (new URL(p.url()).pathname !== P.page) throw new Error(`asked for ${P.page}, landed on ${p.url()}`);
        await p.waitForSelector(P.ready || ".tabs button", { timeout: 90000 });
        await p.waitForTimeout(P.settle || 5000);
        await p.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Got it")?.click(); document.querySelectorAll(".tourx").forEach(x => x.remove()) });
        r = await p.evaluate(`(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const W = ${W}; ${P.run} })()`);
        if (r == null || typeof r !== "object") r = { ok: true, v: r };
      } catch (e) { r = { ok: false, error: String(e.message || e).slice(0, 300) } }
      if (errs.length) { r.scriptErrors = [...new Set(errs)].slice(0, 3).map(s => s.slice(0, 160)); r.ok = false }
      if (new URL(p.url()).pathname !== P.page || r.ok === false) r.nav = nav.slice(0, 14);
      out.push({ name: P.name, W, ...r });
      log(`::${r.ok === false ? "warning" : "notice"} title=probe ${P.name} ${W}px::${JSON.stringify(r).replace(/[\r\n]+/g, " ").slice(0, 3500)}`);
      await ctx.close();
    }
  }
  return out;
}
