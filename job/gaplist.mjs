/* probe (Oct 25 — Sam: X lookups for the college injury gaps): the unexplained gaps still open — skill positions, 2019 on, 2+ games,
   not named in public/data/col-injuries.json or col-absences.json and not already looked up (DONE). Newest first. Read-only. */
const DONE = new Set((process.env.DONE || "").split(",").filter(Boolean));
const nm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
export async function run({ site, token }) {
  const H = { headers: { Authorization: "Bearer " + token } };
  let G = null; for (const y of [2026, 2025, 2027]) { try { const r = await fetch(site + "/api/pack/p" + y + "_colgap", H); if (r.ok) { G = await r.json(); break } } catch (e) {} }
  if (!G) return { ok: false, err: "no colgap pack" };
  const named = new Set();
  for (const f of ["col-injuries.json", "col-absences.json"]) { try { const j = await (await fetch(site + "/data/" + f)).json(); for (const z of j.p || []) named.add(nm(z.name) + "|" + String(z.date || "").slice(0, 4)) } catch (e) {} }
  const out = [];
  for (const [g, v] of Object.entries((G.colgap || G).p || {})) { const [name, pos, S] = v; if (!/^(QB|RB|WR|TE|FB)$/.test(pos) || DONE.has(name)) continue;
    for (const s of S || []) { const [season, team, last, opp, missed, ended] = s; if (season < 2019 || missed < 2) continue;
      if (named.has(nm(name) + "|" + season) || named.has(nm(name) + "|" + (season + 1))) continue;
      out.push([name, pos, season, team, last, opp, missed, ended ? 1 : 0]) } }
  out.sort((a, b) => b[4].localeCompare(a[4]));
  return { ok: true, n: out.length, rows: out.slice(0, +(process.env.N || 40)).map(r => r.join("|")) };
}
