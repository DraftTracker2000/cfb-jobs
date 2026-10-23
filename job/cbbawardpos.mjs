/* College basketball positions the voters settled (Oct 23 — Sam: "im just unsure how there isnt a fix here if the awards clearly know what
   position they play"): the Naismith Hall of Fame position awards name a point guard, shooting guard, small forward, power forward and
   center each season, winners and their five finalists. Anyone on those lists plays that position — it beats any listing or stat rule.
   A player's other seasons take the position from his nearest award season (within 3 years). Lists from Wikipedia and the Hall of Fame's
   finalist announcements (NCAA.com, school releases). */
const POS = { cousy: "PG", west: "SG", erving: "SF", malone: "PF", kareem: "C" };
export const AWARD_LISTS = {
  cousy: { 2012: ["Kendall Marshall"], 2013: ["Trey Burke"], 2014: ["Shabazz Napier"], 2015: ["Delon Wright"], 2016: ["Tyler Ulis"], 2017: ["Frank Mason III"], 2018: ["Jalen Brunson"], 2019: ["Ja Morant"], 2020: ["Payton Pritchard"], 2021: ["Ayo Dosunmu"], 2022: ["Collin Gillespie"], 2023: ["Markquis Nowell"], 2024: ["Tristen Newton"], 2025: ["Braden Smith"], 2026: ["Darius Acuff Jr."] },
  west: { 2015: ["D'Angelo Russell"], 2016: ["Buddy Hield"], 2017: ["Malik Monk"], 2018: ["Carsen Edwards"], 2019: ["RJ Barrett"], 2020: ["Myles Powell"], 2021: ["Chris Duarte"], 2022: ["Johnny Davis"], 2023: ["Marcus Sasser"], 2024: ["RJ Davis"], 2025: ["Chaz Lanier"], 2026: ["Keaton Wagler"] },
  erving: { 2015: ["Stanley Johnson"], 2016: ["Denzel Valentine"], 2017: ["Josh Hart"], 2018: ["Mikal Bridges"], 2019: ["Rui Hachimura"], 2020: ["Saddiq Bey"], 2021: ["Corey Kispert"], 2022: ["Wendell Moore Jr."], 2023: ["Jalen Wilson"], 2024: ["Dalton Knecht"], 2025: ["Cooper Flagg"], 2026: ["AJ Dybantsa"] },
  malone: { 2015: ["Montrezl Harrell"], 2016: ["Georges Niang"], 2017: ["Johnathan Motley"], 2018: ["Deandre Ayton"], 2019: ["Zion Williamson"], 2020: ["Obi Toppin"], 2021: ["Drew Timme"], 2022: ["Keegan Murray"], 2023: ["Trayce Jackson-Davis"], 2024: ["Jaedon LeDee"], 2025: ["Johni Broome"], 2026: ["Cameron Boozer"] },
  kareem: { 2015: ["Frank Kaminsky"], 2016: ["Jakob Poltl"], 2017: ["Przemek Karnowski"], 2018: ["Angel Delgado"], 2019: ["Ethan Happ"], 2020: ["Luka Garza"], 2021: ["Luka Garza"], 2022: ["Oscar Tshiebwe"], 2023: ["Zach Edey"], 2024: ["Zach Edey"], 2025: ["Ryan Kalkbrenner"], 2026: ["Zuby Ejiofor"] } };
const nk = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const BY = {};   // name key → [[season, position], …]
for (const [aw, Y] of Object.entries(AWARD_LISTS)) for (const [y, L] of Object.entries(Y)) for (const n of L) (BY[nk(n)] = BY[nk(n)] || []).push([+y, POS[aw]]);
/* the position the awards give this player in this season, or null */
export function awardPos(name, season) {
  const L = BY[nk(name)]; if (!L) return null; let best = null, gap = 99;
  for (const [y, p] of L) { const g = Math.abs(y - season); if (g < gap || (g === gap && y >= season)) { gap = g; best = p } }
  return gap <= 3 ? best : null;
}
