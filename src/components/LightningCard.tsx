"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Props = {
  lightningAddress: string;
};

export function LightningCard({ lightningAddress }: Props) {
  const [copied, setCopied] = useState(false);

  // Hyperlink uses lightning: URI for mobile deep-link into wallets.
  // QR encodes the bare LUD-16 address; some wallets expect BOLT11 after
  // a lightning: prefix and stall on raw addresses.
  const lightningUri = `lightning:${lightningAddress}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(lightningAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <div className="bg-surface border border-border p-8 md:p-10 relative">
      {/* Corner ornaments — operator-class flourish */}
      <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye" />
      <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye" />
      <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye" />
      <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye" />

      <div className="flex flex-col items-center text-center">
        <p className="eyebrow mb-3">Bitcoin · Lightning</p>
        <h3
          className="font-display text-ink leading-tight tracking-tight mb-6"
          style={{
            fontSize: "1.85rem",
            fontWeight: 700,
            letterSpacing: "-0.015em",
          }}
        >
          Tip over Lightning
        </h3>

        <div className="bg-paper p-4 mb-6 border border-border">
          <QRCodeSVG
            value={lightningAddress}
            size={180}
            bgColor="#f5efe1"
            fgColor="#1a1714"
            level="M"
            marginSize={1}
          />
        </div>

        <a
          href={lightningUri}
          className="font-mono text-sm text-ink-muted hover:text-eye-deep transition-colors mb-3 break-all no-underline"
        >
          {lightningAddress}
        </a>

        <button
          onClick={handleCopy}
          className="font-display text-xs uppercase tracking-[0.22em] text-eye-deep hover:text-ink transition-colors mb-6 cursor-pointer"
          style={{ fontWeight: 600 }}
        >
          {copied ? "Copied" : "Copy address"}
        </button>

        <p className="text-sm text-ink-muted italic max-w-xs leading-relaxed">
          Lightning generates a unique invoice per payment. Best privacy, lowest
          fees. Any Lightning wallet works.
        </p>
      </div>
    </div>
  );
}
