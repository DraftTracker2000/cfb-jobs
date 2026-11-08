/* The weekly crawl (Nov 8 — the owner, 8:21 am: "yes this seems like something important but it would need to not trip up our crawl warning";
   "we need to be reviewing all the adds to make sure they don't break"). The look check covers 17 football views for layout; this goes
   everywhere, the way the Nov 8 audit did by hand (it found the duo line and the scorecard page silently broken):
   - both boards (football / and basketball /cbb/), at desktop (1280) and phone (375) width, look-only (?ro=1 saves and sends nothing):
     College and Pros, every main tab, every sub-view under it;
   - deep views opened through the pages' own functions: player profiles, NFL Player vs Team, every game in both Head to Heads,
     NBA profiles and scout reports, the college Player vs Team tool;
   - and the additions themselves: each must show where it should (the duo line, NFL notes, targets and catches, Better at home,
     Tough on him, clutch free throws, What to expect, Guarded him best).
   On every view: script errors (including unhandled promise errors), "undefined" / "NaN" / "[object Object]" in the text, and at phone
   width anything running off the right edge. It signs in as the data job (the service account), which the scraping warnings skip.
   Returns { ok, views, checks, problems[] }; build.mjs reports it as its own run ("crawl") so the Control room shows it. */

const PAGES = [["/", "football"], ["/cbb/", "basketball"]];
const BAD = /(?:^|[^A-Za-z])(undefined|NaN|\[object Object\])(?![A-Za-z])/;

/* walk every level, main tab and sub-view; runs inside the page */
const WALK = async (W) => {
  const w = ms => new Promise(r => setTimeout(r, ms)), out = [];
  const vis = b => b.offsetParent && b.getBoundingClientRect().top < 300;
  const textBad = () => { const t = (document.querySelector("#panel") || document.body).innerText; const m = t.match(/.{0,40}(?:^|[^A-Za-z])(undefined|NaN|\[object Object\])(?![A-Za-z]).{0,30}/); return m ? m[0].replace(/\s+/g, " ") : null };
  const overflow = () => { if (W > 800) return null; const Wd = document.documentElement.clientWidth; for (const e of document.body.querySelectorAll("*")) { if (!e.offsetParent) continue; const r = e.getBoundingClientRect(); if (!r.width || r.right <= Wd + 1) continue; const c = getComputedStyle(e); if (c.position === "fixed") continue; let p = e.parentElement, inS = false; while (p) { if (/auto|scroll/.test(getComputedStyle(p).overflowX)) { inS = true; break } p = p.parentElement } if (!inS) return `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} ends at ${Math.round(r.right)} of ${Wd}` } return null };
  const look = name => { const b = textBad(), o = overflow(), e = (window.__crawlErr || []).splice(0); out.push({ name, bad: b, over: o, errs: e }) };
  for (const lvl of ["College", "Pros"]) {
    const L = [...document.querySelectorAll("button")].find(b => vis(b) && b.textContent.trim() === lvl); if (L) { L.click(); await w(2500) }
    const tabs = [...document.querySelectorAll("button.tab")].filter(b => b.offsetParent).map(b => b.textContent.trim()).filter(t => t !== "📌");
    for (const tn of tabs) {
      const T = [...document.querySelectorAll("button.tab")].find(b => b.offsetParent && b.textContent.trim() === tn); if (!T) continue; T.click(); await w(2500);
      const top = T.getBoundingClientRect().bottom;
      const subs = [...document.querySelectorAll("button")].filter(b => b.offsetParent && !b.classList.contains("tab") && b.getBoundingClientRect().top > top && b.getBoundingClientRect().top < top + 50).map(b => b.textContent.trim()).filter(t => t && !/^(College|Pros)$/.test(t) && !/run again|↻|🔍|🔔|👤|🧰/i.test(t)).slice(0, 12);
      look(`${lvl} · ${tn}`);
      for (const sn of subs) { const B = [...document.querySelectorAll("button")].find(b => b.offsetParent && b.textContent.trim() === sn && b.getBoundingClientRect().top > top && b.getBoundingClientRect().top < top + 50); if (!B) continue; B.click(); await w(2000); look(`${lvl} · ${tn} → ${sn}`) }
    }
  }
  return out;
};

