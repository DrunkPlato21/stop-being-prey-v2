"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GuildReply, GuildThread, ReactionSummary } from "@/lib/guild";
import { EDIT_WINDOW_MS, MAX_BODY, MAX_REPLY, MAX_TITLE } from "@/lib/guild-constants";
import {
  deleteReplyAction,
  deleteThreadAction,
  editReplyAction,
  editThreadAction,
  markReplyReadAction,
  markThreadReadAction,
  pinReplyAction,
  pinThreadAction,
  postReplyAction,
  restoreThreadAction,
  type GuildFormState,
} from "@/app/guild/actions";
import { ClayReadSeal } from "./ClayReadSeal";
import { GuildByline, type GuildBadgeInfo } from "./GuildByline";
import { authorName, formatRelative } from "./guild-format";
import { formatGuildBody } from "@/components/guild/format-body";
import { FormatToolbar } from "./FormatToolbar";
import { GuildImage } from "./GuildImage";
import { GuildImagePicker } from "./GuildImagePicker";
import { GuildReactions } from "./GuildReactions";
import { useAutoGrow } from "./useAutoGrow";

const INITIAL: GuildFormState = { ok: false };

const EMPTY_REACTIONS: ReactionSummary = {
  counts: {},
  total: 0,
  myReaction: null,
};

// Every action — member or admin — is the same small-caps link cut from
// this one die: identical size, weight, tracking, and line-height, so a
// row of them sits dead on one baseline. Only colour and position vary.
const controlStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: 0,
  margin: 0,
  cursor: "pointer",
  fontFamily: "var(--font-display), Georgia, serif",
  fontSize: "0.64rem",
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--ink-faint)",
  display: "inline-flex",
  alignItems: "center",
};

// Admin links are the same die, just dimmed — separation is carried by the
// row beneath, not by a smaller, mismatched size.
const adminControlStyle: React.CSSProperties = {
  ...controlStyle,
  color: "var(--ink-faint)",
};

// Member actions: one clean line, everything centred on the same baseline.
const memberRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1.4rem",
  flexWrap: "wrap",
};

// The presiding (admin) row lives BENEATH the member actions, set off by a
// hairline and a quiet eyebrow — a separate register for the king's levers,
// never jammed in beside Reply/React.
const adminRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1.4rem",
  flexWrap: "wrap",
  marginTop: "0.7rem",
  paddingTop: "0.65rem",
  borderTop: "1px solid var(--rule)",
};

// Two-step inline delete. The first click only arms it; a second
// explicit "Confirm" fires the soft delete. Stops the one-click accident
// without a jarring native confirm() box. The delete is reversible by an
// admin, but the confirm still spares everyone the "where did it go".
function DeleteControl({
  action,
  hidden,
  base = controlStyle,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  // The row's link style, so Delete matches its neighbours exactly.
  base?: React.CSSProperties;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} style={base}>
        Delete
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "1.1rem" }}>
      <span style={{ ...base, cursor: "default", color: "var(--ink-muted)" }}>
        Delete?
      </span>
      <form action={action} style={{ display: "inline-flex" }}>
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button type="submit" style={{ ...base, color: "var(--blood)" }}>
          Confirm
        </button>
      </form>
      <button type="button" onClick={() => setArmed(false)} style={base}>
        Cancel
      </button>
    </span>
  );
}

function Body({ text }: { text: string }) {
  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        fontSize: "1.05rem",
        lineHeight: 1.7,
        color: "var(--ink-soft)",
        marginTop: "0.8rem",
      }}
    >
      {formatGuildBody(text)}
    </div>
  );
}

// --- Reply composer (bottom of thread + under any reply) -------------

