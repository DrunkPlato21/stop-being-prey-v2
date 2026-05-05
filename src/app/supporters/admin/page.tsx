import type { Metadata } from "next";
import { listAll, isStorageConfigured } from "@/lib/supporters";
import {
  deleteEntryAction,
  toggleApprovedAction,
  toggleVisibilityAction,
  updateAttributionAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Supporters · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function AdminPage() {
  const configured = isStorageConfigured();
  const entries = configured ? await listAll() : [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="eyebrow mb-3">Internal</p>
      <h1
        className="font-display text-ink mb-2"
        style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}
      >
        Supporters · Admin
      </h1>
      <p className="text-sm text-ink-muted italic mb-8">
        {configured
          ? `${entries.length} total · approved+visible appear on /supporters`
          : "Storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."}
      </p>

      {entries.length === 0 ? (
        <p className="text-ink-muted italic">No entries.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border border-rule p-5 bg-surface"
            >
              <div className="flex items-baseline justify-between gap-4 mb-3">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-faint">
                  {formatDate(entry.timestamp)} · {entry.source}
                </p>
                <code className="text-[0.65rem] text-ink-faint">{entry.id}</code>
              </div>

              <blockquote className="font-display italic text-ink leading-snug mb-4 border-l-2 border-eye pl-4 py-1" style={{ fontSize: "1.05rem" }}>
                {entry.message}
              </blockquote>

              <form
                action={updateAttributionAction}
                className="flex flex-col sm:flex-row gap-2 mb-3"
              >
                <input type="hidden" name="id" value={entry.id} />
                <input
                  name="attribution"
                  defaultValue={entry.attribution}
                  className="flex-1 border border-border bg-paper px-3 py-2 text-sm font-serif outline-none focus:border-eye"
                  aria-label="Attribution"
                />
                <button
                  type="submit"
                  className="font-display text-xs uppercase tracking-[0.18em] px-3 py-2 border border-ink hover:bg-ink hover:text-paper transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  Save attribution
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-3 mt-4 text-xs uppercase tracking-[0.14em]">
                <form action={toggleVisibilityAction}>
                  <input type="hidden" name="id" value={entry.id} />
                  <input
                    type="hidden"
                    name="visible"
                    value={entry.visible ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 border border-ink hover:bg-ink hover:text-paper transition-colors font-display"
                    style={{ fontWeight: 600 }}
                  >
                    {entry.visible ? "Hide" : "Show"}
                  </button>
                </form>

                <form action={toggleApprovedAction}>
                  <input type="hidden" name="id" value={entry.id} />
                  <input
                    type="hidden"
                    name="approved"
                    value={entry.approved ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 border border-ink hover:bg-ink hover:text-paper transition-colors font-display"
                    style={{ fontWeight: 600 }}
                  >
                    {entry.approved ? "Unapprove" : "Approve"}
                  </button>
                </form>

                <form action={deleteEntryAction}>
                  <input type="hidden" name="id" value={entry.id} />
                  <button
                    type="submit"
                    className="px-3 py-2 border border-ink-soft text-ink-soft hover:bg-ink-soft hover:text-paper transition-colors font-display"
                    style={{ fontWeight: 600 }}
                  >
                    Delete
                  </button>
                </form>

                <span className="text-ink-faint normal-case tracking-normal italic ml-auto">
                  {entry.approved ? "approved" : "unapproved"} ·{" "}
                  {entry.visible ? "visible" : "hidden"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
