import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import {
  DISPLAY_NAME_COOLDOWN_MS,
  cooldownExpiresAt,
  defaultDisplayName,
  isWithinCooldown,
  normalizeForCheck,
  validateDisplayName,
} from "./display-name";

// Comments storage. One flat list per piece, no threading. Members get
// one comment per piece. Clay (ADMIN_EMAIL) can post one reply per
// member comment, stored on the comment record itself. Reply edits go
// through delete + re-post.
//
// New comments default to `approved: false` (pre-publish hold). They
// stay invisible to other readers until Clay approves them; the author
// can see their own pending comment with an "awaiting review" hint,
// and Clay can see all pending comments via /comments/admin.
//
// Redis schema:
//   profile:<email>                         JSON { displayName, createdAt, ... }
//   displayname:taken:<normalized>          string email (uniqueness claim for displayName)
//   comment:<id>                            JSON CommentRecord
//   comments:<kind>:<slug>                  ZSET, score=createdAt, member=id
//   member-comment:<email>:<kind>:<slug>    string (comment id) — uniqueness lock
//   member-comments:<email>                 SET of comment IDs by author
//   comments:pending                        ZSET of IDs awaiting approval
//   comments:all                            ZSET of every comment ID, score=createdAt
//   profiles:flagged                        ZSET of emails flagged for review

export type CommentKind = "article" | "note" | "case-file";

export type ThreadReply = {
  id: string;
  email: string;
  displayName: string;
  body: string;
  createdAt: number;
  // Edit window applies the same way as top-level comments — set on
  // every edit; null/undefined means never edited.
  editedAt?: number | null;
};

export type CommentRecord = {
  id: string;
  kind: CommentKind;
  slug: string;
  email: string;
  displayName: string;
  body: string;
  createdAt: number;
  // Clay's reply lives on the comment record so we don't need a second
  // round-trip to fetch it. Empty when no reply exists.
  replyBody: string | null;
  replyAt: number | null;
  // Pre-publish hold. New comments arrive false; flipped to true via
  // approveComment(). Legacy records without this field are treated as
  // approved (see isApproved()), so existing comments stay visible
  // after the moderation rollout.
  approved?: boolean;
  // Last edit timestamp from editComment(). Null/undefined when never
  // edited. Editing is allowed by the author for EDIT_WINDOW_MS after
  // createdAt; the window does not reset across edits.
  editedAt?: number | null;
  // Total edits applied to the body, capped by the edit window. Used
  // for analytics + the "(edited)" tag.
  editCount?: number;
  // Admin-curated highlight. Toggled via setFeatured(). Surfaces in
  // the comments section with an olive "Featured" tag and a subtle
  // accent treatment.
  featured?: boolean;
  // Flat list of member-to-member replies. Auto-approve on write
  // (the parent's author was already vetted via comment approval).
  // Clay's own reply (the AUTHOR slot) stays in replyBody/replyAt to
  // preserve the existing single-author-reply mental model.
  threadReplies?: ThreadReply[];
  // Non-member paid comments. Set by the paid-comments flow; absent
  // for member comments. `awaiting_payment` records exist as drafts
  // only — they're not in any visible index until the Stripe webhook
  // flips them to `paid`. Admin still must approve before they go
  // live; the $1 buys a slot in the queue, not a public surface.
  paidComment?: boolean;
  paymentStatus?: "awaiting_payment" | "paid" | "refunded";
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  paidAt?: number | null;
  /** Amount the non-member paid for this comment, in cents. Stored at
      draft time so the GUEST badge can show it later. $1 floor; no
      hard max but reasonable cap enforced at the API boundary. */
  paidAmountCents?: number;
  /** When true, the GUEST badge renders as "GUEST · $5" — the
      commenter opted to make the amount public. When false (default),
      the badge renders as just "GUEST". */
  paidShowAmount?: boolean;
};

// Window during which the author can edit their own comment / reply.
// 5 minutes — long enough for typo fixes, short enough that the public
// record stays stable.
export const COMMENT_EDIT_WINDOW_MS = 5 * 60 * 1000;

export function isWithinEditWindow(
  createdAt: number,
  now: number = Date.now()
): boolean {
  return now - createdAt <= COMMENT_EDIT_WINDOW_MS;
}

/**
 * Treat legacy comments (no `approved` field) as approved so the
 * moderation rollout doesn't retroactively hide existing conversation.
 */
export function isApproved(c: CommentRecord): boolean {
  return c.approved !== false;
}

export type DisplayNameChange = {
  previous: string;
  changedAt: number;
  changedBy: "self" | "admin" | "system";
  // When changedBy === "admin", which admin email did it.
  actorEmail?: string;
};

export type Profile = {
  displayName: string;
  createdAt: number;
  // Whether to email this member when Clay replies to their comment.
  // Optional for back-compat with profiles written before the toggle
  // existed — undefined is treated as opted-in (see notifyOnReply()).
  notifyOnReply?: boolean;
  // Legal first / last name captured from Stripe customer_details at
  // signup. Used to seed the disambiguated default displayName and to
  // give the admin context when resolving impersonation disputes.
  firstName?: string;
  lastName?: string;
  // Tracks 30-day cooldown on member-initiated displayName changes.
  // Admin renames update history but do not bump this — the cooldown
  // gate exists to discourage member churn, not to constrain Clay.
  displayNameChangedAt?: number;
  // Audit log of every displayName change. Newest first.
  displayNameHistory?: DisplayNameChange[];
  // Borderline profanity verdict at write-time. Surfaces in
  // /admin/members so Clay can review without blocking the name.
  flaggedForReview?: boolean;
};

