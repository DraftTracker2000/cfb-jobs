/* Findings packs (Nov 1, 2026 — the owner, 10:03 am: the college and basketball findings "are good to go", Lab first). Uploads what
   docs/research/patternhunt3/findings.py (job/study3/findings.py) built on the runner from the study archive:
     p2026_cfb-findings  { cfbfind: { … } }   p2026_cbb-findings  { cbbfind: { … } }
   Signed-in readable like any pack (no _study- in the name). Finished numbers only. Schema: docs/HOW-THIS-SITE-WORKS.md, "Findings packs".
   Run by the Study job's "focus:findings" steps; DRY=1 ("dry" in the batches box) lists names, sizes and tag counts and writes nothing.
   A pack whose build had section errors is held back when the copy on the site has fewer errors (nothing good is replaced by less).
   usage: node job/findings.mjs <dir with the built .json files> */
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

export function summary(name, j) {
  const k = Object.keys(j)[0], P = j[k] || {}, out = [];
  const add = (lab, c) => { if (c) out.push(`${lab} ${Object.entries(c).map(([a, b]) => `${a} ${b}`).join(" ")}`) };
  for (const [t, x] of Object.entries(P.defense || {})) add(t + (x.family && x.family.passes ? "" : " (family fails)"), x.counts);
  for (const [t, x] of Object.entries(P.coach_style || {})) add(t + (x.family && x.family.passes ? "" : " (family fails)"), x.counts);
  for (const t of ["recruit_hits", "transfers", "draft_flags", "home_court", "coach_development", "late_risers"]) if (P[t]) add(t, P[t].counts);
  for (const t of ["home_underdog"]) if (P[t]) out.push(`${t} passes ${P[t].passes}`);
  if (P.home_field && P.home_field.both_ranked) out.push(`both_ranked passes ${P.home_field.both_ranked.passes}`);
  return { key: k, errors: P.errors || [], lines: out };
}

async function main() {
  const dir = process.argv[2], SITE = (process.env.SITE_URL || "").replace(/\/+$/, ""), JOB = process.env.JOB_TOKEN || "", DRY = process.env.DRY === "1";
  if (!SITE || !JOB) throw new Error("SITE_URL and JOB_TOKEN are required");
  const files = readdirSync(dir).filter(f => /^p\d{4}_[a-z0-9-]+\.json$/.test(f));
  const sess = await (await fetch(SITE + "/api/job/session", { method: "POST", headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" }, body: JSON.stringify({ who: "probe" }) })).json();
  const IX = {};
  for (const f of files) {
    const name = f.replace(/\.json$/, ""), txt = readFileSync(`${dir}/${f}`, "utf8"), j = JSON.parse(txt), s = summary(name, j), gz = gzipSync(Buffer.from(txt));
    let hold = "";
    if (s.errors.length) { try { const r = await fetch(`${SITE}/api/pack/${name}`, { headers: { Authorization: "Bearer " + sess.token } });
      if (r.ok) { const old = await r.json(), oe = ((old[s.key] || {}).errors || []).length; if (oe < s.errors.length) hold = `held back: ${s.errors.length} section errors vs ${oe} in the copy on the site` } } catch (e) { } }
    const head = `${name} · ${(txt.length / 1e3).toFixed(0)} KB (${(gz.length / 1e3).toFixed(0)} KB gzipped)${s.errors.length ? ` · errors: ${s.errors.join("; ")}` : ""}${hold ? " · " + hold : ""}${DRY ? " · dry run, not written" : ""}`;
    console.log(`::${s.errors.length ? "warning" : "notice"} title=findings ${name}::${(head + " ‖ " + s.lines.join(" ‖ ")).slice(0, 4000)}`);
    if (DRY || hold) continue;
    const r = await fetch(`${SITE}/api/pack/${name}`, { method: "PUT", body: gz, headers: { Authorization: "Bearer " + JOB, "x-encoding": "gzip", "Content-Type": "application/json" } });
    if (!r.ok) throw new Error(`PUT ${name} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    const w = await r.json(); IX[name] = { sha: w.sha, bytes: w.bytes, at: Date.now() };
  }
  /* the pack index once, at the end (back-to-back index writes drop entries — job/cfbpunt.mjs) */
  if (Object.keys(IX).length) { const r = await fetch(`${SITE}/api/pack-index`, { method: "PUT", body: JSON.stringify(IX), headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" } });
    console.log(`findings: pack index ${r.ok ? "updated" : "NOT updated " + r.status} for ${Object.keys(IX).join(", ")}`) }
}
if (process.argv[1] && process.argv[1].endsWith("findings.mjs")) main().catch(e => { console.log(`::warning title=findings failed::${String(e && e.message || e).slice(0, 2000)}`); process.exit(1) });
