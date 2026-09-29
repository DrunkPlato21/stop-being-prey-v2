"use client";

// "Print this piece" — a quiet text link under the share row. Older
// readers print essays to hand to someone; the print stylesheet in
// globals.css (@media print) strips the page down to masthead + body and
// spells out every link's URL, so the paper copy keeps its receipts.
// Choosing "Save as PDF" in the print dialog is the PDF version.
export function PrintLink() {
  return (
    <p className="print-hide text-center mt-6">
      <button
        type="button"
        onClick={() => window.print()}
        className="cursor-pointer font-display text-xs uppercase tracking-[0.18em] text-ink-muted hover:text-eye-deep transition-colors"
      >
        Print this piece
      </button>
    </p>
  );
}
