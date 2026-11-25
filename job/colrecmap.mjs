/* The college map's national view (Nov 24 — the owner, 9:25 pm: "yes a … heat map is the base view"): every high-school recruit who signed with a
   school, all schools, by hometown — from CollegeFootballData's recruiting lists (/recruiting/players?year=Y&classification=HighSchool), one call
   per class year through the proxy (past classes are kept by the proxy, so a re-run costs only the newest years).

   Only recruits with a school (committedTo) and a hometown with coordinates. Nothing else is read or changed.
   Output: p2000_cfb-recmap = { v: 1, from, to, at, sch: [school…], pos: [position…],
     r: [[lon×100, lat×100, stars, class year, school index, position index]] } */

import { gzipSync } from "node:zlib";

export async function buildColRecMap({ site, token, from = 2002, to, log = console.log }) {
  const H = { headers: { Authorization: "Bearer " + token } };
  let calls = 0;
  const cf = async path => { for (let k = 0; k < 4; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) { if (!r.headers.get("x-kept")) calls++; return r.json() }
    if (r.status === 429) await new Promise(r => setTimeout(r, 5000)) } catch (e) { } await new Promise(r => setTimeout(r, 1500)) } throw new Error("CFBD failed: " + path) };
  const sch = [], si = new Map(), pos = [], pi = new Map(), r = [], per = {};
  const ix = (L, M, v) => { if (!M.has(v)) { M.set(v, L.length); L.push(v) } return M.get(v) };
  let noLoc = 0, noSch = 0;
  for (let y = from; y <= to; y++) {
    const L = await cf(`/recruiting/players?year=${y}&classification=HighSchool`); let n = 0;
    for (const x of L || []) { const t = x.committedTo, h = x.hometownInfo || {}, lon = +h.longitude, lat = +h.latitude;
      if (!t) { noSch++; continue } if (!isFinite(lon) || !isFinite(lat) || (!lon && !lat)) { noLoc++; continue }
      r.push([Math.round(lon * 100), Math.round(lat * 100), +x.stars || 0, y, ix(sch, si, t), ix(pos, pi, x.position || "")]); n++ }
    per[y] = n; log(`recmap: ${y} · ${n} signees`) }
  log(`recmap: ${r.length} signees, ${sch.length} schools, ${from}–${to} · left out: ${noSch} with no school, ${noLoc} with no hometown coordinates · ${calls} CFBD calls`);
  return { d: { v: 1, from, to, at: Date.now(), sch, pos, r }, per, noSch, noLoc, calls };
}

export async function uploadColRecMap({ api, d }) {
  const gz = gzipSync(Buffer.from(JSON.stringify(d))), name = "p2000_cfb-recmap";
  const u = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  await api("PUT", "/api/pack-index", { body: { [name]: { sha: u.sha, bytes: u.bytes, at: Date.now() } } });
  return { bytes: gz.length };
}
