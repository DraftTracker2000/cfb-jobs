/* The new header's pictures (Nov 9 — the owner, 10:43 am: "i meant like with our actual custom headers so i could see how they actually look … we build
   a bunch to fit graphics in a gap that will no longer exist on the desktop"): the Lab with /lab/?nav2, signed in as the site's probe, with real
   team looks (siteTeam / the throwbacks, patterns and scenes included), both ways of placing the sections, a drop-down open, and the phone.
   Read only; pictures come back as the run's artifact (the bc-shots workflow with script=nav2shots). */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const F = (process.env.FOOTBALL_URL || "https://mycfbbigboard.com").replace(/\/+$/, ""), JOB = process.env.JOB_TOKEN;
mkdirSync("bcshots", { recursive: true });
const ss = await (await fetch(F + "/api/job/session", { method: "POST", headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" }, body: JSON.stringify({ who: "probe" }) })).json();
const browser = await chromium.launch(); const LOG = [], errs = [];
const LOOKS = [["none", null], ["michigan", "Michigan"], ["oklahoma", "Oklahoma"], ["alabama", "Alabama"], ["oregon", "Oregon"], ["steelers70s", "TB:PIT_70S"], ["jets-se", "TB:NYJ_SE"], ["bengals-white", "TB:CIN_WT"], ["bears-orange", "TB:CHI_ORG"]];
async function look(p, v) { await p.evaluate(v => { try { if (!v) siteApply(null); else if (v.startsWith("TB:")) siteApply(SITE_TB[v.slice(3)][1]); else siteTeam(v) } catch (e) { return String(e) } try { tbFit(); tbSun() } catch (e) { } }, v); await p.waitForTimeout(1800);
  await p.evaluate(() => { try { tbFit(); tbSun() } catch (e) { } }); await p.waitForTimeout(400) }
async function info(p) { return p.evaluate(() => { const h = document.querySelector("header"), cs = getComputedStyle(h), r = h.getBoundingClientRect(), sw = document.getElementById("lgswH");
  return { h: Math.round(r.height), sceneW: cs.getPropertyValue("--tbGw").trim() || "-", pattern: document.documentElement.getAttribute("data-tmp") || "-", lgsw: sw ? Math.round(sw.getBoundingClientRect().width) : 0 } }) }
for (const [W, H, name] of [[1440, 900, "desk"], [1280, 800, "lap"], [390, 844, "phone"]]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: name === "phone" ? 2 : 1, extraHTTPHeaders: { "x-site-check": "1" } });
  await ctx.addCookies([{ name: "cfbs", value: ss.token, url: F }]);
  await ctx.addInitScript(t => { try { localStorage.setItem("cfbTok", t); localStorage.setItem("cfbNav2", "1") } catch (e) { } }, ss.token);
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(name + ": " + e.message));
  try {
    await p.goto(`${F}/lab/?nav2`, { waitUntil: "domcontentloaded", timeout: 90000 });
    for (let i = 0; i < 60; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => !!document.getElementById("n2nav") && typeof siteTeam === "function").catch(() => false)) break }
    await p.waitForTimeout(6000);
    const looks = name === "desk" ? LOOKS : name === "lap" ? LOOKS.filter(l => ["none", "michigan", "steelers70s"].includes(l[0])) : LOOKS.filter(l => ["none", "michigan", "bengals-white", "steelers70s"].includes(l[0]));
    for (const [k, v] of looks) {
      await look(p, v);
      for (const lay of name === "phone" ? ["bar"] : ["bar", "two"]) {
        await p.evaluate(l => { document.documentElement.setAttribute("data-n2lay", l); try { NAV2.close() } catch (e) { } }, lay); await p.evaluate(() => { try { tbFit(); tbSun() } catch (e) { } }); await p.waitForTimeout(500);
        const I = await info(p); LOG.push(`${name} ${k} ${lay}: header ${I.h}px · pattern ${I.pattern} · scene width ${I.sceneW} · College/Pros ${I.lgsw}px`);
        await p.screenshot({ path: `bcshots/${name}-${k}-${lay}.png`, clip: { x: 0, y: 0, width: W, height: name === "phone" ? 300 : 230 } })
      }
    }
    if (name !== "phone") {
      for (const [k, v] of [["none", null], ["michigan", "Michigan"], ["bengals-white", "TB:CIN_WT"]]) { await look(p, v); await p.evaluate(() => document.documentElement.setAttribute("data-n2lay", "bar"));
        for (const sec of ["HOME", "PLAYERS"]) { await p.hover(`#n2nav button[data-n2="${sec}"]`); await p.waitForTimeout(700); await p.screenshot({ path: `bcshots/${name}-${k}-menu-${sec.toLowerCase()}.png`, clip: { x: 0, y: 0, width: W, height: 520 } }); await p.mouse.move(W / 2, H - 20); await p.waitForTimeout(600) } }
      await p.evaluate(() => document.documentElement.setAttribute("data-n2lay", "bar")); await p.click("#srchBtn"); await p.waitForTimeout(500); await p.screenshot({ path: `bcshots/${name}-search-open.png`, clip: { x: 0, y: 0, width: W, height: 200 } });
      await p.screenshot({ path: `bcshots/${name}-page.png` })
    } else {
      await look(p, "Michigan"); await p.click('#n2bb button[data-n2b="HOME"]'); await p.waitForTimeout(700); await p.screenshot({ path: `bcshots/phone-michigan-sheet-home.png` });
      await p.click('#n2veil'); await p.waitForTimeout(400); await p.screenshot({ path: `bcshots/phone-michigan-page.png` })
    }
  } catch (e) { LOG.push(`${name}: ${String(e.message || e).slice(0, 300)}`) }
  await ctx.close()
}
LOG.push("script errors: " + JSON.stringify([...new Set(errs)].slice(0, 8)));
writeFileSync("bcshots/log.txt", LOG.join("\n")); console.log(LOG.join("\n"));
await browser.close();
