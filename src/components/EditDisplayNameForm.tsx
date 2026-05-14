"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Inline edit form for the member's display name. Lives on
// /notes/account. Submits to POST /api/profile, which rewrites the
// name on every past comment authored by the member.

type Props = {
  initialDisplayName: string | null;
  // When the member is currently inside the 30-day cooldown window
  // from a prior change. Disables the input + shows the unlock date.
  onCooldown?: boolean;
  nextAllowedAt?: number | null;
};

const ERRORS: Record<string, string> = {
  display_name_required: "Pick a display name first.",
  invalid_display_name: "That display name isn't allowed.",
  reserved: "That name is reserved. Try another.",
  profanity: "That name isn't allowed. Try another.",
  name_taken: "Someone's already using that name. Try another.",
  rate_limited: "You can change your display name once every 30 days.",
  storage_unavailable: "Comments are temporarily unavailable.",
  not_authenticated: "Sign in first.",
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function EditDisplayNameForm({
  initialDisplayName,
  onCooldown = false,
  nextAllowedAt = null,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialDisplayName ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverNextAllowedAt, setServerNextAllowedAt] = useState<number | null>(
    nextAllowedAt ?? null
  );

  const dirty = value.trim() !== (initialDisplayName ?? "").trim();
  const lockedByCooldown = onCooldown && !!nextAllowedAt;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !dirty || lockedByCooldown) return;
    if (!value.trim()) {
      setError(ERRORS.display_name_required);
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: value }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        updatedComments?: number;
        nextAllowedAt?: number;
      };
      if (!res.ok) {
        const baseMessage =
          (data.error && ERRORS[data.error]) || "Couldn't save. Try again.";
        if (data.error === "rate_limited" && data.nextAllowedAt) {
          setServerNextAllowedAt(data.nextAllowedAt);
          setError(`${baseMessage} Next change: ${formatDate(data.nextAllowedAt)}.`);
        } else {
          setError(baseMessage);
        }
        setPending(false);
        return;
      }
      const n = data.updatedComments ?? 0;
      setSuccess(
        n === 0
          ? "Saved."
          : n === 1
            ? "Saved. 1 past comment updated."
            : `Saved. ${n} past comments updated.`
      );
      setPending(false);
      router.refresh();
    } catch {
      setError("Couldn't save. Try again.");
      setPending(false);
    }
  }

  const effectiveNextAllowedAt = serverNextAllowedAt ?? nextAllowedAt;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label
        htmlFor="account-display-name"
        className="eyebrow"
        style={{ letterSpacing: "0.22em", fontSize: "0.65rem" }}
      >
        Display name
      </label>
      <input
        id="account-display-name"
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSuccess(null);
        }}
        maxLength={30}
        placeholder={
          initialDisplayName ? "" : "Not set yet — set it on your first comment."
        }
        disabled={pending || lockedByCooldown}
        className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink"
        style={{
          fontSize: "1rem",
          opacity: lockedByCooldown ? 0.55 : 1,
        }}
      />
      <p
        className="font-serif italic text-ink-faint"
        style={{ fontSize: "0.82rem" }}
      >
        {lockedByCooldown && effectiveNextAllowedAt ? (
          <>You can change your display name once every 30 days. Next change available {formatDate(effectiveNextAllowedAt)}.</>
        ) : (
          <>Once per 30 days. Saving rewrites this name on all your past comments.</>
        )}
      </p>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || !dirty || !value.trim() || lockedByCooldown}
          className="btn-secondary"
          style={{
            opacity: !dirty || pending || lockedByCooldown ? 0.55 : 1,
            cursor:
              !dirty || pending || lockedByCooldown ? "default" : "pointer",
          }}
        >
          <span>{pending ? "Saving…" : "Save name"}</span>
        </button>
        {success && (
          <span
            className="font-serif italic"
            style={{ fontSize: "0.88rem", color: "var(--eye-deep)" }}
          >
            {success}
          </span>
        )}
        {error && (
          <span
            className="font-serif italic text-sm"
            style={{ color: "#7a3a2e" }}
          >
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
