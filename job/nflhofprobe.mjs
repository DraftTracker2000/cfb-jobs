/* probe (MODE=probe, PROBE=nflhof): Oct 30, 6:24 pm (Sam: "yes on the hall of famers … is there a way to build out the football history
   page the same way we did the basketball page? with their players list of award winners and the banners") — read a few NFL players'
   Wikipedia infoboxes (the highlights list and the Hall of Fame field) and count one team's player category, to size the full pull.
   Read-only; nothing written. */
const WUA = { "User-Agent": "mycfbbigboard.com data job (football stats site; contact via the site)" };
const api = async q => { const r = await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...q }), { headers: WUA }); return r.ok ? r.json() : null };
export async function run() {
  const L = ["Matt Ryan", "Richard Sherman"];
  const j = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", rvsection: "0", redirects: "1", titles: L.join("|") });
  const P = ((j && j.query && j.query.pages) || []).map(p => { const w = (p.revisions && p.revisions[0].slots.main.content) || "", k = w.search(/\n\s*\|\s*highlights\s*=/);
    const rest = k < 0 ? "" : w.slice(k + 1), e = rest.search(/\n\s*\|\s*[a-z_]+\s*=|\n\}\}/), h = k < 0 ? "" : (e < 0 ? rest : rest.slice(0, e));
    return { t: p.title, tmpl: (w.match(/\{\{\s*Infobox [^|\n]*/i) || [""])[0], hofF: (w.match(/\n\s*\|\s*(?:hof\w*|pfhof\w*|halloffame)\s*=[^\n]*/gi) || []).join(" ").slice(0, 160),
      keys: (w.match(/\n\s*\|\s*[a-z_0-9]+\s*=/gi) || []).map(x => x.replace(/[\s|=]/g, "")).join(","), pt: (w.match(/\n\s*\|\s*(?:pastteams|teams?|playing_teams|team\d|years\d)\s*=[\s\S]{0,700}/i) || [""])[0], roy: (h.match(/[^\n]*Rookie[^\n]*/g) || []).join(" / ").slice(0, 300) } });
  let n = 0, cont = {}; for (let g = 0; g < 20; g++) { const c = await api({ action: "query", list: "categorymembers", cmtitle: "Category:Detroit Lions players", cmlimit: "500", cmnamespace: "0", ...cont }); if (!c) break; n += ((c.query && c.query.categorymembers) || []).length; if (!c.continue) break; cont = c.continue }
  const hc = await api({ action: "query", list: "categorymembers", cmtitle: "Category:Pro Football Hall of Fame inductees", cmlimit: "500", cmnamespace: "0" });
  return { ok: true, lions: n, hofCat: ((hc && hc.query && hc.query.categorymembers) || []).length, hofMore: !!(hc && hc.continue), P };
}
