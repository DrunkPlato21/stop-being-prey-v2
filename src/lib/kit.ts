// Kit (formerly ConvertKit) integration. The newsletter form is handled
// in /api/subscribe via the v4 form-subscribe endpoint; this module
// handles the membership-side "Members" tag attached on subscription
// success. Same v4 auth scheme as /api/subscribe.
//
// Two-step pattern (matches the form-attach pattern Kit requires):
//   1. POST /v4/subscribers          — upsert subscriber by email
//   2. POST /v4/tags/{tag}/subscribers — attach to the Members tag
//
// Requires both KIT_API_KEY and KIT_MEMBERS_TAG_ID. If either is
// missing, applyMembersTag returns { ok: false, reason: "not_configured" }
// and the caller is expected to log and continue — Kit failure should
// never block a Stripe-confirmed membership from being created.

const KIT_API_BASE = "https://api.kit.com/v4";

// Form 9402960 = "stopbeingprey.com" (verified via /v4/forms listing).
// Single source of truth for the list ID, shared by /api/subscribe and
// the Rules unlock action.
const SBP_FORM_ID = 9402960;

type KitCallResult = {
  ok: boolean;
  status: number;
  body: string;
};

async function postToKit(
  apiKey: string,
  path: string,
  body: Record<string, unknown>
): Promise<KitCallResult> {
  const response = await fetch(`${KIT_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Kit-Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text };
}

/**
 * Look up a subscriber by exact email and return their Kit state, or null
 * if Kit has no record (or the lookup itself failed — callers treat null as
 * "unknown, proceed"). Kit's v4 subscribers endpoint takes an exact
 * email_address filter. We only care whether they're already "active",
 * because re-adding an active subscriber to a form re-fires that form's
 * incentive/welcome email — a confirmed bug (an existing subscriber got the
 * welcome again on the Rules gate). So subscribeToList checks this first.
 */
async function getSubscriberState(
  apiKey: string,
  email: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${KIT_API_BASE}/subscribers?email_address=${encodeURIComponent(
        email
      )}`,
      {
        headers: { "X-Kit-Api-Key": apiKey, Accept: "application/json" },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      subscribers?: Array<{ email_address?: string; state?: string }>;
    };
    const match = data.subscribers?.find(
      (s) => s.email_address?.toLowerCase() === email.toLowerCase()
    );
    return match?.state ?? null;
  } catch {
    return null;
  }
}

export function isMembersTagConfigured(): boolean {
  return !!process.env.KIT_API_KEY && !!process.env.KIT_MEMBERS_TAG_ID;
}

export function isBookNotifyTagConfigured(): boolean {
  return (
    !!process.env.KIT_API_KEY && !!process.env.KIT_BOOK_NOTIFY_TAG_ID
  );
}

export type ApplyTagResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "upsert_failed" | "tag_failed";
      status?: number;
      body?: string;
    };

/**
 * Upsert a subscriber and attach a tag. Both Kit calls are idempotent
 * for an already-tagged email — safe to re-run as many times as the
 * caller wants. The function is generic over tag id so the same code
 * path serves "Members", "book-notify", or any future tag.
 */
async function applyTagInternal(
  email: string,
  tagId: string
): Promise<ApplyTagResult> {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey || !tagId) {
    return { ok: false, reason: "not_configured" };
  }

  const upsert = await postToKit(apiKey, "/subscribers", {
    email_address: email,
  });
  if (!upsert.ok) {
    return {
      ok: false,
      reason: "upsert_failed",
      status: upsert.status,
      body: upsert.body,
    };
  }

  const attach = await postToKit(apiKey, `/tags/${tagId}/subscribers`, {
    email_address: email,
  });
  if (!attach.ok) {
    return {
      ok: false,
      reason: "tag_failed",
      status: attach.status,
      body: attach.body,
    };
  }

  return { ok: true };
}

/**
 * Subscribe an email to the SBP newsletter list. Kit's v4 form-subscribe
 * endpoint requires the subscriber to exist first, so this is the same
 * two-step dance as the tag helpers: upsert the subscriber, then attach
 * to the form. Idempotent — safe to re-run for an already-subscribed
 * email. Shared by /api/subscribe (the site-wide email forms) and the
 * Rules unlock action.
 */
export async function subscribeToList(email: string): Promise<ApplyTagResult> {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  // Already on the list? Then the welcome already went out once, and the
  // list-building goal is met. Re-adding them to the form would re-fire
  // Kit's incentive/welcome email, so we stop here and report success.
  // Non-active states (unconfirmed, bounced, cancelled) and unknowns fall
  // through to a normal subscribe — re-adding is the correct move there.
  const state = await getSubscriberState(apiKey, email);
  if (state === "active") return { ok: true };

  const upsert = await postToKit(apiKey, "/subscribers", {
    email_address: email,
  });
  if (!upsert.ok) {
    return {
      ok: false,
      reason: "upsert_failed",
      status: upsert.status,
      body: upsert.body,
    };
  }

  const attach = await postToKit(apiKey, `/forms/${SBP_FORM_ID}/subscribers`, {
    email_address: email,
  });
  if (!attach.ok) {
    return {
      ok: false,
      reason: "tag_failed",
      status: attach.status,
      body: attach.body,
    };
  }

  return { ok: true };
}

