"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";
import type {
  ActiveNowSnapshot,
  LoungePost,
  LoungeReply,
  ReactionCounts,
  ReactionKey,
} from "@/lib/lounge";
import {
  REACTION_EMOJI,
  REACTION_KEYS,
  REACTION_LABEL,
  emptyReactionCounts,
} from "@/lib/lounge";
import type { TierBadge } from "@/lib/members";
import { LoungeSceneIllustration } from "@/components/LoungeSceneIllustration";
import { MemberBadge } from "@/components/MemberBadge";
import { InitialAvatar } from "@/components/InitialAvatar";
import { Linkified } from "@/components/Linkified";
import { mentionTokenFor } from "@/lib/display-name";

type MemberBadgeInfo = {
  founderSlot: number | null;
  tierBadge: TierBadge | null;
};

// Client island for /lounge. Receives the server-rendered initial
// snapshot and handles every interactive action: posting, replying,
// reacting, loading more, admin delete/pin.
//
// Reactions are FB-style: 5-key picker, one reaction per member per
// target. Tapping the same key again removes; tapping a different
// key replaces.

const MAX_BODY = 280;

type ReactionSnapshot = {
  counts: ReactionCounts;
  total: number;
  myReaction: ReactionKey | null;
};

type Props = {
  initialPinned: LoungePost | null;
  initialPosts: LoungePost[];
  initialReplies: Record<string, LoungeReply[]>;
  initialReactions: Record<string, ReactionSnapshot>;
  /** Per-author badge info keyed by email. Looked up at render time
      so tier changes propagate across all historical posts on the
      next page load. */
  initialMemberBadges: Record<string, MemberBadgeInfo>;
  initialHasMore: boolean;
  /** IDs of posts Clay has marked as read. Members render an eye glyph
      next to the post's timestamp for any id in this list. */
  initialReadByClayPostIds: string[];
  /** Same as above but for replies. */
  initialReadByClayReplyIds: string[];
  /** Normalized admin email so PostCard/ReplyRow can render the
      AUTHOR treatment on Clay's own posts (olive name + AUTHOR badge
      + InitialAvatar + olive left rule on the card). Null when the
      server doesn't expose ADMIN_EMAIL — admin styling will simply
      not fire. */
  adminEmail: string | null;
  lastVisitedAt: number | null;
  isAdmin: boolean;
  activeNow: ActiveNowSnapshot;
  authorCount: number;
  launchIso: string;
};

/* === Read-by-Clay mark =============================== */
// Small italic olive "Clay read this" rendered as a standalone line
// below the post or reply body — an editor's stamp on the post
// itself. Positioned away from the header timestamp so the read mark
// can't be misread as a read-event time. Rendered for all viewers;
// admin gets the toggle button elsewhere to set/clear it.
function ReadByClayMark() {
  return (
    <p
      className="font-serif italic"
      style={{
        color: "var(--eye-deep)",
        fontSize: "0.8rem",
        letterSpacing: "0.005em",
        marginTop: "0.65rem",
        marginBottom: 0,
        lineHeight: 1.3,
      }}
    >
      Clay read this.
    </p>
  );
}

function formatLaunchDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Textarea that grows with its content. Initial size = `minRows`,
// expands as needed up to whatever the browser can fit. Used by both
// compose and reply composers so members don't have to hand-resize.
//
// The layout effect (vs. plain useEffect) runs before paint, so the
// height is correct on the very first render when value is non-empty
// — important for the reply composer which auto-focuses on open.
type AutoResizingTextareaProps =
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows" | "ref"> & {
    value: string;
    minRows?: number;
  };

function AutoResizingTextarea({
  value,
  minRows = 2,
  style,
  ...rest
}: AutoResizingTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset to "auto" first so the textarea can shrink when content
    // is deleted. Without this, scrollHeight stays at the previous
    // taller value and the box never gets smaller.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      style={{
        // Hide the native resize handle and the scrollbar — the
        // textarea size follows the content, no manual resize needed.
        resize: "none",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    />
  );
}

function activeNowLine(snap: ActiveNowSnapshot): string | null {
  const { otherCount, authorPresent } = snap;
  if (!authorPresent && otherCount === 0) return null;
  if (authorPresent && otherCount === 0) {
    return "Clay is in the lounge.";
  }
  if (authorPresent && otherCount === 1) {
    return "Clay and 1 other are in the lounge.";
  }
  if (authorPresent) {
    return `Clay and ${otherCount} others are in the lounge.`;
  }
  return otherCount === 1
    ? "1 member is in the lounge."
    : `${otherCount} members are in the lounge.`;
}

type ApiError = {
  error?: string;
  reason?: "cooldown";
  secondsRemaining?: number;
};

function emptySnapshot(): ReactionSnapshot {
  return { counts: emptyReactionCounts(), total: 0, myReaction: null };
}

// A post is "live" when a reply landed within the last 10 minutes —
// not just freshly created. Used to render a small green pulse beside
// the timestamp so members can scan the room for active threads.
const LIVE_WINDOW_MS = 10 * 60 * 1000;
function isPostLive(
  post: LoungePost,
  now: number
): boolean {
  if (post.lastActivityAt <= post.createdAt + 1000) return false;
  return now - post.lastActivityAt < LIVE_WINDOW_MS;
}

function formatRelative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${Math.max(1, sec)}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function rateLimitMessage(err: ApiError, kind: "post" | "reply"): string {
  if (err.error !== "rate_limited") {
    return err.error === "empty_body"
      ? "Add something to post."
      : "Couldn't send. Try again.";
  }
  const s = err.secondsRemaining ?? 30;
  return `Wait ${s} seconds before ${kind === "post" ? "posting" : "replying"} again.`;
}

