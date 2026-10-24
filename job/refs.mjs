/* Prepares the big public data files and uploads them to the site (see src/api/ref.js
   for why). Uses the exact trimming code the server uses, so the result is identical. */

import { gzipSync } from "node:zlib";
import { trimmedFile, sleeperTrim } from "./lib/files.mjs";
import { buildDraft, buildCombine } from "./draft.mjs";

const BASE = ["nfl_draft", "nfl_draftall", "nfl_draftold", "nfl_players", "nfl_prodays", "nfl_combineoff", "sleeper", "combine"];

/* the draft list is built once a run (job/draft.mjs) and trimmed three ways like any other file */
let DRAFT = null;
const draftCsv = ctx => DRAFT = DRAFT || buildDraft(ctx);
async function make(name, ctx) {
  if (name === "combine") return { body: await buildCombine({ draftCsv: await draftCsv(ctx), log: ctx.log }), type: "text/plain; charset=utf-8" };
  if (/^nfl_draft(all|old)?$/.test(name)) { const csv = await draftCsv(ctx);
    const f = await trimmedFile(name.slice(4), {}, async () => new Response(csv, { status: 200 }));
    if (f.status !== 200) throw new Error(`${name}: ${f.status}`);
    const n = f.body.split("\n").length - 1; if (!process.env.DRAFT_TEST && n < (name === "nfl_draftold" ? 500 : name === "nfl_draft" ? 1500 : 4800)) throw new Error(`${name}: only ${n} rows — not uploaded`);
    return { body: f.body, type: "text/plain; charset=utf-8" } }
  if (name === "sleeper") {
    const r = await fetch("https://api.sleeper.app/v1/players/nfl");
    if (!r.ok) throw new Error("Sleeper " + r.status);
    return { body: JSON.stringify(sleeperTrim(await r.json())), type: "application/json" };
  }
  const m = name.match(/^nfl_(stats)_(\d{4})$/) || name.match(/^nfl_(\w+)$/);
  const f = await trimmedFile(m[1], { season: m[2] || "" });
  if (f.status === 404) return null;                      // e.g. a season that hasn't started
  if (f.status !== 200) throw new Error(`${name} source returned ${f.status}`);
  return { body: f.body, type: "text/plain; charset=utf-8" };
}

export async function refreshRefs({ site, jobToken, mode, log = console.log }) {
  const auth = { Authorization: "Bearer " + jobToken };
  /* packs for the draft builder: reads with a job session, writes with the job token */
  let sess = null; try { const r = await fetch(site + "/api/job/session", { method: "POST", headers: auth }); if (r.ok) sess = await r.json() } catch { }
  const now0 = new Date(), curYear = now0.getUTCMonth() >= 2 ? now0.getUTCFullYear() : now0.getUTCFullYear() - 1;
  const ctx = { curYear, log,
    getPack: async n => { const r = await fetch(site + "/api/pack/" + n, { headers: { Authorization: "Bearer " + (sess && sess.token) } }); return r.ok ? r.json() : null },
    putPack: async (n, obj) => { const gz = gzipSync(Buffer.from(JSON.stringify(obj))); const r = await fetch(site + "/api/pack/" + n, { method: "PUT", body: gz, headers: { ...auth, "x-encoding": "gzip", "Content-Type": "application/json" } });
      if (!r.ok) throw new Error("pack " + n + " " + r.status); const x = await r.json();
      await fetch(site + "/api/pack-index", { method: "PUT", body: JSON.stringify({ [n]: { sha: x.sha, bytes: x.bytes, at: Date.now() } }), headers: { ...auth, "Content-Type": "application/json" } }) } };
  const have = (await (await fetch(site + "/api/ref", { headers: auth })).json()).refs || {};
  const now = new Date(), nflSeason = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const stats = []; for (let y = 2006; y <= nflSeason; y++) stats.push("nfl_stats_" + y);
  const all = [...BASE, ...stats];
  const age = n => have[n] && have[n].at ? Date.now() - have[n].at : Infinity;
  const want = all.filter(n => {
    if (mode === "history") return true;
    if (!have[n]) return true;                                                  // anything missing
    if (!process.env.DRAFT_TEST && /^(nfl_draft(all|old)?|combine|nfl_combineoff)$/.test(n) && age(n) > Date.now() - Date.parse("2026-10-07T03:40:00Z")) return true;   // once: replace the PFR-sourced copies (Oct 6)
    /* last season once more only if it was last built before the season was over (March 1) — then never again (Oct 12) */
    if (mode === "weekly") return BASE.includes(n) || n === "nfl_stats_" + nflSeason || (n === "nfl_stats_" + (nflSeason - 1) && !(have[n].at >= Date.parse(`${nflSeason}-03-01T00:00:00Z`)));
    return n === "nfl_stats_" + nflSeason && age(n) > 20 * 36e5;               // live: today's NFL stats at most daily
  });
  let done = 0, skipped = 0;
  for (const name of want) {
    try {
      const f = await make(name, ctx);
      if (!f) { skipped++; continue }
      const gz = gzipSync(Buffer.from(f.body));
      const r = await fetch(`${site}/api/ref/${name}`, { method: "PUT", body: gz, headers: { ...auth, "x-encoding": "gzip", "Content-Type": f.type } });
      if (!r.ok) throw new Error(`upload ${r.status}`);
      done++;
      log(`reference ${name}: ${(gz.length / 1024).toFixed(0)} KB`);
    } catch (e) { log(`reference ${name} failed: ${e.message}`) }   // one bad source doesn't stop the run
  }
  return { refreshed: done, skipped, checked: all.length };
}
