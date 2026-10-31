/* probe (MODE=probe, PROBE=nflsnub): Oct 31, 3:33 pm (Sam: "yes" to Hall of Fame snubs from the Hall's own semifinalist / finalist lists,
   then 10+ honors or top 25 all-time in a stat). Read-only: finds which Wikipedia pages hold the yearly semifinalist / finalist lists and the
   career-leader lists, and how they're laid out, counting the reads. Results as several short notices (each under 4 KB) and in the step
   summary. Nothing written. STEP picks what to look at. */
import { appendFileSync } from "node:fs";
const WUA = { "User-Agent": "mycfbbigboard.com data job (football stats site; contact via the site)" };
let reads = 0;
const api = async q => { reads++; for (let a = 0; a < 3; a++) { try { const r = await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...q }), { headers: WUA }); if (r.ok) return r.json() } catch { } await new Promise(z => setTimeout(z, 1500 * (a + 1))) } return null };
const say = (t, o) => { const s = typeof o === "string" ? o : JSON.stringify(o); for (let i = 0, n = 0; i < s.length && n < 3; i += 3900, n++) console.log(`::notice title=snub ${t}${n ? " " + (n + 1) : ""}::${s.slice(i, i + 3900).replace(/[\r\n]+/g, " ")}`);
  try { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### ${t}\n\n${s}\n`) } catch { } };
const wt = async titles => { const j = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: titles.join("|") }); const o = {};
  for (const pg of (j && j.query && j.query.pages) || []) o[pg.title] = pg.revisions && pg.revisions[0] && pg.revisions[0].slots.main.content || null; return o };
export async function run() {
  const step = process.env.STEP || "1";
  if (step === "1") {
    const pre = async p => { const j = await api({ action: "query", list: "allpages", apprefix: p, aplimit: "500", apnamespace: "0", apfilterredir: "nonredirects" }); return ((j && j.query && j.query.allpages) || []).map(x => x.title) };
    say("prefix PFHOF", await pre("Pro Football Hall of Fame"));
    say("prefix List PFHOF", await pre("List of Pro Football Hall of Fame"));
    say("prefix NFL career", await pre("List of National Football League career"));
    const c = await api({ action: "query", list: "allcategories", acprefix: "Pro Football Hall of Fame", aclimit: "100" }); say("categories", ((c && c.query && c.query.allcategories) || []).map(x => x.category));
    const ex = ["List of Pro Football Hall of Fame finalists", "Pro Football Hall of Fame finalists", "List of Pro Football Hall of Fame semifinalists", "Pro Football Hall of Fame Class of 2024", "2024 Pro Football Hall of Fame class", "Pro Football Hall of Fame class of 2024", "Pro Football Hall of Fame Class of 2025", "Pro Football Hall of Fame Class of 2020"];
    const e = await api({ action: "query", prop: "info", titles: ex.join("|"), redirects: "1" }); say("exists", ((e && e.query && e.query.pages) || []).map(p => p.title + (p.missing ? " MISSING" : " " + p.length)).concat(((e && e.query && e.query.redirects) || []).map(r => r.from + " → " + r.to)));
    for (const t of ["Pro Football Hall of Fame", "List of Pro Football Hall of Fame inductees"]) { const s = await api({ action: "parse", page: t, prop: "sections" }); say("sections " + t, ((s && s.parse && s.parse.sections) || []).map(x => x.level + " " + x.line)) }
    const s1 = await api({ action: "query", list: "search", srsearch: 'insource:"semifinalist" "Pro Football Hall of Fame"', srlimit: "10", srnamespace: "0" }); say("insource semifinalist", { hits: s1 && s1.query && s1.query.searchinfo && s1.query.searchinfo.totalhits, top: ((s1 && s1.query && s1.query.search) || []).map(x => x.title) });
    const s2 = await api({ action: "query", list: "search", srsearch: 'intitle:finalists "Hall of Fame"', srlimit: "30", srnamespace: "0" }); say("intitle finalists", ((s2 && s2.query && s2.query.search) || []).map(x => x.title));
  }
  if (step === "2") {   /* how a page lays out: its sections and the first rows of its first tables */
    const T = (process.env.TITLES || "").split("|").filter(Boolean), W = await wt(T);
    for (const [t, w] of Object.entries(W)) { if (!w) { say(t, "missing"); continue } const k = w.indexOf("{|"); say(t, `len ${w.length} · tables ${(w.match(/\{\|/g) || []).length} · ` + w.slice(Math.max(0, k), k + 3000)) } }
  if (step === "3") {   /* how many player pages say he was a Hall of Fame semifinalist / finalist; where the career-leader lists are */
    const S = async (q, lim = 500, off = 0) => { const j = await api({ action: "query", list: "search", srsearch: q, srlimit: String(lim), sroffset: String(off), srnamespace: "0", srprop: "" }); return { n: j && j.query && j.query.searchinfo && j.query.searchinfo.totalhits, t: ((j && j.query && j.query.search) || []).map(x => x.title) } };
    const Q = ['insource:"semifinalist" insource:"Hall of Fame" football', 'insource:"semi-finalist" insource:"Hall of Fame" football', 'insource:"finalist" insource:"Pro Football Hall of Fame"', 'insource:"Hall of Fame finalist" football', 'insource:"profootballhof.com" insource:"finalist"', 'insource:"profootballhof.com" insource:"semifinalist"'];
    const C = {}; for (const q of Q) { const r = await S(q, 1); C[q] = r.n } say("counts", C);
    const U = await S('insource:"finalist" insource:"Pro Football Hall of Fame"'); say("finalist titles", U.t.join("|"));
    const L = new Set(); for (const q of ['intitle:leaders intitle:career "National Football League"', 'intitle:"career" intitle:"leaders" NFL', 'intitle:sacks intitle:leaders']) { const r = await S(q, 40); r.t.filter(x => /NFL|National Football League/.test(x)).forEach(x => L.add(x)) }
    const pre = async p => { const j = await api({ action: "query", list: "allpages", apprefix: p, aplimit: "500", apnamespace: "0", apfilterredir: "nonredirects" }); return ((j && j.query && j.query.allpages) || []).map(x => x.title).filter(x => /career|leader/i.test(x)) };
    (await pre("List of NFL")).forEach(x => L.add(x)); say("leader pages", [...L]);
    /* the NFL Honors / season articles: do they name the finalists? */
    const W = await wt(["13th NFL Honors", "14th NFL Honors", "15th NFL Honors", "2024 NFL season", "2025 NFL season", "2011 NFL season"]);
    say("honors/season finalist mentions", Object.fromEntries(Object.entries(W).map(([t, w]) => [t, w ? { len: w.length, fin: (w.match(/finalist/gi) || []).length, at: (w.match(/[^\n]{0,160}finalist[^\n]{0,160}/i) || [""])[0] } : null])));
  }
  say("reads", String(reads)); return { ok: true, step, reads } }
