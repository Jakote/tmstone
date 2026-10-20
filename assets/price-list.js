/* ============================================================================
   TM STONE — THE PUBLISHED PRICE LIST. ONE COPY. READ BY BOTH PUBLIC PAGES.

   This file is the only place a paver price is written down in this repository.

     /index.html       the home-page calculator  -> <script src="assets/price-list.js">
     /quote/index.html the quote builder         -> <script src="../assets/price-list.js">

   ⚠️ DO NOT copy a price out of here into either page. The two pages used to
      carry their own lists and they drifted: the home page quoted M159.93/m²
      for the SQ200 while /quote/ quoted M147.97/m² for the same paver, and a
      customer could read both in one sitting. Ruled 14 Oct 2026 — one list.
      tests/price-parity.test.js fails if a second copy ever appears.

   ⚠️ NO COSTS HERE. These are TM Stone's selling prices, which are
      customer-facing by definition. His batch recipe, supplier rates, overhead
      and mould wear are not in this repository at all — see the PUBLIC BUILD
      note at the top of quote/index.html.

   PRICES — per paver, supply only, from TM Stone's paver_cost_analysis
   (Aug 2026). The per-m² column is price ÷ face area, which is what both
   pages show; it is derived here, never stored, so the two cannot disagree.

     SQ200   M6.3972 /paver   ×25      /m² = M159.93 /m²
     SQ100   M2.8111 /paver   ×100     /m² = M281.11 /m²
     BR220   M4.5085 /paver   ×41.3223 /m² = M186.30 /m²
     HEX200  M4.7236 /paver   ×38.4615 /m² = M181.68 /m²

   The SQ200 figure is M159.93 ÷ 25 = M6.3972 exactly. The home page carried
   M6.3971 until 14 Oct 2026, which showed as M159.93/m² but came out M0.30
   short on a 3,000-paver job. The published per-m² price is the authority.
   ============================================================================ */
(function (root) {
  /* M per paver, supply only. */
  root.TMS_PRICE_LIST = Object.freeze({
    SQ200:  6.3972,
    SQ100:  2.8111,
    BR220:  4.5085,
    HEX200: 4.7236,
  });

  /* Face area in m² per paver. Lives here because price ÷ face is the per-m²
     figure a customer compares between the two pages — a face that drifted
     would make them disagree just as surely as a price that drifted. */
  root.TMS_FACE_M2 = Object.freeze({
    SQ200:  0.04,
    SQ100:  0.01,
    BR220:  0.0242,
    HEX200: 0.026,
  });

  /* The mark-up the list above is quoted at. /quote/ scales off the list for
     its internal and trade-tier views; the home page has no mark-up control
     and always shows the list. Both quote the list at this value. */
  root.TMS_PRICE_REF_MARKUP = 40;
})(typeof window !== 'undefined' ? window : globalThis);
