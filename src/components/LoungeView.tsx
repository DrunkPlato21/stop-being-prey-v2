"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ActiveNowSnapshot,
  LoungeImageMedia,
  LoungePost,
  LoungeReply,
  ReactionCounts,
  ReactionKey,
  RoomPresence,
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
import { LoungeMedia } from "@/components/LoungeMedia";
import { ReactorsPopover } from "@/components/ReactorsPopover";
import { resizeImageToWebp } from "@/lib/image-resize";
import { extractYouTubeId, stripYouTubeUrls } from "@/lib/youtube";
import { mentionTokenFor } from "@/lib/display-name";
import { MentionAutoResizingTextarea } from "@/components/MentionAutoResizingTextarea";
import {
  WatchFeed,
  type WatchPost,
  type WatchArrival,
} from "@/components/WatchFeed";

type MemberBadgeInfo = {
  founderSlot: number | null;
  charterSlot: number | null;
  tierBadge: TierBadge | null;
};

// Client island for /lounge. Receives the server-rendered initial
// snapshot and handles every interactive action: posting, replying,
// reacting, loading more, admin delete/pin.
//
// Reactions are FB-style: 5-key picker, one reaction per member per
// target. Tapping the same key again removes; tapping a different
// key replaces.

// 500 is the member limit shown in the counter. Admin (Clay) gets a
// higher hard cap of MAX_BODY_ADMIN; once he crosses MAX_BODY the
// composer flips to a warning treatment but still accepts up to the cap.
const MAX_BODY = 500;
const MAX_BODY_ADMIN = 1500;
// Existing error/warning ink used elsewhere on the lounge surface
// (composeError, replyError). Reused here so the over-recommended
// state stays in the warm-paper palette instead of pure red.
const WARN_INK = "#7a3a2e";

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
  /** Normalized email of the signed-in viewer, so a member's own posts
      and replies can surface the edit/delete affordances (gated to the
      15-minute window client-side; the server is the real authority). */
  viewerEmail: string;
  lastVisitedAt: number | null;
  isAdmin: boolean;
  /** False when the viewer has no display name yet — the post + reply
      composers reveal an inline name field, required before posting (the
      server gate enforces it too). Always true for the admin. */
  viewerHasDisplayName: boolean;
  activeNow: ActiveNowSnapshot;
  /** "Who's in the room" indicator (count + names), or null when the
      room is below the admin-set floor and the line should hide.
      Refreshed live from the poll so the count tracks the event.
      Optional — the admin moderation view omits it. */
  roomPresence?: RoomPresence | null;
  /** Watch Feed initial state for the lounge banner. The component
      self-polls and self-gates, so these only seed the first paint;
      `initialWatchEnabled` is false unless the admin toggle is on. */
  initialWatchPosts?: WatchPost[];
  initialWatchArrivals?: WatchArrival[];
  initialWatchEnabled?: boolean;
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

// Textarea behavior (auto-resize + cursor-at-end on autoFocus) lives
// in ./AutoResizingTextarea; the lounge composers use the mention-
// aware wrapper (./MentionAutoResizingTextarea) for the @-picker.

// "Who's in the room" line: count plus a few names and an overflow
// tail, e.g. "6 in the room · Janet, Mike, Trish +2". `total` counts
// everyone in the window (the viewer included); `names` are everyone
// other than the viewer, newest-first, so the overflow is reckoned
// against total - 1 (the others). Returns null when there's nothing
// worth showing.
const ROOM_PRESENCE_NAMES_SHOWN = 3;
function roomPresenceLine(presence: RoomPresence | null): string | null {
  if (!presence || presence.total <= 0) return null;
  const head = `${presence.total} in the room`;
  const shown = presence.names.slice(0, ROOM_PRESENCE_NAMES_SHOWN);
  if (shown.length === 0) return head;
  const others = Math.max(0, presence.total - 1);
  const overflow = Math.max(0, others - shown.length);
  const tail = overflow > 0 ? `${shown.join(", ")} +${overflow}` : shown.join(", ");
  return `${head} · ${tail}`;
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
// Poll cadence. Snappy while the room is live (presence above the
// floor) so posts and reactions land near-instantly during an event;
// relaxed otherwise so a normal quiet day doesn't hammer Redis. See
// the 2026-05-18 rate-limit incident.
const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 20_000;
// A just-posted reply is shown optimistically. Keep it from being
// clobbered by a poll whose read raced the write — preserve a local
// reply the server list doesn't have yet until this grace expires
// (by which point the server list includes it and dedupes it).
const REPLY_MERGE_GRACE_MS = 10_000;

const LIVE_WINDOW_MS = 10 * 60 * 1000;
// Window during which a member may edit or delete their own post/reply.
// Keep in sync with EDIT_WINDOW_MS in src/lib/lounge.ts — the server
// enforces it authoritatively; this only drives whether the UI offers
// the affordance.
const EDIT_WINDOW_MS = 15 * 60 * 1000;
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
  if (err.error === "rate_limited") {
    const s = err.secondsRemaining ?? 30;
    return `Wait ${s} seconds before ${kind === "post" ? "posting" : "replying"} again.`;
  }
  switch (err.error) {
    // Display-name gate (first post/reply from a member with no name yet).
    case "display_name_required":
      return "Pick a display name to post.";
    case "invalid_display_name":
      return "That display name isn't allowed.";
    case "reserved":
      return "That name is reserved. Try another.";
    case "profanity":
      return "That name isn't allowed. Try another.";
    case "name_taken":
      return "Someone's already using that name. Try another.";
    case "empty_body":
      return "Add something to post.";
    default:
      return "Couldn't send. Try again.";
  }
}

