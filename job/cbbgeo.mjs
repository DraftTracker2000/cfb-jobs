/* Where college basketball games are played (Oct 21 — Sam: "should we also add a travel box to the basketball side and then that's where
   you could put the back to back information"). Every Division I home city and every game city of last season and this one, as
   [latitude, longitude, time zone], in p2000_cbb-geo — so a game page can say how far each team traveled since its last game and how many
   time zones it crossed. Looked up in GeoNames' free list of every town of 1,000+ people (cities1000, CC BY 4.0); the list is only
   downloaded when a city we haven't placed yet shows up. */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* places the schedule names in a way GeoNames doesn't */
const ALIAS = { "Cancun": ["Cancún", "MX"], "Nassau": ["Nassau", "BS"], "George Town": ["George Town", "KY"], "Maui, HI": ["Kahului", "US", "HI"], "Lahaina, HI": ["Kahului", "US", "HI"],
  "Saint Thomas, Virgin Islands": ["Charlotte Amalie", "VI"], "Charlotte Amalie, Virgin Islands": ["Charlotte Amalie", "VI"], "Moon Township, PA": ["Coraopolis", "US", "PA"],
  "New York, NY": ["New York City", "US", "NY"], "Bronx, NY": ["New York City", "US", "NY"], "Villanova, PA": ["Bryn Mawr", "US", "PA"], "University Park, PA": ["State College", "US", "PA"],
  "South Easton, MA": ["Brockton", "US", "MA"], "Lorman, MS": ["Port Gibson", "US", "MS"], "Stateline, NV": ["South Lake Tahoe", "US", "CA"],
  "Paradise Island": ["Nassau", "BS"], "Montego Bay": ["Montego Bay", "JM"], "Riviera Maya": ["Playa del Carmen", "MX"] };
const COUNTRY = { "italy": "IT", "virgin islands": "VI", "bahamas": "BS", "mexico": "MX", "jamaica": "JM", "cayman islands": "KY", "puerto rico": "PR", "canada": "CA", "ireland": "IE", "germany": "DE", "france": "FR", "spain": "ES", "japan": "JP", "australia": "AU", "england": "GB", "united kingdom": "GB" };
const CA_PROV = { PQ: "10", QC: "10", ON: "08", BC: "02", AB: "01", MB: "03", NS: "07", NB: "04" };
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^st\.? /, "saint ").replace(/^ft\.? /, "fort ").replace(/[^a-z0-9 ]/g, "").trim();

function loadGeoNames(log) {
  const dir = mkdtempSync(join(tmpdir(), "geo-")), zip = join(dir, "c.zip");
  execFileSync("curl", ["-sSfL", "-o", zip, "https://download.geonames.org/export/dump/cities1000.zip"], { stdio: "inherit" });
  const txt = execFileSync("unzip", ["-p", zip, "cities1000.txt"], { maxBuffer: 512 << 20 }).toString("utf8");
  const by = new Map(); let n = 0;
  for (const line of txt.split("\n")) { const f = line.split("\t"); if (f.length < 18) continue; n++;
    const rec = { lat: +f[4], lon: +f[5], cc: f[8], a1: f[10], pop: +f[14] || 0, tz: f[17] };
    for (const nm of new Set([norm(f[1]), norm(f[2])])) { if (!nm) continue; const L = by.get(nm); if (L) L.push(rec); else by.set(nm, [rec]) } }
  log(`geo: GeoNames list read, ${n} places`); return by;
}

function place(by, city) {
  let nm, cc = null, a1 = null; const al = ALIAS[city];
  if (al) [nm, cc, a1] = al;
  else { const m = String(city).split(/,\s*/); nm = m[0]; const tail = (m[1] || "").trim();
    if (/^[A-Z]{2}$/.test(tail)) { if (CA_PROV[tail]) { cc = "CA"; a1 = CA_PROV[tail] } else { cc = "US"; a1 = tail === "DC" ? "DC" : tail } }
    else if (tail) cc = COUNTRY[tail.toLowerCase()] || null }
  const L = (by.get(norm(nm)) || []).filter(r => (!cc || r.cc === cc) && (!a1 || r.a1 === a1));
  if (!L.length) return null; const r = L.sort((a, b) => b.pop - a.pop)[0];
  return [Math.round(r.lat * 1e3) / 1e3, Math.round(r.lon * 1e3) / 1e3, r.tz];
}

export async function buildGeo({ getPack, putPack, log = console.log, cities }) {
  let P = await getPack("p2000_cbb-geo").catch(() => null); if (!P || P.v !== 1) P = { v: 1, c: {}, miss: {} };
  const want = [...new Set(cities.filter(Boolean))], wk = Date.now() - 7 * 864e5;
  const todo = want.filter(c => !P.c[c] && (ALIAS[c] || !(P.miss[c] > wk)));   /* a city we couldn't place is tried again after a week */
  if (!todo.length) { log(`geo: ${Object.keys(P.c).length} places, nothing new`); return P }
  let by; try { by = loadGeoNames(log) } catch (e) { log("geo: GeoNames download failed — " + e.message); return P }
  let got = 0; for (const c of todo) { const x = place(by, c); if (x) { P.c[c] = x; delete P.miss[c]; got++ } else P.miss[c] = Date.now() }
  P.at = Date.now(); await putPack("p2000_cbb-geo", P);
  log(`geo: placed ${got} of ${todo.length} new · ${Object.keys(P.c).length} in all${Object.keys(P.miss).length ? ` · not found: ${Object.keys(P.miss).slice(0, 12).join("; ")}` : ""}`);
  return P;
}
