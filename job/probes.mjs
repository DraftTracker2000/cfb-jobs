/* The probes job/probe.mjs runs (MODE=probe). Each: name, page, optional ready selector / widths / settle ms, and `run` — the body of an
   async function evaluated in the page (w(ms) waits, W is the width). Return {ok, ...whatever helps}. Keep results short. */
const res = `const R=()=>performance.getEntriesByType("resource").map(e=>decodeURIComponent(e.name));`;
export const PROBES = [
  { name: "trend-file", page: "/lab/", widths: [390], run: `${res}
    tab="CTREND";render();for(let i=0;i<40&&!CT_DATA;i++)await w(500);await w(1500);
    const L=R(),ct=L.filter(u=>/\\/api\\/pack\\/p\\d{4}_ct/.test(u)).length,live=L.filter(u=>/stats\\/player\\/season/.test(u)).length;
    return {ok:!!CT_DATA&&!CT_DATA.none&&ct>0&&live===0,week:CT_DATA&&CT_DATA.W,packReads:ct,liveCalls:live,cards:document.querySelectorAll("#empty .pcard").length}` },
];
