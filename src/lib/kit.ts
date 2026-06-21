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
