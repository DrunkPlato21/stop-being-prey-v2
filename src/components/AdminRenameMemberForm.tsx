"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Inline rename control for the admin members page. POSTs to
// /api/admin/members/:email/rename with the new displayName; the
// endpoint bypasses the member's 30-day cooldown and writes an admin
// entry to the audit log.

const ERRORS: Record<string, string> = {
  display_name_required: "Pick a display name first.",
  invalid_display_name: "That display name isn't allowed.",
  reserved: "That name is reserved. Try another.",
  profanity: "That name isn't allowed. Try another.",
  name_taken: "Someone else is already using that name.",
  storage_unavailable: "Storage temporarily unavailable.",
};

type Props = {
  memberEmail: string;
  currentDisplayName: string;
};

export function AdminRenameMemberForm({
  memberEmail,
  currentDisplayName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentDisplayName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!value.trim()) {
      setError(ERRORS.display_name_required);
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/admin/members/${encodeURIComponent(memberEmail)}/rename`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: value }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        updatedComments?: number;
      };
      if (!res.ok) {
        setError(
          (data.error && ERRORS[data.error]) || "Couldn't rename. Try again."
        );
        setPending(false);
        return;
      }
      const n = data.updatedComments ?? 0;
      setSuccess(
        n === 0 ? "Renamed." : `Renamed. ${n} past comment${n === 1 ? "" : "s"} updated.`
      );
      setPending(false);
      router.refresh();
    } catch {
      setError("Couldn't rename. Try again.");
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-display uppercase tracking-[0.2em] text-ink-faint hover:text-eye-deep bg-transparent border-0 cursor-pointer p-0 transition-colors"
        style={{ fontSize: "0.65rem", fontWeight: 600 }}
      >
        rename
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={30}
        disabled={pending}
        className="font-serif text-ink bg-paper border border-border px-2 py-1 outline-none focus:border-ink"
        style={{ fontSize: "0.9rem", minWidth: "10rem" }}
      />
      <button
        type="submit"
        disabled={pending || !value.trim()}
        className="font-display uppercase tracking-[0.2em] text-eye-deep hover:text-ink bg-transparent border-0 cursor-pointer p-0 transition-colors"
        style={{
          fontSize: "0.65rem",
          fontWeight: 600,
          opacity: pending || !value.trim() ? 0.55 : 1,
        }}
      >
        {pending ? "saving…" : "save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setValue(currentDisplayName);
          setError(null);
          setSuccess(null);
        }}
        className="font-display uppercase tracking-[0.2em] text-ink-faint hover:text-ink bg-transparent border-0 cursor-pointer p-0 transition-colors"
        style={{ fontSize: "0.65rem", fontWeight: 500 }}
      >
        cancel
      </button>
      {error && (
        <span
          className="font-serif italic"
          style={{ fontSize: "0.82rem", color: "#7a3a2e" }}
        >
          {error}
        </span>
      )}
      {success && (
        <span
          className="font-serif italic"
          style={{ fontSize: "0.82rem", color: "var(--eye-deep)" }}
        >
          {success}
        </span>
      )}
    </form>
  );
}
