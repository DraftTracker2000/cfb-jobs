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
