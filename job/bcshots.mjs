/* Broadcast workspace pictures (Nov 6 — the owner, 7:19 am: "so you didn't make the broadcast side updated and look nicer?"): every page of the
   broadcast workspace in the Lab, read-only, signed in as the site's probe. Two kinds of picture: the portal as a broadcaster sees it
   (the menu and the workspace, one screen), and each workspace page whole (scrolled to the end). Pictures come back as the run's artifact;
   nothing is posted to the site. Run: JOB_TOKEN=… node job/bcshots.mjs → bcshots/ */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const F = (process.env.FOOTBALL_URL || "https://mycfbbigboard.com").replace(/\/+$/, ""), JOB = process.env.JOB_TOKEN, TAG = process.env.TAG || "before";
const W = +(process.env.WIDTH || 1440), H = +(process.env.HEIGHT || 900);
const PAGES = (process.env.PAGES || "week,prep,live,slate,episode,fweek,season,search,pins,settings,more").split(",");
mkdirSync("bcshots", { recursive: true });
const ss = await (await fetch(F + "/api/job/session", { method: "POST", headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" }, body: JSON.stringify({ who: "probe" }) })).json();
const browser = await chromium.launch(); const LOG = [];
const ctx = await browser.newContext({ viewport: { width: W, height: H }, extraHTTPHeaders: { "x-site-check": "1" } });
await ctx.addCookies([{ name: "cfbs", value: ss.token, url: F }]);
await ctx.addInitScript(t => { try { localStorage.setItem("cfbTok", t) } catch (e) { } }, ss.token);
const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
/* the workspace page by page, whole */
for (const pg of PAGES) {
  try {
    const [pg0, sp] = pg.split(":");   /* "slate:nba" = the Every game page on that sport's tab (Nov 6) */
    await p.goto(`${F}/lab/?broadcast=1&embed=portal&pg=${pg0}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (sp) { await p.waitForTimeout(6000); await p.evaluate(s => { BC.slateSp = s; bcRender() }, sp).catch(() => { }) }
    for (let i = 0; i < 80; i++) { await p.waitForTimeout(500); const ok = await p.evaluate(() => { const R = document.getElementById("bcRoot"); return !!(R && R.children.length && !/Loading|Building/.test(R.textContent.slice(0, 120))) }).catch(() => false); if (ok && i > 8) break }
    await p.waitForTimeout(3000);
    /* the workspace scrolls inside its own box: let it grow to its full height for the picture */
    await p.evaluate(() => { const R = document.getElementById("bcRoot"); if (R) { R.style.position = "static"; R.style.height = "auto"; R.style.maxHeight = "none"; R.style.overflow = "visible" } document.documentElement.style.overflow = "visible"; document.body.style.overflow = "visible"; for (const c of [...document.body.children]) if (c.id !== "bcRoot" && c.tagName !== "SCRIPT") c.style.display = "none" });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `bcshots/${TAG}-${pg.replace(":", "-")}.png`, fullPage: true });
    LOG.push(`${pg}: ${await p.evaluate(() => { const R = document.getElementById("bcRoot"); return R ? (R.querySelector("h1,h2") || {}).textContent + " · " + R.scrollHeight + "px tall" : "no workspace" })}`);
  } catch (e) { LOG.push(`${pg}: ${String(e.message || e).slice(0, 200)}`) }
}
/* the portal as a broadcaster sees it, one screen */
for (const pg of ["week", "prep"]) {
  try { await p.goto(`${F}/lab/portal.html#broadcast/${pg}`, { waitUntil: "domcontentloaded", timeout: 90000 }); await p.waitForTimeout(14000); await p.screenshot({ path: `bcshots/${TAG}-portal-${pg}.png` }) } catch (e) { LOG.push(`portal ${pg}: ${String(e.message || e).slice(0, 200)}`) }
}
LOG.push("script errors: " + JSON.stringify([...new Set(errs)].slice(0, 8)));
writeFileSync("bcshots/log.txt", LOG.join("\n")); console.log(LOG.join("\n"));
await browser.close();
