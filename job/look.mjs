/* The look check (Oct 9 — Sam: "are you saying you could run a test that you havent run yet but you could but you havent?").
   What the restyles were checked with by hand, run by the data job after each game-day build: the page opened at a phone width (375) and a
   desktop width (1280) in look-only mode (?ro=1 saves and sends nothing), every main tab and sub-view clicked through, and on each one
   - anything that runs off the right edge of the screen (outside a box that scrolls sideways on purpose),
   - any script error.
   Tours are kept out of the way. Returns { ok, views, problems[] }; the caller reports it as its own run ("look"), so the after-run health
   check posts it when something broke. */
const VIEWS = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [3, 0], [3, 1], [4, 0], [4, 1]];
export async function lookCheck({ browser, site, token, page = "/", log = console.log }) {
  const problems = []; let views = 0, firstRows = null, fullLoad = null;
  for (const W of [375, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: W < 800 ? 812 : 900 }, isMobile: W < 800, hasTouch: W < 800 });
    const p = await ctx.newPage(); const errs = [];
    /* the phone pass runs on a typical 4G connection (9 Mbit/s down, 150 ms round trip), so the first-visit times mean something */
    if (W < 800) { try { const cdp = await ctx.newCDPSession(p); await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 }) } catch (e) { } }
    p.on("pageerror", e => errs.push(e.message));
    await ctx.addInitScript(t => {
      try { localStorage.setItem("cfbTok", t) } catch (e) { }
      const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^cfbTour|^cfbPT_|^cfbH2hHint/.test(k) ? "1" : g.call(this, k) };
    }, token);
    try {
      const t0 = Date.now();
      await p.goto(`${site}${page}?ro=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
      /* Oct 11: every look since Oct 9 timed out here with nothing saying why — say what the page was showing */
      try { await p.waitForSelector(".tabs button", { timeout: 60000 }) } catch (e) {
        const seen = await p.evaluate(() => ({ url: location.href, title: document.title, tabs: document.querySelectorAll(".tabs button").length, body: (document.body ? document.body.innerText : "").replace(/\s+/g, " ").slice(0, 200) })).catch(() => null);
        throw new Error(`no tabs after 60 s · ${seen ? `${seen.url} · "${seen.title}" · ${seen.tabs} tab buttons · page says: ${seen.body}` : "page unreadable"}${errs.length ? ` · script errors: ${errs.slice(0, 2).join(" | ")}` : ""}`) }
      /* a first visit on a phone (a fresh browser has nothing saved): how long until the board shows players, and until the
         history files (past rosters, recruiting classes) have also landed */
      if (W < 800) { try { await p.waitForFunction(() => typeof D !== "undefined" && D.pool && Object.keys(D.pool).length > 100, null, { timeout: 90000 }); firstRows = +((Date.now() - t0) / 1000).toFixed(1);
        await p.waitForFunction(() => typeof SNAP_HIST === "undefined" || !SNAP_HIST, null, { timeout: 120000 }); fullLoad = +((Date.now() - t0) / 1000).toFixed(1) } catch (e) { problems.push(`375px: the board took over 90 s to show players on a first visit`) } }
      await p.waitForTimeout(4000);
      await p.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Got it")?.click(); document.querySelectorAll(".tourx").forEach(x => x.remove()) });
      for (const [t, s] of VIEWS) {
        const r = await p.evaluate(async ([t, s]) => {
          const w = ms => new Promise(r => setTimeout(r, ms));
          const tb = document.querySelectorAll(".tabs button")[t]; if (!tb) return null; tb.click(); await w(900);
          const seg = [...document.querySelectorAll("#vseg button")].filter(b => b.offsetParent); if (seg.length && s < seg.length) { seg[s].click(); await w(2500) } else if (s) return null;
          document.querySelectorAll(".tourx").forEach(x => x.remove());
          const Wd = document.documentElement.clientWidth, all = [...document.body.querySelectorAll("*")].filter(e => !e.closest("tbody tr:nth-child(n+15)"));
          const sc = all.filter(e => /auto|scroll/.test(getComputedStyle(e).overflowX)), inS = e => sc.some(x => x !== e && x.contains(e));
          const out = [];
          for (const e of all) { if (!e.offsetParent) continue; const r = e.getBoundingClientRect(); if (!r.width) continue; const c = getComputedStyle(e);
            if (r.right > Wd + 1 && c.position !== "fixed" && !inS(e)) { out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} ends at ${Math.round(r.right)} of ${Wd} ("${(e.textContent || "").trim().slice(0, 30)}")`); if (out.length >= 3) break } }
          /* two i buttons side by side (Oct 9: Drafted and Portal each had a pair) */
          for (const b of document.querySelectorAll(".ib")) { const n = b.nextElementSibling; if (b.offsetParent && n && n.classList.contains("ib") && n.offsetParent) { out.push(`two i buttons side by side ("${b.dataset.i}", "${n.dataset.i}")`); break } }
          return { name: (tb.textContent || "").trim() + (seg[s] ? " → " + seg[s].textContent.trim() : ""), out };
        }, [t, s]);
        if (!r) continue; views++;
        for (const o of r.out) problems.push(`${W}px · ${r.name}: ${o}`);
      }
    } catch (e) { problems.push(`${W}px: couldn't finish (${e.message.slice(0, 120)})`) }
    for (const e of [...new Set(errs)].slice(0, 5)) problems.push(`${W}px · script error: ${e.slice(0, 160)}`);
    await ctx.close();
  }
  log(`look check: ${views} views, ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  return { ok: !problems.length, views, problems, firstRows, fullLoad };
}
export const lookMsg = L => (L.ok ? `look check · ${L.views} views at phone and desktop width · all clear` : `look check · ${L.problems.length} problem(s): ${L.problems.slice(0, 6).join(" | ")}`).slice(0, 1100)
  + (L.firstRows != null ? ` · phone first visit on 4G: players in ${L.firstRows} s${L.fullLoad != null ? `, everything in ${L.fullLoad} s` : ""}` : "");
