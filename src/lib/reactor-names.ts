import { getProfile } from "@/lib/comments";
import { REACTION_KEYS, type ReactionKey } from "@/lib/lounge";

// Shared by the Guild + Lounge "who reacted" endpoints: turn raw reactor
// emails into display names, then order by reaction (same emoji groups
// together) and name. Fallback to the email local part matches the
// firstName convention already used across comments/lounge bylines.
export async function resolveReactorNames(
  raw: Array<{ email: string; reaction: ReactionKey }>
): Promise<Array<{ name: string; reaction: ReactionKey }>> {
  const resolved = await Promise.all(
    raw.map(async ({ email, reaction }) => {
      const profile = await getProfile(email).catch(() => null);
      const name =
        profile?.displayName?.trim() || email.split("@")[0] || "A member";
      return { name, reaction };
    })
  );
  const order = (k: ReactionKey) => REACTION_KEYS.indexOf(k);
  return resolved.sort(
    (a, b) =>
      order(a.reaction) - order(b.reaction) || a.name.localeCompare(b.name)
  );
}
