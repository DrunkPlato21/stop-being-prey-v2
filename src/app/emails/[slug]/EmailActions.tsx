"use client";

import { useState } from "react";
import { useEmailFavorites } from "../useEmailReads";

// Under an email, beside the read toggle: the star, and "Share this
// email", which makes (or hands back) the patron's gift link for it. A
// gift link opens this one email for anyone, no sign-in. Patrons get a
// few new ones a month; re-sharing an email they've shared before reuses
// its link and costs nothing.

export function EmailActions({
  kitId,
  subject,
  initiallyFav,
  existingUrl,
  remaining: initialRemaining,
  perMonth,
}: {
  kitId: number;
  subject: string;
  initiallyFav: boolean;
  /** Path of this patron's existing gift link for the email, if any. */
  existingUrl: string | null;
  remaining: number;
  perMonth: number;
}) {
  const { favs, setFav } = useEmailFavorites(initiallyFav ? [kitId] : []);
  const isFav = favs.has(kitId);

  const [url, setUrl] = useState<string | null>(() =>
    existingUrl && typeof window !== "undefined"
      ? new URL(existingUrl, window.location.origin).toString()
      : existingUrl
  );
  const [remaining, setRemaining] = useState(initialRemaining);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "working" | "limit" | "error">(
    "idle"
  );
  const [copied, setCopied] = useState(false);

  const absolute = (u: string) => new URL(u, window.location.origin).toString();

  async function share() {
    setOpen(true);
    if (url) return;
    if (remaining <= 0) {
      setState("limit");
      return;
    }
    setState("working");
    const dev = new URLSearchParams(window.location.search).get("dev_preview");
    try {
      const r = await fetch(
        `/api/emails/gift${dev ? `?dev_preview=${dev}` : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kitId }),
        }
      );
      const body = await r.json();
      if (r.status === 429) {
        setRemaining(0);
        setState("limit");
        return;
      }
      if (!r.ok) throw new Error(body?.error);
      setUrl(absolute(body.url));
      setRemaining(body.remaining);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(absolute(url));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is selectable in the field anyway.
    }
  }

  async function nativeShare() {
    if (!url) return;
    try {
      await navigator.share({ title: subject, url: absolute(url) });
    } catch {
      // Dismissed, or not supported.
    }
  }

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const left = `${remaining} left this month`;

  return (
    <div className="ar-actions">
      <div className="ar-actions-row">
        <button
          type="button"
          className={`ar-action${isFav ? " is-on" : ""}`}
          aria-pressed={isFav}
          onClick={() => setFav(kitId, !isFav)}
        >
          <StarIcon filled={isFav} />
          <span>{isFav ? "Favorite" : "Add to favorites"}</span>
        </button>
        <button
          type="button"
          className={`ar-action${open ? " is-on" : ""}`}
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : share())}
        >
          <GiftIcon />
          <span>Share this email</span>
        </button>
      </div>

      {open && (
        <div className="ar-share" role="region" aria-label="Share this email">
          {url ? (
            <>
              <p className="ar-share-lede">
                Anyone with this link can read this one email. Nothing else
                in the archive opens.
              </p>
              <div className="ar-share-link">
                <input
                  readOnly
                  value={url}
                  aria-label="Gift link"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button type="button" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {canNativeShare && (
                <button
                  type="button"
                  className="ar-share-native"
                  onClick={nativeShare}
                >
                  Send it
                </button>
              )}
              <p className="ar-share-count">
                {left}. Sharing this one again uses the same link.
              </p>
            </>
          ) : state === "working" ? (
            <p className="ar-share-lede">Making your link…</p>
          ) : state === "limit" ? (
            <p className="ar-share-lede">
              You&apos;ve shared {perMonth} emails this month, the most for
              now. Your links already out there keep working, and you get{" "}
              {perMonth} more on the 1st.
            </p>
          ) : state === "error" ? (
            <p className="ar-share-lede">
              That didn&apos;t work. Try again in a moment.
            </p>
          ) : (
            <p className="ar-share-lede">{left}.</p>
          )}
        </div>
      )}
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="ar-star">
      <path
        d="M10 2.6l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.9l5-.7z"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden>
      <path d="M3.5 8.5h13v3h-13zM4.5 11.5v6h11v-6M10 8.5v9" fill="none" />
      <path
        d="M10 8.5C8.5 6 5.8 5.2 5.8 3.9 5.8 2.6 8.4 2.9 10 8.5zm0 0c1.5-2.5 4.2-3.3 4.2-4.6 0-1.3-2.6-1-4.2 4.6z"
        fill="none"
      />
    </svg>
  );
}
