/* Today's college basketball betting angles (Nov 19 — the owner, 1:24 pm: "why keep saying stuff you'd call short instead just fixing it";
   study hunt 79, docs/checks/college-angles-test-2026-11-19.txt). Only what held in both halves (2015–20 / 2021–26): the day's single
   biggest mismatch among games with a line, each team judged on its previous 10 games this season (5+ needed):
     rebounding (a team that rebounds a lot vs a defense that gives up a lot of rebounds) → its team total over 54.0% (55/53)
     forced turnovers (a defense that forces a lot vs an offense that gives it away) → its team total over 53.2% (54/53)
     three-point defense (a defense that allows few made threes vs an offense that makes few) → the other side covers 53.6% (53/54)
   No CBBD call: reads this season's game logs and games packs (job/cbbgames.mjs) after they're written.
   Output: pack "pYYYY_cbb-angles" = { t, v, season, day, games, team: [ { k, lab, gid, team, opp, bet, why, hit, h } ], past: { day: { team } } } */

const TESTED = [
  { k: "reb", side: "o", bet: "tt-over", hit: 54.0, h: [55, 53], lab: "Rebounding" },
  { k: "tov", side: "d", bet: "tt-over", hit: 53.2, h: [54, 53], lab: "Forced turnovers" },
  { k: "m3", side: "d", bet: "ats-other", hit: 53.6, h: [53, 54], lab: "Three-point defense" }];
const r1 = v => v == null || !isFinite(v) ? null : Math.round(v * 10) / 10;
const etDay = d => { try { return new Date(d).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) } catch { return String(d).slice(0, 10) } };

