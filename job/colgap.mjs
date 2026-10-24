/* College missed-game check (Oct 24 — Sam: "i thought you were using the data we had to see when the gaps started happening and then you
   could find the week it happened during the season"). For every current NFL player who records stats (OL and long snappers don't show
   up in box scores), his college team's regular-season box scores, season by season: the weeks he stopped appearing.

   Rules agreed with Sam (Oct 24):
     · he has to be established first: in 3 of the team's last 4 games, or every team game so far (at least 2)
     · a gap sits between games he played (he came back), or runs to the end of the season (season over early)
     · byes don't count (only the team's own games are looked at)
     · it can't say why, so the site labels it "missed (reason unknown)" unless Sam's hand list names the injury
     · it can't see an injury in a team's last game (nothing after it to miss) — that's what Sam's hand list is for

   Data: nflverse players.csv (college, draft year), CFBD /games?year=&seasonType=regular (one call a season, dates and opponents) and
   /games/players?year=&seasonType=regular&team= (the same path the site's college game logs use, so what this pulls is kept for good
   by the proxy and the site gets it free afterwards). About 1,300 calls the first time; nothing after that (past seasons are kept).
   Output: pack "colgap" = { colgap: { t, v: 1, p: { gsis: [name, pos, [[season, team, lastPlayed "YYYY-MM-DD", lastOpp, missed, ended,
   backDate|""], …]] }, check: [Sam's hand entries vs what the box scores say], miss: [colleges we couldn't place] } } */

import { gzipSync } from "node:zlib";
import { csvRows } from "./lib/files.mjs";

const PLAYERS = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv";
const NOSTAT = /^(T|G|C|OT|OG|OL|OC|LS|IOL)$/;
const nm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const sch = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\bst\.?$/, "state").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const ALIAS = { "miami(fl)": "Miami", "miamifl": "Miami", "southerncalifornia": "USC", "centralflorida": "UCF", "mississippi": "Ole Miss", "louisianastate": "LSU",
  "texaschristian": "TCU", "brighamyoung": "BYU", "southernmethodist": "SMU", "alabamabirmingham": "UAB", "texaselpaso": "UTEP", "texassanantonio": "UTSA",
  "nevadalasvegas": "UNLV", "northcarolinastate": "NC State", "floridainternational": "Florida International", "fiu": "Florida International", "massachusetts": "UMass", "connecticut": "UConn",
  "hawaii": "Hawai'i", "sanjosestate": "San José State", "louisianalafayette": "Louisiana", "louisianamonroe": "UL Monroe", "southernmississippi": "Southern Miss",
  "middletennesseestate": "Middle Tennessee", "bowlinggreenstate": "Bowling Green", "cal": "California", "pittsburgh": "Pittsburgh", "pitt": "Pittsburgh",
  "miamioh": "Miami (OH)", "ncstate": "NC State", "olemiss": "Ole Miss", "southflorida": "South Florida", "usf": "South Florida", "floridaatlantic": "Florida Atlantic",
  "texasaandm": "Texas A&M", "texasam": "Texas A&M", "williamandmary": "William & Mary", "northdakotastate": "North Dakota State" };

