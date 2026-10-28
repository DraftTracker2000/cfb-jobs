/* Wikipedia pages that cite Sports Reference are off limits (Sam's rule: no Sports Reference, Basketball-Reference, Pro Football
   Reference — or Wikipedia citing them). Every job that reads Wikipedia passes the API's answer through noSR: any page whose text cites
   one of those sites is emptied (so nothing from it is parsed) and counted. Added Oct 28 after a review found six jobs without the check. */
export const SR = /sports-reference\.com|basketball-reference\.com|pro-football-reference\.com|sports-reference|basketball-reference|pro-football-reference|hockey-reference|baseball-reference/i;
export const srSkipped = [];
export function noSR(j, what) {
  try {
    if (!j || typeof j !== "object") return j;
    const hit = t => typeof t === "string" && SR.test(t);
    if (j.parse) { const w = j.parse.wikitext; if (hit(w)) { j.parse.wikitext = ""; srSkipped.push(what || j.parse.title || "page") } else if (w && typeof w === "object" && hit(w["*"])) { w["*"] = ""; srSkipped.push(what || j.parse.title || "page") } }
    const pages = j.query && j.query.pages; const list = Array.isArray(pages) ? pages : pages ? Object.values(pages) : [];
    for (const p of list) for (const r of p.revisions || []) { if (hit(r.content)) { r.content = ""; srSkipped.push(p.title) } if (r["*"] && hit(r["*"])) { r["*"] = ""; srSkipped.push(p.title) } const m = r.slots && r.slots.main; if (m) { if (hit(m.content)) { m.content = ""; srSkipped.push(p.title) } if (hit(m["*"])) { m["*"] = ""; srSkipped.push(p.title) } } }
  } catch (e) { }
  return j }
