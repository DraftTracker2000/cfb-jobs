/* MODE=release (Nov 8, 2026 — the data save; the owner, 3:43 pm: "go forward with how you plan to release data. i just don't want the site to lose
   anything data points wise"). Deletes the packs on job/release-list.json — the college football study archive and builder-cache packs the
   coverage check (probe kvcover, docs/DATA-SAVE.md) found also kept by the CFBD proxy — and nothing else. Each one is checked again just before:
     study pack: every non-empty answer in it (or, for the plays/box/context packs, every CFBD path it holds) must be in the proxy's kept copy
                 ("past:cfbd<path>", listed through /api/kv-keys); one miss and the pack stays
     builder pack: its name must be the page's own name for a path the proxy keeps (p<year>_bc-api1-<apiHash(path)>)
   The run's dry box lists what would go and deletes nothing. Every name deleted is printed in the run log. */
import { readFileSync } from "node:fs";
import { ctxPaths, boxPath } from "./cfbarchive.mjs";

const finY = (p, cur) => { if (/^\/(info|live|scoreboard)/.test(p) || /minYear|maxYear|startYear|endYear/.test(p)) return 0; const m = String(p).match(/[?&]year=(\d{4})(?!\d)/); const y = m ? +m[1] : 0; return y && y < cur && y >= 1990 ? y : 0 };
const apiHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(36) };
const empty = a => a == null || (Array.isArray(a) && !a.length) || (typeof a === "object" && !Array.isArray(a) && !Object.keys(a).length);
/* the CFBD paths a context pack holds, written by the archive's own path list (job/cfbarchive.mjs) */
const ctxHeld = (y, j) => ctxPaths(y).filter(([k, sub]) => !empty(sub ? (j[k] || {})[sub] : j[k])).map(([, , p]) => p);
export async function runRelease({ site, token, job, dry, log = console.log }) {
  const L = JSON.parse(readFileSync(new URL("./release-list.json", import.meta.url), "utf8"));
  const H = { headers: { Authorization: "Bearer " + token } }, cur = new Date().getUTCMonth() >= 7 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  const kv = new Set(); let c = null, pages = 0;
  do { const r = await fetch(`${site}/api/kv-keys?prefix=${encodeURIComponent("past:cfbd")}${c ? "&cursor=" + encodeURIComponent(c) : ""}`, H); if (!r.ok) throw new Error("kv-keys " + r.status);
    const j = await r.json(); for (const k of j.keys) kv.add(k.slice(9)); c = j.cursor; pages++ } while (c && pages < 500);
  log(`release: the proxy keeps ${kv.size} finished-season answers`);
  const bcCov = new Set(); for (const p of kv) { const y = finY(p, cur); if (y) bcCov.add(`p${y}_bc-api1-${apiHash(p)}`) }
  const ok = [], keep = [];
  for (const n of L.study) {
    let j = null; try { const r = await fetch(`${site}/api/pack/${n}`, H); if (r.status === 404) { keep.push([n, "already gone"]); continue } if (!r.ok) { keep.push([n, "read " + r.status]); continue } j = await r.json() } catch (e) { keep.push([n, "read failed"]); continue }
    const y = +n.slice(1, 5); let paths = [];
    if (j && j.study && j.study.answers) paths = Object.entries(j.study.answers).filter(([, a]) => !empty(a)).map(([p]) => p);
    else if (j && j.path && j.plays) paths = j.plays.length ? [j.path] : [];
    else if (j && j.weeks) paths = Object.entries(j.weeks).filter(([, a]) => !empty(a)).map(([w]) => boxPath(y, w));
    else if (j && (j.games || j.drives)) paths = ctxHeld(y, j);
    else { keep.push([n, "unknown shape"]); continue }
    const miss = paths.filter(p => !kv.has(p));
    if (miss.length) keep.push([n, `${miss.length} answer(s) not kept: ${miss[0]}`]); else ok.push(n) }
  for (const n of L.bc) { if (bcCov.has(n)) ok.push(n); else keep.push([n, "not matched to a kept answer"]) }
  log(`release: ${ok.length} packs pass the check, ${keep.length} stay`); for (const [n, w] of keep) log(`  stays: ${n} — ${w}`);
  let deleted = 0;
  for (let i = 0; i < ok.length; i += 100) {
    const r = await fetch(`${site}/api/pack-release`, { method: "POST", headers: { Authorization: "Bearer " + job, "Content-Type": "application/json" }, body: JSON.stringify({ names: ok.slice(i, i + 100), dry }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error("pack-release " + r.status + " " + JSON.stringify(j).slice(0, 200));
    deleted += j.deleted.length; for (const n of j.deleted) log(`  ${dry ? "would release" : "released"}: ${n}`); for (const [n, w] of j.skipped) log(`  skipped: ${n} — ${w}`) }
  return { checked: L.study.length + L.bc.length, passed: ok.length, stayed: keep.length, deleted, dry };
}
