/* One basketball game's referee line from ESPN's game summary (Oct 21 — Sam: referees "for college basketball and nba"): shared by the
   worker (every finished game it keeps) and the basketball data job (last season's games, read once).
   → [date, home abbr, away abbr, home pts, away pts, home fouls, away fouls, home FTA, away FTA, neutral 1|0, total line, home spread, officials[]]
   or null when the game isn't final or lists no officials. The spread is the home team's (negative = home favored), from ESPN's betting
   line ("ARIZ -8.5"). */
export const BB_REF_COLS = ["date", "home", "away", "hs", "as", "hF", "aF", "hFTA", "aFTA", "neutral", "total", "spread", "refs"];
export function bbRefRow(j) {
  const co = ((j && j.header && j.header.competitions) || [])[0] || {}, cs = co.competitors || [], st = ((co.status || {}).type || {}).state;
  if (st !== "post") return null;
  const off = ((j.gameInfo || {}).officials || []).map(o => String(o.displayName || o.fullName || "")).filter(Boolean);
  if (!off.length) return null;
  const side = h => cs.find(x => x.homeAway === h) || {}, H = side("home"), A = side("away"), ab = T => ((T.team || {}).abbreviation) || "";
  const tstat = (T, re) => { const tb = ((j.boxscore || {}).teams || []).find(t => String((t.team || {}).id) === String((T.team || {}).id)); const s = tb && (tb.statistics || []).find(x => re.test(x.name || ""));
    return s ? String(s.displayValue) : null };
  const n = v => { const x = parseFloat(v); return isFinite(x) ? x : null }, fta = T => { const v = tstat(T, /^freeThrowsMade-freeThrowsAttempted$/); return v && v.includes("-") ? n(v.split("-")[1]) : null };
  const pc = (j.pickcenter || [])[0] || {}; let sp = null;
  { const m = String(pc.details || "").match(/^([A-Z0-9&.'-]+)\s+(-?\d+(?:\.\d+)?)$/); if (m) { const v = +m[2]; sp = m[1] === ab(H) ? v : m[1] === ab(A) ? -v : null } else if (/^even|pk/i.test(String(pc.details || ""))) sp = 0 }
  return [String(co.date || "").slice(0, 10), ab(H), ab(A), n(H.score), n(A.score), n(tstat(H, /^fouls$/)), n(tstat(A, /^fouls$/)), fta(H), fta(A), co.neutralSite ? 1 : 0, n(pc.overUnder), sp, off];
}
