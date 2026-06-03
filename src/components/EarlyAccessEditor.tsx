"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Localhost-only authoring editor for an early-access essay. Left: the
// raw markdown (frontmatter + body + tokens). Right: a live preview that
// is rendered by the SAME server pipeline the live page uses
// (/api/admin/early-access/[slug]/preview -> checkEssaySource), so what
// you see here is what production renders. Save (Cmd/Ctrl+S) PUTs the
// file to disk; it's blocked while there's a hard validation error, so a
// broken essay can't be written. Then you commit + deploy as usual.

type Preview = {
  errors: string[];
  warnings: string[];
  title: string;
  dateStr: string;
  bodyHtml: string;
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; warnings: string[] }
  | { kind: "error"; message: string };

const PREVIEW_DEBOUNCE_MS = 400;

export function EarlyAccessEditor({
  slug,
  initialRaw,
}: {
  slug: string;
  initialRaw: string;
}) {
  const [raw, setRaw] = useState(initialRaw);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  const savedRawRef = useRef(initialRaw);
  const dirty = raw !== savedRawRef.current;

  // Latest-wins preview fetch. A ref holds the in-flight controller so a
  // newer keystroke aborts the older request, and a token guards against
  // an out-of-order response clobbering a newer one.
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  const runPreview = useCallback(
    async (text: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const reqId = ++reqIdRef.current;
      setPreviewing(true);
      try {
        const res = await fetch(
          `/api/admin/early-access/${slug}/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raw: text }),
            signal: controller.signal,
          }
        );
        const data = (await res.json()) as Preview;
        if (reqId === reqIdRef.current) setPreview(data);
      } catch (e) {
        // Aborted requests are expected on fast typing; ignore them.
        if ((e as Error)?.name !== "AbortError" && reqId === reqIdRef.current) {
          setPreview({
            errors: ["Preview failed to load. Is the dev server running?"],
            warnings: [],
            title: "",
            dateStr: "",
            bodyHtml: "",
          });
        }
      } finally {
        if (reqId === reqIdRef.current) setPreviewing(false);
      }
    },
    [slug]
  );

  // First paint: render whatever's on disk.
  useEffect(() => {
    void runPreview(initialRaw);
  }, [initialRaw, runPreview]);

  // Debounced re-preview on every edit.
  useEffect(() => {
    if (raw === initialRaw && preview) return; // already previewed on mount
    const t = setTimeout(() => void runPreview(raw), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const hasErrors = (preview?.errors.length ?? 0) > 0;

  const doSave = useCallback(async () => {
    if (!dirty || hasErrors || save.kind === "saving") return;
    setSave({ kind: "saving" });
    try {
      const res = await fetch(`/api/admin/early-access/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const data: { error?: string; errors?: string[]; warnings?: string[] } =
        await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data.errors?.length
          ? data.errors.join(" ")
          : (data.error ?? "save_failed");
        setSave({ kind: "error", message: detail });
        return;
      }
      savedRawRef.current = raw;
      setSave({ kind: "saved", warnings: data.warnings ?? [] });
    } catch {
      setSave({ kind: "error", message: "Network error while saving." });
    }
  }, [dirty, hasErrors, save.kind, slug, raw]);

  // Cmd/Ctrl+S saves instead of triggering the browser's save dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void doSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave]);

  // Guard against losing unsaved edits on accidental tab close / reload.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <div className="ea-editor">
      {/* Toolbar */}
      <div className="ea-editor-bar">
        <div className="ea-editor-bar-left">
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={!dirty || hasErrors || save.kind === "saving"}
            className="ea-editor-save"
          >
            {save.kind === "saving"
              ? "Saving…"
              : dirty
                ? "Save  (⌘S)"
                : "Saved"}
          </button>
          <StatusLine
            dirty={dirty}
            hasErrors={hasErrors}
            previewing={previewing}
            save={save}
          />
        </div>
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noreferrer"
          className="ea-editor-livelink"
        >
          Open live page ↗
        </a>
      </div>

      {/* Hard errors — block save, shown across the top */}
      {hasErrors && (
        <div className="ea-editor-errors" role="alert">
          <strong>Can&apos;t save yet:</strong>
          <ul>
            {preview!.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Soft warnings — informational, save still allowed */}
      {!hasErrors && (preview?.warnings.length ?? 0) > 0 && (
        <div className="ea-editor-warnings">
          <ul>
            {preview!.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Split pane */}
      <div className="ea-editor-split">
        <div className="ea-editor-pane">
          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              if (save.kind !== "idle") setSave({ kind: "idle" });
            }}
            spellCheck
            className="ea-editor-textarea"
            aria-label="Essay markdown source"
          />
        </div>
        <div className="ea-editor-pane ea-editor-preview-pane">
          {preview && !hasErrors ? (
            <article>
              <header className="ea-editor-preview-masthead">
                <p className="eyebrow">Members · Early access</p>
                <h1>{preview.title}</h1>
                {preview.dateStr && (
                  <p className="ea-editor-preview-dateline">
                    By Clay · {preview.dateStr}
                  </p>
                )}
              </header>
              <div
                className="prose-article ea-essay"
                dangerouslySetInnerHTML={{ __html: preview.bodyHtml }}
              />
            </article>
          ) : (
            <p className="ea-editor-preview-empty">
              {hasErrors
                ? "Fix the error above to see the preview."
                : "Loading preview…"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusLine({
  dirty,
  hasErrors,
  previewing,
  save,
}: {
  dirty: boolean;
  hasErrors: boolean;
  previewing: boolean;
  save: SaveState;
}) {
  let text = "";
  let tone: "muted" | "good" | "bad" = "muted";

  if (save.kind === "error") {
    text = save.message;
    tone = "bad";
  } else if (save.kind === "saved" && !dirty) {
    text =
      save.warnings.length > 0
        ? `Saved. ${save.warnings.length} note${save.warnings.length === 1 ? "" : "s"} below.`
        : "Saved to disk. Commit + deploy to publish.";
    tone = "good";
  } else if (hasErrors) {
    text = "Unsaved — error blocking save.";
    tone = "bad";
  } else if (dirty) {
    text = previewing ? "Unsaved · previewing…" : "Unsaved changes.";
    tone = "muted";
  } else {
    text = "Up to date.";
    tone = "muted";
  }

  return <span className={`ea-editor-status ea-editor-status-${tone}`}>{text}</span>;
}
