/* Probe (Oct 11): checks of single features, run by the data job (MODE=probe) when a browser on Sam's Mac isn't reachable.
   Each probe opens a page at phone and desktop width in look-only mode (?ro=1), runs its steps inside the page and returns a short
   result. Results go on the GitHub run as notices (a warning when a probe throws or returns ok:false), so they can be read from the
   run itself. The probes live in job/probes.mjs; PROBE picks a set by name (all of them when empty). */
import { PROBES } from "./probes.mjs";

export async function runProbes({ browser, site, token, only = "", log = console.log }) {
  const out = [];
  const want = String(only || "").split(",").map(s => s.trim()).filter(Boolean);
  for (const P of PROBES.filter(p => !want.length || want.some(w => p.name.startsWith(w)))) {
    for (const W of P.widths || [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width: W, height: W < 800 ? 844 : 900 }, isMobile: W < 800, hasTouch: W < 800 });
      const p = await ctx.newPage(); const errs = [];
      p.on("pageerror", e => errs.push(e.message));
      await ctx.addInitScript(t => {
        try { localStorage.setItem("cfbTok", t) } catch (e) { }
        const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^cfbTour|^cfbPT_|^cfbH2hHint/.test(k) ? "1" : g.call(this, k) };
      }, token);
      let r;
      try {
        await p.goto(`${site}${P.page}?ro=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await p.waitForSelector(P.ready || ".tabs button", { timeout: 90000 });
        await p.waitForTimeout(P.settle || 5000);
        await p.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Got it")?.click(); document.querySelectorAll(".tourx").forEach(x => x.remove()) });
        r = await p.evaluate(`(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const W = ${W}; ${P.run} })()`);
        if (r == null || typeof r !== "object") r = { ok: true, v: r };
      } catch (e) { r = { ok: false, error: String(e.message || e).slice(0, 300) } }
      if (errs.length) { r.scriptErrors = [...new Set(errs)].slice(0, 3).map(s => s.slice(0, 160)); r.ok = false }
      out.push({ name: P.name, W, ...r });
      log(`::${r.ok === false ? "warning" : "notice"} title=probe ${P.name} ${W}px::${JSON.stringify(r).replace(/[\r\n]+/g, " ").slice(0, 3500)}`);
      await ctx.close();
    }
  }
  return out;
}
