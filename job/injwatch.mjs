/* probe (Oct 25 — Sam: "the games are over and we had all the play by play from yesterday. you should have all the tools to check"):
   the 2026 watch-list injuries, checked the same way as the skill players — each of his team's games this season, whether he's in the
   box score (defenders record tackles), and, for the last three games, every play-by-play line that names him (a lineman only shows up
   there, on penalties). */
const WATCH = [["Colin Simmons", "Texas"], ["Wendell Moe", "Tennessee"], ["Polo Anderson", "Clemson"], ["Elliott Schaper", "Duke"], ["Quay'sheed Scott", "South Carolina"]];
const nm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
export async function run({ site, token }) {
  const H = { headers: { Authorization: "Bearer " + token } };
  const cf = async path => { for (let k = 0; k < 3; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) return r.json() } catch (e) {} await new Promise(z => setTimeout(z, 2000)) } return null };
  const out = [];
  for (const [who, team] of process.env.PI != null ? [WATCH[+process.env.PI]] : WATCH) {
    const key = nm(who), last = who.split(" ").slice(-1)[0];
    const G = ((await cf(`/games?year=2026&seasonType=regular&team=${encodeURIComponent(team)}`)) || []).filter(g => g.completed).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    const BX = (await cf(`/games/players?year=2026&seasonType=regular&team=${encodeURIComponent(team)}`)) || [];
    const rows = [];
    for (const g of G) {
      const b = BX.find(x => x.id === g.id), tm = b && (b.teams || []).find(t => t.team === team); const st = [];
      for (const c of (tm && tm.categories) || []) for (const ty of c.types || []) for (const a of ty.athletes || []) if (nm(a.name) === key && a.stat !== "0") st.push(`${c.name}.${ty.name}=${a.stat}`);
      const opp = g.homeTeam === team ? "vs " + g.awayTeam : "at " + g.homeTeam;
      rows.push([String(g.startDate).slice(0, 10), "wk" + g.week, opp, b ? (tm ? (st.length ? st.slice(0, 6).join(" ") : "not in box") : "no team box") : "no box"]);
    }
    const pbp = [];
    for (const g of G.slice(-3)) { const P = (await cf(`/plays?year=2026&week=${g.week}&team=${encodeURIComponent(team)}&seasonType=regular`)) || [];
      for (const p of P) if (new RegExp(last.replace(/'/g, ".?"), "i").test(p.playText || "")) pbp.push(`wk${g.week} Q${p.period} ${p.clock ? `${p.clock.minutes}:${String(p.clock.seconds).padStart(2, "0")}` : ""} ${String(p.playText).slice(0, 140)}`) }
    out.push({ who, team, rows, pbp: pbp.slice(-12) });
  }
  return out;
}
