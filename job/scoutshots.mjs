/* Scout report audit pictures (Nov 2 — the owner: "audit the scout reports. they're built very poorly. the section tabs float all over the place").
   Read-only, signed in as the site's probe (?ro=1). Opens a pro and a college scout report on a computer-sized and a phone-sized screen,
   then goes through every tab and sub-tab the way a person would: scrolled down a bit, then taps the tab. For each it saves a picture of
   the screen and of the whole report, where the tab row sits on screen before and after the tap, and the report's text.
   Run: JOB_TOKEN=… node job/scoutshots.mjs   → shots/ (pictures + audit.json), uploaded by the workflow. Posts nothing to the site. */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const F = (process.env.FOOTBALL_URL || "https://mycfbbigboard.com").replace(/\/+$/, ""), JOB = process.env.JOB_TOKEN, PAGE = process.env.PAGE_PATH || "/";
const PRO = (process.env.PRO || "MIN,DET").split(","), COL = (process.env.COL || "Ohio State,Michigan").split(",");
mkdirSync("shots", { recursive: true });
const ss = await (await fetch(F + "/api/job/session", { method: "POST", headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" }, body: JSON.stringify({ who: "probe" }) })).json();
const browser = await chromium.launch(); const AUDIT = [];
for (const [dev, opts] of [["desktop", { viewport: { width: 1440, height: 900 } }], ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const ctx = await browser.newContext({ ...opts, extraHTTPHeaders: { "x-site-check": "1" } });
  await ctx.addCookies([{ name: "cfbs", value: ss.token, url: F }]);
  await ctx.addInitScript(t => { try { localStorage.setItem("cfbTok", t) } catch (e) { } }, ss.token);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(F + PAGE + "?ro=1", { waitUntil: "domcontentloaded", timeout: 90000 });
  for (let i = 0; i < 240; i++) { const ok = await p.evaluate(() => { const L = document.getElementById("load"); return !(L && L.offsetParent) && typeof D !== "undefined" && D.pool && Object.keys(D.pool).length > 100 }).catch(() => false); if (ok) break; await p.waitForTimeout(500) }
  for (const [side, me, opp] of [["pro", PRO[0], PRO[1]], ["college", COL[0], COL[1]]]) {
    const tag = `${dev}-${side}`;
    try {
      await p.evaluate(([side, me, opp]) => side === "pro" ? nflSrForm({ me, opp, go: 1 }) : srForm({ me, opp, go: 1 }), [side, me, opp]);
      await p.waitForSelector("#md .sv3tabs", { timeout: 60000 }); await p.waitForTimeout(9000);   /* the sections fill in after the frame */
      const tabs = await p.$$eval("#md .sv3tabs [data-tab]", b => b.map(x => [x.dataset.tab, x.textContent.trim()]));
      for (const [tab, name] of tabs) {
        const subs = await p.$$eval(`#md [data-ph^="${tab}|"]`, b => b.map(x => [x.dataset.ph, x.textContent.trim()])).catch(() => []);
        for (const [ph, sname] of (subs.length ? subs : [[null, ""]])) {
          /* like a person: scrolled part way down the report, then tap */
          await p.evaluate(() => { const ov = document.getElementById("ov"); if (ov) ov.scrollTop = Math.min(ov.scrollHeight, 900) });
          await p.waitForTimeout(300);
          const before = await p.evaluate(() => { const t = document.querySelector("#md .sv3tabs"); return t ? Math.round(t.getBoundingClientRect().top) : null });
          await p.click(`#md .sv3tabs [data-tab="${tab}"]`).catch(() => { });
          if (ph) await p.click(`#md [data-ph="${ph}"]`).catch(() => { });
          await p.waitForTimeout(2500);
          const geo = await p.evaluate(() => { const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) } };
            const t = document.querySelector("#md .sv3tabs"), btn = [...document.querySelectorAll("#md .sv3tabs [data-tab]")].map(r), st = [...document.querySelectorAll("#md .sv3stabs")].filter(x => x.offsetParent).map(r);
            const ov = document.getElementById("ov"), md = document.getElementById("md");
            return { tabs: r(t), tabButtons: btn, tabRows: new Set(btn.map(b => b.top)).size, subTabs: st, scrollTop: ov ? ov.scrollTop : null, reportHeight: md ? md.scrollHeight : null } });
          const after = geo.tabs ? geo.tabs.top : null;
          const text = await p.evaluate(() => { const pan = [...document.querySelectorAll("#md .sv3pan")].find(x => !x.hidden); return pan ? pan.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 12000) : "" });
          const loading = (text.match(/Loading[^\n]*|Couldn't[^\n]*|Not enough[^\n]*|No [a-z-]+ (numbers|plays)[^\n]*/g) || []).slice(0, 12);
          /* overflow: anything wider than the report box */
          const over = await p.evaluate(() => { const md = document.getElementById("md"); if (!md) return []; const W = md.getBoundingClientRect().right + 1; return [...md.querySelectorAll(".sv3pan:not([hidden]) *")].filter(e => e.offsetParent && e.getBoundingClientRect().right > W).slice(0, 8).map(e => (e.className || e.tagName) + " +" + Math.round(e.getBoundingClientRect().right - W) + "px") });
          const nm = `${tag}-${tab}${ph ? "-" + ph.split("|")[1] : ""}`;
          await p.screenshot({ path: `shots/${nm}-screen.png` });
          const md = await p.$("#md"); if (md) await md.screenshot({ path: `shots/${nm}-full.png` }).catch(() => { });
          AUDIT.push({ dev, side, tab: name, sub: sname, tabRowTopBeforeTap: before, tabRowTopAfterTap: after, ...geo, stillLoadingOrMissing: loading, widerThanReport: over, text });
          console.log(`${nm}: tab row ${before} → ${after} px on screen · ${geo.tabRows} row(s) of tabs · report ${geo.reportHeight}px tall${loading.length ? " · " + loading.length + " loading/missing" : ""}${over.length ? " · overflow " + over.join(", ") : ""}`);
        }
      }
      await p.evaluate(() => { try { closeP() } catch (e) { } });
    } catch (e) { console.log(`${tag}: ${e.message.slice(0, 200)}`) }
  }
  if (errs.length) console.log(`${dev} page errors: ${[...new Set(errs)].slice(0, 6).join(" | ")}`);
  await ctx.close();
}
writeFileSync("shots/audit.json", JSON.stringify(AUDIT, null, 1));
await browser.close();
