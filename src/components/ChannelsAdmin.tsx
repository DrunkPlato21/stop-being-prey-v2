"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChannelPost, ChannelSource } from "@/lib/channel-posts";

// Combined Facebook + X + YouTube social-post admin. Single form,
// source picked from a radio group. Past entries listed below,
// deletable.
//
// AI assist: Clay paste-uploads (Ctrl+V), drag-drops, or clicks to
// pick a screenshot of a post. The image is sent to
// /api/admin/channels/analyze, which calls Claude Sonnet 4.6 vision
// and returns a structured suggestion ({source, preview, timestamp}).
// Form auto-fills; Clay edits if needed before clicking Save.
//
// Paste is the primary input. A document-level paste listener picks
// up image clipboard data without requiring a click first, so the
// workflow is: take screenshot → Ctrl+V → review → Save.

const MAX_TEXT = 100;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type AnalyzeSuggestion = {
  suggested_source: "X" | "Facebook" | "YouTube" | "unknown";
  suggested_preview: string;
  extracted_text: string;
  extracted_timestamp: string | null;
};

type AnalyzeApi =
  | {
      ok: true;
      suggestion: AnalyzeSuggestion;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadInputTokens: number;
        cacheCreationInputTokens: number;
      };
    }
  | { ok: false; error: string; detail?: string; retryAfterSeconds?: number };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("read_failed"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

// Best-effort parser for the relative timestamps the AI returns.
// Supports "9h", "12m", "2d", "3w", "May 11", "May 11, 2026", "yesterday",
// "now". Returns null on anything it doesn't understand; the caller
// leaves the existing posted-at value in place.
function parseRelativeTimestamp(
  raw: string | null,
  now: Date = new Date()
): Date | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t === "now" || t === "just now") return now;
  if (t === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }
  const rel = t.match(
    /^(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days|w|wk|wks)$/
  );
  if (rel) {
    const n = Number.parseInt(rel[1], 10);
    const unit = rel[2];
    const d = new Date(now);
    if (unit.startsWith("s")) d.setSeconds(d.getSeconds() - n);
    else if (unit === "m" || unit.startsWith("min"))
      d.setMinutes(d.getMinutes() - n);
    else if (unit.startsWith("h")) d.setHours(d.getHours() - n);
    else if (unit.startsWith("d")) d.setDate(d.getDate() - n);
    else if (unit.startsWith("w")) d.setDate(d.getDate() - n * 7);
    return d;
  }
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed);
  return null;
}

function sourceFromSuggestion(s: AnalyzeSuggestion["suggested_source"]):
  | ChannelSource
  | null {
  if (s === "X") return "x";
  if (s === "Facebook") return "fb";
  if (s === "YouTube") return "youtube";
  return null;
}

const FB_HOST_HINT = /(?:^|\.)(facebook\.com|fb\.com|fb\.watch)$/i;
const X_HOST_HINT = /(?:^|\.)(x\.com|twitter\.com)$/i;
const YT_HOST_HINT = /(?:^|\.)(youtube\.com|youtu\.be)$/i;

// Detect platform from a pasted URL so the toggle flips itself.
// Tolerant of missing protocols (e.g. "x.com/foo/status/123").
function detectSourceFromUrl(input: string): ChannelSource | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidates = trimmed.match(/^https?:\/\//i)
    ? [trimmed]
    : [`https://${trimmed}`, trimmed];
  for (const candidate of candidates) {
    try {
      const host = new URL(candidate).hostname.toLowerCase();
      if (FB_HOST_HINT.test(host)) return "fb";
      if (X_HOST_HINT.test(host)) return "x";
      if (YT_HOST_HINT.test(host)) return "youtube";
    } catch {
      // try next candidate
    }
  }
  return null;
}

function analyzeErrorMessage(code: string): string {
  switch (code) {
    case "rate_limited":
      return "Hit the 10-per-hour AI cap. Fill the fields in manually for now.";
    case "ai_unavailable":
      return "AI assist isn't configured on this deploy. Fill in manually.";
    case "ai_timeout":
      return "AI took too long. Try again, or fill in manually.";
    case "ai_parse_failed":
      return "AI couldn't read this clearly. Please fill in manually.";
    case "image_too_large":
      return "Image is larger than 5 MB. Crop or resize it first.";
    case "invalid_image":
      return "That doesn't look like a supported image (PNG, JPG, WebP).";
    default:
      return "AI assist failed. Fill in manually.";
  }
}

