// ═══════════════════════════════════════════════════════════════════════════
// Realmate — shared listing price parser (window.RM_PRICE)
//
// Realmate listings are free-text captions with no structured price column, so
// the peso figure is parsed from the caption. This is the SINGLE source of that
// logic: the amount the Listing Detail page highlights and the amount the Admin
// panel's Sold Records totals sum are computed here, so they can never drift.
//
// extractAmount(text) → a single Number in pesos, or 0 when none is found.
//   • "12.5m" / "12.5 million"        → 12,500,000
//   • "60k"                            → 60,000   (for a "30k-50k" range, the
//                                                  leading figure is used)
//   • a bare 7–9 digit number          → that number (e.g. 12500000)
// The order mirrors listing-detail.html's parse(): million → thousand → raw.
// ═══════════════════════════════════════════════════════════════════════════
(function (global) {
    'use strict';

    function extractAmount(text) {
        if (!text) return 0;
        const raw = String(text);
        const lower = raw.toLowerCase();
        let m = lower.match(/(\d+\.?\d*)\s*m(?:illion)?/);
        if (m) return parseFloat(m[1]) * 1e6;
        if ((m = lower.match(/(\d+\.?\d*)\s*k\b/))) return parseFloat(m[1]) * 1e3;
        m = raw.replace(/,/g, '').match(/\b(\d{7,9})\b/);
        if (m) return parseFloat(m[1]);
        return 0;
    }

    // "₱12,500,000" — the display format used across the app.
    function formatPeso(n) {
        return '₱' + Math.round(Number(n) || 0).toLocaleString('en-PH');
    }

    global.RM_PRICE = { extractAmount, formatPeso };
})(typeof window !== 'undefined' ? window : this);
