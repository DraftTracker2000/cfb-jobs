/* College tacklers (Oct 28 — the owner approved the sportsdataverse ESPN play participants data). One CSV per season on GitHub
   (release "espn_cfb_play_participants", play_participants_{season}.csv, 2014 on, 25–40 MB): one line per ESPN play with who ran, threw,
   caught, returned, tackled, sacked and broke up the pass. ESPN-derived, so it sits on the flag list with the rest of ESPN.

   Ids: ESPN's athlete ids are CFBD's player ids, so a line joins straight to our college players. Measured Oct 28 against cfbfastR's
   copy of CFBD's plays (same plays, one-to-one): rusher 99.9%, passer 98.4–100%, receiver 98.1–98.6%, sacker 99.6–100% the same id,
   2014 and 2024. Game ids are CFBD's game ids. Play ids line up with CFBD's long play ids as far as that copy can show (it keeps them
   rounded to 15 digits, so plays one or two apart can't be told apart there); an exact check needs CFBD's own /plays ids.

   How ESPN marks a tackle: a solo tackle → tackler_player_id; a shared tackle → both players in assisted_by_player_ids (the two never
   appear on the same play). So tk = solo, ast = shared, tot = tk + ast (the box score's total). A shared sack is half a sack each.
   The file has no team, down or distance. Run / pass comes from who's on the play (a rusher and no passer = run; a passer, receiver
   or sacker = pass; a returner, punter or kicker = kicks and returns, "ot"). Stops need the play's down, distance and yards, so
   they're counted only when a plays(season) lookup is passed in: Map of ESPN play id → [down, distance, yardsGained].
   A stop = a run or pass tackle for no gain or a loss, or short of the line to gain on 3rd or 4th down.

   Coverage (measured Oct 28): every FBS game is in the file, but early seasons name few tacklers (2014: 315 of 706 FBS-vs-FBS games
   have 20+ tackle plays; 2024: 673 of 798). Check audit.gTk before showing a season.

   Pack p{season}_cfbtkl (not wired yet): { v:1, season, cols:[...], p: { espnId: [name, g, tk, ast, tot, sk, pd, rt, pt, ot, (stop, jn)] }, audit }
     g     games with any tackle, sack or pass defended credit
     rt/pt/ot  tackle credits (solo + shared) on runs / passes and sacks / kicks, returns and the rest; rt + pt + ot = tot
     stop  stops (only with plays); jn = his run/pass tackle credits that found their play, so stop/jn is the rate */
import { csvStream } from "./cbbnba.mjs";

export const TKL_URL = y => `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_cfb_play_participants/play_participants_${y}.csv`;
const NEED = ["game_id", "play_id", "tackler_player_id", "tackler_player_names", "assisted_by_player_ids", "assisted_by_player_names",
  "sacked_by_player_ids", "sacked_by_player_names", "pass_defender_player_ids", "pass_defender_player_names", "rusher_player_ids",
  "passer_player_ids", "receiver_player_ids", "returner_player_ids", "punter_player_ids", "kicker_player_ids"];
/* "['4694312' '5153851']" → ["4694312", "5153851"] (the list columns are Python-style; names can carry an apostrophe, then they're in "") */
const list = s => !s || s === "[]" ? [] : [...s.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2]);
const r1 = v => Math.round(v * 10) / 10;