function formatDateInput(d: Date): string {
  // Format for <input type="datetime-local"> — local time, no seconds.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function formatDisplay(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sourceLabel(s: ChannelSource): string {
  if (s === "fb") return "On Facebook";
  if (s === "youtube") return "On YouTube";
  return "On X";
}

function errorMessage(code: string): string {
  switch (code) {
    case "storage_unavailable":
      return "Storage backend is unavailable.";
    case "invalid_source":
      return "Pick Facebook, X, or YouTube for the source.";
    case "invalid_url":
      return "URL host doesn't match the chosen source.";
    case "empty_text":
      return "Add the first line of the post.";
    case "invalid_date":
      return "Posted-at date is invalid.";
    case "missing_fields":
      return "Source, URL, text, and timestamp are all required.";
    default:
      return code;
  }
}

export function ChannelsAdmin({
  initialPosts,
}: {
  initialPosts: ChannelPost[];
}) {
  const [posts, setPosts] = useState<ChannelPost[]>(initialPosts);
  const [source, setSource] = useState<ChannelSource>("fb");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [postedAt, setPostedAt] = useState<string>(() =>
    formatDateInput(new Date())
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeNotice, setAnalyzeNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const nowLabel = useMemo(() => formatDateInput(new Date()), []);

  // Run a screenshot through the analyze endpoint and apply the
  // suggestion to the form. Always renders the thumbnail so Clay
  // sees that the paste landed even when the AI can't parse it.
  async function handleImage(file: File) {
    if (analyzing) return;
    if (!file.type.startsWith("image/")) {
      setAnalyzeError("That doesn't look like an image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setAnalyzeError("Image is larger than 5 MB. Crop or resize it first.");
      return;
    }
    setAnalyzeError(null);
    setAnalyzeNotice(null);

    let dataUrl: string;
    try {
      dataUrl = await fileToDataUrl(file);
    } catch {
      setAnalyzeError("Couldn't read that file.");
      return;
    }
    setImagePreview(dataUrl);
    setAnalyzing(true);

    try {
      const res = await fetch("/api/admin/channels/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data: AnalyzeApi = await res.json().catch(() => ({
        ok: false,
        error: "ai_error",
      }));

      if (!data.ok) {
        const base = analyzeErrorMessage(data.error);
        setAnalyzeError(
          data.detail ? `${base} (${data.detail})` : base
        );
        return;
      }

      const { suggestion } = data;
      const mappedSource = sourceFromSuggestion(suggestion.suggested_source);
      if (mappedSource) setSource(mappedSource);
      if (suggestion.suggested_preview) {
        setText(suggestion.suggested_preview.slice(0, MAX_TEXT));
      }
      const parsedTs = parseRelativeTimestamp(suggestion.extracted_timestamp);
      if (parsedTs) setPostedAt(formatDateInput(parsedTs));

      const notes: string[] = [];
      if (suggestion.suggested_source === "unknown") {
        notes.push("source unclear, pick one above");
      }
      if (!suggestion.suggested_preview) {
        notes.push("no preview suggested");
      }
      if (suggestion.extracted_timestamp && !parsedTs) {
        notes.push(
          `couldn't parse "${suggestion.extracted_timestamp}" — adjust manually`
        );
      }
      setAnalyzeNotice(
        notes.length > 0
          ? `Filled in what I could (${notes.join("; ")}).`
          : "Filled in source, preview, and timestamp. Review and save."
      );
    } catch {
      setAnalyzeError(analyzeErrorMessage("ai_error"));
    } finally {
      setAnalyzing(false);
    }
  }

  // Document-level paste listener. Fires without requiring focus on
  // any input — Clay's workflow is Win+Shift+S → Ctrl+V, no extra
  // click. Only intercepts image clipboard data so pasting text into
  // the URL field still works as expected.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (analyzing) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void handleImage(file);
          }
          return;
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // handleImage closes over analyzing only; safe to skip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzing]);

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleImage(file);
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleImage(file);
    e.target.value = "";
  }

  function clearScreenshot() {
    setImagePreview(null);
    setAnalyzeError(null);
    setAnalyzeNotice(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/admin/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          url: url.trim(),
          text: text.trim(),
          postedAt: new Date(postedAt).toISOString(),
        }),
      });
      const data: { ok?: boolean; post?: ChannelPost; error?: string } =
        await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.post) {
        setError(errorMessage(data.error ?? "save_failed"));
        setPending(false);
        return;
      }
      setPosts((prev) =>
        [data.post!, ...prev].sort((a, b) => b.postedAt - a.postedAt)
      );
      setUrl("");
      setText("");
      setPostedAt(formatDateInput(new Date()));
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this entry from the feed?")) return;
    try {
      const res = await fetch(`/api/admin/channels/${id}`, {
        method: "DELETE",
      });
      const data: { ok?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(errorMessage(data.error ?? "delete_failed"));
        return;
      }
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete_failed");
    }
  }

  const urlPlaceholder =
    source === "fb"
      ? "https://www.facebook.com/ThomasSowellQuotes/posts/..."
      : source === "youtube"
        ? "https://www.youtube.com/watch?v=..."
        : "https://x.com/yourhandle/status/...";
  const urlHint =
    source === "fb"
      ? "Must be a facebook.com / fb.com URL."
      : source === "youtube"
        ? "Must be a youtube.com or youtu.be URL."
        : "Must be an x.com or twitter.com URL.";

  return (
    <div className="flex flex-col gap-12">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <h2
          className="font-display text-ink"
          style={{ fontSize: "1.15rem", fontWeight: 700 }}
        >
          New entry
        </h2>

        {/* AI-assisted screenshot zone. Paste is the primary path —
            the document-level listener picks up images without
            requiring focus. Drag-drop and click-to-pick are
            fallbacks. */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !analyzing && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Paste, drop, or click to upload a screenshot"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!analyzing) fileInputRef.current?.click();
            }
          }}
          className="relative flex flex-col items-center justify-center text-center px-6 py-7 border-2 border-dashed transition-colors"
          style={{
            background: "var(--paper-deep)",
            borderColor: dragOver
              ? "var(--eye-deep)"
              : "var(--rule)",
            cursor: analyzing ? "wait" : "pointer",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onFilePick}
            disabled={analyzing}
            className="hidden"
          />

          {imagePreview ? (
            <div className="flex flex-col items-center gap-3 w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Pasted screenshot preview"
                style={{
                  maxHeight: 180,
                  maxWidth: "100%",
                  objectFit: "contain",
                  border: "1px solid var(--rule)",
                }}
              />
              {analyzing ? (
                <p
                  className="font-serif italic text-ink-muted"
                  style={{ fontSize: "0.9rem" }}
                >
                  Analyzing&hellip;
                </p>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearScreenshot();
                  }}
                  className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep transition-colors"
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 500,
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                  }}
                >
                  clear screenshot
                </button>
              )}
            </div>
          ) : (
            <>
              <p
                className="font-display uppercase text-ink"
                style={{
                  fontSize: "0.72rem",
                  letterSpacing: "0.24em",
                  fontWeight: 600,
                  marginBottom: "0.45rem",
                }}
              >
                Paste a screenshot &middot; Ctrl+V
              </p>
              <p
                className="font-serif italic text-ink-muted"
                style={{ fontSize: "0.88rem", lineHeight: 1.5 }}
              >
                Or drop a file here, or click to choose.
                <br />
                AI will suggest source + preview text. You can edit
                before saving.
              </p>
            </>
          )}

          {analyzing && !imagePreview && (
            <p
              className="font-serif italic text-ink-muted mt-3"
              style={{ fontSize: "0.88rem" }}
            >
              Analyzing&hellip;
            </p>
          )}
        </div>

        {analyzeNotice && (
          <p
            className="font-serif italic text-eye-deep"
            style={{ fontSize: "0.85rem" }}
          >
            {analyzeNotice}
          </p>
        )}
        {analyzeError && (
          <p
            className="font-serif italic"
            style={{ fontSize: "0.85rem", color: "#7a3a2e" }}
          >
            {analyzeError}
          </p>
        )}

        <div>
          <span className="eyebrow block mb-2">Source</span>
          <div
            role="radiogroup"
            aria-label="Source"
            className="grid grid-cols-3 border border-border"
          >
            {(
              [
                { value: "fb", label: "Facebook" },
                { value: "x", label: "X" },
                { value: "youtube", label: "YouTube" },
              ] as const
            ).map((opt, idx) => {
              const active = source === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSource(opt.value)}
                  disabled={pending}
                  className="font-display uppercase transition-colors"
                  style={{
                    fontSize: "0.78rem",
                    letterSpacing: "0.22em",
                    fontWeight: 600,
                    padding: "0.85rem 1rem",
                    background: active ? "var(--ink)" : "transparent",
                    color: active ? "var(--paper)" : "var(--ink)",
                    border: 0,
                    borderLeft:
                      idx === 0 ? "0" : "1px solid var(--border)",
                    cursor: pending ? "wait" : "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="eyebrow block mb-2">Post URL</span>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              const next = e.target.value;
              setUrl(next);
              const detected = detectSourceFromUrl(next);
              if (detected && detected !== source) setSource(detected);
            }}
            placeholder={urlPlaceholder}
            disabled={pending}
            required
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
            style={{ fontSize: "0.95rem" }}
          />
          <p
            className="font-serif italic text-ink-faint mt-2"
            style={{ fontSize: "0.78rem" }}
          >
            {urlHint}
          </p>
        </label>

        <label className="block">
          <span className="eyebrow block mb-2">First line / preview</span>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
            maxLength={MAX_TEXT}
            placeholder="What should show in the feed."
            disabled={pending}
            required
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
            style={{ fontSize: "0.95rem" }}
          />
          <p
            className="font-serif italic text-ink-faint mt-2"
            style={{ fontSize: "0.78rem" }}
          >
            {text.length} / {MAX_TEXT}
          </p>
        </label>

        <label className="block">
          <span className="eyebrow block mb-2">Posted at</span>
          <input
            type="datetime-local"
            value={postedAt}
            onChange={(e) => setPostedAt(e.target.value)}
            max={nowLabel}
            disabled={pending}
            required
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
            style={{ fontSize: "0.95rem" }}
          />
        </label>

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={pending || !url.trim() || !text.trim()}
            className="btn-primary"
            style={{
              opacity: pending || !url.trim() || !text.trim() ? 0.6 : 1,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            <span>{pending ? "adding…" : "Add to feed"}</span>
          </button>
        </div>

        {error && (
          <p
            className="font-serif italic"
            style={{ color: "#7a3a2e", fontSize: "0.9rem" }}
          >
            {error}
          </p>
        )}
      </form>

      <section>
        <h2
          className="font-display text-ink mb-5"
          style={{ fontSize: "1.15rem", fontWeight: 700 }}
        >
          Past entries
        </h2>

        {posts.length === 0 ? (
          <p className="font-serif italic text-ink-faint">
            Nothing in the feed yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {posts.map((p, idx) => (
              <li
                key={p.id}
                className={idx === 0 ? "py-5" : "py-5 border-t border-rule"}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className="font-display uppercase"
                      style={{
                        fontSize: "0.6rem",
                        letterSpacing: "0.22em",
                        fontWeight: 700,
                        color: "var(--eye-deep)",
                      }}
                    >
                      {sourceLabel(p.source)}
                    </span>
                    <span
                      className="font-display uppercase text-ink-muted"
                      style={{
                        fontSize: "0.6rem",
                        letterSpacing: "0.22em",
                        fontWeight: 600,
                      }}
                    >
                      · {formatDisplay(p.postedAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep transition-colors"
                    style={{
                      fontSize: "0.62rem",
                      fontWeight: 500,
                      background: "transparent",
                      border: 0,
                      cursor: "pointer",
                    }}
                  >
                    delete
                  </button>
                </div>
                <p
                  className="font-serif text-ink leading-relaxed mb-2"
                  style={{ fontSize: "0.95rem" }}
                >
                  {p.text}
                </p>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors break-all"
                  style={{ fontSize: "0.62rem", fontWeight: 600 }}
                >
                  open{" "}
                  {p.source === "fb"
                    ? "on facebook"
                    : p.source === "youtube"
                      ? "on youtube"
                      : "on x"}{" "}
                  &rarr;
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
