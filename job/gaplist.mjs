/* probe (Oct 25 — Sam: X lookups for the college injury gaps): the unexplained gaps still open — skill positions, 2019 on, 2+ games,
   not named in public/data/col-injuries.json or col-absences.json and not already looked up (DONE). Newest first. Read-only. */
const DONE = new Set((process.env.DONE || "").split(",").filter(Boolean));
const nm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
export async function run({ site, token, log }) {
  const H = { headers: { Authorization: "Bearer " + token } };
  let G = null; for (const y of [2026, 2025, 2027]) { try { const r = await fetch(site + "/api/pack/p" + y + "_colgap", H); if (r.ok) { G = await r.json(); break } } catch (e) {} }
  if (!G) return { ok: false, err: "no colgap pack" };
  const named = new Set();
  for (const f of ["col-injuries.json", "col-absences.json"]) { try { const j = await (await fetch(site + "/data/" + f)).json(); for (const z of j.p || []) named.add(nm(z.name) + "|" + String(z.date || "").slice(0, 4)) } catch (e) {} }
  const out = [];
  for (const [g, v] of Object.entries((G.colgap || G).p || {})) { const [name, pos, S] = v; if (!/^(QB|RB|WR|TE|FB)$/.test(pos) || DONE.has(name)) continue;
    for (const s of S || []) { const [season, team, last, opp, missed, ended, back] = s; if (season < 2019 || missed < 2) continue;
      if (named.has(nm(name) + "|" + season) || named.has(nm(name) + "|" + (season + 1))) continue;
      out.push([name, pos, season, team, last, opp, missed, ended ? 1 : 0, back || ""]) } }
  out.sort((a, b) => b[4].localeCompare(a[4]));
  if (process.env.ALL) { const cf = async path => { for (let k = 0; k < 3; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) return r.json() } catch (e) {} await new Promise(z => setTimeout(z, 1500)) } return null };
    const SCH = {}; for (const r of out) { const k = r[2] + "|" + r[3]; if (!SCH[k]) SCH[k] = (await cf(`/games?year=${r[2]}&seasonType=regular&team=${encodeURIComponent(r[3])}`)) || [];
      const G = SCH[k].filter(g => g.startDate).map(g => [String(g.startDate).slice(0, 10), g.homeTeam === r[3] ? g.awayTeam : "@" + g.homeTeam]).sort();
      const after = G.filter(g => g[0] > r[4] && (!r[8] || g[0] < r[8])); r.push(after.slice(0, r[6]).map(g => g[0].slice(5) + " " + g[1]).join(";")) } const t = out.map(r => r.join("|")).join("\n"); for (let i = 0; i < t.length; i += 3500) log(`::notice title=gapall ${String(i / 3500).padStart(3, "0")}::${t.slice(i, i + 3500).replace(/\n/g, "~")}`); return { ok: true, n: out.length } }
  return { ok: true, n: out.length, rows: out.slice(0, +(process.env.N || 40)).map(r => r.join("|")) };
}