export function LoungeView(props: Props) {
  const [pinned, setPinned] = useState<LoungePost | null>(props.initialPinned);
  const [posts, setPosts] = useState<LoungePost[]>(props.initialPosts);
  const [replies, setReplies] = useState<Record<string, LoungeReply[]>>(
    props.initialReplies
  );
  const [reactions, setReactions] = useState<
    Record<string, ReactionSnapshot>
  >(props.initialReactions);
  const [memberBadges, setMemberBadges] = useState<
    Record<string, MemberBadgeInfo>
  >(props.initialMemberBadges);
  const [hasMore, setHasMore] = useState<boolean>(props.initialHasMore);
  const [now, setNow] = useState<number>(() => Date.now());

  // Compose state
  const [composeBody, setComposeBody] = useState("");
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Reply boxes by parent post id
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<string>("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Expanded-replies set: by default show only the latest reply per
  // post — enough to surface what was last said in the thread so the
  // room is scannable, without burying the original post under a
  // forum-style wall of replies. Click "show N more" to expand.
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    new Set()
  );

  // Picker open state: only one picker can be open at a time
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);

  // Read-by-Clay receipts. Two Sets — one for posts, one for replies.
  // Initialized from server-rendered state, mutated optimistically when
  // admin toggles. Members never write to these directly.
  const [readByClayPostIds, setReadByClayPostIds] = useState<Set<string>>(
    () => new Set(props.initialReadByClayPostIds)
  );
  const [readByClayReplyIds, setReadByClayReplyIds] = useState<Set<string>>(
    () => new Set(props.initialReadByClayReplyIds)
  );

  // Load-more state
  const [loadingMore, setLoadingMore] = useState(false);

  /* === Live polling state ====================================
     A poll every ~20s keeps the room alive without WebSockets.
     Strategy:
       - Silently merge field updates (replyCount, reactionCount,
         lastActivityAt, replies under visible posts, reactions) so
         the page reflects new activity without scroll disruption.
       - New top-level posts authored by *others* are queued behind
         a "N new" pill at the top of the feed. The user clicks to
         merge + scroll-to-top — same pattern as Twitter/Discord.
       - Polling is paused when the tab is hidden or any compose /
         reply textarea is focused (don't disrupt drafting). */
  const [pendingNewIds, setPendingNewIds] = useState<string[]>([]);
  const [pendingSnapshot, setPendingSnapshot] = useState<{
    pinned: LoungePost | null;
    posts: LoungePost[];
    replies: Record<string, LoungeReply[]>;
    reactions: Record<string, ReactionSnapshot>;
    memberBadges: Record<string, MemberBadgeInfo>;
  } | null>(null);

  // Refs so the poll closure always reads the latest state without
  // re-installing the interval on every render.
  const postsRef = useRef(posts);
  const pinnedRef = useRef(pinned);
  const composeFocusedRef = useRef(false);
  const replyFocusedRef = useRef(false);
  // Per-target timestamp of the user's most recent optimistic
  // reaction. Polls within ~3s of an optimistic action skip reaction
  // updates for that target to avoid clobbering a still-flying write.
  const optimisticReactionAt = useRef<Record<string, number>>({});

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  // Deep-link auto-scroll. When the page loads with /lounge#post-<id>
  // (typically from a notification), we try to scroll to that post.
  // If the post isn't in the initial 20, we auto-load-more up to a
  // small cap until it's found or the feed is exhausted.
  const [deepLinkTarget, setDeepLinkTarget] = useState<string | null>(null);
  const autoLoadAttempts = useRef(0);
  const loadMoreRef = useRef<(() => Promise<void>) | null>(null);

  const frozenLastVisitedAt = useRef<number | null>(props.lastVisitedAt);

  // Tick relative-time formatter every 15s
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  // On mount, parse the URL hash. If it's a #post-<id> link, store
  // the target so the next effect can drive scroll + auto-load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const match = window.location.hash.match(/^#post-([\w-]+)$/);
    if (match) setDeepLinkTarget(match[1]);
  }, []);

  // Live poll: pull a fresh first page every ~20s and reconcile. See
  // the comment block on pendingNewIds for the merge strategy.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (composeFocusedRef.current || replyFocusedRef.current) return;
      try {
        const res = await fetch("/api/lounge?limit=20", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data: {
          ok?: boolean;
          pinned?: LoungePost | null;
          posts?: LoungePost[];
          replies?: Record<string, LoungeReply[]>;
          reactions?: Record<string, ReactionSnapshot>;
          memberBadges?: Record<string, MemberBadgeInfo>;
        } = await res.json().catch(() => ({}));
        if (cancelled || !data.ok) return;

        const serverPinned: LoungePost | null = data.pinned ?? null;
        const serverPosts: LoungePost[] = data.posts ?? [];
        const serverReplies: Record<string, LoungeReply[]> =
          data.replies ?? {};
        const serverReactions: Record<string, ReactionSnapshot> =
          data.reactions ?? {};
        const serverBadges: Record<string, MemberBadgeInfo> =
          data.memberBadges ?? {};

        // Silently merge badge updates. A member who upgrades from
        // $13 to $50 mid-session gets OPERATOR on every existing
        // post of theirs in view, no full reload needed.
        if (Object.keys(serverBadges).length > 0) {
          setMemberBadges((prev) => ({ ...prev, ...serverBadges }));
        }

        // 1) Silently update counts/lastActivityAt on already-visible
        //    posts. Don't reorder — visible cards shifting around is
        //    jarring; reorder only on pill-click merge.
        setPosts((prev) =>
          prev.map((p) => {
            const fresh =
              serverPosts.find((s) => s.id === p.id) ??
              (serverPinned && serverPinned.id === p.id
                ? serverPinned
                : null);
            if (!fresh) return p;
            return {
              ...p,
              replyCount: fresh.replyCount,
              reactionCount: fresh.reactionCount,
              lastActivityAt: fresh.lastActivityAt,
            };
          })
        );
        setPinned((prev) => {
          if (!prev) return serverPinned;
          if (serverPinned && serverPinned.id === prev.id) {
            return {
              ...prev,
              replyCount: serverPinned.replyCount,
              reactionCount: serverPinned.reactionCount,
              lastActivityAt: serverPinned.lastActivityAt,
            };
          }
          // Pin changed server-side (admin pinned/unpinned). Take the
          // server's word — pinning is an explicit admin action so
          // surfacing it immediately is the right call.
          return serverPinned;
        });

        // 2) Replies for posts in view: server is authoritative.
        //    Adding under an existing post doesn't shift scroll, so
        //    this is safe to merge silently.
        if (Object.keys(serverReplies).length > 0) {
          setReplies((prev) => {
            const out = { ...prev };
            for (const [pid, list] of Object.entries(serverReplies)) {
              out[pid] = list;
            }
            return out;
          });
        }

        // 3) Reactions: server-authoritative, but skip targets the
        //    user reacted to in the last ~3s to avoid clobbering an
        //    in-flight optimistic write.
        const nowMs = Date.now();
        if (Object.keys(serverReactions).length > 0) {
          setReactions((prev) => {
            const out = { ...prev };
            for (const [id, snap] of Object.entries(serverReactions)) {
              const lastOpt = optimisticReactionAt.current[id] ?? 0;
              if (nowMs - lastOpt < 3000) continue;
              out[id] = snap;
            }
            return out;
          });
        }

        // 4) Queue new top-level posts (in server first page but not
        //    in current state). User clicks the pill to integrate.
        const stateIds = new Set(postsRef.current.map((p) => p.id));
        if (pinnedRef.current) stateIds.add(pinnedRef.current.id);
        const freshIds = serverPosts
          .filter(
            (p) =>
              !stateIds.has(p.id) &&
              !(serverPinned && p.id === serverPinned.id)
          )
          .map((p) => p.id);
        if (freshIds.length > 0) {
          setPendingNewIds(freshIds);
          setPendingSnapshot({
            pinned: serverPinned,
            posts: serverPosts,
            replies: serverReplies,
            reactions: serverReactions,
            memberBadges: serverBadges,
          });
        }
      } catch {
        // Network blip — next tick recovers.
      }
    }

    const id = window.setInterval(poll, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  function mergePending() {
    const snapshot = pendingSnapshot;
    if (!snapshot) {
      setPendingNewIds([]);
      return;
    }
    // Replace the first-page slice with server's ordering. Any posts
    // in current state that AREN'T in the server first page are kept
    // as a trailing tail — these are "older" posts the user paginated
    // into and shouldn't disappear on merge.
    setPosts((prev) => {
      const serverIds = new Set(snapshot.posts.map((p) => p.id));
      const trailing = prev.filter(
        (p) =>
          !serverIds.has(p.id) &&
          !(snapshot.pinned && p.id === snapshot.pinned.id)
      );
      return [...snapshot.posts, ...trailing];
    });
    setPinned(snapshot.pinned);
    setReplies((prev) => ({ ...prev, ...snapshot.replies }));
    setReactions((prev) => ({ ...prev, ...snapshot.reactions }));
    setMemberBadges((prev) => ({ ...prev, ...snapshot.memberBadges }));
    setPendingNewIds([]);
    setPendingSnapshot(null);
    // Quietly scroll to top so the new posts are visible. Behavior
    // is "auto" not "smooth" — smooth scroll on long pages takes a
    // beat the user didn't ask for.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Close picker on outside click / Escape
  useEffect(() => {
    if (!pickerOpenFor) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-reaction-picker]")) return;
      if (target.closest("[data-reaction-trigger]")) return;
      setPickerOpenFor(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpenFor(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpenFor]);

  function isNew(at: number): boolean {
    if (props.isAdmin) return false;
    const stamp = frozenLastVisitedAt.current;
    if (stamp === null) return false;
    return at > stamp;
  }

  async function submitPost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = composeBody.trim();
    if (!body || composing) return;
    setComposing(true);
    setComposeError(null);
    try {
      const res = await fetch("/api/lounge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data: { ok?: boolean; post?: LoungePost } & ApiError = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok || !data.post) {
        setComposeError(rateLimitMessage(data, "post"));
        return;
      }
      setPosts((prev) => [data.post!, ...prev]);
      setReplies((prev) => ({ ...prev, [data.post!.id]: [] }));
      setReactions((prev) => ({ ...prev, [data.post!.id]: emptySnapshot() }));
      setComposeBody("");
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "send_failed");
    } finally {
      setComposing(false);
    }
  }

  async function submitReply(parentPostId: string) {
    const body = replyDraft.trim();
    if (!body || replying) return;
    setReplying(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/lounge/${parentPostId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data: { ok?: boolean; reply?: LoungeReply } & ApiError = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok || !data.reply) {
        setReplyError(rateLimitMessage(data, "reply"));
        return;
      }
      const newReply = data.reply!;
      setReplies((prev) => ({
        ...prev,
        [parentPostId]: [...(prev[parentPostId] ?? []), newReply],
      }));
      setReactions((prev) => ({ ...prev, [newReply.id]: emptySnapshot() }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === parentPostId
            ? { ...p, replyCount: p.replyCount + 1 }
            : p
        )
      );
      if (pinned && pinned.id === parentPostId) {
        setPinned({ ...pinned, replyCount: pinned.replyCount + 1 });
      }
      setReplyDraft("");
      setOpenReplyFor(null);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "send_failed");
    } finally {
      setReplying(false);
    }
  }

  async function chooseReaction(
    target: { kind: "post" | "reply"; id: string },
    nextChoice: ReactionKey | null
  ) {
    setPickerOpenFor(null);
    // Stamp so the poll skips this target for a few seconds and
    // doesn't clobber the in-flight optimistic state.
    optimisticReactionAt.current[target.id] = Date.now();

    // Compute optimistic snapshot: tapping same key removes, picking
    // new key replaces, null clears.
    const current = reactions[target.id] ?? emptySnapshot();
    const prior = current.myReaction;
    let resolved: ReactionKey | null = nextChoice;
    if (nextChoice !== null && prior === nextChoice) {
      resolved = null;
    }

    const optimistic: ReactionSnapshot = {
      counts: { ...current.counts },
      total: current.total,
      myReaction: resolved,
    };
    if (prior !== null) {
      optimistic.counts[prior] = Math.max(0, optimistic.counts[prior] - 1);
      optimistic.total = Math.max(0, optimistic.total - 1);
    }
    if (resolved !== null) {
      optimistic.counts[resolved] += 1;
      optimistic.total += 1;
    }
    setReactions((prev) => ({ ...prev, [target.id]: optimistic }));

    // Sync the post's denormalized reactionCount in the feed so the
    // pinned/feed cards stay accurate.
    const delta = optimistic.total - current.total;
    if (target.kind === "post") {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === target.id
            ? { ...p, reactionCount: Math.max(0, p.reactionCount + delta) }
            : p
        )
      );
      if (pinned && pinned.id === target.id) {
        setPinned({
          ...pinned,
          reactionCount: Math.max(0, pinned.reactionCount + delta),
        });
      }
    } else {
      setReplies((prev) => {
        const out: Record<string, LoungeReply[]> = { ...prev };
        for (const pid of Object.keys(out)) {
          out[pid] = out[pid].map((r) =>
            r.id === target.id
              ? {
                  ...r,
                  reactionCount: Math.max(0, r.reactionCount + delta),
                }
              : r
          );
        }
        return out;
      });
    }

    try {
      const res = await fetch("/api/lounge/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: target.kind,
          id: target.id,
          reaction: nextChoice,
        }),
      });
      const data: {
        ok?: boolean;
        counts?: ReactionCounts;
        total?: number;
        myReaction?: ReactionKey | null;
      } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        // Rollback
        setReactions((prev) => ({ ...prev, [target.id]: current }));
        return;
      }
      // Reconcile with server-truth (in case of races)
      setReactions((prev) => ({
        ...prev,
        [target.id]: {
          counts: data.counts ?? optimistic.counts,
          total: typeof data.total === "number" ? data.total : optimistic.total,
          myReaction: data.myReaction ?? null,
        },
      }));
    } catch {
      // Rollback
      setReactions((prev) => ({ ...prev, [target.id]: current }));
    }
  }

  async function deleteTarget(kind: "post" | "reply", id: string) {
    if (!props.isAdmin) return;
    if (!confirm(`Delete this ${kind}?`)) return;
    try {
      const res = await fetch("/api/admin/lounge/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const data: { ok?: boolean } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return;
      if (kind === "post") {
        setPosts((prev) => prev.filter((p) => p.id !== id));
        if (pinned && pinned.id === id) setPinned(null);
        setReplies((prev) => {
          const out = { ...prev };
          delete out[id];
          return out;
        });
      } else {
        setReplies((prev) => {
          const out: Record<string, LoungeReply[]> = {};
          for (const pid of Object.keys(prev)) {
            out[pid] = prev[pid].filter((r) => r.id !== id);
          }
          return out;
        });
        setPosts((prev) =>
          prev.map((p) => ({
            ...p,
            replyCount: Math.max(0, p.replyCount - 1),
          }))
        );
      }
    } catch {
      // No-op
    }
  }

  async function toggleReadByClay(
    kind: "post" | "reply",
    id: string
  ) {
    if (!props.isAdmin) return;
    const currentSet = kind === "post" ? readByClayPostIds : readByClayReplyIds;
    const currentlyRead = currentSet.has(id);
    const next = !currentlyRead;
    // Optimistic update — snap the eye glyph instantly. Roll back on
    // network failure so the UI tells the truth.
    const setState =
      kind === "post" ? setReadByClayPostIds : setReadByClayReplyIds;
    setState((prev) => {
      const out = new Set(prev);
      if (next) out.add(id);
      else out.delete(id);
      return out;
    });
    try {
      const res = await fetch("/api/admin/lounge/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, read: next }),
      });
      const data: { ok?: boolean; read?: boolean } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error("toggle_failed");
      }
    } catch {
      // Rollback
      setState((prev) => {
        const out = new Set(prev);
        if (currentlyRead) out.add(id);
        else out.delete(id);
        return out;
      });
    }
  }

  async function togglePin(postId: string, isPinned: boolean) {
    if (!props.isAdmin) return;
    const newId = isPinned ? null : postId;
    try {
      const res = await fetch("/api/admin/lounge/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newId }),
      });
      const data: { ok?: boolean; pinnedId?: string | null } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) return;
      if (newId === null) {
        if (pinned) {
          setPosts((prev) =>
            [{ ...pinned, pinned: false }, ...prev].sort(
              (a, b) => b.createdAt - a.createdAt
            )
          );
        }
        setPinned(null);
      } else {
        const target =
          posts.find((p) => p.id === postId) ??
          (pinned && pinned.id === postId ? pinned : null);
        if (target) {
          if (pinned) {
            setPosts((prev) =>
              [{ ...pinned, pinned: false }, ...prev].sort(
                (a, b) => b.createdAt - a.createdAt
              )
            );
          }
          setPosts((prev) => prev.filter((p) => p.id !== postId));
          setPinned({ ...target, pinned: true });
        }
      }
    } catch {
      // No-op
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const last = posts[posts.length - 1];
      // Cursor walks by lastActivityAt (the feed's sort key), not
      // createdAt — paginating by createdAt would skip posts that
      // recently bumped above the cursor.
      const before = last?.lastActivityAt;
      const url = `/api/lounge?limit=20${
        typeof before === "number" ? `&before=${before}` : ""
      }`;
      const res = await fetch(url);
      const data: {
        ok?: boolean;
        posts?: LoungePost[];
        replies?: Record<string, LoungeReply[]>;
        reactions?: Record<string, ReactionSnapshot>;
        memberBadges?: Record<string, MemberBadgeInfo>;
        hasMore?: boolean;
      } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !Array.isArray(data.posts)) {
        setLoadingMore(false);
        return;
      }
      setPosts((prev) => [...prev, ...(data.posts ?? [])]);
      setReplies((prev) => ({ ...prev, ...(data.replies ?? {}) }));
      setReactions((prev) => ({ ...prev, ...(data.reactions ?? {}) }));
      setMemberBadges((prev) => ({ ...prev, ...(data.memberBadges ?? {}) }));
      setHasMore(!!data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  const feed = useMemo(() => posts, [posts]);

  // Mirror loadMore into a ref so the deep-link effect can call the
  // freshest version without stale closures.
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  // Deep-link drive. Runs whenever posts / hasMore changes while a
  // target is set. If the target post is now in the DOM, scroll +
  // briefly highlight it. If not and there's more to load, trigger
  // another page. Cap at 5 auto-loads (100 posts deep) to avoid
  // runaway behavior when the target post no longer exists.
  const MAX_DEEPLINK_LOADS = 5;
  useEffect(() => {
    if (!deepLinkTarget) return;
    const el = document.getElementById(`post-${deepLinkTarget}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Soft olive ring that fades; matches the site palette.
      const prev = el.style.boxShadow;
      el.style.transition = "box-shadow 0.4s ease";
      el.style.boxShadow = "0 0 0 3px rgba(138, 125, 32, 0.4)";
      window.setTimeout(() => {
        if (el) el.style.boxShadow = prev;
      }, 2200);
      setDeepLinkTarget(null);
      return;
    }
    if (autoLoadAttempts.current >= MAX_DEEPLINK_LOADS || !hasMore) {
      // Give up quietly. Target was deleted, far in the archive, or
      // never existed.
      setDeepLinkTarget(null);
      return;
    }
    if (!loadingMore) {
      autoLoadAttempts.current += 1;
      void loadMoreRef.current?.();
    }
  }, [deepLinkTarget, posts, hasMore, loadingMore]);

  return (
    <div className="rules-paper">
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Members area</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-5 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            The Lounge.
          </h1>
          {/* Line-art masthead — a small piece of furniture under
              the title to set the room. ~100px tall. */}
          <div
            className="mx-auto mb-6 fade-up stagger-3"
            style={{ maxWidth: 360 }}
          >
            <LoungeSceneIllustration />
          </div>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Where the operators talk.
          </p>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-6 py-12 md:py-16">
        {/* Active-now presence line. Quiet, italic, olive. Only
            renders when someone other than the caller is in the
            5-minute window. */}
        {(() => {
          const line = activeNowLine(props.activeNow);
          if (!line) return null;
          return (
            <p
              className="font-serif italic lounge-meta mb-7 text-center"
              style={{ fontSize: "0.88rem" }}
            >
              {line}
            </p>
          );
        })()}

        {/* "N new" pill — sits inline above the feed, not floating.
            Only renders when a poll surfaced top-level posts from
            other members that aren't in state yet. Clicking it pulls
            the fresh first page in and scrolls to the top. */}
        {pendingNewIds.length > 0 && (
          <div className="text-center mb-6">
            <button
              type="button"
              onClick={mergePending}
              className="lounge-new-pill"
              aria-label={`Show ${pendingNewIds.length} new ${
                pendingNewIds.length === 1 ? "post" : "posts"
              }`}
            >
              <span aria-hidden="true" style={{ marginRight: "0.5rem" }}>
                ↑
              </span>
              {pendingNewIds.length === 1
                ? "1 new post"
                : `${pendingNewIds.length} new posts`}
            </button>
          </div>
        )}

        {/* Pinned post (if any) */}
        {pinned && (
          <div className="mb-8">
            <PostCard
              post={pinned}
              replies={replies[pinned.id] ?? []}
              isPinned={true}
              isAdmin={props.isAdmin}
              reactions={reactions}
              memberBadges={memberBadges}
              readByClayPostIds={readByClayPostIds}
              readByClayReplyIds={readByClayReplyIds}
              adminEmail={props.adminEmail}
              now={now}
              isNew={isNew}
              openReplyFor={openReplyFor}
              setOpenReplyFor={setOpenReplyFor}
              replyDraft={replyDraft}
              setReplyDraft={setReplyDraft}
              replying={replying}
              replyError={replyError}
              expandedReplies={expandedReplies}
              setExpandedReplies={setExpandedReplies}
              pickerOpenFor={pickerOpenFor}
              setPickerOpenFor={setPickerOpenFor}
              onReact={chooseReaction}
              onSubmitReply={submitReply}
              onDelete={deleteTarget}
              onTogglePin={togglePin}
              onToggleReadByClay={toggleReadByClay}
              onReplyFocus={() => {
                replyFocusedRef.current = true;
              }}
              onReplyBlur={() => {
                replyFocusedRef.current = false;
              }}
            />
          </div>
        )}

        {/* Feed */}
        {feed.length === 0 && !pinned ? (
          <div
            className="px-7 py-10 md:px-10 md:py-12 border border-rule text-center"
            style={{ background: "var(--paper-deep)" }}
          >
            <p
              className="font-serif italic text-eye-deep leading-relaxed"
              style={{ fontSize: "1.05rem" }}
            >
              The lounge is quiet. Be the first to settle in.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {feed.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                replies={replies[p.id] ?? []}
                isPinned={false}
                isAdmin={props.isAdmin}
                reactions={reactions}
                memberBadges={memberBadges}
                readByClayPostIds={readByClayPostIds}
                readByClayReplyIds={readByClayReplyIds}
              adminEmail={props.adminEmail}
                now={now}
                isNew={isNew}
                openReplyFor={openReplyFor}
                setOpenReplyFor={setOpenReplyFor}
                replyDraft={replyDraft}
                setReplyDraft={setReplyDraft}
                replying={replying}
                replyError={replyError}
                expandedReplies={expandedReplies}
                setExpandedReplies={setExpandedReplies}
                pickerOpenFor={pickerOpenFor}
                setPickerOpenFor={setPickerOpenFor}
                onReact={chooseReaction}
                onSubmitReply={submitReply}
                onDelete={deleteTarget}
                onTogglePin={togglePin}
                onToggleReadByClay={toggleReadByClay}
                onReplyFocus={() => {
                  replyFocusedRef.current = true;
                }}
                onReplyBlur={() => {
                  replyFocusedRef.current = false;
                }}
              />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="mt-10 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
              style={{
                fontSize: "0.68rem",
                fontWeight: 600,
                padding: "0.6rem 1.1rem",
                border: "1px solid var(--eye-deep)",
                background: "transparent",
                cursor: loadingMore ? "wait" : "pointer",
                opacity: loadingMore ? 0.6 : 1,
              }}
            >
              {loadingMore ? "loading…" : "Load more"}
            </button>
          </div>
        )}

        {/* Atmospheric footer — quiet olive italic, sets the room
            as a place that's existed for a while. */}
        <p
          className="font-serif italic lounge-meta text-center mt-14 mb-10"
          style={{ fontSize: "0.82rem" }}
        >
          The lounge has been open since {formatLaunchDate(props.launchIso)}.
          {" "}
          {props.authorCount === 1
            ? "1 member has posted here."
            : `${props.authorCount} members have posted here.`}
        </p>

        {/* Sticky compose dock — anchored at the bottom of the
            viewport so it's always reachable while members scroll
            through the room. Becomes the page-end element naturally
            when the user reaches the bottom. */}
        <form
          onSubmit={submitPost}
          className="lounge-compose-dock"
        >
          <label className="block">
            <AutoResizingTextarea
              value={composeBody}
              onChange={(e) =>
                setComposeBody(e.target.value.slice(0, MAX_BODY))
              }
              onFocus={() => {
                composeFocusedRef.current = true;
              }}
              onBlur={() => {
                composeFocusedRef.current = false;
              }}
              minRows={2}
              maxLength={MAX_BODY}
              placeholder="Pull up a chair..."
              disabled={composing}
              className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
              style={{ fontSize: "1rem", lineHeight: 1.5 }}
            />
          </label>
          <div className="flex items-center justify-between gap-4 mt-2">
            <span
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.78rem" }}
            >
              {composeBody.length} / {MAX_BODY}
            </span>
            <button
              type="submit"
              disabled={composing || !composeBody.trim()}
              className="btn-primary"
              style={{
                opacity:
                  composing || !composeBody.trim() ? 0.6 : 1,
                cursor: composing ? "wait" : "pointer",
              }}
            >
              <span>{composing ? "posting..." : "Post"}</span>
            </button>
          </div>
          {composeError && (
            <p
              className="font-serif italic mt-2"
              style={{ color: "#7a3a2e", fontSize: "0.86rem" }}
            >
              {composeError}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

/* === Reaction control (trigger + summary + picker) ======================
   Trigger reads as "REACT" until the member picks something — no
   default thumb emoji crowding the row. Picker opens on hover
   (200ms grace before opening, 300ms grace before closing so brief
   pointer trips don't dismiss it). Click still works as a fallback
   for touch/keyboard. Outside-click + Escape close (handled at the
   LoungeView level). */

const PICKER_OPEN_DELAY_MS = 180;
const PICKER_CLOSE_DELAY_MS = 280;

function ReactionControl({
  targetId,
  targetKind,
  snapshot,
  pickerOpenFor,
  setPickerOpenFor,
  onReact,
  small = false,
}: {
  targetId: string;
  targetKind: "post" | "reply";
  snapshot: ReactionSnapshot;
  pickerOpenFor: string | null;
  setPickerOpenFor: (id: string | null) => void;
  onReact: (
    target: { kind: "post" | "reply"; id: string },
    next: ReactionKey | null
  ) => void;
  small?: boolean;
}) {
  const isOpen = pickerOpenFor === targetId;
  const mine = snapshot.myReaction;
  const hasReaction = mine !== null;

  // Top-3 reaction keys by count for the summary cluster.
  const topKeys: ReactionKey[] = REACTION_KEYS.filter(
    (k) => snapshot.counts[k] > 0
  )
    .sort((a, b) => snapshot.counts[b] - snapshot.counts[a])
    .slice(0, 3);

  // Hover-open / hover-close timers. Refs so re-renders don't wipe
  // the pending timeout id.
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  function clearOpen() {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }
  function clearClose() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function handleEnter() {
    clearClose();
    if (isOpen) return;
    clearOpen();
    openTimerRef.current = window.setTimeout(() => {
      setPickerOpenFor(targetId);
      openTimerRef.current = null;
    }, PICKER_OPEN_DELAY_MS);
  }

  function handleLeave() {
    clearOpen();
    if (!isOpen) return;
    clearClose();
    closeTimerRef.current = window.setTimeout(() => {
      setPickerOpenFor(null);
      closeTimerRef.current = null;
    }, PICKER_CLOSE_DELAY_MS);
  }

  // Clean up any pending timers on unmount.
  useEffect(() => {
    return () => {
      clearOpen();
      clearClose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerColor = hasReaction ? "var(--eye-deep)" : "var(--ink-faint)";

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        data-reaction-trigger
        onClick={() => {
          // Click toggles immediately (mobile/keyboard primary path).
          clearOpen();
          clearClose();
          setPickerOpenFor(isOpen ? null : targetId);
        }}
        className="font-display uppercase tracking-[0.22em] transition-colors"
        style={{
          fontSize: small ? "0.58rem" : "0.62rem",
          fontWeight: 600,
          background: "transparent",
          border: 0,
          color: triggerColor,
          cursor: "pointer",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={
          hasReaction ? `Your reaction: ${REACTION_LABEL[mine]}` : "Add a reaction"
        }
      >
        {hasReaction && (
          <span
            aria-hidden="true"
            style={{
              fontSize: small ? "0.95rem" : "1.05rem",
              lineHeight: 1,
            }}
          >
            {REACTION_EMOJI[mine]}
          </span>
        )}
        <span>{hasReaction ? REACTION_LABEL[mine] : "React"}</span>
      </button>

      {/* Summary cluster (top emoji + total). Hidden when the user
          is the only reactor — the trigger already shows their
          emoji + label, no point echoing it. */}
      {snapshot.total > 0 && !(hasReaction && snapshot.total === 1) && (
        <span
          className="font-display"
          style={{
            marginLeft: "0.55rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--ink-faint)",
            fontSize: small ? "0.6rem" : "0.66rem",
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          <span aria-hidden="true" style={{ display: "inline-flex" }}>
            {topKeys.map((k) => (
              <span
                key={k}
                style={{
                  fontSize: small ? "0.85rem" : "0.95rem",
                  lineHeight: 1,
                  marginRight: "-0.2rem",
                }}
              >
                {REACTION_EMOJI[k]}
              </span>
            ))}
          </span>
          <span style={{ marginLeft: "0.3rem" }}>{snapshot.total}</span>
        </span>
      )}

      {/* Picker */}
      {isOpen && (
        <div
          data-reaction-picker
          role="menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            display: "inline-flex",
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            boxShadow: "0 6px 22px rgba(26, 23, 20, 0.12)",
            padding: "0.35rem 0.45rem",
            gap: "0.2rem",
          }}
        >
          {REACTION_KEYS.map((key) => {
            const isMine = mine === key;
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() =>
                  onReact({ kind: targetKind, id: targetId }, key)
                }
                aria-pressed={isMine}
                title={REACTION_LABEL[key]}
                aria-label={REACTION_LABEL[key]}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2rem",
                  height: "2rem",
                  fontSize: "1.25rem",
                  lineHeight: 1,
                  background: isMine
                    ? "rgba(184, 168, 44, 0.18)"
                    : "transparent",
                  border: 0,
                  cursor: "pointer",
                  borderRadius: 2,
                  transition: "transform 0.12s ease, background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(1.18)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(1)";
                }}
              >
                <span aria-hidden="true">{REACTION_EMOJI[key]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* === Post card ============================================ */

type CardProps = {
  post: LoungePost;
  replies: LoungeReply[];
  isPinned: boolean;
  isAdmin: boolean;
  reactions: Record<string, ReactionSnapshot>;
  memberBadges: Record<string, MemberBadgeInfo>;
  readByClayPostIds: Set<string>;
  readByClayReplyIds: Set<string>;
  adminEmail: string | null;
  now: number;
  isNew: (at: number) => boolean;
  openReplyFor: string | null;
  setOpenReplyFor: (id: string | null) => void;
  replyDraft: string;
  setReplyDraft: (s: string) => void;
  replying: boolean;
  replyError: string | null;
  expandedReplies: Set<string>;
  setExpandedReplies: (next: Set<string>) => void;
  pickerOpenFor: string | null;
  setPickerOpenFor: (id: string | null) => void;
  onReact: (
    target: { kind: "post" | "reply"; id: string },
    next: ReactionKey | null
  ) => void;
  onSubmitReply: (postId: string) => void;
  onDelete: (kind: "post" | "reply", id: string) => void;
  onTogglePin: (postId: string, isPinned: boolean) => void;
  onToggleReadByClay: (kind: "post" | "reply", id: string) => void;
  onReplyFocus: () => void;
  onReplyBlur: () => void;
};

function PostCard(props: CardProps) {
  const {
    post,
    replies,
    isPinned,
    isAdmin,
    reactions,
    memberBadges,
    readByClayPostIds,
    readByClayReplyIds,
    adminEmail,
    now,
    isNew,
    openReplyFor,
    setOpenReplyFor,
    replyDraft,
    setReplyDraft,
    replying,
    replyError,
    expandedReplies,
    setExpandedReplies,
    pickerOpenFor,
    setPickerOpenFor,
    onReact,
    onSubmitReply,
    onDelete,
    onTogglePin,
    onToggleReadByClay,
  } = props;

  const postIsRead = readByClayPostIds.has(post.id);
  // Authority treatment: Clay's own posts get the AUTHOR badge,
  // olive name + avatar, and a left rule on the card. Match against
  // the normalized admin email handed in from the server (process.env
  // isn't available client-side).
  const byAuthor =
    !!adminEmail &&
    post.memberEmail.toLowerCase().trim() === adminEmail;

  const isFresh = isNew(post.createdAt);

  const expanded = expandedReplies.has(post.id);
  const visibleReplies =
    expanded || replies.length <= 1
      ? replies
      : replies.slice(replies.length - 1);
  const hiddenCount = replies.length - visibleReplies.length;

  const snapshot = reactions[post.id] ?? emptySnapshot();

  return (
    <article
      id={`post-${post.id}`}
      className={
        "relative lounge-card" +
        (isPinned ? " lounge-card-pinned" : "") +
        (isFresh ? " lounge-card-fresh" : "") +
        (byAuthor ? " lounge-card-author" : "")
      }
      style={{ padding: "1.5rem 1.5rem" }}
    >
      {isPinned && (
        <span
          aria-label="Pinned"
          className="font-display uppercase"
          style={{
            position: "absolute",
            top: "0.7rem",
            right: "0.9rem",
            fontSize: "0.55rem",
            letterSpacing: "0.28em",
            fontWeight: 600,
            color: "var(--eye-deep)",
          }}
        >
          &diams; Pinned
        </span>
      )}

      <header className="flex items-center justify-between gap-3 mb-2 flex-wrap min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <InitialAvatar
            displayName={byAuthor ? "Clay" : post.firstName}
            size={28}
          />
          <span
            className="font-display break-words"
            style={{
              fontSize: byAuthor ? "1.05rem" : "0.96rem",
              fontWeight: 700,
              letterSpacing: "-0.005em",
              color: byAuthor ? "var(--eye-deep)" : "var(--ink)",
              maxWidth: "100%",
            }}
          >
            {byAuthor ? "Clay" : post.firstName}
          </span>
          {byAuthor ? (
            <span
              className="font-display uppercase"
              style={{
                fontSize: "0.58rem",
                fontWeight: 700,
                color: "var(--eye-deep)",
                background: "var(--paper-deep)",
                border: "1px solid var(--eye-deep)",
                padding: "0.12rem 0.5rem",
                letterSpacing: "0.24em",
              }}
            >
              Author
            </span>
          ) : (
            (() => {
              const b = memberBadges[post.memberEmail];
              return (
                <MemberBadge
                  founderSlot={b?.founderSlot ?? null}
                  tierBadge={b?.tierBadge ?? null}
                  size="small"
                />
              );
            })()
          )}
          {isFresh && (
            <span
              className="font-display uppercase"
              style={{
                fontSize: "0.55rem",
                letterSpacing: "0.24em",
                fontWeight: 700,
                color: "var(--paper)",
                background: "var(--eye-deep)",
                padding: "0.1rem 0.4rem",
              }}
            >
              New
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 self-start" style={{ marginTop: "0.45rem" }}>
          {isPostLive(post, now) && (
            <span
              aria-label="Recent replies"
              title="Recent activity"
              className="lounge-live-dot"
            />
          )}
          <span
            className="font-serif italic text-ink-faint"
            style={{ fontSize: "0.78rem" }}
          >
            {formatRelative(post.createdAt, now)}
          </span>
        </div>
      </header>

      <p
        className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
        style={{ fontSize: "1rem" }}
      >
        <Linkified text={post.body} highlightMentions />
      </p>

      {/* Read-by-Clay mark lives below the body, as a quiet editor's
          stamp on the post itself. Out of the header so it can't be
          misread as a timestamp for when Clay read it. */}
      {postIsRead && <ReadByClayMark />}

      <footer className="mt-4 flex items-center gap-5 flex-wrap">
        <ReactionControl
          targetId={post.id}
          targetKind="post"
          snapshot={snapshot}
          pickerOpenFor={pickerOpenFor}
          setPickerOpenFor={setPickerOpenFor}
          onReact={onReact}
        />
        <button
          type="button"
          onClick={() =>
            setOpenReplyFor(openReplyFor === post.id ? null : post.id)
          }
          className="font-display uppercase tracking-[0.22em] transition-colors"
          style={{
            fontSize: "0.62rem",
            fontWeight: 600,
            background: "transparent",
            border: 0,
            color: "var(--ink-faint)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Reply &middot; {post.replyCount}
        </button>
        {isAdmin && (
          <>
            <span
              className="text-ink-faint"
              style={{ fontSize: "0.62rem" }}
              aria-hidden="true"
            >
              |
            </span>
            <button
              type="button"
              onClick={() => onToggleReadByClay("post", post.id)}
              className="font-display uppercase tracking-[0.22em] hover:text-eye-deep transition-colors"
              style={{
                fontSize: "0.62rem",
                fontWeight: 600,
                background: "transparent",
                border: 0,
                color: postIsRead ? "var(--eye-deep)" : "var(--ink-faint)",
                cursor: "pointer",
                padding: 0,
              }}
              title={postIsRead ? "Clear read receipt" : "Mark as read by Clay"}
            >
              {postIsRead ? "unread" : "mark read"}
            </button>
            <button
              type="button"
              onClick={() => onTogglePin(post.id, isPinned)}
              className="font-display uppercase tracking-[0.22em] hover:text-eye-deep transition-colors"
              style={{
                fontSize: "0.62rem",
                fontWeight: 600,
                background: "transparent",
                border: 0,
                color: "var(--ink-faint)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {isPinned ? "unpin" : "pin"}
            </button>
            <button
              type="button"
              onClick={() => onDelete("post", post.id)}
              className="font-display uppercase tracking-[0.22em] hover:text-eye-deep transition-colors"
              style={{
                fontSize: "0.62rem",
                fontWeight: 600,
                background: "transparent",
                border: 0,
                color: "var(--ink-faint)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              delete
            </button>
          </>
        )}
      </footer>

      {/* Inline reply composer */}
      {openReplyFor === post.id && (
        <div className="mt-4 pt-4 border-t border-rule">
          <AutoResizingTextarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value.slice(0, MAX_BODY))}
            onFocus={props.onReplyFocus}
            onBlur={props.onReplyBlur}
            minRows={2}
            maxLength={MAX_BODY}
            placeholder={`Reply to ${post.firstName}…`}
            disabled={replying}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
            style={{ fontSize: "0.95rem", lineHeight: 1.5 }}
            autoFocus
          />
          <div className="flex items-center justify-between gap-3 mt-2">
            <span
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.76rem" }}
            >
              {replyDraft.length} / {MAX_BODY}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setReplyDraft("");
                  setOpenReplyFor(null);
                }}
                className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink transition-colors"
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 500,
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                cancel
              </button>
              <button
                type="button"
                onClick={() => onSubmitReply(post.id)}
                disabled={replying || !replyDraft.trim()}
                className="btn-secondary"
                style={{
                  opacity:
                    replying || !replyDraft.trim() ? 0.6 : 1,
                  cursor: replying ? "wait" : "pointer",
                }}
              >
                <span>{replying ? "sending…" : "Reply"}</span>
              </button>
            </div>
          </div>
          {replyError && (
            <p
              className="font-serif italic mt-2"
              style={{ color: "#7a3a2e", fontSize: "0.84rem" }}
            >
              {replyError}
            </p>
          )}
        </div>
      )}

      {/* Replies — curved olive connector instead of a flat border.
          The .lounge-reply-block ::before draws the vertical trunk
          and each .lounge-reply ::before draws the small hook that
          branches into the reply. */}
      {visibleReplies.length > 0 && (
        <div className="mt-5 lounge-reply-block">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => {
                const next = new Set(expandedReplies);
                next.add(post.id);
                setExpandedReplies(next);
              }}
              className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink transition-colors mb-3"
              style={{
                fontSize: "0.6rem",
                fontWeight: 600,
                background: "transparent",
                border: 0,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Show {hiddenCount} more {hiddenCount === 1 ? "reply" : "replies"}
            </button>
          )}
          <ul className="flex flex-col gap-4">
            {visibleReplies.map((r) => (
              <ReplyRow
                key={r.id}
                reply={r}
                isAdmin={isAdmin}
                snapshot={reactions[r.id] ?? emptySnapshot()}
                badge={memberBadges[r.memberEmail]}
                isReadByClay={readByClayReplyIds.has(r.id)}
                byAuthor={
                  !!adminEmail &&
                  r.memberEmail.toLowerCase().trim() === adminEmail
                }
                now={now}
                isFresh={isNew(r.createdAt)}
                pickerOpenFor={pickerOpenFor}
                setPickerOpenFor={setPickerOpenFor}
                onReact={onReact}
                onDelete={() => onDelete("reply", r.id)}
                onToggleReadByClay={() => onToggleReadByClay("reply", r.id)}
                onMentionReply={() => {
                  // Build the @-token from the reply author's first
                  // name. mentionTokenFor strips punctuation/whitespace
                  // so the parser can resolve it back to the same
                  // email on send.
                  const token = mentionTokenFor(r.firstName);
                  if (!token) return;
                  const mention = `@${token} `;
                  if (openReplyFor === post.id) {
                    // Composer's already open on this post — append
                    // without nuking what's been typed. Keep a single
                    // space between the existing tail and the new tag.
                    const current = replyDraft;
                    const sep =
                      current.length === 0 || current.endsWith(" ")
                        ? ""
                        : " ";
                    setReplyDraft(
                      (current + sep + mention).slice(0, MAX_BODY)
                    );
                  } else {
                    // Composer was closed (or open on another post).
                    // Replace draft + open ours.
                    setReplyDraft(mention.slice(0, MAX_BODY));
                    setOpenReplyFor(post.id);
                  }
                }}
              />
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/* === Reply row ============================================ */

function ReplyRow({
  reply,
  isAdmin,
  snapshot,
  badge,
  isReadByClay,
  byAuthor,
  now,
  isFresh,
  pickerOpenFor,
  setPickerOpenFor,
  onReact,
  onDelete,
  onToggleReadByClay,
  onMentionReply,
}: {
  reply: LoungeReply;
  isAdmin: boolean;
  snapshot: ReactionSnapshot;
  badge: MemberBadgeInfo | undefined;
  isReadByClay: boolean;
  byAuthor: boolean;
  now: number;
  isFresh: boolean;
  pickerOpenFor: string | null;
  setPickerOpenFor: (id: string | null) => void;
  onReact: (
    target: { kind: "post" | "reply"; id: string },
    next: ReactionKey | null
  ) => void;
  onDelete: () => void;
  onToggleReadByClay: () => void;
  /** Open the post's composer pre-filled with @<this reply's
      author>. Flat thread is preserved — the new reply lands as a
      sibling at the bottom, the @-tag just makes the addressing
      legible (and triggers a lounge_mention notification to the
      tagged member when sent). */
  onMentionReply: () => void;
}) {
  return (
    <li
      id={`reply-${reply.id}`}
      className={"lounge-reply" + (byAuthor ? " lounge-reply-author" : "")}
    >
      <header className="flex items-center justify-between gap-3 mb-1 flex-wrap min-w-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <InitialAvatar
            displayName={byAuthor ? "Clay" : reply.firstName}
            size={22}
          />
          <span
            className="font-display break-words"
            style={{
              fontSize: byAuthor ? "0.98rem" : "0.9rem",
              fontWeight: 700,
              letterSpacing: "-0.005em",
              color: byAuthor ? "var(--eye-deep)" : "var(--ink)",
              maxWidth: "100%",
            }}
          >
            {byAuthor ? "Clay" : reply.firstName}
          </span>
          {byAuthor ? (
            <span
              className="font-display uppercase"
              style={{
                fontSize: "0.55rem",
                fontWeight: 700,
                color: "var(--eye-deep)",
                background: "var(--paper-deep)",
                border: "1px solid var(--eye-deep)",
                padding: "0.1rem 0.45rem",
                letterSpacing: "0.24em",
              }}
            >
              Author
            </span>
          ) : (
            <MemberBadge
              founderSlot={badge?.founderSlot ?? null}
              tierBadge={badge?.tierBadge ?? null}
              size="small"
            />
          )}
          {isFresh && (
            <span
              className="font-display uppercase"
              style={{
                fontSize: "0.52rem",
                letterSpacing: "0.24em",
                fontWeight: 700,
                color: "var(--paper)",
                background: "var(--eye-deep)",
                padding: "0.08rem 0.34rem",
              }}
            >
              New
            </span>
          )}
        </div>
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.74rem" }}
        >
          {formatRelative(reply.createdAt, now)}
        </span>
      </header>
      <p
        className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
        style={{ fontSize: "0.95rem" }}
      >
        <Linkified text={reply.body} highlightMentions />
      </p>
      {/* Editor's stamp below the reply body. Out of the header so it
          isn't misread as a timestamp for the read event. */}
      {isReadByClay && <ReadByClayMark />}
      <div className="mt-2 flex items-center gap-4 flex-wrap">
        <ReactionControl
          targetId={reply.id}
          targetKind="reply"
          snapshot={snapshot}
          pickerOpenFor={pickerOpenFor}
          setPickerOpenFor={setPickerOpenFor}
          onReact={onReact}
          small
        />
        <button
          type="button"
          onClick={onMentionReply}
          className="font-display uppercase tracking-[0.22em] hover:text-eye-deep transition-colors"
          style={{
            fontSize: "0.58rem",
            fontWeight: 600,
            background: "transparent",
            border: 0,
            color: "var(--ink-faint)",
            cursor: "pointer",
            padding: 0,
          }}
          title={`Reply to ${reply.firstName}`}
        >
          reply
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={onToggleReadByClay}
              className="font-display uppercase tracking-[0.22em] hover:text-eye-deep transition-colors"
              style={{
                fontSize: "0.58rem",
                fontWeight: 600,
                background: "transparent",
                border: 0,
                color: isReadByClay ? "var(--eye-deep)" : "var(--ink-faint)",
                cursor: "pointer",
                padding: 0,
              }}
              title={isReadByClay ? "Clear read receipt" : "Mark as read by Clay"}
            >
              {isReadByClay ? "unread" : "mark read"}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="font-display uppercase tracking-[0.22em] hover:text-eye-deep transition-colors"
              style={{
                fontSize: "0.58rem",
                fontWeight: 600,
                background: "transparent",
                border: 0,
                color: "var(--ink-faint)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}
