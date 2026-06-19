"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import type { GuildReply, GuildThread } from "@/lib/guild";
import { EDIT_WINDOW_MS, MAX_BODY, MAX_REPLY, MAX_TITLE } from "@/lib/guild-constants";
import {
  deleteReplyAction,
  deleteThreadAction,
  editReplyAction,
  editThreadAction,
  markReplyReadAction,
  markThreadReadAction,
  pinThreadAction,
  postReplyAction,
  restoreReplyAction,
  restoreThreadAction,
  type GuildFormState,
} from "@/app/guild/actions";
import { ClayReadSeal } from "./ClayReadSeal";
import { GuildByline, type GuildBadgeInfo } from "./GuildByline";
import { authorName, formatRelative } from "./guild-format";
import { Linkified } from "@/components/Linkified";

const INITIAL: GuildFormState = { ok: false };

// Shared small-caps action link styling for the quiet control row.
const controlStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: 0,
  cursor: "pointer",
  fontSize: "0.64rem",
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--ink-faint)",
};

// Two-step inline delete. The first click only arms it; a second
// explicit "Confirm" fires the soft delete. Stops the one-click accident
// without a jarring native confirm() box. The delete is reversible by an
// admin, but the confirm still spares everyone the "where did it go".
function DeleteControl({
  action,
  hidden,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} style={controlStyle}>
        Delete
      </button>
    );
  }
  return (
    <form action={action} className="flex items-center gap-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <span
        style={{ ...controlStyle, cursor: "default", color: "var(--ink-muted)" }}
      >
        Delete?
      </span>
      <button type="submit" style={{ ...controlStyle, color: "var(--blood)" }}>
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        style={controlStyle}
      >
        Cancel
      </button>
    </form>
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
      <Linkified text={text} />
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
}: {
  threadId: string;
  parentReplyId: string | null;
  placeholder: string;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(postReplyAction, INITIAL);
  const [body, setBody] = useState("");

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
      <textarea
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
      <textarea
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
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} style={{ marginTop: "0.5rem" }}>
      <input type="hidden" name="id" value={reply.id} />
      <input type="hidden" name="threadId" value={reply.threadId} />
      <textarea
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

  return (
    <div
      id={`reply-${reply.id}`}
      style={{
        marginLeft: nested ? "1.5rem" : 0,
        paddingLeft: nested ? "1.1rem" : byClay ? "0.9rem" : 0,
        borderLeft: nested
          ? "1px solid var(--rule)"
          : byClay
          ? "2px solid var(--eye-deep)"
          : "none",
        marginTop: "1.4rem",
      }}
    >
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
                style={{ ...controlStyle, color: "var(--eye-deep)" }}
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

      {/* Control row */}
      {!reply.deleted && (
        <div style={{ display: "flex", alignItems: "center", gap: "1.1rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
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
          {mounted && (isOwner || isAdmin) && (
            <DeleteControl
              action={deleteReplyAction}
              hidden={{ id: reply.id, threadId }}
            />
          )}
          {isAdmin && !reply.clayReadAt && (
            <form action={markReplyReadAction}>
              <input type="hidden" name="id" value={reply.id} />
              <input type="hidden" name="threadId" value={threadId} />
              <button type="submit" style={{ ...controlStyle, color: "var(--eye-deep)" }}>
                Mark read
              </button>
            </form>
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
}: {
  thread: GuildThread;
  replies: GuildReply[];
  names: Record<string, string>;
  badges: Record<string, GuildBadgeInfo>;
  adminEmail: string | null;
  viewerEmail: string;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
                  style={{ ...controlStyle, color: "var(--eye-deep)" }}
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
          </>
        )}

        {/* Control row: owner edit/delete + Clay presiding (pin, read) */}
        {!thread.deleted && (
          <div style={{ display: "flex", alignItems: "center", gap: "1.1rem", marginTop: "1rem", flexWrap: "wrap" }}>
            {canEdit && (
              <button type="button" onClick={() => setEditing((v) => !v)} style={controlStyle}>
                Edit
              </button>
            )}
            {mounted && (isOwner || isAdmin) && (
              <DeleteControl
                action={deleteThreadAction}
                hidden={{ id: thread.id }}
              />
            )}
            {isAdmin && (
              <>
                <form action={pinThreadAction}>
                  <input type="hidden" name="id" value={thread.id} />
                  <input type="hidden" name="pinned" value={thread.pinned ? "1" : "0"} />
                  <button type="submit" style={{ ...controlStyle, color: "var(--eye-deep)" }}>
                    {thread.pinned ? "Unpin" : "Pin as Question of the Week"}
                  </button>
                </form>
                {!thread.clayReadAt && (
                  <form action={markThreadReadAction}>
                    <input type="hidden" name="id" value={thread.id} />
                    <button type="submit" style={{ ...controlStyle, color: "var(--eye-deep)" }}>
                      Mark read
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        )}
      </article>

      {/* Replies */}
      <section style={{ marginTop: "2.75rem" }}>
        <p className="eyebrow" style={{ letterSpacing: "0.28em", fontSize: "0.62rem", borderTop: "1px solid var(--rule)", paddingTop: "1.4rem" }}>
          {visibleCount === 0
            ? "No replies yet"
            : visibleCount === 1
            ? "1 reply"
            : `${visibleCount} replies`}
        </p>

        {topLevel.map((r) => (
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
          />
        ))}

        {/* Add to the conversation */}
        {!thread.deleted && (
          <div style={{ marginTop: "2.25rem", borderTop: "1px solid var(--rule)", paddingTop: "1.5rem" }}>
            <ReplyComposer
              threadId={thread.id}
              parentReplyId={null}
              placeholder="Add to the conversation…"
            />
          </div>
        )}
      </section>
    </div>
  );
}
