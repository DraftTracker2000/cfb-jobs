/* Read-only check (Oct 28 — Sam's item 22): the referee numbers leave NBA preseason games out (since Oct 21). Before deciding whether to
   count them, read the preseason games of the last two seasons (ESPN's scoreboard and game summaries — the same pages the refs job reads)
   and report each official's preseason line: games, home record, home-minus-away fouls a game, and total fouls a game against the
   preseason average — so any official who's lopsided in the preseason stands out. Nothing is written. */
const UA = { headers: { "User-Agent": "mycbbbigboard.com data job (referee check, read only)" } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function j(u) { for (let k = 0; k < 3; k++) { try { const r = await fetch(u, UA); if (r.ok) return await r.json(); if (r.status === 404) return null } catch { } await sleep(1500 * (k + 1)) } return null }
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
const fouls = t => { const s = (t.statistics || []).find(x => /^fouls$|^totalFouls$/i.test(x.name) || /^fouls$/i.test(x.label || "")); return s ? +String(s.displayValue).split("-")[0] : null };

export async function preRefs({ years = [2025, 2026], log = console.log } = {}) {
  const games = [];
  for (const y of years) { for (let d = new Date(Date.UTC(y, 8, 28)); d <= new Date(Date.UTC(y, 9, 22)); d.setUTCDate(d.getUTCDate() + 1)) {
      const sb = await j(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymd(d)}`); await sleep(300); if (!sb) continue;
      for (const e of sb.events || []) { if ((e.season || {}).type !== 1 || ((e.status || {}).type || {}).state !== "post") continue;
        const s = await j(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${e.id}`); await sleep(400); if (!s) continue;
        const offs = ((s.gameInfo || {}).officials || []).map(o => o.displayName || o.fullName).filter(Boolean); if (!offs.length) continue;
        const C = ((s.header || {}).competitions || [])[0] || {}, cs = C.competitors || [], H = cs.find(c => c.homeAway === "home"), A = cs.find(c => c.homeAway === "away"); if (!H || !A) continue;
        const bx = ((s.boxscore || {}).teams || []), fH = fouls(bx.find(t => String((t.team || {}).id) === String(H.id)) || {}), fA = fouls(bx.find(t => String((t.team || {}).id) === String(A.id)) || {});
        games.push({ y, id: e.id, offs, hw: +H.score > +A.score, fH, fA, intl: !!C.neutralSite }) } } }
  const fg = games.filter(g => g.fH != null && g.fA != null), avgT = fg.reduce((a, g) => a + g.fH + g.fA, 0) / (fg.length || 1), avgD = fg.reduce((a, g) => a + g.fH - g.fA, 0) / (fg.length || 1), hw = games.filter(g => g.hw).length / (games.length || 1);
  const by = {}; for (const g of games) for (const o of g.offs) { const x = by[o] = by[o] || { n: 0, hw: 0, nf: 0, d: 0, t: 0 }; x.n++; if (g.hw) x.hw++; if (g.fH != null && g.fA != null) { x.nf++; x.d += g.fH - g.fA; x.t += g.fH + g.fA } }
  const rows = Object.entries(by).map(([o, x]) => ({ o, n: x.n, hw: x.hw, d: x.nf ? x.d / x.nf : null, t: x.nf ? x.t / x.nf : null }));
  /* lopsided: 4+ games and home-minus-away fouls 4+ a game off the preseason average, or 5+ games all won (or all lost) by one side */
  const flag = rows.filter(r => r.n >= 4 && ((r.d != null && Math.abs(r.d - avgD) >= 4) || (r.n >= 5 && (r.hw === 0 || r.hw === r.n)))).sort((a, b) => Math.abs(b.d - avgD) - Math.abs(a.d - avgD));
  const sum = { games: games.length, withFouls: fg.length, officials: rows.length, avgFouls: +avgT.toFixed(1), avgHomeMinusAway: +avgD.toFixed(2), homeWin: +(100 * hw).toFixed(0),
    mostGames: rows.sort((a, b) => b.n - a.n).slice(0, 3).map(r => `${r.o} ${r.n}`), flagged: flag.map(r => `${r.o}: ${r.n} games, home ${r.hw}-${r.n - r.hw}, home−away fouls ${r.d == null ? "—" : (r.d >= 0 ? "+" : "") + r.d.toFixed(1)}, total ${r.t == null ? "—" : r.t.toFixed(1)}`) };
  log("prerefs " + JSON.stringify(sum)); return sum }
