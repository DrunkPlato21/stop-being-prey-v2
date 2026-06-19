// Plain Guild constants with no server dependencies, so client
// components (composers, edit forms) can import limits without pulling
// the Redis/crypto-backed guild.ts module into the client bundle.

export const MAX_TITLE = 140;
export const MAX_BODY = 6000;
export const MAX_REPLY = 4000;

// Authors may edit their own thread/reply for this long after posting.
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

// --------------------------------------------------------------------
// Categories
// --------------------------------------------------------------------

// Every thread picks one category at creation. The pick is REQUIRED, and
// not for navigation — there isn't the volume to need filtering yet. It's
// there because choosing the kind of post first scaffolds the writing and
// kills the blank-page freeze.
//
// These are INTENT-based, not topic-based. A topic ("politics", "media")
// fragments and most buckets sit empty; an intent ("a real engagement",
// "the theory") stays relevant at any volume and reads like a prompt.
// Keep the list SHORT. Many empty categories read "abandoned". Let a
// split emerge from real usage — never guess one up front.
export const GUILD_CATEGORIES = [
  {
    slug: "field",
    label: "The Field",
    hint: "A real engagement. One you won and want to break down, or one you're in right now and need the move on.",
  },
  {
    slug: "doctrine",
    label: "The Doctrine",
    hint: "The rules and the theory. Argue one, test one, ask about one.",
  },
  {
    slug: "open",
    label: "Open floor",
    hint: "Ideas, thinking out loud, everything else.",
  },
] as const;

export type GuildCategory = (typeof GUILD_CATEGORIES)[number]["slug"];

// Legacy threads created before categories existed default here on read.
export const DEFAULT_GUILD_CATEGORY: GuildCategory = "open";

export function isGuildCategory(v: unknown): v is GuildCategory {
  return (
    typeof v === "string" && GUILD_CATEGORIES.some((c) => c.slug === v)
  );
}

export function guildCategoryLabel(slug: string): string {
  return (
    GUILD_CATEGORIES.find((c) => c.slug === slug)?.label ?? "Open floor"
  );
}