export async function applyMembersTag(email: string): Promise<ApplyTagResult> {
  const tagId = process.env.KIT_MEMBERS_TAG_ID;
  if (!tagId) return { ok: false, reason: "not_configured" };
  return applyTagInternal(email, tagId);
}

/**
 * Apply the "book-notify" tag to a subscriber. Same upsert+attach
 * pattern as applyMembersTag, different tag id. Existing members
 * just get the tag added to their record, no duplicate signup.
 */
export async function applyBookNotifyTag(
  email: string
): Promise<ApplyTagResult> {
  const tagId = process.env.KIT_BOOK_NOTIFY_TAG_ID;
  if (!tagId) return { ok: false, reason: "not_configured" };
  return applyTagInternal(email, tagId);
}

/**
 * Live count of active subscribers, for the "Joining N readers" social
 * proof. Kit v4 exposes the total only via include_total_count on the
 * subscribers list endpoint (pagination.total_count); per_page=1 keeps the
 * payload tiny since we only want the number. Cached an hour at the data
 * layer so render traffic never hammers Kit. Returns null when
 * unconfigured or on any failure, so callers can fall back to a static
 * floor rather than render a broken line.
 */
export async function getSubscriberCount(): Promise<number | null> {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${KIT_API_BASE}/subscribers?status=active&per_page=1&include_total_count=true`,
      {
        headers: { "X-Kit-Api-Key": apiKey, Accept: "application/json" },
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      pagination?: { total_count?: number };
    };
    const count = data.pagination?.total_count;
    return typeof count === "number" && count > 0 ? count : null;
  } catch {
    return null;
  }
}

/**
 * Live count of subscribers carrying the Members tag — the exact audience a
 * host broadcast will reach. Used by the host panel so Trish sees the real
 * recipient count before confirming a send. Returns null when unconfigured
 * or on any failure; the caller falls back to a softer "your paid members"
 * phrasing rather than a wrong number. Not cached — she wants the current
 * number at send time, and this is a once-per-visit call.
 */
export async function getMembersTagCount(): Promise<number | null> {
  const apiKey = process.env.KIT_API_KEY;
  const tagId = process.env.KIT_MEMBERS_TAG_ID;
  if (!apiKey || !tagId) return null;
  try {
    const res = await fetch(
      `${KIT_API_BASE}/tags/${tagId}/subscribers?status=active&per_page=1&include_total_count=true`,
      {
        headers: { "X-Kit-Api-Key": apiKey, Accept: "application/json" },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      pagination?: { total_count?: number };
    };
    const count = data.pagination?.total_count;
    return typeof count === "number" && count >= 0 ? count : null;
  } catch {
    return null;
  }
}

export type BroadcastResult =
  | { ok: true; id: number | string; sendAt: string }
  | {
      ok: false;
      reason: "not_configured" | "create_failed";
      status?: number;
      body?: string;
    };

/**
 * Create and schedule a Kit broadcast to the Members tag — the mechanism
 * behind the Guild Host's weekly note. Kit's v4 API has no "send now", so we
 * schedule it a couple of minutes out (near-immediate, and it gives a short
 * grace window). `content` is the HTML body; Kit wraps it in the account's
 * default email template (header, footer, unsubscribe), so members get the
 * same chrome as Clay's normal newsletter. Targeting is by the Members tag,
 * so only paid members receive it.
 *
 * Requires KIT_API_KEY and KIT_MEMBERS_TAG_ID. Returns not_configured if
 * either is missing so the caller can surface a clear error to the host
 * rather than silently doing nothing.
 */
export async function sendMemberBroadcast(args: {
  subject: string;
  content: string;
  previewText?: string;
}): Promise<BroadcastResult> {
  const apiKey = process.env.KIT_API_KEY;
  const tagId = process.env.KIT_MEMBERS_TAG_ID;
  if (!apiKey || !tagId) return { ok: false, reason: "not_configured" };

  // Two minutes out: Kit schedules rather than sends instantly, and this
  // small window is a de-facto "oops" buffer before it goes wide.
  const sendAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  const result = await postToKit(apiKey, "/broadcasts", {
    subject: args.subject,
    content: args.content,
    preview_text: args.previewText ?? "",
    public: false,
    send_at: sendAt,
    subscriber_filter: [
      {
        all: [{ type: "tag", ids: [Number(tagId)] }],
        any: null,
        none: null,
      },
    ],
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: "create_failed",
      status: result.status,
      body: result.body,
    };
  }

  // Kit returns the created broadcast; pull its id for logging/traceability.
  let id: number | string = "";
  try {
    const parsed = JSON.parse(result.body) as {
      broadcast?: { id?: number | string };
    };
    id = parsed.broadcast?.id ?? "";
  } catch {
    // Non-fatal: the send was accepted even if we can't parse the id back.
  }

  return { ok: true, id, sendAt };
}
