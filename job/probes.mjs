/* The probes job/probe.mjs runs (MODE=probe). Each: name, page, optional ready selector / widths / settle ms, and `run` — the body of an
   async function evaluated in the page (w(ms) waits, W is the width). Return {ok, ...whatever helps}. Keep results short. */
const res = `const R=()=>performance.getEntriesByType("resource").map(e=>decodeURIComponent(e.name));`;
export const PROBES = [
  { name: "trend-file", page: "/lab/", widths: [390], run: `${res}
    tab="CTREND";render();for(let i=0;i<40&&!CT_DATA;i++)await w(500);await w(1500);
    const L=R(),ct=L.filter(u=>/\\/api\\/pack\\/p\\d{4}_ct/.test(u)).length,live=L.filter(u=>/stats\\/player\\/season/.test(u)).length;
    return {ok:!!CT_DATA&&!CT_DATA.none&&ct>0&&live===0,week:CT_DATA&&CT_DATA.W,packReads:ct,liveCalls:live,cards:document.querySelectorAll("#empty .pcard").length}` },
  { name: "calendar", page: "/lab/", widths: [390], run: `const C=await h2hCal();return {ok:true,now:new Date().toISOString(),cur:C.cur&&C.cur.week,weeks:H2H_CAL.slice(0,12).map(w=>[w.week,w.seasonType,w.startDate,w.endDate,w.lastGameStart].join(" "))}` },
  /* what a few CFBD lists look like (one call each, through the site's shared proxy) */
  { name: "shapes", page: "/lab/", widths: [390], run: `const sh=v=>{const x=Array.isArray(v)?v[0]:v;return {n:Array.isArray(v)?v.length:null,first:JSON.stringify(x).slice(0,420)}};const o={ok:true};
    for(const [k,p] of [["ppa","/ppa/players/season?year=2026&team=Ohio%20State"],["portal","/player/portal?year=2026"],["srs","/ratings/srs?year=2026"],["spconf","/ratings/sp/conferences?year=2026"],["lines","/lines?year=2026&week=6&team=Georgia"],["games","/games?year=2026&week=6&team=Georgia"],["gadv","/stats/game/advanced?year=2026&week=6&team=Georgia"],["sadv","/stats/season/advanced?year=2026&team=Georgia"]])
     try{o[k]=sh(await api(p))}catch(e){o[k]="ERR "+e.message}
    return o` },
];