/**
 * Whether this profile wants reply notifications. Default-on: legacy
 * profiles (no field) are treated as opted-in so the rollout doesn't
 * silently flip preferences for existing members.
 */
export function notifyOnReply(profile: Profile | null | undefined): boolean {
  if (!profile) return true;
  return profile.notifyOnReply !== false;
}

const PROFILE_PREFIX = "profile:";
const COMMENT_PREFIX = "comment:";
const COMMENTS_INDEX_PREFIX = "comments:";
const MEMBER_LOCK_PREFIX = "member-comment:";
// Set of comment IDs authored by a given email. Lets us rewrite the
// displayName on every past comment when a member edits their profile.
const MEMBER_COMMENTS_PREFIX = "member-comments:";
// Global ZSET of pending (unapproved) comment IDs. Powers the admin
// queue page without needing to walk every per-piece index.
const PENDING_INDEX_KEY = "comments:pending";
// Global ZSET of every comment ID, score=createdAt. Powers the
// /admin/comments chrono feed. Newer than PENDING_INDEX_KEY; existing
// pre-launch comments are walked in via backfill-comments-index.
const ALL_INDEX_KEY = "comments:all";
// Uniqueness index for display names. Key holds the email that owns
// the (normalized) name. SETNX claim + DEL release. Backfilled via
// /api/admin/backfill-displayname-index for existing profiles.
const DISPLAYNAME_CLAIM_PREFIX = "displayname:taken:";
// Set of profiles whose displayName flagged borderline at write-time.
const FLAGGED_PROFILES_KEY = "profiles:flagged";

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isCommentsConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * Whether the given email is Clay (the admin / author). Driven by
 * ADMIN_EMAIL env var so it's swappable without a code change.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admin = process.env.ADMIN_EMAIL;
  if (!admin) return false;
  return admin.toLowerCase().trim() === email.toLowerCase().trim();
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function indexKey(kind: CommentKind, slug: string): string {
  return `${COMMENTS_INDEX_PREFIX}${kind}:${slug}`;
}

function lockKey(email: string, kind: CommentKind, slug: string): string {
  return `${MEMBER_LOCK_PREFIX}${normEmail(email)}:${kind}:${slug}`;
}

function memberCommentsKey(email: string): string {
  return `${MEMBER_COMMENTS_PREFIX}${normEmail(email)}`;
}

function claimKey(normalized: string): string {
  return `${DISPLAYNAME_CLAIM_PREFIX}${normalized}`;
}

/* === Display-name uniqueness claim ========================= */

/**
 * Whether the normalized display name is currently claimed by a
 * different email. Returns false if free or claimed by the same email.
 * Exposed so the disambiguation pipeline can shop for a free variant.
 */
export async function isDisplayNameTakenBy(
  normalized: string,
  exceptEmail: string | null = null
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  if (!normalized) return false;
  const owner = await client.get<string>(claimKey(normalized));
  if (!owner) return false;
  const ownerEmail = typeof owner === "string" ? owner : String(owner);
  if (exceptEmail && ownerEmail === normEmail(exceptEmail)) return false;
  return true;
}

/**
 * Look up the email that owns a normalized display name, or null if
 * no one has claimed it. Mirrors the read half of isDisplayNameTakenBy
 * but returns the email itself so @-mention resolution can target a
 * specific member.
 */
export async function getEmailByDisplayName(
  normalized: string
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  if (!normalized) return null;
  const owner = await client.get<string>(claimKey(normalized));
  if (!owner) return null;
  return typeof owner === "string" ? owner : String(owner);
}

/**
 * Atomically claim a normalized display name for an email. Returns
 * true on successful claim, false if another email already owns it.
 * Re-claiming by the same email is a no-op success.
 */
async function claimDisplayName(
  normalized: string,
  email: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  if (!normalized) return false;
  const result = await client.set(claimKey(normalized), normEmail(email), {
    nx: true,
  });
  if (result === "OK") return true;
  // Already exists — check whether the existing owner is us.
  const current = await client.get<string>(claimKey(normalized));
  const currentEmail = typeof current === "string" ? current : String(current);
  return currentEmail === normEmail(email);
}

async function releaseDisplayName(normalized: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  if (!normalized) return;
  await client.del(claimKey(normalized));
}

/* === Profiles ============================================== */