/* the deep views and the additions, football; runs inside the page */
const DEEP_FB = async () => {
  const w = ms => new Promise(r => setTimeout(r, ms)), out = [], chk = [];
  const md = () => (document.getElementById("md") || document.body).textContent;
  const bad = () => { const m = md().match(/.{0,40}(?:^|[^A-Za-z])(undefined|NaN|\[object Object\])(?![A-Za-z]).{0,30}/); return m ? m[0].replace(/\s+/g, " ") : null };
  const step = async (name, f, ms) => { try { await f() } catch (e) { (window.__crawlErr = window.__crawlErr || []).push(`${name}: ${e.message}`) } await w(ms || 4000); out.push({ name, bad: bad(), errs: (window.__crawlErr || []).splice(0) }) };
  const PL = await nflPlayers().catch(() => null) || {};
  const chem = await fetch("/data/nfl-chem.json").then(r => r.json()).catch(() => null);
  const duo = chem && Object.keys(chem.r).find(k => PL[k] && PL[k].team);
  if (duo) { await step("NFL profile (duo)", () => nflProfile(duo)); const c = document.getElementById("nflChem"); chk.push(["QB–receiver duo line", !!(c && c.textContent.trim())]) }
  const wr = Object.entries(PL).filter(([k, v]) => v.pos === "WR" && v.team && (v.last || 0) >= CURYEAR).map(([k]) => k)[0];
  if (wr) { await step("NFL Player vs Team (WR)", () => nflPvtForm({ name: `${PL[wr].name} · WR · ${PL[wr].team}`, team: PL[wr].team === "DET" ? "GB" : "DET", site: "home", roof: "out", tp: "any", wd: "any", pc: "clear", go: true }), 9000);
    const o = document.getElementById("npOut"); chk.push(["Targets and catches read", !!(o && /targets and catches/i.test(o.textContent))]) }
  const hwr = await fetch("/data/cfb-home-wr.json").then(r => r.json()).catch(() => null);
  const hid = hwr && Object.keys(hwr.p).find(k => typeof poolOrArch === "function" && poolOrArch(k) && poolOrArch(k).s);
  if (hid) { await step("College profile (Better at home)", () => profile(hid)); const e = document.getElementById("hwr"); chk.push(["Better at home line", !!(e && e.textContent.trim())]) }
  const top = typeof D !== "undefined" && D.pool ? Object.keys(D.pool).slice(0, 2) : [];
  for (const id of top) await step("College profile " + id, () => profile(id));
  return { out, chk };
};
/* Head to Head: every game opened, both sports; runs inside the page */
const H2H_ALL = async (sport) => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const sel = sport === "nfl" ? "[data-nv]" : "[data-hv]", set = sport === "nfl" ? NFL_OPEN : H2H_OPEN, conv = sport === "nfl" ? x => x : x => +x;
  const ids = [...document.querySelectorAll(sel)].map(b => b.getAttribute(sport === "nfl" ? "data-nv" : "data-hv")); if (!ids.length) return { n: 0 };
  ids.forEach(i => set.add(conv(i))); set.delete(conv(ids[0])); document.querySelector(`${sel.slice(0, -1)}="${ids[0]}"]`).click(); await w(9000);
  const t = document.body.textContent, m = t.match(/.{0,40}(?:^|[^A-Za-z])(undefined|NaN|\[object Object\])(?![A-Za-z]).{0,30}/);
  const emptyNotes = [...document.querySelectorAll("[data-nnw]")].filter(e => e.style.display !== "none" && /Notes:\s*$/.test(e.textContent.replace(/i\s*$/, "").trim())).length;
  return { n: ids.length, bad: m ? m[0].replace(/\s+/g, " ") : null, notes: (t.match(/Notes:/g) || []).length, emptyNotes, errs: (window.__crawlErr || []).splice(0) };
};
/* basketball deep views and additions; runs inside the page */
const DEEP_BB = async () => {
  const w = ms => new Promise(r => setTimeout(r, ms)), out = [], chk = [];
  const bad = () => { const m = document.body.textContent.match(/.{0,40}(?:^|[^A-Za-z])(undefined|NaN|\[object Object\])(?![A-Za-z]).{0,30}/); return m ? m[0].replace(/\s+/g, " ") : null };
  const step = async (name, f, ms) => { try { await f() } catch (e) { (window.__crawlErr = window.__crawlErr || []).push(`${name}: ${e.message}`) } await w(ms || 5000); out.push({ name, bad: bad(), errs: (window.__crawlErr || []).splice(0) }) };
  const cft = await fetch("/data/nba-clutch-ft.json").then(r => r.json()).catch(() => null), cid = cft && Object.keys(cft.p)[0];
  if (cid) { await step("NBA profile (clutch FTs)", () => openPro(cid)); chk.push(["Clutch free-throw line", !!document.querySelector("#md .ncft")]); chk.push(["Guarded him best / His man", !!(document.querySelector("#ngrd") || document.querySelector("#nman"))]) }
  const T = await bbToughLoad(), nba = T && T.nba && Object.entries(T.nba)[0];
  if (nba) { await step("NBA scout report (Tough on him)", () => nbaPvT(nba[0], Object.keys(nba[1])[0]), 4000); chk.push(["Tough on him (NBA)", /Tough on him/.test(document.body.textContent)]) }
  const SID = new Map(Object.values(TEAMS.teams).map(t => [String(t.sid), t]));
  const pl = CORE.players.find(p => p.s && p.eid && T.mbb[String(p.eid)] && Object.keys(T.mbb[String(p.eid)]).some(k => SID.has(k)));
  if (pl) { const tm = SID.get(Object.keys(T.mbb[String(pl.eid)]).find(k => SID.has(k))); ST.ptP = String(pl.id); ST.ptT = String(tm.id);
    await step("College Player vs Team", () => openTools("PT"), 8000); const t = (TP && TP()) ? TP().textContent : "";
    chk.push(["What to expect (college)", /What to expect/.test(t)]); chk.push(["Tough on him (college)", /Tough on him/.test(t)]) }
  return { out, chk };
};

