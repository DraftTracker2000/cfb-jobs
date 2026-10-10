/* ── NFL pay rules for the contracts pack (Sam, Oct 2: "10000% above board") ──
   Every number here is from a public, citable source — never from Over the Cap or Spotrac.
   · CBA = the 2020 NFL–NFLPA Collective Bargaining Agreement, the NFLPA's published copy
     (nflpaweb.blob.core.windows.net/website/PDFs/CBA/March-15-2020-NFL-NFLPA-Collective-Bargaining-Agreement-Final-Executed-Copy.pdf)
   · Rookie deals as reported, one at a time, by reporters who don't credit those sites (links kept with each figure). */

export const SRC = {
  cba: "https://nflpaweb.blob.core.windows.net/website/PDFs/CBA/March-15-2020-NFL-NFLPA-Collective-Bargaining-Agreement-Final-Executed-Copy.pdf",
  cap2026: "https://www.nfl.com/news/nfl-announces-2026-salary-cap-set-at-301-2-million-per-team",
  corry2026: "https://www.cbssports.com/nfl/news/2026-nfl-draft-agents-take-rookie-contracts/",
  lions2026: "https://www.si.com/nfl/lions/onsi/detroit-lions-finalize-six-2026-draft-pick-rookie-contracts",
  texans2026: "https://www.click2houston.com/sports/2026/05/11/texans-sign-draft-picks-kamari-ramsey-494-million-lewis-bond-464-million-aiden-fisher-450-million/",
  wilsonHill: "https://x.com/AaronWilson_NFL/status/2055384814161690772",
  wilsonClark: "https://x.com/AaronWilson_NFL/status/2054637072808337661",
  wilsonIheanachor: "https://x.com/AaronWilson_NFL/status/2055379023589445870",
  wilsonAbney: "https://x.com/AaronWilson_NFL/status/2053959310397304984",
  growth2025: "https://sports.yahoo.com/article/nfl-rookie-signing-bonuses-jump-032355130.html",
  growth2024: "https://sports.yahoo.com/nfl-rookie-signing-bonuses-4-150018243.html",
  growth2023: "https://sportico.com/leagues/football/2023/nfl-draft-2023-rookie-signing-bonuses-1234721004/amp",
};

/* the salary cap by league year (only years the NFL has announced) */
export const CAP = { 2026: 301200000 };

/* CBA Article 26 §1(a): minimum Paragraph 5 salary on the Active/Inactive List, by Credited Seasons (thousands) */
const MIN_YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
const MIN_ROWS = {   // CS 0, 1, 2, 3, 4–6, 7+
  0: [610, 660, 705, 750, 795, 840, 885, 930, 975, 1020, 1065],
  1: [675, 780, 825, 870, 915, 960, 1005, 1050, 1095, 1140, 1185],
  2: [750, 850, 895, 940, 985, 1030, 1075, 1120, 1165, 1210, 1255],
  3: [825, 920, 965, 1010, 1055, 1100, 1145, 1190, 1235, 1280, 1325],
  4: [910, 990, 1035, 1080, 1125, 1170, 1215, 1260, 1305, 1350, 1395],
  7: [1050, 1075, 1120, 1165, 1210, 1255, 1300, 1345, 1390, 1435, 1480],
};
export function minSalary(year, cs) {
  const i = Math.max(0, Math.min(MIN_YEARS.length - 1, year - 2020)), row = cs >= 7 ? 7 : cs >= 4 ? 4 : Math.max(0, cs);
  return MIN_ROWS[row][i] * 1000;
}
/* CBA Article 26 §5–6: a veteran's one-year minimum ("qualifying") deal counts on the cap as the 2-Credited-Season minimum */
export const vetMinCap = year => minSalary(year, 2);

/* CBA Article 33 §3: practice squad weekly pay — categories (i)–(iii) fixed, (iv) veterans between a min and max; 18 weeks */
const PS_YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
const PS_FIXED = [8400, 9200, 11500, 12000, 12500, 13000, 13750, 14500, 15250, 16000, 16750];
const PS_VMIN = [12000, 14000, 15400, 16100, 16800, 17500, 18350, 19200, 20050, 20900, 21750];
export function psWeekly(year, accrued) {
  const i = Math.max(0, Math.min(PS_YEARS.length - 1, year - 2020));
  return accrued >= 3 ? PS_VMIN[i] : PS_FIXED[i];   // a veteran (category iv) — the low end of his range, since the deal isn't reported
}

