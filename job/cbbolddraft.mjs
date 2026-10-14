/* NBA drafts before 2001 (Oct 14 — Sam: "still not complete on Izzo's draft picks"): CollegeBasketballData's draft list starts in 2001,
   so a coach's picks from the 1980s and 1990s (Mateen Cleaves and Morris Peterson in 2000, for Izzo) were missing. Each year's Wikipedia
   page ("1996 NBA draft") has the full table — round, pick, player, team, school. Read once per year (finished drafts never change) into
   p2000_cbb-olddraft: { y: [[pick, round, name, school]] }, plus the Division I team id where the school matches ours. */
const UA = { "User-Agent": "mycbbbigboard.com data job (college basketball stats site; contact via the site)" };
const FROM = 1980, TO = 2000;

export function parseDraftTable(w) {
  const i = w.search(/==\s*Draft(?: selections)?\s*==/i); if (i < 0) return [];
  const out = [];
  for (const row of w.slice(i).split(/\n\|-/)) {
    const cells = row.split("\n").filter(l => /^\s*\|(?![}-])/.test(l)).flatMap(l => l.replace(/^\s*\|/, "").split("||"))
      .map(c => c.replace(/^\s*(?:align|bgcolor|style|scope|rowspan|colspan|class)\s*=[^|]*\|/i, "").replace(/^\s*(?:align|bgcolor|style)\s*=[^|]*\|/i, "").trim());
    if (cells.length < 5 || !/^\d+$/.test(cells[0]) || !/^\d+$/.test(cells[1])) continue;
    const nm = (() => { const c = cells[2], s = c.match(/\{\{\s*sortname\s*\|([^|}]+)\|([^|}]+)/i); if (s) return `${s[1].trim()} ${s[2].trim()}`;
      const l = c.match(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/); return (l ? l[1] : c.replace(/<[^>]*>|\{\{[^}]*\}\}|'{2,}|[*^+~#†‡]/g, "")).trim() })();
    const last = cells[cells.length - 1], l2 = last.match(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/), school = (l2 ? l2[1] : last.replace(/<[^>]*>[\s\S]*$/, "").replace(/\{\{[^}]*\}\}/g, "")).replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (nm) out.push([+cells[1], +cells[0], nm, school]);
  }
  return out;
}

export async function buildOldDraft({ getPack, putPack, log, teams, schoolKey }) {
  let P = await getPack("p2000_cbb-olddraft").catch(() => null); if (!P || !P.y) P = { y: {} };
  let calls = 0;
  for (let y = FROM; y <= TO; y++) { if (P.y[y] && P.y[y].length >= 40) continue;
    try { const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&redirects=1&page=${y}_NBA_draft`, { headers: UA })).json(); calls++;
      const rows = parseDraftTable((j.parse || {}).wikitext || ""); if (rows.length >= 40) P.y[y] = rows } catch (e) { await new Promise(r => setTimeout(r, 4000)) }
    await new Promise(r => setTimeout(r, 1200)) }
  const idOf = {}; for (const t of teams || []) idOf[schoolKey(t.school)] = t.id;
  P.picks = []; for (const [y, rows] of Object.entries(P.y)) for (const [pk, rd, nm, sch] of rows) { const col = idOf[schoolKey(sch)]; if (col != null) P.picks.push({ y: +y, pk, rd, nm, col }) }
  if (calls) await putPack("p2000_cbb-olddraft", P);
  log(`old drafts: ${Object.keys(P.y).length} years (${FROM}–${TO}), ${P.picks.length} picks matched to a school · ${calls} Wikipedia calls`);
  return P;
}