async function open(browser, site, token, page, W) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 800 ? 812 : 900 }, isMobile: W < 800, hasTouch: W < 800, extraHTTPHeaders: { "x-site-check": "1" } });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await ctx.addCookies([{ name: "cfbs", value: token, url: site }]);
  await ctx.addInitScript(t => {
    try { localStorage.setItem("cfbTok", t) } catch (e) { }
    const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^cfbTour|^cfbPT_|^cfbH2hHint/.test(k) ? "1" : g.call(this, k) };
    window.__crawlErr = []; addEventListener("unhandledrejection", e => window.__crawlErr.push("unhandled: " + String(e.reason && e.reason.message || e.reason).slice(0, 160)));
  }, token);
  await p.goto(`${site}${page}?ro=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let k = 0; k < 3 && new URL(p.url()).pathname !== page; k++) { await p.waitForTimeout(2500); await p.goto(`${site}${page}?ro=1`, { waitUntil: "domcontentloaded", timeout: 60000 }) }
  if (new URL(p.url()).pathname !== page) throw new Error(`asked for ${page}, landed on ${p.url()}`);
  await p.waitForFunction(() => [...document.querySelectorAll("button.tab, .tabs button")].some(b => b.offsetParent), null, { timeout: 90000 });
  await p.waitForTimeout(6000);
  await p.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Got it")?.click(); document.querySelectorAll(".tourx").forEach(x => x.remove()) });
  return { ctx, p, errs };
}

export async function crawlCheck({ browser, site, token, log = console.log }) {
  const problems = [], checks = []; let views = 0;
  const note = (where, r) => { views++; if (r.bad) problems.push(`${where} · ${r.name}: shows "${r.bad}"`); if (r.over) problems.push(`${where} · ${r.name}: ${r.over}`); for (const e of r.errs || []) problems.push(`${where} · ${r.name}: ${e}`) };
  for (const [page, nm] of PAGES) for (const W of [1280, 375]) {
    const where = `${nm} ${W}px`; let s;
    try {
      s = await open(browser, site, token, page, W);
      for (const r of await s.p.evaluate(`(${WALK})(${W})`)) note(where, r);
      if (W > 800) {
        if (nm === "football") {
          const d = await s.p.evaluate(`(${DEEP_FB})()`); for (const r of d.out) note(where, r); checks.push(...d.chk);
          for (const [hash, sp] of [["#/pro/h2h/games", "nfl"], ["#/col/h2h/games", "col"]]) {
            await s.p.evaluate(h => { location.hash = h }, hash); await s.p.waitForTimeout(8000);
            const h = await s.p.evaluate(`(${H2H_ALL})("${sp}")`); views++;
            if (h.bad) problems.push(`${where} · ${sp} Head to Head (${h.n} games open): shows "${h.bad}"`);
            if (h.emptyNotes) problems.push(`${where} · NFL Head to Head: ${h.emptyNotes} empty Notes line(s)`);
            for (const e of h.errs || []) problems.push(`${where} · ${sp} Head to Head: ${e}`);
            if (sp === "nfl" && h.n) checks.push(["NFL notes line", h.notes > 0]);
          }
        } else { const d = await s.p.evaluate(`(${DEEP_BB})()`); for (const r of d.out) note(where, r); checks.push(...d.chk) }
      }
    } catch (e) { problems.push(`${where}: couldn't finish (${String(e.message || e).slice(0, 300)})`) }
    if (s) { for (const e of [...new Set(s.errs)].slice(0, 6)) problems.push(`${where} · script error: ${e.slice(0, 160)}`); await s.ctx.close() }
  }
  for (const [what, ok] of checks) if (!ok) problems.push(`addition missing: ${what}`);
  log(`crawl: ${views} views, ${checks.filter(c => c[1]).length}/${checks.length} additions showing, ${problems.length} problem(s)`);
  return { ok: !problems.length, views, checks, problems };
}
export const crawlMsg = C => (C.ok ? `weekly crawl · ${C.views} views on both boards at phone and desktop width, every addition showing (${C.checks.length}) · all clear`
  : `weekly crawl · ${C.problems.length} problem(s): ${C.problems.slice(0, 8).join(" | ")}`).slice(0, 1400);