/* one season's lines → the pack; rows = async iterable of field arrays (header first) */
export async function tacklersOfRows(rows, season, playMap = null) {
  let I = null; const P = {}, A = { plays: 0, kind: { run: 0, pass: 0, ot: 0 }, tkPlays: { run: 0, pass: 0, ot: 0 }, games: 0, gTk: 0, joined: 0, tkRP: 0 };
  const G = {};
  const pl = (id, nm) => { const x = P[id] = P[id] || { n: nm || "", g: new Set(), tk: 0, ast: 0, sk: 0, pd: 0, rt: 0, pt: 0, ot: 0, stop: 0, jn: 0 }; if (nm) x.n = nm; return x };
  for await (const f of rows) {
    if (!I) { I = {}; f.forEach((h, i) => I[String(h).trim()] = i); const miss = NEED.filter(k => !(k in I)); if (miss.length) throw new Error(`play participants ${season}: columns missing: ${miss.join(", ")}`); continue }
    if (f.length < 2) continue;
    A.plays++; const gid = f[I.game_id], gs = G[gid] = G[gid] || { tk: 0 };
    const has = k => list(f[I[k + "_player_ids"]]).length > 0;
    const sackIds = list(f[I.sacked_by_player_ids]), kind = has("returner") || has("punter") || has("kicker") ? "ot" : sackIds.length || has("passer") || has("receiver") ? "pass" : has("rusher") ? "run" : "ot";
    A.kind[kind]++;
    const solo = f[I.tackler_player_id], soloN = list(f[I.tackler_player_names])[0], shared = list(f[I.assisted_by_player_ids]), sharedN = list(f[I.assisted_by_player_names]);
    const credits = []; if (solo) credits.push([solo, soloN, "tk"]); shared.forEach((id, i) => { if (id && id !== solo) credits.push([id, sharedN[i], "ast"]) });
    let pm = null; if (credits.length && kind !== "ot" && playMap) { pm = playMap.get(String(f[I.play_id])) || null; A.tkRP++; if (pm) A.joined++ }
    const stop = pm && pm[2] != null && (pm[2] <= 0 || (pm[0] >= 3 && pm[1] != null && pm[2] < pm[1]));
    if (credits.length) { A.tkPlays[kind]++; gs.tk++ }
    for (const [id, nm, k] of credits) { const x = pl(id, nm); x[k]++; x.g.add(gid); x[kind === "run" ? "rt" : kind === "pass" ? "pt" : "ot"]++; if (pm) { x.jn++; if (stop) x.stop++ } }
    const skN = list(f[I.sacked_by_player_names]); sackIds.forEach((id, i) => { const x = pl(id, skN[i]); x.sk += 1 / sackIds.length; x.g.add(gid) });
    const pdN = list(f[I.pass_defender_player_names]); list(f[I.pass_defender_player_ids]).forEach((id, i) => { const x = pl(id, pdN[i]); x.pd++; x.g.add(gid) });
  }
  if (!I) throw new Error(`play participants ${season}: empty file`);
  A.games = Object.keys(G).length; A.gTk = Object.values(G).filter(g => g.tk >= 20).length;
  const withStops = !!playMap, cols = ["name", "g", "tk", "ast", "tot", "sk", "pd", "rt", "pt", "ot", ...(withStops ? ["stop", "jn"] : [])], p = {};
  for (const [id, x] of Object.entries(P)) p[id] = [x.n, x.g.size, x.tk, x.ast, x.tk + x.ast, r1(x.sk), x.pd, x.rt, x.pt, x.ot, ...(withStops ? [x.stop, x.jn] : [])];
  return { v: 1, season, cols, p, audit: A };
}

/* every season asked for → [pack, …]; a season whose file isn't out (404) is skipped.
   plays: optional async season → Map(ESPN play id → [down, distance, yardsGained]) for stops; leave it out and the stop columns aren't there */
export async function buildTacklers({ years, fetchFn = fetch, log = console.log, plays = null }) {
  const out = [];
  for (const y of years) {
    const t0 = Date.now(); let r;
    try { r = await fetchFn(TKL_URL(y), { redirect: "follow" }) } catch (e) { log(`tacklers ${y}: ${e.message}`); continue }
    if (!r || r.status === 404) { log(`tacklers ${y}: no file`); continue }
    if (!r.ok || !r.body) { log(`tacklers ${y}: HTTP ${r.status}`); continue }
    let M = null; if (plays) { try { M = await plays(y) } catch (e) { log(`tacklers ${y}: plays lookup failed (${e.message}), no stops this season`) } }
    /* decoded with one streaming decoder, so a name's accented letter split across two chunks stays whole */
    const pack = await tacklersOfRows(csvStream(r.body.pipeThrough(new TextDecoderStream())), y, M);
    const a = pack.audit; log(`tacklers ${y}: ${a.plays} plays · ${a.tkPlays.run + a.tkPlays.pass + a.tkPlays.ot} with a tackle · ${Object.keys(pack.p).length} players · ${a.gTk}/${a.games} games with 20+ tackle plays${M ? ` · ${a.joined}/${a.tkRP} run/pass tackle plays found their play` : ""} · ${Math.round((Date.now() - t0) / 1000)}s`);
    out.push(pack);
  }
  return out;
}