/* ── the rookie scale ── CBA Article 7: four-year deals; year-one cap = signing bonus ÷ 4 + the rookie minimum; each later year's cap can grow
   by at most 25% of year one. Most picks through round 3 take that full 25% a year (a first-rounder's four years total 5.5 × year one);
   rounds 4–7 get the minimum salary each year. Each slot's year-one amount isn't in the CBA (the league and union set it every year), so
   it comes from 2026 deals as reported, pick by pick, and earlier classes are scaled back by how much signing bonuses grew each year
   (2026 +18.5%, 2025 +26%, 2024 +4%, 2023 +1%). [pick, signing bonus, four-year total, source] */
export const ROOKIE_2026 = [
  [1, 38111344, 57270598, "corry2026"], [2, 36223436, 54674724, "corry2026"], [3, 35022048, 53022816, "corry2026"], [4, 33649028, 51134913, "corry2026"],
  [5, 31246228, 47831063, "corry2026"], [6, 26955536, 41931362, "corry2026"], [7, 23552976, 37211592, "corry2026"], [8, 20090416, 32491822, "corry2026"],
  [9, 19918784, 32255828, "corry2026"], [10, 18974832, 30957894, "corry2026"], [11, 17515992, 28951989, "corry2026"], [13, 14941568, 25412156, "corry2026"],
  [14, 14083440, 24232230, "corry2026"], [16, 12708244, 22341335, "corry2026"], [20, 11594824, 20810383, "corry2026"], [21, 11598000, 20692000, "wilsonIheanachor"],
  [25, 10650880, 19512460, "corry2026"], [28, 10221800, 18922475, "corry2026"], [32, 8686360, 16783745, "corry2026"],
  [36, 5584000, 12904000, "texans2026"], [60, 2341000, 8114000, "wilsonHill"], [64, 2198000, 7878000, "wilsonClark"],
  [118, 1152000, 5532000, "lions2026"], [141, 575620, 4945000, "texans2026"], [157, 498900, 4878000, "wilsonAbney"], [168, 450000, 4830000, "lions2026"],
  [204, 266880, 4646000, "texans2026"], [205, 263000, 4643000, "lions2026"], [222, 194000, 4574000, "lions2026"], [243, 127568, 4507000, "texans2026"],
];
export const CLASS_SCALE = { 2026: 1, 2025: 1.185, 2024: 1.185 * 1.26, 2023: 1.185 * 1.26 * 1.04, 2022: 1.185 * 1.26 * 1.04 * 1.01 };
/* a 2026 signing bonus at any pick: straight-line between reported picks on a log scale (bonuses fall off roughly geometrically) */
export function sb2026(pick) {
  const P = ROOKIE_2026;
  if (pick <= P[0][0]) return { sb: P[0][1], exact: pick === P[0][0] };
  for (let i = 1; i < P.length; i++) if (pick <= P[i][0]) {
    const [a, sa] = P[i - 1], [b, sb] = P[i]; if (pick === b) return { sb, exact: true };
    const t = (pick - a) / (b - a); return { sb: Math.exp(Math.log(sa) + t * (Math.log(sb) - Math.log(sa))), exact: false } }
  const [a, sa] = P[P.length - 2], [b, sbb] = P[P.length - 1], slope = (Math.log(sbb) - Math.log(sa)) / (b - a);
  return { sb: Math.max(60000, sbb * Math.exp(slope * (pick - b))), exact: false };
}
/* a drafted rookie's cap hit in each year of his deal: { [year]: amount }, plus the bonus and whether it's an estimate */
export function rookieDeal(classYear, pick) {
  const s = sb2026(pick), sb = Math.round(s.sb / (CLASS_SCALE[classYear] || CLASS_SCALE[2022])), pr = sb / 4, y1 = pr + minSalary(classYear, 0), full = pick <= 100;
  const cap = {};
  for (let n = 0; n < 4; n++) { const y = classYear + n, mins = minSalary(y, n), base = full ? Math.max(mins, minSalary(classYear, 0) + n * .25 * y1) : mins; cap[y] = Math.round(pr + base) }
  return { sb, cap, est: !(s.exact && classYear === 2026) };
}
