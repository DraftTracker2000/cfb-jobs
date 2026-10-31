/* probe (MODE=probe, PROBE=nflsnub): Oct 31, 3:33 pm (Sam: "yes" to Hall of Fame snubs from the Hall's own semifinalist / finalist lists,
   then 10+ honors or top 25 all-time in a stat). Read-only: finds which Wikipedia pages hold the yearly semifinalist / finalist lists and the
   career-leader lists, counts the reads, and prints each page's wikitext (gzip + base64, between FIX markers) into the run log so the build
   can be written and tested against saved copies. Nothing written. */
import { gzipSync } from "node:zlib";
const WUA = { "User-Agent": "mycfbbigboard.com data job (football stats site; contact via the site)" };
let reads = 0;
const api = async q => { reads++; for (let a = 0; a < 3; a++) { try { const r = await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...q }), { headers: WUA }); if (r.ok) return r.json() } catch { } await new Promise(z => setTimeout(z, 1500 * (a + 1))) } return null };
const dump = (title, w) => { const b = gzipSync(Buffer.from(w)).toString("base64"); console.log(`FIX-BEGIN ${title}`); for (let i = 0; i < b.length; i += 8000) console.log("FIX " + b.slice(i, i + 8000)); console.log(`FIX-END ${title}`) };
export async function run() {
  const o = { ok: true, search: {}, pages: {} };
  const SQ = (process.env.SQ || "Pro Football Hall of Fame semifinalists|Pro Football Hall of Fame finalists|intitle:\"Pro Football Hall of Fame\"|Pro Football Hall of Fame class of 2024|Pro Football Hall of Fame Class|National Football League career leaders").split("|");
  for (const s of SQ) { const j = await api({ action: "query", list: "search", srsearch: s, srlimit: "40", srnamespace: "0" }); o.search[s] = ((j && j.query && j.query.search) || []).map(x => x.title) }
  const pf = await api({ action: "query", list: "allpages", apprefix: "Pro Football Hall of Fame", aplimit: "200", apnamespace: "0" }); o.prefix = ((pf && pf.query && pf.query.allpages) || []).map(x => x.title);
  const pl = await api({ action: "query", list: "allpages", apprefix: "List of National Football League career", aplimit: "200", apnamespace: "0" }); o.leaders = ((pl && pl.query && pl.query.allpages) || []).map(x => x.title);
  const T = (process.env.TITLES || "").split("|").filter(Boolean);
  for (let k = 0; k < T.length; k += 20) { const j = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: T.slice(k, k + 20).join("|") });
    for (const pg of (j && j.query && j.query.pages) || []) { const w = pg.revisions && pg.revisions[0] && pg.revisions[0].slots.main.content; o.pages[pg.title] = w ? w.length : "missing"; if (w) dump(pg.title, w) } }
  o.reads = reads; console.log("PROBE-OUT " + JSON.stringify(o)); return o }
