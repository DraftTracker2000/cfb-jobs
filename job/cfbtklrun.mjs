/* College tacklers, built (Nov 5 — Sam, doc item 25: "finish it" for wip/cfb-tacklers; Oct 28 he approved the sportsdataverse ESPN play
   participants data, which sits on the flag list with the rest of ESPN). Run as a probe (MODE=probe, PROBE=cfbtkl): one pack per season,
   p<season>_cfbtkl (job/cfbtkl.mjs), 2019 on — earlier seasons name too few tacklers (2014: 315 of 706 FBS games with 20+ tackle plays).
   Seasons already built and finished are left alone; the current season is rebuilt every run. Writes only these packs and their index lines. */
import { gzipSync } from "node:zlib";
import { buildTacklers } from "./cfbtkl.mjs";

export async function run({ site, log = console.log }) {
  const job = process.env.JOB_TOKEN, now = new Date(), cur = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const H = { Authorization: "Bearer " + job };
  let ix = {}; try { const ss = await (await fetch(site + "/api/job/session", { method: "POST", headers: H })).json(); ix = (await (await fetch(site + "/api/pack-index", { headers: { Authorization: "Bearer " + ss.token } })).json()).packs || {} } catch (e) { }
  const years = []; for (let y = 2019; y <= cur; y++) if (y === cur || !ix[`p${y}_cfbtkl`]) years.push(y);
  const packs = await buildTacklers({ years, log }), IX = {}, out = [];
  for (const P of packs) { const a = P.audit; if (P.season < cur && a.gTk < 0.6 * a.games) { out.push(`${P.season}: held (${a.gTk}/${a.games} games with 20+ tackle plays)`); continue }
    const gz = gzipSync(Buffer.from(JSON.stringify({ cfbtkl: P }))), name = `p${P.season}_cfbtkl`;
    const r = await fetch(`${site}/api/pack/${name}`, { method: "PUT", body: gz, headers: { ...H, "x-encoding": "gzip", "Content-Type": "application/json" } });
    if (!r.ok) { out.push(`${P.season}: PUT ${r.status}`); continue } const j = await r.json(); IX[name] = { sha: j.sha, bytes: j.bytes, at: Date.now() };
    out.push(`${P.season}: ${Object.keys(P.p).length} players · ${a.gTk}/${a.games} games with 20+ tackle plays · ${(gz.length / 1024).toFixed(0)} KB`) }
  if (Object.keys(IX).length) await fetch(`${site}/api/pack-index`, { method: "PUT", body: JSON.stringify(IX), headers: { ...H, "Content-Type": "application/json" } });
  return { ok: true, years, out };
}