// Inline display-name field shown in the post + reply composers to a
// member who hasn't set a name yet. First post turns it into their profile
// (see the gate in /api/lounge). Kept deliberately quiet so it reads as a
// one-time setup line, not a wall.
function LoungeNameField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 mb-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 30))}
        maxLength={30}
        placeholder="Pick a display name (30 char max)"
        disabled={disabled}
        aria-label="Display name"
        className="font-serif text-ink bg-paper border border-border px-4 py-2 outline-none focus:border-ink"
        style={{ fontSize: "0.95rem" }}
      />
      <p
        className="font-serif italic text-ink-faint"
        style={{ fontSize: "0.76rem" }}
      >
        Set once. You can change it later from your account.
      </p>
    </div>
  );
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
  // First-post display-name gate. `needsName` starts true for a member with
  // no name yet (admin is always named); the post + reply composers reveal
  // an inline field, and the name rides the first post/reply to the server
  // gate. Flipped false once any post or reply succeeds, so the field
  // disappears everywhere without waiting for a reload.
  const [needsName, setNeedsName] = useState(!props.viewerHasDisplayName);
  const [nameDraft, setNameDraft] = useState("");
  // Attached image (one per post). pendingImage is the validated,
  // uploaded descriptor sent with the post; pendingPreview is a local
  // object URL for an instant thumbnail while/after it uploads.
  const [pendingImage, setPendingImage] = useState<LoungeImageMedia | null>(
    null
  );
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // Reply boxes by parent post id. `openUnderReplyId` controls where
  // the composer renders: null anchors it under the post body (when
  // the user clicked "Reply" on the post itself), a reply id anchors
  // it under that specific reply (when the user clicked "reply" on
  // an individual reply). Submission still creates a flat sibling
  // reply on the parent post regardless of anchor.
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const [openUnderReplyId, setOpenUnderReplyId] = useState<string | null>(
    null
  );
  const [replyDraft, setReplyDraft] = useState<string>("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  // Attached image for the single active reply composer, mirroring the
  // top-level compose image state. One reply box is open at a time, so a
  // single set of state serves whichever post is being replied to.
  const [replyImage, setReplyImage] = useState<LoungeImageMedia | null>(null);
  const [replyPreview, setReplyPreview] = useState<string | null>(null);
  const [replyUploadingImage, setReplyUploadingImage] = useState(false);

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

  // Own-content edit state. `editingTarget` is the post/reply currently
  // open in the inline editor (null = none). The draft, in-flight flag,
  // and error drive the EditBox. Delete reuses the same removal path as
  // the admin delete, just hitting the member endpoint.
  const [editingTarget, setEditingTarget] = useState<{
    kind: "post" | "reply";
    id: string;
  } | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const viewerEmail = props.viewerEmail.toLowerCase().trim();

  // "Who's in the room" indicator. Seeded from the server snapshot,
  // then refreshed on every poll so the count + names track the event
  // live. Null means the room is below the floor — render nothing.
  const [roomPresence, setRoomPresence] = useState<RoomPresence | null>(
    props.roomPresence ?? null
  );

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
  // Mirror of roomPresence so the poll scheduler can read "is the room
  // live?" without re-installing the interval on every presence change.
  const roomPresenceRef = useRef(roomPresence);
  const composeFocusedRef = useRef(false);
  const replyFocusedRef = useRef(false);
  // Per-target timestamp of the user's most recent optimistic
  // reaction. Polls within ~3s of an optimistic action skip reaction
  // updates for that target to avoid clobbering a still-flying write.
  const optimisticReactionAt = useRef<Record<string, number>>({});
  // Per-reply timestamp of the user's most recent optimistic reply, so
  // the poll's reply merge can protect a just-posted reply from a
  // racing read until the server list catches up.
  const optimisticReplyAt = useRef<Record<string, number>>({});

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);
  useEffect(() => {
    roomPresenceRef.current = roomPresence;
  }, [roomPresence]);

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
          roomPresence?: RoomPresence | null;
        } = await res.json().catch(() => ({}));
        if (cancelled || !data.ok) return;

        // Keep the "in the room" line live. `roomPresence` is present
        // (possibly null) on every first-page poll, so mirror it
        // straight through — null collapses the line when the room
        // drops below the floor.
        setRoomPresence(data.roomPresence ?? null);

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

        // 2) Replies for posts in view: server is authoritative, but
        //    don't drop a reply the user just posted that the server's
        //    read hasn't caught up to yet. Keep any local reply absent
        //    from the server list if it's within the grace window;
        //    once the server returns it, dedupe by id keeps it single.
        if (Object.keys(serverReplies).length > 0) {
          const nowMs = Date.now();
          setReplies((prev) => {
            const out = { ...prev };
            for (const [pid, list] of Object.entries(serverReplies)) {
              const serverIds = new Set(list.map((r) => r.id));
              const survivors = (prev[pid] ?? []).filter(
                (r) =>
                  !serverIds.has(r.id) &&
                  nowMs - (optimisticReplyAt.current[r.id] ?? 0) <
                    REPLY_MERGE_GRACE_MS
              );
              out[pid] =
                survivors.length > 0
                  ? [...list, ...survivors].sort(
                      (a, b) => a.createdAt - b.createdAt
                    )
                  : list;
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

    // Adaptive cadence: poll fast when the room is live (presence above
    // the floor), slow when it's quiet. Self-scheduling timeout instead
    // of a fixed interval so the delay can change between ticks without
    // tearing down the effect.
    let timeoutId: number | null = null;
    function scheduleNext() {
      if (cancelled) return;
      const delay = roomPresenceRef.current ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      timeoutId = window.setTimeout(async () => {
        await poll();
        scheduleNext();
      }, delay);
    }
    scheduleNext();
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
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

  function clearPendingImage() {
    setPendingImage(null);
    setPendingPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setComposeError("That doesn't look like an image.");
      return;
    }
    setComposeError(null);
    clearPendingImage();
    setUploadingImage(true);
    const preview = URL.createObjectURL(file);
    setPendingPreview(preview);
    try {
      // Downscale + re-encode to WebP in the browser before upload —
      // keeps storage/bandwidth tiny and strips EXIF.
      const { blob, width, height } = await resizeImageToWebp(file);
      const fd = new FormData();
      fd.append("file", new File([blob], "image.webp", { type: "image/webp" }));
      const res = await fetch("/api/lounge/upload", { method: "POST", body: fd });
      const data: { ok?: boolean; url?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok || !data.url) {
        setComposeError(
          data.error === "daily_limit"
            ? "You've hit today's image limit."
            : "Image upload failed. Try again."
        );
        clearPendingImage();
        return;
      }
      setPendingImage({ type: "image", url: data.url, width, height });
    } catch {
      setComposeError("Couldn't process that image.");
      clearPendingImage();
    } finally {
      setUploadingImage(false);
    }
  }

  function clearReplyImage() {
    setReplyImage(null);
    setReplyPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  // Reply-side twin of onPickImage: same Blob upload, same WebP downscale,
  // writing the reply image state instead of the compose state.
  async function onPickReplyImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setReplyError("That doesn't look like an image.");
      return;
    }
    setReplyError(null);
    clearReplyImage();
    setReplyUploadingImage(true);
    const preview = URL.createObjectURL(file);
    setReplyPreview(preview);
    try {
      const { blob, width, height } = await resizeImageToWebp(file);
      const fd = new FormData();
      fd.append("file", new File([blob], "image.webp", { type: "image/webp" }));
      const res = await fetch("/api/lounge/upload", { method: "POST", body: fd });
      const data: { ok?: boolean; url?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok || !data.url) {
        setReplyError(
          data.error === "daily_limit"
            ? "You've hit today's image limit."
            : "Image upload failed. Try again."
        );
        clearReplyImage();
        return;
      }
      setReplyImage({ type: "image", url: data.url, width, height });
    } catch {
      setReplyError("Couldn't process that image.");
      clearReplyImage();
    } finally {
      setReplyUploadingImage(false);
    }
  }

  const replyImageCtl: ReplyImageCtl = {
    preview: replyPreview,
    uploading: replyUploadingImage,
    hasImage: !!replyImage,
    onPick: onPickReplyImage,
    clear: clearReplyImage,
  };

  async function submitPost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = composeBody.trim();
    if ((!body && !pendingImage) || composing || uploadingImage) return;
    if (needsName && !nameDraft.trim()) {
      setComposeError("Pick a display name to post.");
      return;
    }
    setComposing(true);
    setComposeError(null);
    try {
      const res = await fetch("/api/lounge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          media: pendingImage ?? undefined,
          ...(needsName ? { displayName: nameDraft.trim() } : {}),
        }),
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
      // Name is set now — drop the field everywhere.
      if (needsName) {
        setNeedsName(false);
        setNameDraft("");
      }
      clearPendingImage();
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "send_failed");
    } finally {
      setComposing(false);
    }
  }

  async function submitReply(parentPostId: string) {
    const body = replyDraft.trim();
    if ((!body && !replyImage) || replying || replyUploadingImage) return;
    if (needsName && !nameDraft.trim()) {
      setReplyError("Pick a display name to post.");
      return;
    }
    setReplying(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/lounge/${parentPostId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          media: replyImage ?? undefined,
          ...(needsName ? { displayName: nameDraft.trim() } : {}),
        }),
      });
      const data: { ok?: boolean; reply?: LoungeReply } & ApiError = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok || !data.reply) {
        setReplyError(rateLimitMessage(data, "reply"));
        return;
      }
      // Name is set now — drop the field everywhere.
      if (needsName) {
        setNeedsName(false);
        setNameDraft("");
      }
      const newReply = data.reply!;
      // Stamp so the poll's reply merge won't clobber this until the
      // server list includes it (see REPLY_MERGE_GRACE_MS).
      optimisticReplyAt.current[newReply.id] = Date.now();
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
      clearReplyImage();
      setOpenReplyFor(null);
      setOpenUnderReplyId(null);
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

    // Admin reacting to a post or reply implies they've read it —
    // auto-stamp the read-by-Clay receipt so it shows the eye glyph
    // without a second click. Only fires when adding/changing a
    // reaction (resolved !== null); clearing a reaction is not an
    // unread signal. Idempotent — markReadByClay no-ops if already on.
    if (props.isAdmin && resolved !== null) {
      void markReadByClay(target.kind, target.id);
    }

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

  // Drop a deleted post/reply from local state. Shared by the admin
  // moderation delete and a member's self-delete so both keep the feed
  // consistent without a reload.
  function removeTargetFromState(kind: "post" | "reply", id: string) {
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
      removeTargetFromState(kind, id);
    } catch {
      // No-op
    }
  }

  // --- Own-content edit / delete ---

  function startEdit(kind: "post" | "reply", id: string, body: string) {
    setEditingTarget({ kind, id });
    setEditDraft(body);
    setEditError(null);
    setEditSaving(false);
  }

  function cancelEdit() {
    setEditingTarget(null);
    setEditDraft("");
    setEditError(null);
    setEditSaving(false);
  }

  async function submitEdit() {
    if (!editingTarget) return;
    const { kind, id } = editingTarget;
    if (editDraft.trim().length === 0) {
      setEditError("Add something first.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch("/api/lounge/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, body: editDraft }),
      });
      const data: { ok?: boolean; error?: string; body?: string; editedAt?: number } =
        await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setEditError(
          data.error === "window_closed"
            ? "The edit window has closed."
            : data.error === "forbidden"
              ? "You can only edit your own posts."
              : data.error === "empty_body"
                ? "Add something first."
                : "Couldn't save. Try again."
        );
        setEditSaving(false);
        return;
      }
      const newBody = typeof data.body === "string" ? data.body : editDraft;
      const editedAt =
        typeof data.editedAt === "number" ? data.editedAt : Date.now();
      if (kind === "post") {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, body: newBody, editedAt } : p
          )
        );
        setPinned((prev) =>
          prev && prev.id === id ? { ...prev, body: newBody, editedAt } : prev
        );
      } else {
        setReplies((prev) => {
          const out: Record<string, LoungeReply[]> = {};
          for (const pid of Object.keys(prev)) {
            out[pid] = prev[pid].map((r) =>
              r.id === id ? { ...r, body: newBody, editedAt } : r
            );
          }
          return out;
        });
      }
      cancelEdit();
    } catch {
      setEditError("Couldn't save. Try again.");
      setEditSaving(false);
    }
  }

  async function selfDelete(kind: "post" | "reply", id: string) {
    if (!confirm(`Delete this ${kind}? This can't be undone.`)) return;
    try {
      const res = await fetch("/api/lounge/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const data: { ok?: boolean } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return;
      if (editingTarget?.id === id) cancelEdit();
      removeTargetFromState(kind, id);
    } catch {
      // No-op
    }
  }

  const editController: EditController = {
    viewerEmail,
    isAdmin: props.isAdmin,
    editingId: editingTarget?.id ?? null,
    draft: editDraft,
    saving: editSaving,
    error: editError,
    setDraft: setEditDraft,
    start: startEdit,
    cancel: cancelEdit,
    submit: submitEdit,
    selfDelete,
  };

  // One-way "mark as read" helper. Used when admin reacts to a post
  // or reply — the reaction implies the read, no point also clicking
  // the manual stamp. No-ops if the id is already in the read set so
  // a second reaction doesn't re-fire the API call.
  async function markReadByClay(kind: "post" | "reply", id: string) {
    if (!props.isAdmin) return;
    const currentSet = kind === "post" ? readByClayPostIds : readByClayReplyIds;
    if (currentSet.has(id)) return;
    const setState =
      kind === "post" ? setReadByClayPostIds : setReadByClayReplyIds;
    setState((prev) => {
      const out = new Set(prev);
      out.add(id);
      return out;
    });
    try {
      const res = await fetch("/api/admin/lounge/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, read: true }),
      });
      const data: { ok?: boolean } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error("mark_failed");
    } catch {
      setState((prev) => {
        const out = new Set(prev);
        out.delete(id);
        return out;
      });
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

  // Always exclude the pinned post from the feed — it's rendered in
  // the pinned slot above. A reply bumps a post to the top of the feed
  // index, so without this a reply to the pinned post would surface it
  // a second time in the feed (the duplicate). Filtering here makes
  // that impossible regardless of how it lands in `posts`.
  const feed = useMemo(
    () => (pinned ? posts.filter((p) => p.id !== pinned.id) : posts),
    [posts, pinned]
  );

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

      {/* The Watch Feed — live broadcast banner above the chat. Renders
          nothing unless the admin toggle is on; self-polls and gates
          itself, so it's safe to mount unconditionally. */}
      <WatchFeed
        initialPosts={props.initialWatchPosts ?? []}
        initialArrivals={props.initialWatchArrivals ?? []}
        initialEnabled={props.initialWatchEnabled ?? false}
      />

      <section className="max-w-2xl mx-auto px-6 py-12 md:py-16">
        {/* "Who's in the room" line. Count + a few names, floor-gated
            on the server so a thin room shows nothing. A small olive
            dot marks it as a live signal; the line itself stays quiet
            and italic to match the room. */}
        {(() => {
          const line = roomPresenceLine(roomPresence);
          if (!line) return null;
          return (
            <p
              className="font-serif italic lounge-meta mb-7 text-center flex items-center justify-center gap-2"
              style={{ fontSize: "0.88rem" }}
            >
              <span className="lounge-room-dot" aria-hidden="true" />
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
              openUnderReplyId={openUnderReplyId}
              setOpenUnderReplyId={setOpenUnderReplyId}
              replyDraft={replyDraft}
              setReplyDraft={setReplyDraft}
              replying={replying}
              replyError={replyError}
              replyImageCtl={replyImageCtl}
              needsName={needsName}
              nameDraft={nameDraft}
              setNameDraft={setNameDraft}
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
              edit={editController}
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
                openUnderReplyId={openUnderReplyId}
                setOpenUnderReplyId={setOpenUnderReplyId}
                replyDraft={replyDraft}
                setReplyDraft={setReplyDraft}
                replying={replying}
                replyError={replyError}
                replyImageCtl={replyImageCtl}
                needsName={needsName}
                nameDraft={nameDraft}
                setNameDraft={setNameDraft}
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
                edit={editController}
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
        {(() => {
          // While a reply composer is open, swap the sticky "Pull up a
          // chair" dock for a slim "you're replying" bar. Reasons: (1) on
          // mobile you'd otherwise see both the inline reply box and the
          // dock at once; (2) members who meant to reply were typing into
          // the dock by mistake and posting a new top-level note. Keeping
          // the slot occupied (rather than just hiding it) also means you
          // can't forget a reply is open after scrolling away without
          // typing — the bar names who you're replying to and jumps you
          // back to the composer.
          if (openReplyFor !== null) {
            const target = posts.find((p) => p.id === openReplyFor);
            let replyingToName = target?.firstName ?? "someone";
            if (openUnderReplyId) {
              const r = (replies[openReplyFor] ?? []).find(
                (x) => x.id === openUnderReplyId
              );
              if (r) replyingToName = r.firstName;
            }
            const jumpToComposer = () => {
              const el = document.getElementById("lounge-active-reply");
              if (!el) return;
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              const ta = el.querySelector("textarea");
              if (ta) ta.focus({ preventScroll: true });
            };
            const cancelReply = () => {
              setReplyDraft("");
              clearReplyImage();
              setOpenReplyFor(null);
              setOpenUnderReplyId(null);
            };
            return (
              <div
                className="lounge-compose-dock"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}
              >
                <button
                  type="button"
                  onClick={jumpToComposer}
                  className="font-display uppercase tracking-[0.18em] transition-colors"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    minWidth: 0,
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    background: "transparent",
                    border: 0,
                    color: "var(--eye-deep)",
                    cursor: "pointer",
                    padding: "0.25rem 0",
                    textAlign: "left",
                  }}
                  title="Jump back to your reply"
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="10"
                    viewBox="0 0 14 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M5 2 L1.5 5.5 L5 9" />
                    <path d="M1.5 5.5 H8.5 Q12.5 5.5 12.5 10" />
                  </svg>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Replying to {replyingToName}
                    <span
                      className="lounge-meta"
                      style={{
                        marginLeft: "0.55rem",
                        fontSize: "0.6rem",
                        letterSpacing: "0.16em",
                      }}
                    >
                      tap to go back
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={cancelReply}
                  className="font-display uppercase tracking-[0.18em] text-ink-faint hover:text-ink transition-colors"
                  style={{
                    flexShrink: 0,
                    fontSize: "0.62rem",
                    fontWeight: 600,
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    padding: "0.25rem 0",
                  }}
                >
                  cancel
                </button>
              </div>
            );
          }
          const composeCap = props.isAdmin ? MAX_BODY_ADMIN : MAX_BODY;
          const composeOver = props.isAdmin && composeBody.length > MAX_BODY;
          return (
        <form
          onSubmit={submitPost}
          className="lounge-compose-dock"
        >
          {needsName && (
            <LoungeNameField
              value={nameDraft}
              onChange={setNameDraft}
              disabled={composing}
            />
          )}
          <label className="block">
            <MentionAutoResizingTextarea
              value={composeBody}
              onValueChange={(v) => setComposeBody(v.slice(0, composeCap))}
              onFocus={() => {
                composeFocusedRef.current = true;
              }}
              onBlur={() => {
                composeFocusedRef.current = false;
              }}
              minRows={2}
              maxLength={composeCap}
              placeholder="Pull up a chair..."
              disabled={composing}
              className={`font-serif text-ink bg-paper border px-4 py-3 outline-none w-full ${
                composeOver
                  ? ""
                  : "border-border focus:border-ink"
              }`}
              style={{
                fontSize: "1rem",
                lineHeight: 1.5,
                ...(composeOver
                  ? {
                      borderColor: WARN_INK,
                      borderWidth: "2px",
                      boxShadow: `0 0 0 1px ${WARN_INK}33`,
                    }
                  : {}),
              }}
            />
          </label>

          {/* Attached image preview (one per post), with remove. */}
          {pendingPreview && (
            <div className="relative inline-block mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingPreview}
                alt=""
                style={{
                  maxHeight: "6rem",
                  width: "auto",
                  display: "block",
                  border: "1px solid var(--border, #d8cfb8)",
                  opacity: uploadingImage ? 0.6 : 1,
                }}
              />
              <button
                type="button"
                onClick={clearPendingImage}
                aria-label="Remove image"
                className="absolute -top-2 -right-2 bg-ink text-paper flex items-center justify-center"
                style={{
                  width: "1.25rem",
                  height: "1.25rem",
                  borderRadius: "999px",
                  fontSize: "0.8rem",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          )}
          {/* YouTube auto-embed hint (only when no image is attached). */}
          {!pendingImage &&
            !pendingPreview &&
            extractYouTubeId(composeBody) && (
              <p
                className="font-serif italic text-ink-faint mt-2"
                style={{ fontSize: "0.74rem" }}
              >
                A YouTube video will embed when you post.
              </p>
            )}

          <div className="flex items-center justify-between gap-4 mt-2">
            <div className="flex items-center gap-3">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={onPickImage}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={composing || uploadingImage || !!pendingImage}
                aria-label="Add a photo"
                title="Add a photo"
                className="text-ink hover:text-eye-deep disabled:opacity-40 disabled:cursor-not-allowed transition-colors -ml-1 p-1 leading-none"
              >
                {uploadingImage ? (
                  <span
                    className="font-serif italic text-ink-muted"
                    style={{ fontSize: "0.74rem" }}
                  >
                    uploading…
                  </span>
                ) : (
                  // Universal "image" glyph (frame + sun + mountain) so it
                  // reads as photo-upload at a glance, like any chat app.
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2.5" />
                    <circle cx="8.5" cy="9" r="1.6" />
                    <path d="M21 15.5 16 11 6.5 20.5" />
                  </svg>
                )}
              </button>
              <span
                className={`font-serif italic ${
                  composeOver ? "" : "text-ink-faint"
                }`}
                style={{
                  fontSize: "0.78rem",
                  ...(composeOver
                    ? { color: WARN_INK, fontWeight: 600 }
                    : {}),
                }}
              >
                {composeBody.length} / {MAX_BODY}
                {composeOver && " — over recommended"}
              </span>
            </div>
            <button
              type="submit"
              disabled={
                composing ||
                uploadingImage ||
                (!composeBody.trim() && !pendingImage)
              }
              className="btn-primary"
              style={{
                opacity:
                  composing ||
                  uploadingImage ||
                  (!composeBody.trim() && !pendingImage)
                    ? 0.6
                    : 1,
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
          );
        })()}
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

      {/* Summary cluster (top emoji + total), tappable to see who reacted.
          Hidden when the user is the only reactor — the trigger already
          shows their emoji + label, no point echoing it. */}
      {snapshot.total > 0 && !(hasReaction && snapshot.total === 1) && (
        <ReactorsPopover
          endpoint={`/api/lounge/reactors?kind=${targetKind}&targetId=${targetId}`}
          counts={snapshot.counts}
          total={snapshot.total}
          small={small}
        />
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

/* === Own-content edit / delete ============================
   One controller object threaded down to PostCard and ReplyRow so a
   member can edit or delete their own post/reply within the window.
   `editingId` is the id currently in edit mode (post and reply ids are
   both UUIDs, so a single id is unambiguous). */

type EditController = {
  /** Normalized viewer email — compared against a record's author. */
  viewerEmail: string;
  isAdmin: boolean;
  editingId: string | null;
  draft: string;
  saving: boolean;
  error: string | null;
  setDraft: (s: string) => void;
  start: (kind: "post" | "reply", id: string, body: string) => void;
  cancel: () => void;
  submit: () => void;
  selfDelete: (kind: "post" | "reply", id: string) => void;
};

// Inline editor that replaces a post/reply body while it's being
// edited. Mirrors the reply composer's look so the room feels of a
// piece. `cap` is the member/admin length cap.
function EditBox({ edit, cap }: { edit: EditController; cap: number }) {
  const over = cap === MAX_BODY_ADMIN && edit.draft.length > MAX_BODY;
  return (
    <div className="mt-1">
      <textarea
        value={edit.draft}
        onChange={(e) => edit.setDraft(e.target.value.slice(0, cap))}
        rows={3}
        maxLength={cap}
        disabled={edit.saving}
        className={`font-serif text-ink bg-paper border px-4 py-3 outline-none w-full ${
          over ? "" : "border-border focus:border-ink"
        }`}
        style={{
          fontSize: "0.95rem",
          lineHeight: 1.5,
          ...(over
            ? {
                borderColor: WARN_INK,
                borderWidth: "2px",
                boxShadow: `0 0 0 1px ${WARN_INK}33`,
              }
            : {}),
        }}
        autoFocus
        aria-label="Edit your message"
      />
      <div className="flex items-center justify-between gap-3 mt-2">
        <span
          className={`font-serif italic ${over ? "" : "text-ink-faint"}`}
          style={{
            fontSize: "0.76rem",
            ...(over ? { color: WARN_INK, fontWeight: 600 } : {}),
          }}
        >
          {edit.draft.length} / {MAX_BODY}
          {over && " over recommended"}
        </span>
        <div className="flex items-center gap-3">
          {edit.error && (
            <span
              className="font-serif italic"
              style={{ fontSize: "0.76rem", color: WARN_INK, fontWeight: 600 }}
            >
              {edit.error}
            </span>
          )}
          <button
            type="button"
            onClick={edit.cancel}
            disabled={edit.saving}
            className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink transition-colors"
            style={{
              fontSize: "0.66rem",
              fontWeight: 600,
              background: "transparent",
              border: 0,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={edit.submit}
            disabled={edit.saving || edit.draft.trim().length === 0}
            className="font-display uppercase tracking-[0.22em] transition-colors"
            style={{
              fontSize: "0.66rem",
              fontWeight: 700,
              color: "var(--eye-deep)",
              background: "transparent",
              border: 0,
              cursor:
                edit.saving || edit.draft.trim().length === 0
                  ? "default"
                  : "pointer",
              opacity: edit.draft.trim().length === 0 ? 0.5 : 1,
              padding: 0,
            }}
          >
            {edit.saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Small italic "edited" marker shown next to a timestamp once a record
// has been edited. Title carries the relative edit time on hover.
function EditedMarker({ at, now }: { at: number; now: number }) {
  return (
    <span
      className="font-serif italic text-ink-faint"
      style={{ fontSize: "0.72rem" }}
      title={`Edited ${formatRelative(at, now)}`}
    >
      · edited
    </span>
  );
}

/* === Post card ============================================ */

// Controls for the active reply composer's attached image, bundled so the
// reply-side image plumbing rides on one prop instead of five.
type ReplyImageCtl = {
  preview: string | null;
  uploading: boolean;
  hasImage: boolean;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clear: () => void;
};

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
  openUnderReplyId: string | null;
  setOpenUnderReplyId: (id: string | null) => void;
  replyDraft: string;
  setReplyDraft: (s: string) => void;
  replying: boolean;
  replyError: string | null;
  replyImageCtl: ReplyImageCtl;
  // First-post name gate, threaded from LoungeView so the reply composer
  // can reveal the inline name field and share the single draft with the
  // top-level post composer.
  needsName: boolean;
  nameDraft: string;
  setNameDraft: (s: string) => void;
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
  edit: EditController;
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
    openUnderReplyId,
    setOpenUnderReplyId,
    replyDraft,
    setReplyDraft,
    replying,
    replyError,
    replyImageCtl,
    needsName,
    nameDraft,
    setNameDraft,
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

  // Own-content edit/delete. A member may edit or delete their own post
  // for EDIT_WINDOW_MS; admin can edit own posts anytime (and still uses
  // the admin delete control for everyone's content, so self-delete is
  // member-only here to avoid two delete buttons on his own card).
  const edit = props.edit;
  const isMine =
    edit.viewerEmail.length > 0 &&
    post.memberEmail.toLowerCase().trim() === edit.viewerEmail;
  const withinEditWindow = now - post.createdAt < EDIT_WINDOW_MS;
  const canEditOwn = isMine && (edit.isAdmin || withinEditWindow);
  const canSelfDelete = isMine && !edit.isAdmin && withinEditWindow;
  const isEditing = edit.editingId === post.id;

  // Show the last few replies inline; collapse anything older behind a
  // "Show N more replies" button. Threshold tuned so short threads
  // render in full and only legitimately long ones get folded.
  const REPLIES_VISIBLE_BY_DEFAULT = 5;
  const expanded = expandedReplies.has(post.id);
  const visibleReplies =
    expanded || replies.length <= REPLIES_VISIBLE_BY_DEFAULT
      ? replies
      : replies.slice(replies.length - REPLIES_VISIBLE_BY_DEFAULT);
  const hiddenCount = replies.length - visibleReplies.length;

  const snapshot = reactions[post.id] ?? emptySnapshot();

  // Inline composer renderer. Called from two places: directly below
  // the post body (when the user clicked the post's "Reply" button)
  // and below a specific reply (when the user clicked "reply" on a
  // reply). Same component either way — only the placeholder name
  // and anchor location differ. Submission always lands a flat
  // sibling reply on the parent post regardless of anchor.
  const replyCap = isAdmin ? MAX_BODY_ADMIN : MAX_BODY;
  const replyOver = isAdmin && replyDraft.length > MAX_BODY;
  const replyImageInputRef = useRef<HTMLInputElement | null>(null);
  const replyNameMissing = needsName && !nameDraft.trim();
  const replyCanSend =
    (replyDraft.trim().length > 0 || replyImageCtl.hasImage) &&
    !replyImageCtl.uploading &&
    !replyNameMissing;
  const renderComposer = (replyingToName: string) => (
    <div id="lounge-active-reply" className="mt-4 pt-4 border-t border-rule">
      {needsName && (
        <LoungeNameField
          value={nameDraft}
          onChange={setNameDraft}
          disabled={replying}
        />
      )}
      <MentionAutoResizingTextarea
        value={replyDraft}
        onValueChange={(v) => setReplyDraft(v.slice(0, replyCap))}
        onFocus={props.onReplyFocus}
        onBlur={props.onReplyBlur}
        minRows={2}
        maxLength={replyCap}
        placeholder={`Reply to ${replyingToName}…`}
        disabled={replying}
        className={`font-serif text-ink bg-paper border px-4 py-3 outline-none w-full ${
          replyOver ? "" : "border-border focus:border-ink"
        }`}
        style={{
          fontSize: "0.95rem",
          lineHeight: 1.5,
          ...(replyOver
            ? {
                borderColor: WARN_INK,
                borderWidth: "2px",
                boxShadow: `0 0 0 1px ${WARN_INK}33`,
              }
            : {}),
        }}
        autoFocus
      />
      {/* Attached image preview (one per reply), with remove. */}
      {replyImageCtl.preview && (
        <div className="relative inline-block mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={replyImageCtl.preview}
            alt=""
            style={{
              maxHeight: "6rem",
              width: "auto",
              display: "block",
              border: "1px solid var(--border, #d8cfb8)",
              opacity: replyImageCtl.uploading ? 0.6 : 1,
            }}
          />
          <button
            type="button"
            onClick={replyImageCtl.clear}
            aria-label="Remove image"
            className="absolute -top-2 -right-2 bg-ink text-paper flex items-center justify-center"
            style={{
              width: "1.25rem",
              height: "1.25rem",
              borderRadius: "999px",
              fontSize: "0.8rem",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 mt-2">
        <div className="flex items-center gap-3">
          <input
            ref={replyImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={replyImageCtl.onPick}
          />
          <button
            type="button"
            onClick={() => replyImageInputRef.current?.click()}
            disabled={replying || replyImageCtl.uploading || replyImageCtl.hasImage}
            aria-label="Add a photo"
            title="Add a photo"
            className="text-ink hover:text-eye-deep disabled:opacity-40 disabled:cursor-not-allowed transition-colors -ml-1 p-1 leading-none"
          >
            {replyImageCtl.uploading ? (
              <span
                className="font-serif italic text-ink-muted"
                style={{ fontSize: "0.72rem" }}
              >
                uploading…
              </span>
            ) : (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2.5" />
                <circle cx="8.5" cy="9" r="1.6" />
                <path d="M21 15.5 16 11 6.5 20.5" />
              </svg>
            )}
          </button>
          <span
            className={`font-serif italic ${
              replyOver ? "" : "text-ink-faint"
            }`}
            style={{
              fontSize: "0.76rem",
              ...(replyOver ? { color: WARN_INK, fontWeight: 600 } : {}),
            }}
          >
            {replyDraft.length} / {MAX_BODY}
            {replyOver && " — over recommended"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setReplyDraft("");
              replyImageCtl.clear();
              setOpenReplyFor(null);
              setOpenUnderReplyId(null);
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
            disabled={replying || !replyCanSend}
            className="btn-secondary"
            style={{
              opacity: replying || !replyCanSend ? 0.6 : 1,
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
  );

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
              minWidth: 0,
              overflowWrap: "anywhere",
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
                  charterSlot={b?.charterSlot ?? null}
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
          {post.editedAt && <EditedMarker at={post.editedAt} now={now} />}
        </div>
      </header>

      {isEditing ? (
        <EditBox edit={edit} cap={isAdmin ? MAX_BODY_ADMIN : MAX_BODY} />
      ) : (
        (() => {
          // When a YouTube link embeds below, drop the raw URL from the
          // text — the player IS the link. A link-only post then renders
          // no text block at all, just the embed. Stored body untouched.
          const displayBody =
            post.media?.type === "youtube"
              ? stripYouTubeUrls(post.body)
              : post.body;
          return displayBody ? (
            <p
              className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
              style={{ fontSize: "1rem" }}
            >
              <Linkified text={displayBody} highlightMentions />
            </p>
          ) : null;
        })()
      )}

      {post.media && <LoungeMedia media={post.media} />}

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
        {(() => {
          const composerHere =
            openReplyFor === post.id && openUnderReplyId === null;
          return (
            <button
              type="button"
              onClick={() => {
                // Toggle when composer is already anchored under THIS
                // post's body. Otherwise (closed, anchored under one of
                // this post's replies, or anchored under another post)
                // move it here under the post body.
                if (composerHere) {
                  setOpenReplyFor(null);
                  setOpenUnderReplyId(null);
                } else {
                  setOpenReplyFor(post.id);
                  setOpenUnderReplyId(null);
                }
              }}
              className="lounge-reply-cta lounge-reply-cta--button font-display uppercase tracking-[0.18em] transition-colors"
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                // Bordered pill so the reply action reads unmistakably as
                // a button. Members were missing the old text-only link
                // and typing into the main composer instead.
                border: composerHere
                  ? "1px solid var(--eye-deep)"
                  : "1px solid var(--rule)",
                background: composerHere ? "var(--eye-deep)" : "var(--paper)",
                color: composerHere ? "var(--paper)" : "var(--eye-deep)",
                cursor: "pointer",
                padding: "0.4rem 0.85rem",
                borderRadius: "999px",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
              aria-pressed={composerHere}
              aria-label={`Reply to ${post.firstName}`}
            >
              <svg
                aria-hidden="true"
                width="11"
                height="9"
                viewBox="0 0 14 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <path d="M5 2 L1.5 5.5 L5 9" />
                <path d="M1.5 5.5 H8.5 Q12.5 5.5 12.5 10" />
              </svg>
              <span>
                Reply
                {post.replyCount > 0 && (
                  <>
                    {" "}
                    <span style={{ opacity: 0.75 }}>· {post.replyCount}</span>
                  </>
                )}
              </span>
            </button>
          );
        })()}
        {canEditOwn && !isEditing && (
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
              onClick={() => edit.start("post", post.id, post.body)}
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
              edit
            </button>
          </>
        )}
        {canSelfDelete && !isEditing && (
          <button
            type="button"
            onClick={() => edit.selfDelete("post", post.id)}
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
        )}
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

      {/* Inline reply composer — renders here ONLY when the composer
          is anchored under the post body (`openUnderReplyId === null`).
          When anchored under a specific reply it renders inside the
          replies list below; see `renderComposer` and the ReplyRow
          loop further down. */}
      {openReplyFor === post.id &&
        openUnderReplyId === null &&
        renderComposer(post.firstName)}

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
              <Fragment key={r.id}>
                <ReplyRow
                  reply={r}
                  isAdmin={isAdmin}
                  edit={edit}
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
                      // Composer is already on this post — slide the
                      // anchor to this reply and append the mention to
                      // whatever's been typed (single space separator
                      // when the existing tail doesn't already end in
                      // whitespace).
                      setOpenUnderReplyId(r.id);
                      const current = replyDraft;
                      const sep =
                        current.length === 0 || current.endsWith(" ")
                          ? ""
                          : " ";
                      setReplyDraft(
                        (current + sep + mention).slice(0, replyCap)
                      );
                    } else {
                      // Composer was closed or anchored on another post —
                      // open here, anchor under this reply, replace draft.
                      setOpenReplyFor(post.id);
                      setOpenUnderReplyId(r.id);
                      setReplyDraft(mention.slice(0, replyCap));
                    }
                  }}
                />
                {openReplyFor === post.id &&
                  openUnderReplyId === r.id &&
                  renderComposer(r.firstName)}
              </Fragment>
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
  edit,
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
  edit: EditController;
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
  const isMine =
    edit.viewerEmail.length > 0 &&
    reply.memberEmail.toLowerCase().trim() === edit.viewerEmail;
  const withinEditWindow = now - reply.createdAt < EDIT_WINDOW_MS;
  const canEditOwn = isMine && (edit.isAdmin || withinEditWindow);
  const canSelfDelete = isMine && !edit.isAdmin && withinEditWindow;
  const isEditing = edit.editingId === reply.id;
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
              minWidth: 0,
              overflowWrap: "anywhere",
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
              charterSlot={badge?.charterSlot ?? null}
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
        <span className="flex items-center gap-1.5">
          <span
            className="font-serif italic text-ink-faint"
            style={{ fontSize: "0.74rem" }}
          >
            {formatRelative(reply.createdAt, now)}
          </span>
          {reply.editedAt && <EditedMarker at={reply.editedAt} now={now} />}
        </span>
      </header>
      {isEditing ? (
        <EditBox edit={edit} cap={isAdmin ? MAX_BODY_ADMIN : MAX_BODY} />
      ) : (
        <>
          {reply.body && (
            <p
              className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
              style={{ fontSize: "0.95rem" }}
            >
              <Linkified text={reply.body} highlightMentions />
            </p>
          )}
          {reply.media && <LoungeMedia media={reply.media} />}
        </>
      )}
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
          className="lounge-reply-cta font-display uppercase tracking-[0.22em] hover:text-eye-deep transition-colors"
          style={{
            fontSize: "0.62rem",
            fontWeight: 600,
            background: "transparent",
            border: 0,
            color: "var(--ink-muted)",
            cursor: "pointer",
            padding: "0.2rem 0",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
          }}
          title={`Reply to ${reply.firstName}`}
        >
          <svg
            aria-hidden="true"
            width="10"
            height="8"
            viewBox="0 0 14 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M5 2 L1.5 5.5 L5 9" />
            <path d="M1.5 5.5 H8.5 Q12.5 5.5 12.5 10" />
          </svg>
          <span>reply</span>
        </button>
        {canEditOwn && !isEditing && (
          <button
            type="button"
            onClick={() => edit.start("reply", reply.id, reply.body)}
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
            edit
          </button>
        )}
        {canSelfDelete && !isEditing && (
          <button
            type="button"
            onClick={() => edit.selfDelete("reply", reply.id)}
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
        )}
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