export async function buildCbbAngles({ getPack, putPack, log = console.log, S, names = {} }) {
  const [LG, GM, prev] = await Promise.all([getPack(`p${S}_cbb-logs`), getPack(`p${S}_cbb-games`), getPack(`p${S}_cbb-angles`).catch(() => null)]);
  if (!LG || !LG.teams || !GM || !GM.games) throw new Error("no game logs or games for " + S);
  const C = LG.cols.team, ix = Object.fromEntries(C.map((c, i) => [c, i])), nm = id => names[id] || String(id);
  /* each team's games in date order: mine (m3, reb, tov) and what its opponent did in the same game */
  const row = {}; for (const [t, R] of Object.entries(LG.teams)) for (const r of R) row[r[0] + "|" + t] = r;
  const H = {}; for (const [t, R] of Object.entries(LG.teams)) H[t] = R.map(r => { const o = row[r[0] + "|" + r[ix.opp]];
    return { d: r[ix.date], o: { m3: r[ix.tpm], reb: r[ix.reb], tov: r[ix.tov] }, a: { m3: o ? o[ix.tpm] : null, reb: o ? o[ix.reb] : r[ix.oppReb], tov: o ? o[ix.tov] : r[ix.oppTov] } } });
  const mean = (A, f) => { const v = A.map(f).filter(x => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  const form = (t, day) => { const A = (H[t] || []).filter(x => x.d < day).slice(-10); if (A.length < 5) return null; const o = { n: A.length };
    for (const m of ["m3", "reb", "tov"]) { o["o_" + m] = mean(A, x => x.o[m]); o["d_" + m] = mean(A, x => x.a[m]) } return o };
  /* the next day with games still to play that have a line */
  const today = etDay(Date.now()), open = GM.games.filter(g => g.hs == null && g.st !== "final" && g.ln && g.ln.sp != null && etDay(g.d) >= today);
  const day = open.length ? open.map(g => etDay(g.d)).sort()[0] : null, DG = day ? open.filter(g => etDay(g.d) === day) : [];
  const Sd = []; for (const g of DG) for (const [t, o, h] of [[g.h, g.a, 1], [g.a, g.h, 0]]) { const L = form(t, day), O = form(o, day); if (!L || !O) continue;
    const sp = h ? g.ln.sp : -g.ln.sp, ou = g.ln.ou != null ? +g.ln.ou : null; Sd.push({ g, t, o, sp, ou, imp: ou != null ? (ou - sp) / 2 : null, L, O }) }
  const z = arr => { const v = arr.filter(x => x != null), m = v.reduce((a, b) => a + b, 0) / (v.length || 1), s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)) || 1; return arr.map(x => x == null ? null : (x - m) / s) };
  /* side "o": my offense strong vs their defense bad at stopping it · side "d": my defense strong vs their offense weak (turnovers count against the offense) */
  const score = A => { const sg = A.k === "tov" ? -1 : 1;
    const a = z(Sd.map(s => A.side === "o" ? (s.L["o_" + A.k] == null ? null : sg * s.L["o_" + A.k]) : (s.L["d_" + A.k] == null ? null : -sg * s.L["d_" + A.k])));
    const b = z(Sd.map(s => A.side === "o" ? (s.O["d_" + A.k] == null ? null : sg * s.O["d_" + A.k]) : (s.O["o_" + A.k] == null ? null : -sg * s.O["o_" + A.k])));
    return Sd.map((s, i) => a[i] == null || b[i] == null ? null : a[i] + b[i]) };
  const f1 = v => v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1);
  const why = (A, s) => A.k === "reb" ? `${nm(s.t)} grabs ${f1(s.L.o_reb)} boards a game · ${nm(s.o)} allows ${f1(s.O.d_reb)}`
    : A.k === "tov" ? `${nm(s.t)} forces ${f1(s.L.d_tov)} turnovers · ${nm(s.o)} gives it away ${f1(s.O.o_tov)}` : `${nm(s.t)} allows ${f1(s.L.d_m3)} made threes · ${nm(s.o)} makes ${f1(s.O.o_m3)}`;
  const team = [];
  for (const A of TESTED) { const v = score(A), i = v.reduce((b, x, j) => x != null && (b < 0 || x > v[b]) ? j : b, -1); if (i < 0) continue; const s = Sd[i];
    if (A.bet === "tt-over" && s.imp == null) continue;
    const bet = A.bet === "tt-over" ? { t: "tt", side: nm(s.t), dir: "over", line: Math.round(s.imp * 2) / 2 } : { t: "ats", side: nm(s.o), line: -s.sp };
    team.push({ k: A.k + "-" + A.bet, lab: A.lab, gid: s.g.id, team: nm(s.t), opp: nm(s.o), tid: s.t, oid: s.o, bet, why: why(A, s), hit: A.hit, h: A.h }) }
  /* grade earlier days */
  const past = Object.assign({}, (prev && prev.past) || {});
  if (prev && prev.day && prev.day !== day && (prev.team || []).length) past[prev.day] = { team: prev.team };
  const byId = Object.fromEntries(GM.games.map(g => [g.id, g])), cmp = (a, b) => a > b ? 1 : a < b ? 0 : null;
  for (const d in past) for (const a of past[d].team || []) { if (a.r === 0 || a.r === 1) continue; const g = byId[a.gid]; if (!g || g.hs == null) continue;
    const pts = id => +id === +g.h ? g.hs : g.as, me = a.bet.t === "ats" ? a.oid : a.tid, them = +me === +g.h ? g.a : g.h;
    a.r = a.bet.t === "ats" ? cmp(pts(me) - pts(them) + a.bet.line, 0) : cmp(pts(me), a.bet.line) }
  const out = { t: Date.now(), v: 1, season: S, day, games: DG.map(g => ({ id: g.id, h: g.h, a: g.a, home: nm(g.h), away: nm(g.a), sp: g.ln.sp, ou: g.ln.ou })), team, past };
  await putPack(`p${S}_cbb-angles`, out);
  log(`angles: ${day || "no day"} · ${DG.length} games with a line · ${Sd.length} sides with 5+ games · ${team.length} angles${team.length ? " — " + team.map(a => `${a.lab}: ${a.bet.side} ${a.bet.t === "tt" ? "over " + a.bet.line : (a.bet.line > 0 ? "+" : "") + a.bet.line}`).join(" | ") : ""} · ${Object.keys(past).length} past days`);
  return out;
}