function ReplyComposer({
  threadId,
  parentReplyId,
  placeholder,
  onDone,
  compact,
  textareaRef,
}: {
  threadId: string;
  parentReplyId: string | null;
  placeholder: string;
  onDone?: () => void;
  compact?: boolean;
  // Optional external handle so the OP's "Reply" button can focus this box.
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [state, formAction, pending] = useActionState(postReplyAction, INITIAL);
  const [body, setBody] = useState("");
  // Image state. `hasImage` gates the send button (so an image-only reply
  // can post); `imgUploading` blocks send mid-upload; bumping `pickerKey`
  // on a successful post remounts the picker to clear its thumbnail.
  const [hasImage, setHasImage] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = textareaRef ?? internalRef;
  useAutoGrow(bodyRef, body);

  const canSend = (body.trim().length > 0 || hasImage) && !imgUploading;

  useEffect(() => {
    if (state.ok) {
      setBody("");
      setHasImage(false);
      setPickerKey((k) => k + 1);
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} style={{ marginTop: compact ? "0.8rem" : "1.5rem" }}>
      <input type="hidden" name="threadId" value={threadId} />
      {parentReplyId && (
        <input type="hidden" name="parentReplyId" value={parentReplyId} />
      )}
      <FormatToolbar
        textareaRef={bodyRef}
        value={body}
        onChange={(v) => setBody(v.slice(0, MAX_REPLY))}
      />
      <textarea
        ref={bodyRef}
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_REPLY))}
        placeholder={placeholder}
        rows={compact ? 3 : 4}
        className="w-full"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontSize: "1rem",
          lineHeight: 1.6,
          color: "var(--ink)",
          padding: "0.7rem",
          outline: "none",
          resize: "vertical",
        }}
      />
      <GuildImagePicker
        key={pickerKey}
        onUploadingChange={setImgUploading}
        onImageChange={setHasImage}
      />
      {state.error && (
        <p style={{ color: "var(--blood)", fontSize: "0.82rem", marginTop: "0.4rem" }}>
          {state.error}
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.9rem", marginTop: "0.6rem" }}>
        {onDone && (
          <button type="button" onClick={onDone} style={controlStyle}>
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={pending || !canSend}
          className="font-display uppercase tracking-[0.18em]"
          style={{
            background: "var(--eye-deep)",
            color: "var(--surface)",
            border: 0,
            borderRadius: 2,
            padding: "0.45rem 1.1rem",
            fontSize: "0.66rem",
            fontWeight: 600,
            cursor: pending ? "default" : "pointer",
            opacity: pending || !canSend ? 0.5 : 1,
          }}
        >
          {pending ? "Posting…" : "Reply"}
        </button>
      </div>
    </form>
  );
}

// --- Inline edit (thread OP) -----------------------------------------

function EditThreadForm({
  thread,
  onDone,
}: {
  thread: GuildThread;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(editThreadAction, INITIAL);
  const [title, setTitle] = useState(thread.title);
  const [body, setBody] = useState(thread.body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(bodyRef, body);
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} style={{ marginTop: "0.6rem" }}>
      <input type="hidden" name="id" value={thread.id} />
      <input
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
        className="w-full font-display"
        style={{
          background: "transparent",
          border: "none",
          borderBottom: "1px solid var(--rule)",
          fontSize: "1.8rem",
          color: "var(--ink)",
          padding: "0.3rem 0",
          marginBottom: "0.8rem",
          outline: "none",
        }}
      />
      <FormatToolbar
        textareaRef={bodyRef}
        value={body}
        onChange={(v) => setBody(v.slice(0, MAX_BODY))}
      />
      <textarea
        ref={bodyRef}
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        rows={6}
        className="w-full"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontSize: "1.05rem",
          lineHeight: 1.6,
          color: "var(--ink)",
          padding: "0.7rem",
          outline: "none",
          resize: "vertical",
        }}
      />
      {state.error && (
        <p style={{ color: "var(--blood)", fontSize: "0.82rem", marginTop: "0.4rem" }}>
          {state.error}
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.9rem", marginTop: "0.6rem" }}>
        <button type="button" onClick={onDone} style={controlStyle}>Cancel</button>
        <button
          type="submit"
          disabled={pending}
          className="font-display uppercase tracking-[0.18em]"
          style={{
            background: "var(--eye-deep)",
            color: "var(--surface)",
            border: 0,
            borderRadius: 2,
            padding: "0.45rem 1.1rem",
            fontSize: "0.66rem",
            fontWeight: 600,
            cursor: "pointer",
            opacity: pending ? 0.5 : 1,
          }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// --- Inline edit (reply) ---------------------------------------------

function EditReplyForm({
  reply,
  onDone,
}: {
  reply: GuildReply;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(editReplyAction, INITIAL);
  const [body, setBody] = useState(reply.body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(bodyRef, body);
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} style={{ marginTop: "0.5rem" }}>
      <input type="hidden" name="id" value={reply.id} />
      <input type="hidden" name="threadId" value={reply.threadId} />
      <FormatToolbar
        textareaRef={bodyRef}
        value={body}
        onChange={(v) => setBody(v.slice(0, MAX_REPLY))}
      />
      <textarea
        ref={bodyRef}
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_REPLY))}
        rows={3}
        className="w-full"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontSize: "1rem",
          lineHeight: 1.6,
          color: "var(--ink)",
          padding: "0.6rem",
          outline: "none",
          resize: "vertical",
        }}
      />
      {state.error && (
        <p style={{ color: "var(--blood)", fontSize: "0.82rem", marginTop: "0.4rem" }}>
          {state.error}
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.9rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onDone} style={controlStyle}>Cancel</button>
        <button
          type="submit"
          disabled={pending}
          className="font-display uppercase tracking-[0.18em]"
          style={{
            background: "var(--eye-deep)",
            color: "var(--surface)",
            border: 0,
            borderRadius: 2,
            padding: "0.4rem 1rem",
            fontSize: "0.64rem",
            fontWeight: 600,
            cursor: "pointer",
            opacity: pending ? 0.5 : 1,
          }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// --- One reply (and its nested children) -----------------------------

function ReplyNode({
  reply,
  childReplies,
  names,
  badges,
  adminEmail,
  viewerEmail,
  isAdmin,
  threadId,
  mounted,
  nested,
  reactions,
  replyTargets,
  isPinned,
  pinnedSlot,
}: {
  reply: GuildReply;
  childReplies?: GuildReply[];
  names: Record<string, string>;
  badges: Record<string, GuildBadgeInfo>;
  adminEmail: string | null;
  viewerEmail: string;
  isAdmin: boolean;
  threadId: string;
  mounted: boolean;
  nested?: boolean;
  reactions: Record<string, ReactionSummary>;
  // reply id → the comment it answers (true target) + the name to show.
  replyTargets: Record<string, { id: string; name: string }>;
  // Is this reply the one currently pinned to the top of the thread?
  isPinned?: boolean;
  // Rendered inside the pinned slot at the top (the slot supplies its own
  // frame, so we drop the normal separators + author tint here).
  pinnedSlot?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const isOwner = viewerEmail.toLowerCase().trim() === reply.authorEmail;
  const canEdit =
    mounted && isOwner && Date.now() - reply.createdAt <= EDIT_WINDOW_MS;
  const byClay = !!adminEmail && reply.authorEmail === adminEmail;
  const replyToName = byClay
    ? "Clay"
    : authorName(reply.authorEmail, names);

  // Which presiding controls apply — so the admin row (and its hairline)
  // only appears when there's actually something for Clay to do here.
  const showPin = isAdmin && !nested; // pin is top-level only
  const showMarkRead = isAdmin && !reply.clayReadAt;
  const showAdminDelete = isAdmin && mounted && !isOwner;

  // Structure is carried by ONE signal only — indentation + a left branch
  // rule means "nested". A top-level reply has neither, so it can never be
  // mistaken for a child. (The pinned slot frames itself.)
  const structureStyle: React.CSSProperties = pinnedSlot
    ? { marginTop: "0.3rem" }
    : nested
    ? {
        marginLeft: "1.6rem",
        paddingLeft: "1.25rem",
        borderLeft: "2px solid var(--rule)",
        marginTop: "1.25rem",
      }
    : {
        marginTop: "1.7rem",
        paddingTop: "1.7rem",
        borderTop: "1px solid var(--rule)",
      };

  // Authorship is a separate signal from structure: Clay's replies get a
  // warm tint card (plus the AUTHOR badge in the byline), never a border
  // that could read as a thread level.
  const showClayCard = byClay && !pinnedSlot;
  const cardStyle: React.CSSProperties = showClayCard
    ? {
        background: "var(--paper-deep)",
        borderRadius: 4,
        padding: "0.65rem 0.9rem",
        marginTop: "0.2rem",
      }
    : {};

  const replyTo = replyTargets[reply.id] ?? null;
  const visibleChildren = (childReplies ?? []).filter((c) => !c.deleted);
  // A deleted reply with nothing live hanging off it leaves no trace at all
  // — no "[removed]", no Restore cruft. It survives only as a slim tombstone
  // when live replies still need it to anchor their context.
  if (reply.deleted && visibleChildren.length === 0) return null;

  return (
    <div id={`reply-${reply.id}`} style={structureStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem 0.8rem", fontSize: "0.8rem", color: "var(--ink-muted)" }}>
          <GuildByline
            email={reply.authorEmail}
            names={names}
            badges={badges}
            adminEmail={adminEmail}
            size="small"
          />
          <span suppressHydrationWarning style={{ color: "var(--ink-faint)" }}>
            {formatRelative(reply.createdAt)}
          </span>
          {reply.editedAt && (
            <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>edited</span>
          )}
          {reply.clayReadAt && <ClayReadSeal at={reply.clayReadAt} />}
        </div>

        {/* Whom this answers. The one cue that survives flattening: even a
            hoisted grandchild names the exact comment it replied to, and the
            link jumps straight to it. No more guessing who's talking to who. */}
        {replyTo && !reply.deleted && (
          <a
            href={`#reply-${replyTo.id}`}
            className="no-underline"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              marginTop: "0.5rem",
              fontSize: "0.78rem",
              color: "var(--ink-faint)",
            }}
          >
            <span aria-hidden>↳</span>
            <span>
              Replying to{" "}
              <span style={{ color: "var(--eye-deep)", fontWeight: 600 }}>
                {replyTo.name}
              </span>
            </span>
          </a>
        )}

        {reply.deleted ? (
          <div
            style={{
              marginTop: "0.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.9rem",
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
              [removed]
            </span>
          </div>
        ) : editing ? (
          <EditReplyForm reply={reply} onDone={() => setEditing(false)} />
        ) : (
          <>
            <Body text={reply.body} />
            {reply.media && <GuildImage media={reply.media} />}
          </>
        )}

        {/* Member actions on one line; the presiding row sits beneath. */}
        {!reply.deleted && (
          <div style={{ marginTop: "0.8rem" }}>
            <div style={memberRowStyle}>
              {/* Hidden while the composer is open — the open box has its
                  own Reply/Cancel, so showing this toggle too just doubles
                  the word "Reply" next to itself. */}
              {!replying && (
                <button
                  type="button"
                  onClick={() => setReplying(true)}
                  style={{ ...controlStyle, color: "var(--eye-deep)" }}
                >
                  Reply
                </button>
              )}
              {canEdit && (
                <button type="button" onClick={() => setEditing((v) => !v)} style={controlStyle}>
                  Edit
                </button>
              )}
              {/* Your own reply: deleting it is a member action. */}
              {mounted && isOwner && (
                <DeleteControl
                  action={deleteReplyAction}
                  hidden={{ id: reply.id, threadId }}
                />
              )}
              <GuildReactions
                kind="reply"
                targetId={reply.id}
                threadId={threadId}
                initial={reactions[reply.id] ?? EMPTY_REACTIONS}
              />
            </div>

            {/* Presiding — Clay's levers, in their own register beneath. */}
            {isAdmin && (showPin || showMarkRead || showAdminDelete) && (
              <div style={adminRowStyle}>
                {/* Pin only top-level replies — a nested reply lifted to the
                    top would lose the context it answers. */}
                {showPin && (
                  <form action={pinReplyAction} style={{ display: "inline-flex" }}>
                    <input type="hidden" name="id" value={reply.id} />
                    <input type="hidden" name="threadId" value={threadId} />
                    <input type="hidden" name="pinned" value={isPinned ? "1" : "0"} />
                    <button
                      type="submit"
                      style={{ ...adminControlStyle, color: "var(--eye-deep)" }}
                    >
                      {isPinned ? "Unpin" : "Pin to top"}
                    </button>
                  </form>
                )}
                {showMarkRead && (
                  <form action={markReplyReadAction} style={{ display: "inline-flex" }}>
                    <input type="hidden" name="id" value={reply.id} />
                    <input type="hidden" name="threadId" value={threadId} />
                    <button type="submit" style={adminControlStyle}>
                      Mark read
                    </button>
                  </form>
                )}
                {/* Someone else's reply: removing it is a presiding action.
                    (Your own delete lives with the member actions above.) */}
                {showAdminDelete && (
                  <DeleteControl
                    action={deleteReplyAction}
                    hidden={{ id: reply.id, threadId }}
                    base={adminControlStyle}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Anchored to the comment it answers: an olive left rule binds the
            box to this reply and separates it from the next comment, so the
            box never reads as belonging to the comment below it. */}
        {replying && (
          <div
            style={{
              marginTop: "0.8rem",
              marginBottom: "0.4rem",
              paddingLeft: "1.1rem",
              borderLeft: "2px solid var(--eye-deep)",
            }}
          >
            <ReplyComposer
              threadId={threadId}
              parentReplyId={reply.id}
              placeholder={`Replying to ${replyToName}…`}
              onDone={() => setReplying(false)}
              compact
            />
          </div>
        )}
      </div>

      {/* Nested children (one tier; the lib flattens anything deeper) */}
      {childReplies?.map((c) => (
        <ReplyNode
          key={c.id}
          reply={c}
          names={names}
          badges={badges}
          adminEmail={adminEmail}
          viewerEmail={viewerEmail}
          isAdmin={isAdmin}
          threadId={threadId}
          mounted={mounted}
          reactions={reactions}
          replyTargets={replyTargets}
          nested
        />
      ))}
    </div>
  );
}

// --- The thread page body --------------------------------------------

export function ThreadView({
  thread,
  replies,
  names,
  badges,
  adminEmail,
  viewerEmail,
  isAdmin,
  reactions,
}: {
  thread: GuildThread;
  replies: GuildReply[];
  names: Record<string, string>;
  badges: Record<string, GuildBadgeInfo>;
  adminEmail: string | null;
  viewerEmail: string;
  isAdmin: boolean;
  reactions: Record<string, ReactionSummary>;
}) {
  const [editing, setEditing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Deep-link landing. A notification ("X replied to you") or a "Replying
  // to" link points at /guild/<id>#reply-<replyId>. App Router's native
  // hash scroll is unreliable for content this far down and a sticky header
  // would hide the target anyway, so we own it: center the reply in the
  // viewport and flash it, regardless of whether it's pinned or nested.
  // Runs on mount (arriving from a notification) and on in-page hash
  // changes (clicking a "Replying to" link in the same thread).
  useEffect(() => {
    function jumpToHash() {
      const hash = window.location.hash;
      if (!hash.startsWith("#reply-")) return;
      const el = document.getElementById(hash.slice(1));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("reply-flash");
      // Reflow so re-adding the class restarts the animation on repeat taps.
      void el.offsetWidth;
      el.classList.add("reply-flash");
    }
    // One frame so the server-rendered replies have settled into layout.
    const raf = window.requestAnimationFrame(jumpToHash);
    window.addEventListener("hashchange", jumpToHash);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", jumpToHash);
    };
  }, []);

  // The thread-level composer is deliberate, not always-open: it stays a
  // quiet prompt until you choose to add a new point (the OP's "Reply" or
  // the prompt at the foot both open it). Answering a specific person
  // happens through that comment's own Reply, so the big bottom box can no
  // longer be mistaken for "reply to the last comment".
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  useEffect(() => {
    if (!composerOpen) return;
    const ta = composerRef.current;
    if (!ta) return;
    ta.scrollIntoView({ behavior: "smooth", block: "center" });
    ta.focus({ preventScroll: true });
  }, [composerOpen]);

  const isOwner = viewerEmail.toLowerCase().trim() === thread.authorEmail;
  const canEdit =
    mounted && isOwner && Date.now() - thread.createdAt <= EDIT_WINDOW_MS;

  // Build the two-tier tree from the flat, chronological reply list.
  const topLevel = replies.filter((r) => r.parentReplyId === null);
  const childrenOf: Record<string, GuildReply[]> = {};
  for (const r of replies) {
    if (r.parentReplyId) {
      (childrenOf[r.parentReplyId] ??= []).push(r);
    }
  }
  const visibleCount = replies.filter((r) => !r.deleted).length;

  // reply id → the comment it answers and the name to label. Uses the true
  // target (replyToId) so a hoisted grandchild still names the right person;
  // falls back to the flattened parent for replies that predate the field.
  const replyById: Record<string, GuildReply> = {};
  for (const r of replies) replyById[r.id] = r;
  const replyTargets: Record<string, { id: string; name: string }> = {};
  for (const r of replies) {
    const targetId = r.replyToId ?? r.parentReplyId;
    if (!targetId) continue;
    const target = replyById[targetId];
    if (!target) continue;
    const targetByClay = !!adminEmail && target.authorEmail === adminEmail;
    replyTargets[r.id] = {
      id: targetId,
      name: targetByClay ? "Clay" : authorName(target.authorEmail, names),
    };
  }

  // The pinned reply (if any) is lifted to a slot at the very top and
  // dropped from its inline position, so it shows exactly once. Only a
  // live, top-level reply qualifies (the lib enforces the same).
  const pinnedId = thread.pinnedReplyId ?? null;
  const pinnedReply =
    (pinnedId &&
      topLevel.find((r) => r.id === pinnedId && !r.deleted)) ||
    null;
  const inlineTopLevel = pinnedReply
    ? topLevel.filter((r) => r.id !== pinnedReply.id)
    : topLevel;
  const pinnedByClay =
    !!pinnedReply && !!adminEmail && pinnedReply.authorEmail === adminEmail;

  return (
    <div style={{ maxWidth: "44rem", margin: "0 auto", padding: "2.25rem 1.25rem 5rem" }}>
      <Link
        href="/guild"
        className="no-underline font-display uppercase tracking-[0.2em]"
        style={{ color: "var(--ink-faint)", fontSize: "0.66rem", fontWeight: 600 }}
      >
        ← The Guild
      </Link>

      {/* Original post */}
      <article style={{ marginTop: "1.5rem" }}>
        {thread.pinned && (
          <p
            className="font-display uppercase"
            style={{ color: "var(--eye-deep)", letterSpacing: "0.22em", fontSize: "0.64rem", fontWeight: 600, marginBottom: "0.5rem" }}
          >
            Question of the Week
          </p>
        )}

        {thread.deleted ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
              [This thread was removed.]
            </span>
            {isAdmin && (
              <form action={restoreThreadAction}>
                <input type="hidden" name="id" value={thread.id} />
                <button
                  type="submit"
                  style={{ ...adminControlStyle, color: "var(--eye-deep)" }}
                >
                  Restore thread
                </button>
              </form>
            )}
          </div>
        ) : editing ? (
          <EditThreadForm thread={thread} onDone={() => setEditing(false)} />
        ) : (
          <>
            <h1 className="font-display" style={{ fontSize: "2.2rem", lineHeight: 1.12, margin: 0 }}>
              {thread.title}
            </h1>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem 0.9rem", marginTop: "0.6rem", fontSize: "0.82rem", color: "var(--ink-muted)" }}>
              <GuildByline
                email={thread.authorEmail}
                names={names}
                badges={badges}
                adminEmail={adminEmail}
              />
              <span suppressHydrationWarning style={{ color: "var(--ink-faint)" }}>
                {formatRelative(thread.createdAt)}
              </span>
              {thread.editedAt && (
                <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>edited</span>
              )}
              {thread.clayReadAt && <ClayReadSeal at={thread.clayReadAt} />}
            </div>
            <Body text={thread.body} />
            {thread.media && <GuildImage media={thread.media} />}
          </>
        )}

        {/* Member actions on one line; the presiding row sits beneath. On
            the OP the two primary actions carry real presence — Reply is the
            outlined-olive pill (same vocabulary as the foot CTA, a touch more
            confident), React steps up beside it — while the replies below
            stay whisper-quiet so this row reads as the anchor. */}
        {!thread.deleted && !editing && (
          <div style={{ marginTop: "1.25rem" }}>
            <div style={{ ...memberRowStyle, gap: "1.1rem" }}>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="font-display uppercase tracking-[0.18em] transition-colors"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "transparent",
                  border: "1px solid var(--eye-deep)",
                  color: "var(--eye-deep)",
                  borderRadius: 2,
                  padding: "0.6rem 1.5rem",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--eye-deep)";
                  e.currentTarget.style.color = "var(--surface)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--eye-deep)";
                }}
              >
                Reply
              </button>
              <GuildReactions
                kind="thread"
                targetId={thread.id}
                threadId={thread.id}
                initial={reactions[thread.id] ?? EMPTY_REACTIONS}
                prominent
              />
              {canEdit && (
                <button type="button" onClick={() => setEditing((v) => !v)} style={controlStyle}>
                  Edit
                </button>
              )}
              {mounted && isOwner && (
                <DeleteControl
                  action={deleteThreadAction}
                  hidden={{ id: thread.id }}
                />
              )}
            </div>

            {isAdmin && (
              <div style={adminRowStyle}>
                <form action={pinThreadAction} style={{ display: "inline-flex" }}>
                  <input type="hidden" name="id" value={thread.id} />
                  <input type="hidden" name="pinned" value={thread.pinned ? "1" : "0"} />
                  <button type="submit" style={{ ...adminControlStyle, color: "var(--eye-deep)" }}>
                    {thread.pinned ? "Unpin" : "Pin as Question of the Week"}
                  </button>
                </form>
                {!thread.clayReadAt && (
                  <form action={markThreadReadAction} style={{ display: "inline-flex" }}>
                    <input type="hidden" name="id" value={thread.id} />
                    <button type="submit" style={adminControlStyle}>
                      Mark read
                    </button>
                  </form>
                )}
                {mounted && !isOwner && (
                  <DeleteControl
                    action={deleteThreadAction}
                    hidden={{ id: thread.id }}
                    base={adminControlStyle}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </article>

      {/* Replies */}
      <section style={{ marginTop: "2.75rem" }}>
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "1.5rem", display: "flex", alignItems: "baseline", gap: "0.55rem" }}>
          <h2
            className="font-display"
            style={{ fontSize: "1.6rem", lineHeight: 1, fontWeight: 600, color: "var(--ink)", margin: 0 }}
          >
            {visibleCount === 0 ? "No replies yet" : visibleCount}
          </h2>
          {visibleCount > 0 && (
            <span
              className="font-display uppercase"
              style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.18em", color: "var(--ink-muted)" }}
            >
              {visibleCount === 1 ? "Reply" : "Replies"}
            </span>
          )}
        </div>

        {/* Pinned reply, lifted to the top under its own banner. */}
        {pinnedReply && (
          <div
            style={{
              marginTop: "1.4rem",
              border: "1px solid var(--eye-deep)",
              borderRadius: 6,
              background: "var(--paper-deep)",
              padding: "0.5rem 1.1rem 1.1rem",
            }}
          >
            <p
              className="font-display uppercase"
              style={{
                color: "var(--eye-deep)",
                letterSpacing: "0.22em",
                fontSize: "0.6rem",
                fontWeight: 600,
                margin: "0.7rem 0 0",
              }}
            >
              {pinnedByClay ? "Pinned by Clay" : "Pinned"}
            </p>
            <ReplyNode
              reply={pinnedReply}
              childReplies={childrenOf[pinnedReply.id]}
              names={names}
              badges={badges}
              adminEmail={adminEmail}
              viewerEmail={viewerEmail}
              isAdmin={isAdmin}
              threadId={thread.id}
              mounted={mounted}
              reactions={reactions}
              replyTargets={replyTargets}
              isPinned
              pinnedSlot
            />
          </div>
        )}

        {inlineTopLevel.map((r) => (
          <ReplyNode
            key={r.id}
            reply={r}
            childReplies={childrenOf[r.id]}
            names={names}
            badges={badges}
            adminEmail={adminEmail}
            viewerEmail={viewerEmail}
            isAdmin={isAdmin}
            threadId={thread.id}
            mounted={mounted}
            reactions={reactions}
            replyTargets={replyTargets}
          />
        ))}

        {/* Add a new point to the thread. Deliberate: a quiet prompt that
            opens the composer on click, so it can't be mistaken for a reply
            to the comment above it. Replying to a person goes through that
            comment's own Reply. */}
        {!thread.deleted && (
          <div style={{ marginTop: "2.25rem", borderTop: "1px solid var(--rule)", paddingTop: "1.5rem" }}>
            {composerOpen ? (
              <ReplyComposer
                threadId={thread.id}
                parentReplyId={null}
                placeholder="Add a new point to this thread…"
                textareaRef={composerRef}
                onDone={() => setComposerOpen(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="font-display uppercase tracking-[0.18em]"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  background: "transparent",
                  border: "1px solid var(--eye-deep)",
                  color: "var(--eye-deep)",
                  borderRadius: 2,
                  padding: "0.7rem 1.3rem",
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Add to the conversation
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
