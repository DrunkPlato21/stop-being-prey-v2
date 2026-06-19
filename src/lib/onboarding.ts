import { Redis } from "@upstash/redis";

// Per-member first-run progress. Drives the "Getting started" panel on
// the Desk for new members. Steps are marked as the member does the real
// thing (reads the Rules, posts in the Guild, posts in the Lounge); the
// "name" step is derived from the profile, not stored here. The panel
// retires once every step is done or the member dismisses it.
//
// Dev-namespaced like guild.ts / notifications.ts so local testing never
// writes onboarding state for real members.

const KEY_PREFIX =
  process.env.ONBOARDING_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");
const RECORD_PREFIX = `${KEY_PREFIX}onboarding:`;

export type OnboardingStep = "rules" | "guild" | "lounge";

// Each completed step stores its completion timestamp; dismissedAt is set
// when the member closes the panel. Absent fields mean "not done".
export type OnboardingRecord = {
  rules?: number;
  guild?: number;
  lounge?: number;
  dismissedAt?: number;
};

let cached: Redis | null = null;
function getClient(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

export async function getOnboarding(email: string): Promise<OnboardingRecord> {
  const client = getClient();
  if (!client) return {};
  const raw = await client
    .get(`${RECORD_PREFIX}${normEmail(email)}`)
    .catch(() => null);
  if (!raw) return {};
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as OnboardingRecord)
      : (raw as OnboardingRecord);
  } catch {
    return {};
  }
}

/** Mark a step done (idempotent — first completion wins, never bumped). */
export async function markOnboardingStep(
  email: string,
  step: OnboardingStep
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const norm = normEmail(email);
  if (!norm) return;
  const rec = await getOnboarding(norm);
  if (rec[step]) return;
  rec[step] = Date.now();
  await client.set(`${RECORD_PREFIX}${norm}`, JSON.stringify(rec));
}

/** Retire the panel for this member. */
export async function dismissOnboarding(email: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  const norm = normEmail(email);
  if (!norm) return;
  const rec = await getOnboarding(norm);
  if (rec.dismissedAt) return;
  rec.dismissedAt = Date.now();
  await client.set(`${RECORD_PREFIX}${norm}`, JSON.stringify(rec));
}