export async function getProfile(email: string): Promise<Profile | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${PROFILE_PREFIX}${normEmail(email)}`);
  if (!raw) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as Profile)
      : (raw as Profile);
  } catch {
    return null;
  }
}

/**
 * Batched profile lookup — one MGET round-trip for many emails. Used
 * by the presence snapshot helper so the admin panel doesn't fan out
 * one Redis call per present member. Returned map is keyed by
 * normalized email; null when no profile exists for that email.
 */
export async function getProfilesByEmails(
  emails: string[]
): Promise<Map<string, Profile | null>> {
  const out = new Map<string, Profile | null>();
  if (emails.length === 0) return out;
  const client = getClient();
  const unique = Array.from(new Set(emails.map(normEmail)));
  if (!client) {
    for (const e of unique) out.set(e, null);
    return out;
  }
  const keys = unique.map((e) => `${PROFILE_PREFIX}${e}`);
  const raw = (await client
    .mget<(string | null)[]>(...keys)
    .catch(() => [] as (string | null)[])) ?? [];
  unique.forEach((email, i) => {
    const value = raw[i];
    if (!value) {
      out.set(email, null);
      return;
    }
    try {
      const parsed =
        typeof value === "string"
          ? (JSON.parse(value) as Profile)
          : (value as Profile);
      out.set(email, parsed);
    } catch {
      out.set(email, null);
    }
  });
  return out;
}

export type SetProfileError =
  | "invalid_display_name"
  | "reserved"
  | "profanity"
  | "name_taken"
  | "storage_unavailable";

export type SetProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; error: SetProfileError };

/**
 * First-comment profile creation. Sanitizes + validates against the
 * reserved list and profanity filter, then atomically claims the
 * normalized name in the uniqueness index. Existing profile fields
 * (notifyOnReply, firstName, lastName, audit log) are preserved.
 *
 * This is the member-driven path. The webhook signup path uses
 * assignDefaultDisplayName instead, which iterates candidates until
 * one claims successfully.
 */
export async function setProfile(
  email: string,
  displayName: string
): Promise<SetProfileResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const sanitized = sanitizeDisplayName(displayName);
  if (!sanitized) return { ok: false, error: "invalid_display_name" };

  const validation = validateDisplayName(sanitized);
  if (!validation.ok) {
    if (validation.error === "reserved") {
      return { ok: false, error: "reserved" };
    }
    if (validation.error === "profanity") {
      return { ok: false, error: "profanity" };
    }
    return { ok: false, error: "invalid_display_name" };
  }

  const cleaned = validation.cleaned;
  const normalized = normalizeForCheck(cleaned);
  if (!normalized) return { ok: false, error: "invalid_display_name" };

  const existing = await getProfile(email);

  // If the member already has the exact same name, the claim might
  // already be ours from a prior write — re-claim is idempotent.
  if (existing?.displayName && normalizeForCheck(existing.displayName) !== normalized) {
    const claimed = await claimDisplayName(normalized, email);
    if (!claimed) return { ok: false, error: "name_taken" };
    await releaseDisplayName(normalizeForCheck(existing.displayName));
  } else if (!existing?.displayName) {
    const claimed = await claimDisplayName(normalized, email);
    if (!claimed) return { ok: false, error: "name_taken" };
  }

  const profile: Profile = {
    displayName: cleaned,
    createdAt: existing?.createdAt ?? Date.now(),
    notifyOnReply: existing?.notifyOnReply ?? true,
    firstName: existing?.firstName,
    lastName: existing?.lastName,
    displayNameChangedAt: existing?.displayNameChangedAt,
    displayNameHistory: existing?.displayNameHistory,
    flaggedForReview: validation.flaggedForReview,
  };
  await client.set(
    `${PROFILE_PREFIX}${normEmail(email)}`,
    JSON.stringify(profile)
  );

  if (validation.flaggedForReview) {
    await client.zadd(FLAGGED_PROFILES_KEY, {
      score: Date.now(),
      member: normEmail(email),
    });
  }

  return { ok: true, profile };
}

/**
 * Update only the reply-notification preference. Creates a minimal
 * profile (empty displayName) if none exists yet — lets a member
 * opt out before posting their first comment. The empty displayName
 * gets filled on first comment, so the placeholder profile is fine.
 */
export async function updateNotifyPreference(
  email: string,
  notifyOnReply: boolean
): Promise<
  | { ok: true; profile: Profile }
  | { ok: false; error: "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const existing = await getProfile(email);
  const profile: Profile = {
    displayName: existing?.displayName ?? "",
    createdAt: existing?.createdAt ?? Date.now(),
    notifyOnReply,
  };
  await client.set(
    `${PROFILE_PREFIX}${normEmail(email)}`,
    JSON.stringify(profile)
  );
  return { ok: true, profile };
}

export type UpdateDisplayNameError =
  | "invalid_display_name"
  | "reserved"
  | "profanity"
  | "name_taken"
  | "rate_limited"
  | "storage_unavailable";

export type UpdateDisplayNameResult =
  | {
      ok: true;
      profile: Profile;
      updatedComments: number;
    }
  | {
      ok: false;
      error: UpdateDisplayNameError;
      // When rate_limited, surfaces the timestamp the cooldown lifts.
      nextAllowedAt?: number;
    };

/**
 * Update the member's display name and rewrite displayName on every
 * past comment they authored. The per-email comment-id set keeps this
 * O(N) over their own comments, not over the whole site.
 *
 * `actor` distinguishes between the member self-editing their own
 * profile (subject to the 30-day cooldown) and an admin rename
 * (bypasses cooldown, recorded in the audit log as changedBy:"admin").
 * The "system" actor is used by the webhook auto-assignment path and
 * is also free of the cooldown.
 */
export async function updateDisplayName(
  email: string,
  displayName: string,
  actor: { kind: "self" } | { kind: "admin"; actorEmail: string } | { kind: "system" } = { kind: "self" }
): Promise<UpdateDisplayNameResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const sanitized = sanitizeDisplayName(displayName);
  if (!sanitized) return { ok: false, error: "invalid_display_name" };

  const validation = validateDisplayName(sanitized);
  if (!validation.ok) {
    if (validation.error === "reserved") return { ok: false, error: "reserved" };
    if (validation.error === "profanity") return { ok: false, error: "profanity" };
    return { ok: false, error: "invalid_display_name" };
  }

  const cleaned = validation.cleaned;
  const newNorm = normalizeForCheck(cleaned);
  if (!newNorm) return { ok: false, error: "invalid_display_name" };

  const existing = await getProfile(email);

  // Cooldown applies only to self-edits, and only if the name actually
  // changed (re-saving the same name is a no-op rather than a violation).
  if (actor.kind === "self" && existing?.displayName) {
    const sameName =
      normalizeForCheck(existing.displayName) === newNorm;
    if (
      !sameName &&
      isWithinCooldown(existing.displayNameChangedAt ?? null)
    ) {
      return {
        ok: false,
        error: "rate_limited",
        nextAllowedAt: existing.displayNameChangedAt
          ? cooldownExpiresAt(existing.displayNameChangedAt)
          : undefined,
      };
    }
  }

  // Atomic uniqueness claim. Skip when the name didn't actually change.
  const oldNorm = existing?.displayName
    ? normalizeForCheck(existing.displayName)
    : "";
  if (newNorm !== oldNorm) {
    const claimed = await claimDisplayName(newNorm, email);
    if (!claimed) return { ok: false, error: "name_taken" };
    if (oldNorm) await releaseDisplayName(oldNorm);
  }

  const now = Date.now();
  const history = existing?.displayNameHistory ?? [];
  const auditEntry: DisplayNameChange | null =
    existing?.displayName && existing.displayName !== cleaned
      ? {
          previous: existing.displayName,
          changedAt: now,
          changedBy: actor.kind,
          actorEmail: actor.kind === "admin" ? actor.actorEmail : undefined,
        }
      : null;

  const profile: Profile = {
    displayName: cleaned,
    createdAt: existing?.createdAt ?? now,
    notifyOnReply: existing?.notifyOnReply ?? true,
    firstName: existing?.firstName,
    lastName: existing?.lastName,
    // Self-edits bump the cooldown timestamp. Admin + system writes
    // don't, so they never put the member into a cooldown they didn't
    // initiate.
    displayNameChangedAt:
      auditEntry && actor.kind === "self"
        ? now
        : existing?.displayNameChangedAt,
    displayNameHistory: auditEntry
      ? [auditEntry, ...history].slice(0, 50)
      : history,
    flaggedForReview: validation.flaggedForReview,
  };
  await client.set(
    `${PROFILE_PREFIX}${normEmail(email)}`,
    JSON.stringify(profile)
  );

  if (validation.flaggedForReview) {
    await client.zadd(FLAGGED_PROFILES_KEY, {
      score: now,
      member: normEmail(email),
    });
  } else {
    await client.zrem(FLAGGED_PROFILES_KEY, normEmail(email));
  }

  // Rewrite displayName on every past comment by this author.
  const ids = ((await client.smembers(memberCommentsKey(email))) ??
    []) as string[];
  let updated = 0;
  for (const id of ids) {
    const current = await getComment(id);
    if (!current) {
      await client.srem(memberCommentsKey(email), id);
      continue;
    }
    if (current.displayName === cleaned) continue;
    const next: CommentRecord = { ...current, displayName: cleaned };
    await client.set(`${COMMENT_PREFIX}${id}`, JSON.stringify(next));
    updated += 1;
  }

  return { ok: true, profile, updatedComments: updated };
}

/* === Default-name assignment (signup path) =================== */

/**
 * Called from the Stripe webhook on a successful checkout. Parses
 * Stripe's customer_details.name into first/last, picks the
 * least-disambiguated free variant, and writes the profile. No-op if
 * the member already has a displayName on file (idempotent for
 * webhook retries).
 *
 * Bypasses the cooldown (actor: "system"). Honors the reserved /
 * profanity filter — names that would trip it get skipped and the
 * next candidate is tried.
 */
export async function assignDefaultDisplayName(args: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<{ ok: true; profile: Profile } | { ok: false; error: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const existing = await getProfile(args.email);
  if (existing?.displayName) {
    return { ok: true, profile: existing };
  }

  const fallback = args.email.split("@")[0] ?? "Member";
  const candidate = await defaultDisplayName({
    firstName: args.firstName,
    lastName: args.lastName,
    fallback,
    isTaken: (norm) => isDisplayNameTakenBy(norm, args.email),
  });

  // Claim the name. Race-safe: another concurrent signup might have
  // taken it between the isTaken check and now — fall through to the
  // next candidate via updateDisplayName's claim loop.
  const result = await updateDisplayName(args.email, candidate, {
    kind: "system",
  });
  if (!result.ok) {
    // Persist first/last even if the displayName claim raced — the
    // member can pick one manually later. Write a minimal profile so
    // the data isn't lost.
    const now = Date.now();
    const minimal: Profile = {
      displayName: "",
      createdAt: now,
      firstName: args.firstName || undefined,
      lastName: args.lastName || undefined,
      notifyOnReply: true,
    };
    await client.set(
      `${PROFILE_PREFIX}${normEmail(args.email)}`,
      JSON.stringify(minimal)
    );
    return { ok: false, error: result.error };
  }

  // Persist firstName/lastName for the admin's reference.
  const profile: Profile = {
    ...result.profile,
    firstName: args.firstName || result.profile.firstName,
    lastName: args.lastName || result.profile.lastName,
  };
  await client.set(
    `${PROFILE_PREFIX}${normEmail(args.email)}`,
    JSON.stringify(profile)
  );
  return { ok: true, profile };
}

/* === Flagged profiles index ================================ */

/**
 * Emails whose current displayName tripped the borderline-profanity
 * verdict. Surfaces in /admin/members so Clay can decide whether to
 * rename. Newest first.
 */
export async function listFlaggedProfiles(limit = 100): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  const raw = await client
    .zrange(FLAGGED_PROFILES_KEY, 0, limit - 1, { rev: true })
    .catch(() => [] as unknown[]);
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * Whether the current member's profile is on cooldown for self-edit.
 * Surfaced to the account UI so we can show "next change available
 * <date>" without round-tripping a failed save.
 */
export function selfEditCooldownInfo(profile: Profile | null): {
  onCooldown: boolean;
  nextAllowedAt: number | null;
} {
  if (!profile?.displayNameChangedAt) {
    return { onCooldown: false, nextAllowedAt: null };
  }
  if (!isWithinCooldown(profile.displayNameChangedAt)) {
    return { onCooldown: false, nextAllowedAt: null };
  }
  return {
    onCooldown: true,
    nextAllowedAt: cooldownExpiresAt(profile.displayNameChangedAt),
  };
}

// Re-export the cooldown constant so callers don't need two imports.
export { DISPLAY_NAME_COOLDOWN_MS };

/* === Validation ============================================ */

// Member comment ceiling. Paid non-member comments (V2 step 3) get
// their own lower limit (500) enforced upstream in the paid composer
// + API route; the library cap stays at the member ceiling.
const MAX_BODY = 1500;
const MAX_NAME = 30;
// Clay's own author replies get more room than member bodies — he uses
// them for long, considered responses. Keep this in sync with the cap
// in the reply API route and the AdminReplyControls textarea/counter.
export const MAX_REPLY_BODY = 8000;

// Match C0 control chars (0x00-0x1F) and DEL (0x7F). Newlines are
// inside the range — we strip them in display-name sanitation, but
// keep them in body sanitation by carving an exception around 0x0A.
const C0_RANGE = " -";
const C0_RANGE_KEEP_LF = " -	-";

export function sanitizeDisplayName(input: string): string {
  // Strip control chars and HTML brackets; collapse whitespace to a
  // single line; forbid URLs so self-promo handles can't sneak in.
  const stripped = input
    .replace(/[<>]/g, "")
    .replace(new RegExp("[" + C0_RANGE + "]", "g"), " ");
  const oneLine = stripped.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  if (/\bhttps?:\/\//i.test(oneLine)) return "";
  return oneLine.slice(0, MAX_NAME);
}

export function sanitizeBody(input: string, maxLen: number = MAX_BODY): string {
  // Preserve newlines (we render them as <br />), strip HTML brackets
  // and other C0 control chars so it's safe to display as text.
  const noControl = input
    .replace(/[<>]/g, "")
    .replace(new RegExp("[" + C0_RANGE_KEEP_LF + "]", "g"), "");
  // Collapse 3+ newlines to 2 so spacing stays readable.
  const collapsed = noControl.replace(/\n{3,}/g, "\n\n").trim();
  return collapsed.slice(0, maxLen);
}

/* === Comments CRUD ========================================= */

export async function listCommentsForSlug(
  kind: CommentKind,
  slug: string
): Promise<CommentRecord[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(indexKey(kind, slug), 0, -1)) as string[];
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${COMMENT_PREFIX}${id}`);
  const raw = await client.mget<(string | null)[]>(...keys);
  const out: CommentRecord[] = [];
  for (const value of raw) {
    if (!value) continue;
    try {
      const parsed =
        typeof value === "string"
          ? (JSON.parse(value) as CommentRecord)
          : (value as CommentRecord);
      out.push(parsed);
    } catch {
      // skip malformed
    }
  }
  // Oldest first — feels chronological, matches how the conversation
  // actually unfolded under the piece.
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getComment(id: string): Promise<CommentRecord | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${COMMENT_PREFIX}${id}`);
  if (!raw) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as CommentRecord)
      : (raw as CommentRecord);
  } catch {
    return null;
  }
}

// Top-level comments a member may keep live per piece. Default 2: one
// considered take plus room for a follow-up. The conversation past that
// happens in unlimited member-to-member replies, which don't count
// against this. Per-piece overrides are keyed by `${kind}:${slug}` (the
// canonical COMMENT slug, which can differ from the URL slug, e.g. the
// Massie essay's URL is /the-massie-problem but its comment slug stays
// "the-massie-eulogy"). None are needed now that the default is 2.
const PER_PIECE_COMMENT_LIMITS: Record<string, number> = {};

export function commentLimitFor(kind: CommentKind, slug: string): number {
  return PER_PIECE_COMMENT_LIMITS[`${kind}:${slug}`] ?? 2;
}

// The member lock value holds the member's comment id(s) for a piece.
// Originally a single id string; now a list to support per-piece limits
// above 1. Read-tolerant of the legacy single-id string so existing
// locks keep working without a migration — they upgrade to the list
// form on the member's next post or delete.
function parseLockIds(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string");
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          return parsed.filter((x): x is string => typeof x === "string");
        }
      } catch {
        // fall through — treat as a bare single id
      }
    }
    return s ? [s] : [];
  }
  return [String(value)];
}

export async function getMemberCommentIds(
  email: string,
  kind: CommentKind,
  slug: string
): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  const value = await client.get(lockKey(email, kind, slug));
  return parseLockIds(value);
}

export async function getMemberCommentId(
  email: string,
  kind: CommentKind,
  slug: string
): Promise<string | null> {
  const ids = await getMemberCommentIds(email, kind, slug);
  return ids[0] ?? null;
}

export type CreateCommentInput = {
  email: string;
  displayName: string;
  kind: CommentKind;
  slug: string;
  body: string;
};

export type CreateCommentResult =
  | { ok: true; comment: CommentRecord }
  | {
      ok: false;
      error: "storage_unavailable" | "already_commented" | "empty_body";
    };

export async function createComment(
  input: CreateCommentInput
): Promise<CreateCommentResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const body = sanitizeBody(input.body);
  if (!body) return { ok: false, error: "empty_body" };

  const existingIds = await getMemberCommentIds(
    input.email,
    input.kind,
    input.slug
  );
  if (existingIds.length >= commentLimitFor(input.kind, input.slug)) {
    return { ok: false, error: "already_commented" };
  }

  const id = randomUUID();
  const now = Date.now();
  // Auto-approve when:
  //   - Admin (Clay) — the publisher shouldn't moderate himself, and
  //     a delay between him posting and the comment going live would
  //     be jarring for readers refreshing the page after his reply.
  //   - kind === "note" — Field Notes live behind the member paywall;
  //     everyone reaching the comment box has already passed the
  //     membership trust filter, so a pre-publish hold adds latency
  //     without value. Public articles (kind="article") still moderate
  //     because they accept paid non-member comments where the trust
  //     filter is just "had a dollar."
  //   - kind === "case-file" — same logic as "note." Case files are
  //     behind the member paywall except for explicit public-preview
  //     slugs, and even there the $1 paid form is the only path for
  //     non-members. The marketing surfaces are narrow enough that
  //     auto-approval here is fine; post-publish admin moderation
  //     stays available via /admin/comments.
  const isAuthor = isAdmin(input.email);
  const isMemberOnlySurface =
    input.kind === "note" || input.kind === "case-file";
  const autoApprove = isAuthor || isMemberOnlySurface;
  const record: CommentRecord = {
    id,
    kind: input.kind,
    slug: input.slug,
    email: normEmail(input.email),
    displayName: input.displayName,
    body,
    createdAt: now,
    replyBody: null,
    replyAt: null,
    approved: autoApprove,
  };

  await client.set(`${COMMENT_PREFIX}${id}`, JSON.stringify(record));
  await client.zadd(indexKey(input.kind, input.slug), {
    score: now,
    member: id,
  });
  await client.zadd(ALL_INDEX_KEY, { score: now, member: id });
  await client.set(lockKey(input.email, input.kind, input.slug), [
    ...existingIds,
    id,
  ]);
  await client.sadd(memberCommentsKey(input.email), id);
  if (!autoApprove) {
    await client.zadd(PENDING_INDEX_KEY, { score: now, member: id });
  }

  return { ok: true, comment: record };
}

/**
 * Delete a comment. Authorized for the comment author or the admin.
 * Removes the record, the ZSET entry, and the per-member lock. Clay's
 * reply (if any) dies with it — replies live on the same record.
 */
export async function deleteComment(
  id: string,
  actorEmail: string
): Promise<
  | { ok: true }
  | { ok: false; error: "not_found" | "forbidden" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const comment = await getComment(id);
  if (!comment) return { ok: false, error: "not_found" };

  const isAuthor = normEmail(actorEmail) === comment.email;
  if (!isAuthor && !isAdmin(actorEmail)) {
    return { ok: false, error: "forbidden" };
  }

  await client.del(`${COMMENT_PREFIX}${id}`);
  await client.zrem(indexKey(comment.kind, comment.slug), id);
  await client.zrem(ALL_INDEX_KEY, id);
  // Free just this comment's slot in the member lock; only clear the
  // lock entirely when it was their last one (supports per-piece limits
  // above 1, and stays correct for the default limit of 1).
  const remainingLockIds = (
    await getMemberCommentIds(comment.email, comment.kind, comment.slug)
  ).filter((x) => x !== id);
  if (remainingLockIds.length === 0) {
    await client.del(lockKey(comment.email, comment.kind, comment.slug));
  } else {
    await client.set(
      lockKey(comment.email, comment.kind, comment.slug),
      remainingLockIds
    );
  }
  await client.srem(memberCommentsKey(comment.email), id);
  await client.zrem(PENDING_INDEX_KEY, id);

  return { ok: true };
}

/**
 * Approve a pending comment. Admin only. Idempotent — approving an
 * already-approved comment is a no-op.
 */
export async function approveComment(
  id: string,
  actorEmail: string
): Promise<
  | { ok: true; comment: CommentRecord }
  | { ok: false; error: "not_found" | "forbidden" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  if (!isAdmin(actorEmail)) return { ok: false, error: "forbidden" };

  const comment = await getComment(id);
  if (!comment) return { ok: false, error: "not_found" };

  if (isApproved(comment)) {
    // Already approved — make sure it's not still in the pending set
    // (defends against drift from earlier states).
    await client.zrem(PENDING_INDEX_KEY, id);
    return { ok: true, comment };
  }

  const next: CommentRecord = { ...comment, approved: true };
  await client.set(`${COMMENT_PREFIX}${id}`, JSON.stringify(next));
  await client.zrem(PENDING_INDEX_KEY, id);
  return { ok: true, comment: next };
}

/**
 * List all pending comments globally, newest first. Used by the admin
 * queue. Limit is a safety cap.
 */
export async function listPendingComments(
  limit = 100
): Promise<CommentRecord[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(PENDING_INDEX_KEY, 0, limit - 1, {
    rev: true,
  })) as string[];
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${COMMENT_PREFIX}${id}`);
  const raw = await client.mget<(string | null)[]>(...keys);
  const out: CommentRecord[] = [];
  for (const value of raw) {
    if (!value) continue;
    try {
      const parsed =
        typeof value === "string"
          ? (JSON.parse(value) as CommentRecord)
          : (value as CommentRecord);
      // Guard against stale entries in the pending set.
      if (!isApproved(parsed)) out.push(parsed);
    } catch {
      // skip malformed
    }
  }
  return out;
}

