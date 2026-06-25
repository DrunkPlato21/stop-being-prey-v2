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
  restoreReplyAction,
  restoreThreadAction,
  type GuildFormState,
} from "@/app/guild/actions";
import { ClayReadSeal } from "./ClayReadSeal";
import { GuildByline, type GuildBadgeInfo } from "./GuildByline";
import { authorName, formatRelative } from "./guild-format";
import { formatGuildBody } from "@/components/guild/format-body";
import { FormatToolbar } from "./FormatToolbar";
import { GuildImage } from "./GuildImage";
import { GuildReactions } from "./GuildReactions";

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
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = textareaRef ?? internalRef;

  useEffect(() => {
    if (state.ok) {
      setBody("");
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
          disabled={pending || !body.trim()}
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
            opacity: pending || !body.trim() ? 0.5 : 1,
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
            {isAdmin && (
              <form action={restoreReplyAction}>
                <input type="hidden" name="id" value={reply.id} />
                <input type="hidden" name="threadId" value={threadId} />
                <button
                  type="submit"
                  style={{ ...adminControlStyle, color: "var(--eye-deep)" }}
                >
                  Restore
                </button>
              </form>
            )}
          </div>
        ) : editing ? (
          <EditReplyForm reply={reply} onDone={() => setEditing(false)} />
        ) : (
          <Body text={reply.body} />
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
              placeholder={`Reply to ${replyToName}…`}
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

  // The OP's "Reply" jumps the reader to the thread-level composer.
  const composerRef = useRef<HTMLTextAreaElement>(null);
  function focusComposer() {
    const ta = composerRef.current;
    if (!ta) return;
    ta.scrollIntoView({ behavior: "smooth", block: "center" });
    ta.focus({ preventScroll: true });
  }

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

        {/* Member actions on one line; the presiding row sits beneath. */}
        {!thread.deleted && !editing && (
          <div style={{ marginTop: "1.1rem" }}>
            <div style={memberRowStyle}>
              <button
                type="button"
                onClick={focusComposer}
                style={{ ...controlStyle, color: "var(--eye-deep)" }}
              >
                Reply
              </button>
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
              <GuildReactions
                kind="thread"
                targetId={thread.id}
                threadId={thread.id}
                initial={reactions[thread.id] ?? EMPTY_REACTIONS}
              />
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
          />
        ))}

        {/* Add to the conversation */}
        {!thread.deleted && (
          <div style={{ marginTop: "2.25rem", borderTop: "1px solid var(--rule)", paddingTop: "1.5rem" }}>
            <ReplyComposer
              threadId={thread.id}
              parentReplyId={null}
              placeholder="Add to the conversation…"
              textareaRef={composerRef}
            />
          </div>
        )}
      </section>
    </div>
  );
}
