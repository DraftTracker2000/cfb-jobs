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
  /* Value per Play on college profiles: a QB, a RB, a WR, a TE */
  { name: "ppa-profiles", page: "/lab/", run: `const o={ok:true};for(const id of ["5079712","5164332","5079720","5138451"]){await profile(id);for(let i=0;i<30&&document.querySelector("#ppa.sub");i++)await w(400);
     const el=document.getElementById("ppa");o[id]=el?[...el.querySelectorAll(".ptile")].map(t=>t.innerText.replace(/\\s+/g," ")).join(" | "):"(no section)";
     const md=document.getElementById("md");if(md&&md.scrollWidth>md.clientWidth+2)o[id]+=" OVERFLOW";}
    o.ok=Object.values(o).filter(v=>typeof v==="string").some(v=>/pct|plays/.test(v));return o` },
  /* Head to Head: worth watching, last week's best, moneyline tile in an open card */
  { name: "h2h-new", page: "/lab/", run: `tab="COACH";CO_VIEW="h2h";render();for(let i=0;i<40&&!document.querySelector(".h2hg");i++)await w(500);await w(2500);
    const wt=[...document.querySelectorAll(".h2hw")].map(b=>b.innerText.replace(/\\s+/g," "));const best=[...document.querySelectorAll(".h2hbr")].map(b=>b.innerText.replace(/\\s+/g," "));
    const g=document.querySelector(".h2hg [data-hv]");if(g){g.click();await w(2500)}const ml=document.querySelector(".lnx .lnt:nth-child(3)");
    const de=document.documentElement;return {ok:true,watch:wt,best,ml:ml?ml.innerText.replace(/\\s+/g," "):null,pageOverflow:de.scrollWidth>de.clientWidth+1}` },
  { name: "nfl-ml", page: "/lab/", widths: [390], run: `tab="LEGACY";LEG_VIEW="h2h";render();for(let i=0;i<40&&!document.querySelector(".h2hg");i++)await w(500);await w(1500);
    const g=document.querySelector(".h2hg [data-hv],.h2hg [data-nhv],.h2hg button");if(g){g.click();await w(2000)}const ml=document.querySelector(".lnx .lnt:nth-child(3)");return {ok:true,ml:ml?ml.innerText.replace(/\\s+/g," "):null}` },
  { name: "diag", page: "/lab/", widths: [390], run: `const H={headers:{Authorization:"Bearer "+TOKEN}};const ix=(await (await fetch("/api/pack-index",H)).json()).packs;
    const pick=k=>ix[k]?{sha:ix[k].sha,at:new Date(ix[k].at).toISOString(),kb:Math.round(ix[k].bytes/1024)}:null;
    const ct=await (await fetch("/api/pack/p2026_ct",H)).json();const C=await h2hCal();const now=Date.now();
    const done=(C.weeks||[]).filter(w=>(w.seasonType||"regular")==="regular"&&new Date(w.endDate||w.lastGameStart).getTime()-22*36e5<now);
    let pp=null;try{pp=await ppaYear(2026)}catch(e){pp="ERR "+e.message}
    const H2=await h2hLoad();const g=(H2&&H2.games)||[];
    return {ok:true,HAS_CLOUD,BUILDER,ct:pick("p2026_ct"),ctW:ct&&ct.ct&&ct.ct.W,clientW:done.length?done[done.length-1].week:null,ppa:pick("p2026_ppa"),ppaN:pp&&pp.d?Object.keys(pp.d).length:pp,
     has5079712:!!(pp&&pp.d&&pp.d["5079712"]),h2hWeek:H2&&H2.week,games:g.length,done:g.filter(x=>x.done).length,withML:g.filter(x=>x.hml!=null).length,withEx:g.filter(x=>x.ex!=null).length}` },
  { name: "defs", page: "/lab/", widths: [390], run: `const html=document.documentElement.outerHTML;return {ok:true,url:location.href,len:html.length,hasPpaSrc:html.includes("async function ppaYear("),hasMl:html.includes("function mlTile("),types:["ppaYear","ppaHTML","ppaYearLive","mlTile","h2hWatchHTML","colTrendData","h2hCal","profile"].map(k=>k+":"+typeof window[k]).join(" "),ev:(()=>{try{return typeof eval("ppaYear")}catch(e){return "ERR "+e.message}})()}` },
  /* what Wikipedia's season pages carry in their info box (coordinators) */
  { name: "wiki", page: "/", widths: [390], run: `const o={ok:true};for(const t of ["2024 Ohio State Buckeyes football team","2019 Boise State Broncos football team","2023 Kansas City Chiefs season","2012 Ohio State Buckeyes football team"]){
     try{const j=await (await fetch("https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&section=0&format=json&origin=*&page="+encodeURIComponent(t))).json();const x=(j.parse&&j.parse.wikitext&&j.parse.wikitext["*"])||"";
      o[t]=x.split("\\n").filter(l=>/^\\s*\\|\\s*(head_coach|hc|off_|def_|oc|dc|coach|coordinator|offensive|defensive|sp_)/i.test(l)).join(" ¦ ").slice(0,600)}catch(e){o[t]="ERR "+e.message}}return o` },
  /* where each conference posts its availability reports: links on its football pages that mention availability */
  { name: "avail-find", node: `const UA={headers:{"user-agent":"Mozilla/5.0 (mycfbbigboard.com data job)"}};const o={ok:true};
    for(const u of ["https://www.secsports.com/","https://www.secsports.com/sport/football","https://theacc.com/sports/football","https://bigten.org/fb/","https://big12sports.com/sports/football","https://sunbeltsports.org/sports/football","https://themw.com/sports/football","https://www.secsports.com/availability-report","https://theacc.com/availability","https://bigten.org/availability/"]){
     try{const r=await fetch(u,UA);const t=await r.text();const L=[...new Set([...t.matchAll(/href="([^"]*availab[^"]*)"/gi)].map(m=>m[1]))].slice(0,8);o[u]=r.status+" "+t.length+"B "+JSON.stringify(L)}catch(e){o[u]="ERR "+e.message}}return o` },
];