export async function buildColGap({ site, token, hand = [], log = console.log, minLeft = 10000 }) {
  const H = { headers: { Authorization: "Bearer " + token } };
  let calls = 0;
  const cf = async path => { for (let k = 0; k < 3; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) { if (!r.headers.get("x-kept")) calls++; return r.json() } if (r.status === 429) await new Promise(r => setTimeout(r, 5000)) } catch (e) { } await new Promise(r => setTimeout(r, 1500)) } return null };
  const left = async () => { const j = await cf("/info"); return j && j.remainingCalls != null ? +j.remainingCalls : null };
  const now = new Date(), cur = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

  /* who: current NFL players who show up in box scores */
  const R = csvRows(await (await fetch(PLAYERS, { redirect: "follow" })).text()), h = R[0], c = k => h.indexOf(k);
  const P = [];
  for (let i = 1; i < R.length; i++) { const x = R[i]; const last = +x[c("last_season")]; if (!(last >= cur)) continue; const pos = x[c("position")] || "";
    if (NOSTAT.test(pos) || !x[c("college_name")]) continue; const dy = +x[c("draft_year")] || +x[c("rookie_season")]; if (!dy) continue;
    P.push({ g: x[c("gsis_id")], n: x[c("display_name")], pos, col: x[c("college_name")], dy }) }
  /* Sam's hand list: his schools too (transfers), keyed by name */
  const handTeams = {};
  for (const e of hand) { const m = /^Practice \(([^)]+)\)|^Spring practice \(([^)]+)\)|^Off the field \(([^)]+)\)|^(.+?) (?:vs|at)\.? /.exec(e.game || ""); const t = m && (m[1] || m[2] || m[3] || m[4]);
    if (t) (handTeams[nm(e.name)] = handTeams[nm(e.name)] || new Set()).add(t.trim()) }

  /* seasons: dates and opponents, and the names CFBD uses for schools */
  const yrs = new Set(); for (const p of P) for (let y = p.dy - 5; y < p.dy; y++) if (y >= 2004 && y <= cur - 0 && y < cur + 1) yrs.add(y);
  const G = {}, names = new Map();
  for (const y of [...yrs].sort()) { const L = await cf(`/games?year=${y}&seasonType=regular`); G[y] = {};
    for (const g of L || []) { const hT = g.homeTeam || g.home_team, aT = g.awayTeam || g.away_team; G[y][g.id] = { id: g.id, dt: (g.startDate || g.start_date || "").slice(0, 10), h: hT, a: aT, done: g.completed !== false };
      names.set(sch(hT), hT); names.set(sch(aT), aT) } }
  const team = s => { const k = sch(s); return ALIAS[k] || names.get(k) || (ALIAS[k.replace(/state$/, "st")]) || null };
  const miss = new Set();

  /* team-seasons needed */
  const need = new Map();   // "team|y" -> [player]
  for (const p of P) { const T = new Set(); for (const c of String(p.col).split(";").map(x => x.trim()).filter(Boolean)) { const t0 = team(c); if (t0) T.add(t0); else miss.add(c) }   /* transfers: nflverse lists every school, "Georgia Tech; Alabama" */
    for (const t of handTeams[nm(p.n)] || []) { const tt = team(t); if (tt) T.add(tt) }
    for (const t of T) for (let y = p.dy - 5; y < p.dy; y++) if (G[y]) { const k = t + "|" + y; (need.get(k) || need.set(k, []).get(k)).push(p) } }
  log(`college gaps: ${P.length} players · ${need.size} team-seasons · ${miss.size} colleges not placed`);

  const out = {};
  let n = 0, l0 = await left(), stopped = false;
  const keys = [...need.keys()];
  for (let i = 0; i < keys.length; i += 4) {
    if (l0 != null && i && i % 200 === 0) { const l = await left(); if (l != null && l < minLeft) { stopped = true; log(`college gaps: stopped at ${i}/${keys.length}, ${l} calls left`); break } }
    await Promise.all(keys.slice(i, i + 4).map(async k => {
      const [t, ys] = k.split("|"), y = +ys; const bx = await cf(`/games/players?year=${y}&seasonType=regular&team=${encodeURIComponent(t)}`); n++;
      if (!bx) return;
      const played = {};   // name key -> Set(game id)
      for (const g of bx) for (const tm of g.teams || []) { if (tm.team !== t) continue;
        for (const cat of tm.categories || []) for (const ty of cat.types || []) for (const a of ty.athletes || []) { const key = nm(a.name); (played[key] = played[key] || new Set()).add(String(g.id)) } }
      /* the team's own finished games, in order (byes simply aren't there); a game with no box score at all is left out too */
      const have = new Set(bx.map(g => String(g.id)));
      const sched = Object.values(G[y]).filter(g => (g.h === t || g.a === t) && g.done && have.has(String(g.id))).sort((a, b) => a.dt.localeCompare(b.dt));
      for (const p of need.get(k)) { const S = played[nm(p.n)]; if (!S || !S.size) continue;
        const on = sched.map(g => S.has(String(g.id)));
        let j = 0;
        while (j < on.length) {
          if (on[j]) { j++; continue }
          const prev = on.slice(Math.max(0, j - 4), j), est = (prev.length >= 4 && prev.filter(Boolean).length >= 3) || (j >= 2 && on.slice(0, j).every(Boolean));
          let e = j; while (e < on.length && !on[e]) e++;
          if (est) { const last = sched[j - 1], back = sched[e];
            (out[p.g] = out[p.g] || [p.n, p.pos, []])[2].push([y, t, last.dt, last.h === t ? last.a : last.h, e - j, e >= on.length ? 1 : 0, back ? back.dt : ""]) }
          j = e }
      }
    }));
  }

  /* Sam's hand list against the box scores */
  const check = [];
  for (const e of hand) { const d = e.date || "", yy = +d.slice(0, 4), mo = +d.slice(5, 7), szn = mo <= 2 ? yy - 1 : yy;
    const rec = Object.values(out).find(r => nm(r[0]) === nm(e.name)); const gaps = rec ? rec[2].filter(g => g[0] === szn) : [];
    const t0 = Date.parse(d) || 0;
    const best = gaps.sort((a, b) => Math.abs(Date.parse(a[2]) - t0) - Math.abs(Date.parse(b[2]) - t0))[0];
    check.push([e.name, d, e.missed, best ? [best[2], best[3], best[4], best[5], best[6]] : null, gaps.length]) }

  return { p: out, check, miss: [...miss].sort(), calls, teamSeasons: n, stopped, players: P.length };
}

export async function uploadColGap({ api, data }) {
  const name = `p${new Date().getUTCFullYear()}_colgap`;
  const gz = gzipSync(Buffer.from(JSON.stringify({ colgap: { t: Date.now(), v: 1, ...data } })));
  const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  await api("PUT", "/api/pack-index", { body: { [name]: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
  return { name, bytes: r.bytes };
}
