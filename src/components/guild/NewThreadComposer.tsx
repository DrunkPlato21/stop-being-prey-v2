"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { postThreadAction, type GuildFormState } from "@/app/guild/actions";
import { FormatToolbar } from "./FormatToolbar";
import { ComposerPreview, useComposerPreview } from "./ComposerPreview";
import { DraftNotice } from "./DraftNotice";
import { readComposerDraft, useComposerDraft } from "./useComposerDraft";
import { GuildImagePicker } from "./GuildImagePicker";
import { MentionAutoResizingTextarea } from "@/components/MentionAutoResizingTextarea";
import {
  GUILD_CATEGORIES,
  MAX_BODY,
  MAX_TITLE,
  type GuildCategory,
} from "@/lib/guild-constants";

const INITIAL: GuildFormState = { ok: false };

// One draft slot for the room's one new-thread composer.
const DRAFT_KEY = "thread:new";
type ThreadDraft = { title: string; body: string; category: string };

// Open-a-thread composer. Collapsed by default so the index reads calm;
// one tap opens it. Low friction: a title, a body, post. On success the
// action redirects into the new thread, so there's no success state to
// handle here.
export function NewThreadComposer({
  // True when the viewer has no display name yet: reveal an inline name
  // field (the server action requires it before the thread lands). Never
  // set for the admin. See the first-post gate in guild/actions.ts.
  needsDisplayName = false,
}: {
  needsDisplayName?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    postThreadAction,
    INITIAL
  );
  // Seeded from any rescued draft. Safe to read storage during render: this
  // form only mounts after the collapsed button is tapped, so it is never
  // server-rendered and can't desync hydration.
  const [saved] = useState(() => readComposerDraft<ThreadDraft>(DRAFT_KEY));
  const [title, setTitle] = useState(saved?.title ?? "");
  const [body, setBody] = useState(saved?.body ?? "");
  // First-post display name. Only used (and only gates the button) when
  // needsDisplayName; the input carries name="displayName" so it rides the
  // form action straight to the gate.
  const [displayName, setDisplayName] = useState("");
  // Required. Empty until the author picks, which gates the Post button.
  const [category, setCategory] = useState<GuildCategory | "">(
    (saved?.category as GuildCategory | undefined) ?? ""
  );
  const [imageUploading, setImageUploading] = useState(false);
  const nameMissing = needsDisplayName && !displayName.trim();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const preview = useComposerPreview(bodyRef);
  const draft = useComposerDraft<ThreadDraft>(
    DRAFT_KEY,
    { title, body, category },
    !title.trim() && !body.trim() && !category,
    !!saved
  );
  // The collapsed button says so when there's an unfinished thread waiting,
  // but only after hydration: the server has no idea what's in this
  // member's storage, and the two first renders have to agree.
  const [showDraftCue, setShowDraftCue] = useState(false);
  useEffect(() => {
    if (saved?.body?.trim() || saved?.title?.trim()) setShowDraftCue(true);
  }, [saved]);

  // The draft is cleared on submit, since a successful post redirects and
  // this component never hears about it. If the server rejects instead, the
  // words are still on screen, so put them straight back in storage.
  useEffect(() => {
    if (state.error) draft.saveNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Reopening a rescued draft puts the caret at the end of the body, where
  // the member actually left off.
  useEffect(() => {
    if (!open || !saved?.body) return;
    const ta = bodyRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function discardDraft() {
    setTitle("");
    setBody("");
    setCategory("");
    draft.clear();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-display uppercase tracking-[0.18em] transition-colors hover:text-ink"
        style={{
          color: "var(--eye-deep)",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 2,
          padding: "0.7rem 1.2rem",
          fontSize: "0.72rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {showDraftCue ? "Finish your thread" : "Open a thread"}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => draft.clear()}
      className="border border-rule"
      style={{ background: "var(--surface)", padding: "1.25rem", borderRadius: 2 }}
    >
      <p
        className="eyebrow"
        style={{ letterSpacing: "0.28em", fontSize: "0.62rem", marginBottom: "0.8rem" }}
      >
        New thread
      </p>
      {draft.rescued && <DraftNotice onDiscard={discardDraft} />}
      {/* Category — a required pick, placed first on purpose. Choosing
          the kind of post before writing scaffolds it and kills the
          blank-page freeze. The hint doubles as a prompt. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {GUILD_CATEGORIES.map((c) => {
          const active = category === c.slug;
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => setCategory(c.slug)}
              aria-pressed={active}
              className="font-display uppercase tracking-[0.16em] transition-colors"
              style={{
                background: active ? "var(--eye-deep)" : "transparent",
                color: active ? "var(--surface)" : "var(--eye-deep)",
                border: "1px solid var(--eye-deep)",
                borderRadius: 2,
                padding: "0.4rem 0.8rem",
                fontSize: "0.64rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p
        style={{
          minHeight: "1.1rem",
          margin: "0.55rem 0 1.1rem",
          fontSize: "0.82rem",
          fontStyle: "italic",
          color: "var(--ink-soft)",
        }}
      >
        {category
          ? GUILD_CATEGORIES.find((c) => c.slug === category)?.hint
          : "Pick what kind of thread this is."}
      </p>
      <input type="hidden" name="category" value={category} />
      {needsDisplayName && (
        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="guild-thread-display-name"
            className="eyebrow"
            style={{ letterSpacing: "0.22em", fontSize: "0.62rem" }}
          >
            Display name
          </label>
          <input
            id="guild-thread-display-name"
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 30))}
            maxLength={30}
            placeholder="How you'll appear (30 char max)"
            className="w-full"
            style={{
              background: "transparent",
              border: "1px solid var(--rule)",
              borderRadius: 2,
              fontFamily: "var(--font-source-serif), Georgia, serif",
              fontSize: "1rem",
              color: "var(--ink)",
              padding: "0.55rem 0.7rem",
              marginTop: "0.4rem",
              outline: "none",
            }}
          />
          <p
            style={{
              margin: "0.4rem 0 0",
              fontSize: "0.8rem",
              fontStyle: "italic",
              color: "var(--ink-faint)",
            }}
          >
            Set once. You can change it later from your account.
          </p>
        </div>
      )}
      <input
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
        placeholder="What is this thread about?"
        // A restored draft focuses the body instead (see below): landing in
        // the title puts the caret at the end of a long line and scrolls it
        // mid-word, which reads as damage rather than as a rescue.
        autoFocus={!saved}
        className="w-full font-display"
        style={{
          background: "transparent",
          border: "none",
          borderBottom: "1px solid var(--rule)",
          fontSize: "1.4rem",
          color: "var(--ink)",
          padding: "0.4rem 0",
          marginBottom: "1rem",
          outline: "none",
        }}
      />
      <FormatToolbar
        textareaRef={bodyRef}
        value={body}
        onChange={(v) => setBody(v.slice(0, MAX_BODY))}
        previewing={preview.previewing}
        onTogglePreview={preview.toggle}
      />
      {/* The textarea is hidden, never unmounted: a hidden field still
          submits, so a member can post straight from preview. */}
      {preview.previewing && (
        <ComposerPreview text={body} minHeight={preview.minHeight} />
      )}
      <MentionAutoResizingTextarea
        ref={bodyRef}
        name="body"
        value={body}
        onValueChange={(v) => setBody(v.slice(0, MAX_BODY))}
        placeholder="Lay out the question or the case. Take the space you need."
        minRows={6}
        className="w-full"
        style={{
          display: preview.previewing ? "none" : undefined,
          background: "transparent",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontSize: "1.05rem",
          lineHeight: 1.6,
          color: "var(--ink)",
          padding: "0.8rem",
          outline: "none",
          // The Guild composer has always offered the drag handle. Auto-grow
          // makes it redundant, but taking it away is a visible change to a
          // box members are used to, so it stays.
          resize: "vertical",
          overflow: "auto",
        }}
      />
      <GuildImagePicker onUploadingChange={setImageUploading} />
      {state.error && (
        <p style={{ color: "var(--blood)", fontSize: "0.85rem", marginTop: "0.6rem" }}>
          {state.error}
        </p>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "1rem",
          marginTop: "1rem",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-display uppercase tracking-[0.18em] text-ink-faint hover:text-ink transition-colors"
          style={{ background: "transparent", border: 0, fontSize: "0.66rem", fontWeight: 600, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={
            pending ||
            imageUploading ||
            !title.trim() ||
            !body.trim() ||
            !category ||
            nameMissing
          }
          className="font-display uppercase tracking-[0.18em] transition-opacity"
          style={{
            background: "var(--eye-deep)",
            color: "var(--surface)",
            border: 0,
            borderRadius: 2,
            padding: "0.6rem 1.4rem",
            fontSize: "0.7rem",
            fontWeight: 600,
            cursor: pending ? "default" : "pointer",
            opacity:
              pending ||
              imageUploading ||
              !title.trim() ||
              !body.trim() ||
              !category ||
              nameMissing
                ? 0.5
                : 1,
          }}
        >
          {pending ? "Posting…" : "Post thread"}
        </button>
      </div>
    </form>
  );
}
