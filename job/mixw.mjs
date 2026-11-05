/* Team mix weights stay on the server (Nov 5, 2026 — the owner, 5:24 pm: "yes a" to "do the scoring on our server, so browsers only get the
   results, never the weights"; P2-20; his Oct 31 rule "we don't want to tell our weights anywhere").

   The grade packs every signed-in browser downloads (p<Y>_res-board, -detail, -ds<k>, -comb) carried each grade row's weight (`w`), and
   the Team mix score was worked out in the page from them. Here, as the data job uploads those packs:
   - every row weight is taken out of what browsers get (stripW);
   - one small file per season, p<Y>_res-mix-model, keeps what the Team mix needs: per player his BoardScore and, for each of the six
     parts, the sum of score × weight and the sum of weight (mixPack). Names ending in -model are served to the admin and the data job
     only (src/api/packs.js); the worker's /api/teammix reads it and sends back whole-number team scores (src/api/teammix.js).
   Same arithmetic as before: team = BoardScore + (Σ m·sc·w / Σ m·w − Σ sc·w / Σ w), each part's m = its slider / 100. */

export const MIX_PARTS = ["prod", "eff", "use", "rec", "size", "exp"];
/* the same split the page used (public/lab/index.html tmxPart, portal.html TMX_P) */
export const mixPart = r => { const k = String(r.key || ""); if (r.isRec) return "rec"; if (/^(HT|WT)$/.test(k)) return "size"; if (/^CY$/.test(k)) return "exp";
  if (/USG|TCH|CAR$|TGT|SNAP|vol/i.test(k) || r.vol) return "use"; if (/PCT|YPA|YPR|YPC|EPA|PPA|INTR|T3|RATE|AVG|PER/i.test(k)) return "eff"; return "prod" };

export const RES_W = /^(p\d{4})_res-(board|detail|comb|ds\d+)$/;

/* p<Y>_res-board's res → { v, p: { id: [BoardScore, S_prod … S_exp, W_prod … W_exp] } } (sums rounded to 4 places) */
export function mixPack(res) {
  const out = { v: 1, parts: MIX_PARTS, p: {} };
  for (const [id, L] of Object.entries((res && res.p) || {})) {
    if (!L || typeof L !== "object" || !L.IX || L.IX.idx == null || !Array.isArray(L.rows)) continue;
    const S = MIX_PARTS.map(() => 0), W = MIX_PARTS.map(() => 0); let any = false;
    for (const r of L.rows) { if (r == null || typeof r !== "object" || r.sc == null || !r.w) continue; const i = MIX_PARTS.indexOf(mixPart(r)); S[i] += r.sc * r.w; W[i] += r.w; any = true }
    if (any) out.p[id] = [Math.round(L.IX.idx), ...S.map(x => +x.toFixed(4)), ...W.map(x => +x.toFixed(4))];
  }
  return out;
}

/* take every row weight out of a grade pack's res (in place); returns how many were taken out */
export function stripW(kind, res) {
  let n = 0; if (!res || typeof res !== "object") return 0;
  const rows = A => { if (Array.isArray(A)) for (const r of A) if (r && typeof r === "object" && "w" in r) { delete r.w; n++ } };
  const sv = L => { if (L && Array.isArray(L.sv)) for (const v of L.sv) if (v && typeof v === "object") rows(v.rows) };
  if (kind === "board") for (const L of Object.values(res.p || {})) if (L && typeof L === "object") { rows(L.rows); sv(L) }
  if (kind === "detail" || /^ds\d+$/.test(kind)) for (const L of Object.values(res)) sv(L);
  if (kind === "comb") for (const s of Object.values(res.spd || {})) if (s && typeof s === "object" && "w" in s) { delete s.w; n++ }
  return n;
}

/* the score for one player's entry and one mix (the worker's arithmetic, kept here too so the tests check both) */
export function mixScore(e, mix) {
  const k = MIX_PARTS.length; let sw = 0, ww = 0, sm = 0, wm = 0;
  for (let i = 0; i < k; i++) { const S = e[1 + i], W = e[1 + k + i], m = (mix && mix[MIX_PARTS[i]] != null ? mix[MIX_PARTS[i]] : 100) / 100; sw += S; ww += W; sm += S * m; wm += W * m }
  const d = ww && wm ? sm / wm - sw / ww : 0; return Math.max(0, Math.min(100, Math.round(e[0] + d)));
}
