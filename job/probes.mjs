/* The probes job/probe.mjs runs (MODE=probe). Each: name, page, optional ready selector / widths / settle ms, and `run` — the body of an
   async function evaluated in the page (w(ms) waits, W is the width). Return {ok, ...whatever helps}. Keep results short. */
const res = `const R=()=>performance.getEntriesByType("resource").map(e=>decodeURIComponent(e.name));`;
export const PROBES = [
  /* Oct 22 (Sam: lineups "there should be other ways to clean this out"): can the runners read NBA.com's official rotation (exact in/out times) */
  { name: "nba-rotation", node: `const o={ok:false};const H={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Referer":"https://www.nba.com/","Origin":"https://www.nba.com","Accept":"application/json, text/plain, */*","x-nba-stats-origin":"stats","x-nba-stats-token":"true"};
    for(const [k,u] of [["rot","https://stats.nba.com/stats/gamerotation?GameID=0022600003&LeagueID=00"],["box","https://stats.nba.com/stats/boxscoretraditionalv3?GameID=0022600003&StartPeriod=0&EndPeriod=0&StartRange=0&EndRange=0&RangeType=0"]]){const t0=Date.now();try{const ac=new AbortController();setTimeout(()=>ac.abort(),25000);const r=await fetch(u,{headers:H,signal:ac.signal});const tx=await r.text();o[k]={status:r.status,ms:Date.now()-t0,len:tx.length,head:tx.slice(0,300)};if(r.ok&&k==="rot"){o.ok=true;const j=JSON.parse(tx);o.sets=j.resultSets.map(x=>x.name+":"+x.headers.join("|")+":"+x.rowSet.length);o.row=j.resultSets[0].rowSet[0]}}catch(e){o[k]={err:e.message,ms:Date.now()-t0}}}return o` },
  /* Oct 21 (Sam: coaches vs refs over a career): how far back ESPN's game pages list the officials, college and NBA */
  { name: "espn-ofc-depth", node: `const o={ok:true,c:{},n:{}};const L={c:"mens-college-basketball",n:"nba"};
    for(const lg of ["c","n"])for(const y of [2003,2006,2009,2012,2015,2018,2021]){const d=y+"0115";const sb=await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/"+L[lg]+"/scoreboard?dates="+d+(lg==="c"?"&groups=50&limit=500":"")).then(r=>r.ok?r.json():null).catch(()=>null);
     const ev=(sb&&sb.events||[]).slice(0,4);let w=0,f=0;for(const e of ev){const s=await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/"+L[lg]+"/summary?event="+e.id).then(r=>r.ok?r.json():null).catch(()=>null);const off=s&&s.gameInfo&&s.gameInfo.officials||[];if(off.length)w++;
      const bs=s&&s.boxscore&&s.boxscore.teams||[];if(bs.some(t=>(t.statistics||[]).some(x=>/foul/i.test(x.name||x.label||""))))f++}
     o[lg][y]=ev.length+" games · "+w+" with officials · "+f+" with fouls"}return o` },
  /* Oct 21 (Sam: calls on players by official): does NBA.com's play-by-play name the official on each foul and violation? */
  { name: "nba-pbp-ofc", node: `const o={ok:false,tried:[]};const H={"User-Agent":"Mozilla/5.0","Referer":"https://www.nba.com/","Origin":"https://www.nba.com"};
    for(const id of ["0022600001","0022600005","0022600010","0022500100"]){const r=await fetch("https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_"+id+".json",{headers:H});o.tried.push(id+":"+r.status);if(!r.ok)continue;
     const j=await r.json(),A=j.game.actions,F=A.filter(a=>/foul|violation|turnover/.test(a.actionType));o.ok=true;o.id=id;o.n=A.length;
     o.kinds=[...new Set(F.map(a=>a.actionType+":"+(a.subType||"")+":"+(a.descriptor||"")+":"+(a.officialId?"ofc":"-")))].slice(0,40);
     o.sample=F.filter(a=>a.officialId).slice(0,3).map(a=>({t:a.actionType,s:a.subType,d:a.descriptor,p:a.personId,nm:a.playerNameI,team:a.teamTricode,ofc:a.officialId,desc:a.description}));
     const b=await fetch("https://cdn.nba.com/static/json/liveData/boxscore/boxscore_"+id+".json",{headers:H});if(b.ok){const bj=await b.json();o.officials=(bj.game.officials||[]).map(x=>[x.personId,x.name,x.assignment])}
     break}return o` },
  /* Oct 11 (#334, Sam on "who made the play": "this seems like a huge miss"): CFBD's play stats (every player on a play, by role, with
     his id) against what the defender charts read out of play text — same team, same season */
  { name: "playstats-cmp", page: "/lab/", widths: [390], run: `const o={ok:true,types:null,teams:{}};try{o.types=(await api("/plays/stats/types")).map(t=>t.id+":"+t.name).join(", ")}catch(e){o.types="ERR "+e.message}
    for(const team of ["Ohio State","Iowa","San José State"]){const y=2025,ST={},calls=[0];let sample=null;
     for(let wk=1;wk<=16;wk++){let L=[];try{L=await api("/plays/stats?year="+y+"&week="+wk+"&team="+encodeURIComponent(team));calls[0]++}catch(e){continue}
      for(const r of L||[]){if(!sample)sample=JSON.stringify(r).slice(0,400);if(r.team!==team)continue;const a=ST[r.athleteId]=ST[r.athleteId]||{n:r.athleteName,t:{}};a.t[r.statType]=(a.t[r.statType]||0)+1}}
     const X=await dcTeam(team,y);const cmp=[];let both=0,onlyText=0,onlyStats=0;
     const byId={};for(const d of Object.values(X.D))byId[d.id]=d;
     for(const [id,a] of Object.entries(ST)){const d=byId[id];const tk=(a.t["Tackle"]||0)+(a.t["Solo Tackle"]||0),bu=a.t["Pass Breakup"]||0,int=a.t["Interception"]||0,sk=a.t["Sack"]||0;if(!(tk+bu+int+sk))continue;if(d)both++;else onlyStats++;
      if(cmp.length<8&&d)cmp.push(a.n+" stats:"+JSON.stringify(a.t)+" text: tkC "+d.tkC+" rt "+d.rt+" bu "+d.bu+" int "+d.int+" sk "+d.sk.toFixed(1))}
     for(const id of Object.keys(byId))if(!ST[id])onlyText++;
     o.teams[team]={calls:calls[0],sample,defendersInStats:Object.keys(ST).length,both,onlyStats,onlyText,cmp}}
    return o` },
  /* Oct 11 (#331): does CFBD's opponent-adjusted player EPA (/wepa/players/passing|rushing) predict a player's next season better than
     his raw EPA per play? Pearson r with next season's raw EPA per play (and next season's adjusted), players with enough plays both years */
  { name: "wepa-test", page: "/lab/", widths: [390], run: `const o={ok:true,shape:null,res:{}};const cor=(a,b)=>{const n=a.length,ma=a.reduce((x,y)=>x+y,0)/n,mb=b.reduce((x,y)=>x+y,0)/n;let s=0,sa=0,sb=0;for(let i=0;i<n;i++){s+=(a[i]-ma)*(b[i]-mb);sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2}return +(s/Math.sqrt(sa*sb)).toFixed(3)};
    const RAW={},WP={},WR={};for(const y of [2021,2022,2023,2024,2025]){RAW[y]=(await ppaYearLive(y)).d;const p=await api("/wepa/players/passing?year="+y).catch(()=>[]),r=await api("/wepa/players/rushing?year="+y).catch(()=>[]);if(!o.shape)o.shape=JSON.stringify(p[0]).slice(0,300);WP[y]={};WR[y]={};for(const x of p)WP[y][String(x.athleteId)]=[x.wepa,x.plays];for(const x of r)WR[y][String(x.athleteId)]=[x.wepa,x.plays];o["n"+y]=[p.length,r.length]}
    for(const [k,W,vi,ni,min,pos] of [["QB pass",WP,3,5,150,/QB/],["RB rush",WR,4,6,80,/RB/],["QB rush",WR,4,6,50,/QB/]]){const A=[],B=[],C=[],D=[];
     for(const y of [2021,2022,2023,2024]){for(const [id,x] of Object.entries(RAW[y])){if(!pos.test(x[0])||x[ni]<min)continue;const nx=RAW[y+1][id];if(!nx||nx[ni]<min)continue;const w=W[y][id],wn=W[y+1][id];if(!w||w[0]==null)continue;A.push(x[vi]);B.push(w[0]);C.push(nx[vi]);D.push(wn&&wn[0]!=null?wn[0]:nx[vi])}}
     o.res[k]={n:A.length,rawToNextRaw:cor(A,C),adjToNextRaw:cor(B,C),rawToNextAdj:cor(A,D),adjToNextAdj:cor(B,D),sameYearRawVsAdj:cor(A,B)}}
    return o` },
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
  { name: "serve", node: `const o={ok:true};for(const [k,h] of [["cookie",{cookie:"cfbs="+TOKEN}],["none",{}]])for(const path of ["/lab/?ro=1","/lab/","/"]){const r=await fetch(SITE+path,{headers:{...h,"user-agent":"Mozilla/5.0 probe"},redirect:"manual"});const t=await r.text();
    o[k+" "+path]=r.status+" loc="+(r.headers.get("location")||"")+" len="+t.length+" title="+((t.match(/<title>([^<]*)/)||[])[1]||"")+" ppa="+t.includes("async function ppaYear(")+" robots="+t.includes("noindex")}return o` },
  { name: "where", page: "/lab/", widths: [390], noro: true, run: `return {ok:true,url:location.href,ppa:typeof ppaYear}` },
  { name: "where-ro", page: "/lab/", widths: [390], settle: 500, run: `const t0=performance.now();return {ok:true,url:location.href,ppa:typeof ppaYear,nav:performance.getEntriesByType("navigation").map(e=>e.name+" "+e.type)}` },
  /* what a conference's availability page holds: links that look like reports, and whether player rows are in the HTML */
  { name: "avail-pages", node: `const UA={headers:{"user-agent":"Mozilla/5.0 (mycfbbigboard.com data job)"}};const o={ok:true};
    for(const u of ["https://theacc.com/sports/2025/8/28/availability-reporting-football.aspx","https://big12sports.com/sports/2025/8/21/availability-reporting.aspx","https://theamerican.org/sports/2025/8/5/fbavail.aspx","https://conferenceusa.com/sports/2025/8/23/FB_0823254134.aspx","https://pac-12.com/news/2026/9/11/2026-football-reports.aspx"]){
     try{const r=await fetch(u,UA);const t=await r.text();const links=[...new Set([...t.matchAll(/href="([^"]+)"/gi)].map(m=>m[1]).filter(h=>/avail|report|\.pdf|injur/i.test(h)))].slice(0,12);
      const i=t.search(/Questionable|Doubtful|Out for/i);o[u]=r.status+" "+t.length+"B links="+JSON.stringify(links)+" sample="+(i>=0?JSON.stringify(t.slice(Math.max(0,i-300),i+200).replace(/\\s+/g," ")):"none")}catch(e){o[u]="ERR "+e.message}}return o` },
  { name: "wiki-batch", page: "/", widths: [390], run: `const T=["2024 Ohio State Buckeyes football team","2023 Miami Hurricanes football team","2023 Miami RedHawks football team","2022 Texas A&M Aggies football team","2021 Washington Football Team season","2015 St. Louis Rams season","2099 Nowhere football team"];
    const u="https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&rvsection=0&redirects=1&format=json&formatversion=2&origin=*&titles="+encodeURIComponent(T.join("|"));
    const j=await (await fetch(u)).json();return {ok:true,err:j.error&&j.error.info,warn:JSON.stringify(j.warnings||"").slice(0,200),norm:j.query&&j.query.normalized,redir:j.query&&j.query.redirects,
     pages:(j.query&&j.query.pages||[]).map(p=>p.title+": "+(p.missing?"MISSING":((p.revisions&&p.revisions[0].slots.main.content)||"").length+"ch "+(((p.revisions&&p.revisions[0].slots.main.content)||"").match(/\\|\\s*off_coach\\s*=([^\\n]*)/)||[])[1]))}` },
  { name: "where-late", page: "/lab/", widths: [390], settle: 9000, run: `return {ok:location.pathname==="/lab/",url:location.href}` },
  /* the ACC / Big 12 feature pages load their reports with a script: find the script and the data it reads */
  { name: "avail-js", node: `const UA={headers:{"user-agent":"Mozilla/5.0 (mycfbbigboard.com data job)"}};const o={ok:true};
    for(const u of ["https://theacc.com/sports/2025/8/28/availability-reporting-football.aspx","https://big12sports.com/sports/2025/8/14/FBreporting.aspx","https://pac-12.com/news/2026/9/11/2026-football-reports.aspx","https://theamerican.org/sports/2025/8/5/fbavail.aspx"]){
     try{const t=await (await fetch(u,UA)).text();const S=[...new Set([...t.matchAll(/(?:src|href)="([^"]*feature-pages[^"]*|[^"]*avail[^"]*\\.js[^"]*)"/gi)].map(m=>m[1]))];
      const inl=[...t.matchAll(/(https?:\\/\\/[^"'\\s)]*(?:json|api|sheet|docs\\.google|airtable|feed)[^"'\\s)]*)/gi)].map(m=>m[1]).filter(x=>!/googletagmanager|facebook|twitter|schema\\.org|onetrust|cdn\\.jsdelivr/i.test(x));
      const R={scripts:S.slice(0,6),urls:[...new Set(inl)].slice(0,10)};
      for(const sc of S.filter(x=>/\\.js/.test(x)).slice(0,2)){try{const js=await (await fetch(new URL(sc,u).href,UA)).text();R[sc]=js.length+"B "+JSON.stringify([...new Set([...js.matchAll(/(https?:\\/\\/[^"'\\s\`]+)/g)].map(m=>m[1]))].slice(0,10))+" fetch="+JSON.stringify((js.match(/fetch\\([^)]{0,160}/g)||[]).slice(0,4))}catch(e){R[sc]="ERR "+e.message}}
      const k=t.search(/status-Out|class="status|data-status/);if(k>=0)R.sample=t.slice(Math.max(0,k-400),k+300).replace(/\\s+/g," ");
      o[u]=R}catch(e){o[u]="ERR "+e.message}}return o` },
  { name: "nfllive", node: `const H={headers:{Authorization:"Bearer "+TOKEN}};const o={ok:true,now:new Date().toISOString()};
    for(const u of ["/api/nfllive","/api/nfllive?box=1"]){try{const r=await fetch(SITE+u,H);const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}
     o[u]=r.status+" "+t.length+"B "+(j?(u.includes("box")?"players="+Object.keys(j.p||{}).length+" defs="+Object.keys(j.d||{}).length+" games="+JSON.stringify(j.games)+" at="+(j.at?new Date(j.at).toISOString():""):"games="+(j.g||[]).length+" "+JSON.stringify((j.g||[]).filter(x=>x[5]!=="pre").slice(0,4).map(x=>x[1]+"@"+x[2]+" "+x[5]+" "+x[8]+" "+x[3]+"-"+x[4]))+" at="+(j.at?new Date(j.at).toISOString():"")):t.slice(0,200))}catch(e){o[u]="ERR "+e.message}}return o` },
  /* the availability reports' JSON (the Pac-12 page reads sbcautostorage …/availability-reports/pac12-football/prod/report.json): try the same pattern for the others */
  { name: "avail-json", node: `const o={ok:true};const base="https://sbcautostorage.blob.core.windows.net/availability-reports/";
    for(const c of ["pac12","acc","big12","sec","bigten","b1g","american","aac","cusa","sunbelt","mw","mwc","mountainwest","mac"]){const u=base+c+"-football/prod/report.json";
     try{const r=await fetch(u+"?ts="+Date.now());const t=await r.text();o[c]=r.status+" "+t.length+"B "+(r.ok?t.slice(0,500):"")}catch(e){o[c]="ERR "+e.message}}return o` },
  { name: "net-acc", url: "https://theacc.com/sports/2025/8/28/availability-reporting-football.aspx" },
  { name: "net-big12", url: "https://big12sports.com/sports/2025/8/14/FBreporting.aspx" },
  { name: "net-sec", url: "https://www.secsports.com/fbreports" },
  /* Oct 15: the ACC and Big 12 pages read app.hdintelligence.com/api/get-publish-public — the call and its format */
  { name: "cap-acc", url: "https://theacc.com/sports/2025/8/28/availability-reporting-football.aspx", cap: "hdintelligence\\.com/api/get-publish-public", capN: 2, settle: 12000 },
  { name: "cap-big12", url: "https://big12sports.com/sports/2025/8/14/FBreporting.aspx", cap: "hdintelligence\\.com/api/get-publish-public", capN: 2, settle: 12000 },
  /* which conferences publish through hdintelligence, and what the statuses look like once posted */
  { name: "hd-orgs", node: `const o={ok:true};const H={method:"POST",headers:{"content-type":"application/json","accept":"application/json","referer":"https://app.hdintelligence.com/","user-agent":"Mozilla/5.0 (mycfbbigboard.com data job)"}};
    for(const c of ["ACC","B12","SEC","B1G","BIG10","BIGTEN","AAC","AMERICAN","MWC","MW","CUSA","MAC","SBC","SUNBELT","PAC12","P12","IND"]){try{const r=await fetch("https://app.hdintelligence.com/api/get-publish-public",{...H,body:JSON.stringify({sport:"Football",organization:c,conference:c})});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}
     if(!j||typeof j!=="object"||!Object.keys(j).length){o[c]=r.status+" "+t.slice(0,80);continue}
     const G=Object.values(j),st={},ex=[];let order=null;for(const g of G){order=order||g.statusReportOrder;for(const tm of g.games||[])for(const r2 of tm.rows||[]){st[r2.status]=(st[r2.status]||0)+1;if(r2.status!=="Available"&&ex.length<6)ex.push(tm.teamName+": "+JSON.stringify(r2))}}
     o[c]={games:G.length,types:[...new Set(G.map(g=>g.ReportType))],dates:[...new Set(G.map(g=>g.footer&&g.footer.date))],teams:G.flatMap(g=>(g.games||[]).map(t=>t.teamName)).join(", "),order,st,ex,keys:Object.keys(G[0]).filter(k=>!/Image|Font|Color/.test(k)).join(",")}}catch(e){o[c]="ERR "+e.message}}return o` },
  { name: "cap-sec", url: "https://www.secsports.com/fbreports", cap: "secsports\\.com/api/(?!sports|menus|schedule-events|search)", capN: 3, settle: 12000 },
  /* the college availability views (Oct 15): a team page, a listed player's profile, and a Full matchup card */
  { name: "cavail-look", page: "/lab/", widths: [390, 1280], run: `const o={ok:false};const C=await cavLoad();const teams=Object.keys(C.t||{});o.teams=teams.length;
    const T=teams.find(t=>(C.t[t].p||[]).length>=3)||teams[0];if(!T)return {ok:false,why:"no pack"};o.team=T;
    await teamProfile(T);for(let i=0;i<40&&!document.querySelector("#tmCav .cavw");i++)await w(500);const tc=document.querySelector("#tmCav");o.teamPage=tc?tc.innerText.replace(/\\s+/g," ").slice(0,500):"(none)";
    const md=document.getElementById("md");o.overflow=md.scrollWidth>md.clientWidth+2;closeP();
    let pid=null,pn=null;outer:for(const t of teams)for(const p of C.t[t].p){for(const [id,q] of Object.entries(D.pool||{}))if(q&&q.team===t&&coNm(q.name)===coNm(p[0])){pid=id;pn=q.name+" ("+t+") "+p[3];break outer}}
    o.player=pn;if(pid){await profile(pid);await w(1500);const c=document.querySelector("#md .cavp");o.profile=c?c.innerText:"(no line)";closeP()}
    o.ok=/availability/i.test(o.teamPage)&&(!pid||!/no line/.test(o.profile));return o` },
  /* one game of the Sun Belt JSON in full, to read the player format */
  { name: "avail-sbc", node: `const t=await (await fetch("https://sbcautostorage.blob.core.windows.net/availability-reports/sunbelt-football/prod/report.json?ts="+Date.now())).text();const j=JSON.parse(t);const g=(j.games||[]).find(g=>JSON.stringify(g).length>900)||(j.games||[])[0];return {ok:true,keys:Object.keys(j),n:(j.games||[]).length,game:JSON.stringify(g).slice(0,3500)}` },
  { name: "net-b1g", url: "https://bigten.org/sports/football/availability-report" },
  { name: "wpfit", mod: "wpfit" },
  { name: "cbbtest", mod: "cbbtest" },
  { name: "cbbrate", mod: "cbbrate" },
  { name: "cbbrate-k10", mod: "cbbrate", env: { RATE_K: "10" } },
  { name: "cbbrate-k3", mod: "cbbrate", env: { RATE_K: "3", RATE_PULL: ".7" } },
  { name: "cbbrate-k2", mod: "cbbrate", env: { RATE_K: "2", RATE_PULL: ".7" } },
  { name: "cbbrate-k3p8", mod: "cbbrate", env: { RATE_K: "3", RATE_PULL: ".8" } },
  { name: "cbbrate-k1p8", mod: "cbbrate", env: { RATE_K: "1", RATE_PULL: ".8" } },
  { name: "nbatest", mod: "nbatest" },
  { name: "cbbwpfit", mod: "cbbwpfit" },
  { name: "nflwpfit", mod: "nflwpfit" },
  { name: "nfladjtest", mod: "nfladjtest" },
  { name: "cbblineups", mod: "cbblineups" },
  { name: "relprobe", mod: "relprobe" },
  { name: "cbbtest-srs", mod: "cbbtest", env: { PRIOR: "srs" } },
  { name: "cbbtest-hybrid", mod: "cbbtest", env: { PRIOR: "hybrid" } },
  { name: "cbbtest-base", mod: "cbbtest", env: { PRIOR: "cbbd" } },
  /* can we get college basketball players' birth dates? (Oct 11 — the age test for BoardScore needs them for drafted and undrafted alike) */
  { name: "cbbdob", node: `const o={ok:true,teams:{}};const H={headers:{"User-Agent":"mycbbbigboard data job"}};
    for(const t of [150,2509,96,2305,2250,57,9,2181]){const j=await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/"+t+"/roster",H).then(r=>r.json()).catch(()=>null);
     const A=(j&&j.athletes)||[];o.teams[t]={n:A.length,dobRoster:A.filter(a=>a.dateOfBirth||a.age).length,keys:A[0]?Object.keys(A[0]).join(","):""};
     let core=0,tried=0;for(const a of A.slice(0,6)){tried++;const c=await fetch("https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/athletes/"+a.id,H).then(r=>r.json()).catch(()=>null);if(c&&c.dateOfBirth)core++}
     o.teams[t].dobCore=core+"/"+tried}
    /* players from years ago (ESPN ids of 2015–2018 college players, undrafted and drafted) */
    const old=[];for(const id of [2580912,2581184,2991055,3133602,3133628,3064514,3135045,2990992,3134907,3133838]){const c=await fetch("https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/athletes/"+id,H).then(r=>r.json()).catch(()=>null);old.push(id+":"+(c?(c.fullName||"?")+" "+(c.dateOfBirth||"no dob"):"none"))}
    o.old=old;return o` },
];
