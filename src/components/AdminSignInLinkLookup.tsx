"use client";

import { useState } from "react";

// Admin quick tool: type any member's email, mint a 7-day production
// sign-in link to paste into a personal email. For members whose
// automated sign-in email doesn't land (corporate inbox filtering).
// Hits POST /api/admin/members/:email/sign-in-link (same route the
// per-row button on /admin/members uses).

const ERRORS: Record<string, string> = {
  member_not_found: "No member on file with that email.",
  storage_unavailable: "Storage is down. Try again.",
  invalid_email: "Enter a valid email.",
};

export function AdminSignInLinkLookup() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [forEmail, setForEmail] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mint(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const target = email.trim().toLowerCase();
    if (!target) {
      setError("Enter a member's email.");
      return;
    }
    setPending(true);
    setError(null);
    setLink(null);
    setCopied(false);
    try {
      const res = await fetch(
        `/api/admin/members/${encodeURIComponent(target)}/sign-in-link`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        expiresInDays?: number;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.url) {
        setError(
          (data.error && ERRORS[data.error]) || "Couldn't mint link. Try again."
        );
        setPending(false);
        return;
      }
      setLink(data.url);
      setForEmail(target);
      setDays(data.expiresInDays ?? null);
      setPending(false);
    } catch {
      setError("Couldn't mint link. Try again.");
      setPending(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={mint} className="flex flex-wrap items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="member@example.com"
          disabled={pending}
          autoComplete="off"
          className="font-serif text-ink bg-paper border border-border px-3 py-2 outline-none focus:border-ink"
          style={{ fontSize: "1rem", minWidth: "18rem" }}
        />
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="btn-primary"
          style={{
            padding: "0.6rem 1.2rem",
            fontSize: "0.72rem",
            opacity: pending || !email.trim() ? 0.6 : 1,
          }}
        >
          <span>{pending ? "Minting…" : "Mint sign-in link"}</span>
        </button>
      </form>

      {error && (
        <p className="font-serif italic" style={{ color: "#7a3a2e", fontSize: "0.9rem" }}>
          {error}
        </p>
      )}

      {link && (
        <div
          className="flex flex-col gap-2 p-4"
          style={{ background: "var(--paper-deep)", borderLeft: "2px solid var(--eye-deep)" }}
        >
          <p className="font-serif text-ink" style={{ fontSize: "0.9rem" }}>
            Sign-in link for <strong>{forEmail}</strong>:
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              onFocusCapture={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
              className="border border-border bg-paper px-2 py-1 text-xs flex-1"
              style={{ fontFamily: "monospace", minWidth: "20rem" }}
            />
            <button
              type="button"
              onClick={copy}
              className="font-display uppercase tracking-[0.18em]"
              style={{ color: "var(--eye-deep)", fontWeight: 600, fontSize: "0.7rem" }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="font-serif italic text-ink-faint" style={{ fontSize: "0.8rem" }}>
            Single-use{days ? `, expires in ${days} days` : ""}. Paste it into a
            personal email to the member. First click logs them in.
          </p>
        </div>
      )}
    </div>
  );
}