export async function countPendingComments(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  return (await client.zcard(PENDING_INDEX_KEY)) ?? 0;
}

/**
 * Every comment on the site, newest first. Powers the chrono feed on
 * /admin/comments — Clay's one-stop view for replying to anything,
 * pending or already approved. `limit` is a safety cap; raise it if
 * the feed grows past it.
 */
export async function listRecentComments(
  limit = 200
): Promise<CommentRecord[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(ALL_INDEX_KEY, 0, limit - 1, {
    rev: true,
  })) as string[];
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${COMMENT_PREFIX}${id}`);
  const raw = await client.mget<(string | null)[]>(...keys);
  const out: CommentRecord[] = [];
  for (const value of raw) {
    if (!value) continue;
    try {
      const parsed =
        typeof value === "string"
          ? (JSON.parse(value) as CommentRecord)
          : (value as CommentRecord);
      out.push(parsed);
    } catch {
      // skip malformed
    }
  }
  return out;
}

/**
 * Set (or update) Clay's reply on a comment. Admin only. The reply
 * lives on the comment record itself, so writing it is a single set.
 */
export async function setReply(
  commentId: string,
  actorEmail: string,
  body: string
): Promise<
  | { ok: true; comment: CommentRecord }
  | {
      ok: false;
      error: "not_found" | "forbidden" | "empty_body" | "storage_unavailable";
    }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  if (!isAdmin(actorEmail)) return { ok: false, error: "forbidden" };

  const comment = await getComment(commentId);
  if (!comment) return { ok: false, error: "not_found" };

  const cleaned = sanitizeBody(body, MAX_REPLY_BODY);
  if (!cleaned) return { ok: false, error: "empty_body" };

  const next: CommentRecord = {
    ...comment,
    replyBody: cleaned,
    replyAt: Date.now(),
  };
  await client.set(`${COMMENT_PREFIX}${commentId}`, JSON.stringify(next));
  return { ok: true, comment: next };
}

/**
 * Edit a comment's body. Authorized for the comment author only and
 * only inside the 5-minute edit window. Increments editCount and sets
 * editedAt. The new body is sanitized + must be non-empty.
 */
export async function editComment(
  id: string,
  actorEmail: string,
  newBody: string
): Promise<
  | { ok: true; comment: CommentRecord }
  | {
      ok: false;
      error:
        | "not_found"
        | "forbidden"
        | "edit_window_expired"
        | "empty_body"
        | "storage_unavailable";
    }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const comment = await getComment(id);
  if (!comment) return { ok: false, error: "not_found" };

  const isAuthor = normEmail(actorEmail) === comment.email;
  if (!isAuthor) return { ok: false, error: "forbidden" };

  if (!isWithinEditWindow(comment.createdAt)) {
    return { ok: false, error: "edit_window_expired" };
  }

  const cleaned = sanitizeBody(newBody);
  if (!cleaned) return { ok: false, error: "empty_body" };

  const now = Date.now();
  const next: CommentRecord = {
    ...comment,
    body: cleaned,
    editedAt: now,
    editCount: (comment.editCount ?? 0) + 1,
  };
  await client.set(`${COMMENT_PREFIX}${id}`, JSON.stringify(next));
  return { ok: true, comment: next };
}

/**
 * Toggle the featured flag on a comment. Admin only.
 */
export async function setFeatured(
  id: string,
  actorEmail: string,
  featured: boolean
): Promise<
  | { ok: true; comment: CommentRecord }
  | { ok: false; error: "not_found" | "forbidden" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  if (!isAdmin(actorEmail)) return { ok: false, error: "forbidden" };

  const comment = await getComment(id);
  if (!comment) return { ok: false, error: "not_found" };

  const next: CommentRecord = { ...comment, featured };
  await client.set(`${COMMENT_PREFIX}${id}`, JSON.stringify(next));
  return { ok: true, comment: next };
}

/* === Thread replies (member-to-member) ===================== */

const MAX_THREAD_REPLIES = 100; // ceiling per comment

/**
 * Append a member-to-member reply to a comment's thread. Auto-approves
 * (no pre-publish hold) since the parent's author was already vetted.
 * The reply's displayName must come from the caller's profile so it
 * stays consistent with the rest of their identity across the site.
 */
export async function createThreadReply(input: {
  parentId: string;
  email: string;
  displayName: string;
  body: string;
}): Promise<
  | { ok: true; comment: CommentRecord; reply: ThreadReply }
  | {
      ok: false;
      error:
        | "not_found"
        | "empty_body"
        | "thread_full"
        | "storage_unavailable";
    }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const parent = await getComment(input.parentId);
  if (!parent) return { ok: false, error: "not_found" };

  const cleaned = sanitizeBody(input.body);
  if (!cleaned) return { ok: false, error: "empty_body" };

  const existing = parent.threadReplies ?? [];
  if (existing.length >= MAX_THREAD_REPLIES) {
    return { ok: false, error: "thread_full" };
  }

  const reply: ThreadReply = {
    id: randomUUID(),
    email: normEmail(input.email),
    displayName: input.displayName,
    body: cleaned,
    createdAt: Date.now(),
  };

  const next: CommentRecord = {
    ...parent,
    threadReplies: [...existing, reply],
  };
  await client.set(
    `${COMMENT_PREFIX}${parent.id}`,
    JSON.stringify(next)
  );
  return { ok: true, comment: next, reply };
}

/**
 * Delete a thread reply by id. Authorized for the reply's author or
 * the admin. No-op when neither the parent nor the reply exists.
 */
export async function deleteThreadReply(
  parentId: string,
  replyId: string,
  actorEmail: string
): Promise<
  | { ok: true; comment: CommentRecord }
  | { ok: false; error: "not_found" | "forbidden" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const parent = await getComment(parentId);
  if (!parent) return { ok: false, error: "not_found" };

  const existing = parent.threadReplies ?? [];
  const target = existing.find((r) => r.id === replyId);
  if (!target) return { ok: false, error: "not_found" };

  const isReplyAuthor = normEmail(actorEmail) === target.email;
  if (!isReplyAuthor && !isAdmin(actorEmail)) {
    return { ok: false, error: "forbidden" };
  }

  const next: CommentRecord = {
    ...parent,
    threadReplies: existing.filter((r) => r.id !== replyId),
  };
  await client.set(
    `${COMMENT_PREFIX}${parent.id}`,
    JSON.stringify(next)
  );
  return { ok: true, comment: next };
}

/**
 * Edit a thread reply body. Same 5-minute window applies — only the
 * reply's author, only inside the window.
 */
export async function editThreadReply(
  parentId: string,
  replyId: string,
  actorEmail: string,
  newBody: string
): Promise<
  | { ok: true; comment: CommentRecord; reply: ThreadReply }
  | {
      ok: false;
      error:
        | "not_found"
        | "forbidden"
        | "edit_window_expired"
        | "empty_body"
        | "storage_unavailable";
    }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const parent = await getComment(parentId);
  if (!parent) return { ok: false, error: "not_found" };

  const existing = parent.threadReplies ?? [];
  const target = existing.find((r) => r.id === replyId);
  if (!target) return { ok: false, error: "not_found" };

  if (normEmail(actorEmail) !== target.email) {
    return { ok: false, error: "forbidden" };
  }
  if (!isWithinEditWindow(target.createdAt)) {
    return { ok: false, error: "edit_window_expired" };
  }

  const cleaned = sanitizeBody(newBody);
  if (!cleaned) return { ok: false, error: "empty_body" };

  const updated: ThreadReply = {
    ...target,
    body: cleaned,
    editedAt: Date.now(),
  };
  const next: CommentRecord = {
    ...parent,
    threadReplies: existing.map((r) => (r.id === replyId ? updated : r)),
  };
  await client.set(
    `${COMMENT_PREFIX}${parent.id}`,
    JSON.stringify(next)
  );
  return { ok: true, comment: next, reply: updated };
}

export async function deleteReply(
  commentId: string,
  actorEmail: string
): Promise<
  | { ok: true; comment: CommentRecord }
  | { ok: false; error: "not_found" | "forbidden" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  if (!isAdmin(actorEmail)) return { ok: false, error: "forbidden" };

  const comment = await getComment(commentId);
  if (!comment) return { ok: false, error: "not_found" };

  const next: CommentRecord = { ...comment, replyBody: null, replyAt: null };
  await client.set(`${COMMENT_PREFIX}${commentId}`, JSON.stringify(next));
  return { ok: true, comment: next };
}
