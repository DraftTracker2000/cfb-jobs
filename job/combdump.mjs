/* probe (Oct 25 — NBA athletic profile on the More tab): what the combine pack holds — positions as listed, how many have each
   measurement, and the spread by position group, so the page can rate a player against his own group. Read-only. */
export async function run({ site, token, log }) {
  const r = await fetch(site + "/api/pack/p2000_cbb-combine", { headers: { Authorization: "Bearer " + token } }); if (!r.ok) return { ok: false, st: r.status };
  const C = await r.json(), R = C.rows || [], cols = C.cols || [];
  const pos = {}; for (const x of R) pos[x[4] || "?"] = (pos[x[4] || "?"] || 0) + 1;
  const grp = p => { p = String(p || ""); if (/^(PG|SG|G|PG-SG|SG-PG)$/.test(p)) return "G"; if (/C/.test(p) || /^PF$/.test(p) || /^PF-SF$/.test(p)) return "B"; return p ? "W" : "?" };
  const q = (a, f) => a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : null;
  const S = {}; for (const g of ["G", "W", "B"]) { S[g] = {}; const G = R.filter(x => grp(x[4]) === g); S[g].n = G.length;
    for (let i = 5; i < cols.length; i++) { const a = G.map(x => x[i]).filter(v => v != null).sort((x, y) => x - y); S[g][cols[i]] = [a.length, q(a, .1), q(a, .5), q(a, .9)] }
    const d = G.filter(x => x[7] != null && x[5] != null).map(x => x[7] - x[5]).sort((x, y) => x - y); S[g].length = [d.length, q(d, .1), q(d, .5), q(d, .9)] }
  const yrs = {}; for (const x of R) yrs[x[0]] = (yrs[x[0]] || 0) + 1;
  const all = JSON.stringify({ n: R.length, cols, v: C.v, pos, yrs, S, sample: R.slice(-3) });
  for (let i = 0; i < all.length; i += 3500) log(`::notice title=combdump ${i / 3500}::${all.slice(i, i + 3500)}`);
  return { ok: true, n: R.length, parts: Math.ceil(all.length / 3500) };
}
