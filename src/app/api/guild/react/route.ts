import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile } from "@/lib/comments";
import { getReply, getThread, setGuildReaction } from "@/lib/guild";
import { isReactionKey, type ReactionKey } from "@/lib/lounge";
import { createNotification } from "@/lib/notifications";

// POST /api/guild/react
//   body: { kind: "thread" | "reply", targetId: string, threadId: string,
//           reaction: GuildReaction | null }
// Set / switch / clear the caller's reaction on a thread or reply.
// Passing the reaction you already have (or null) removes it. Returns the
// fresh reaction summary so the client can reconcile its optimistic state.

export const runtime = "nodejs";

function firstWord(value: string): string {
  const t = value.trim();
  if (!t) return "";
  const s = t.search(/\s/);
  return s === -1 ? t : t.slice(0, s);
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = b.kind;
  const targetId = b.targetId;
  const threadId = typeof b.threadId === "string" ? b.threadId : "";
  if ((kind !== "thread" && kind !== "reply") || typeof targetId !== "string") {
    return Response.json({ error: "invalid_target" }, { status: 400 });
  }

  const reactionRaw = b.reaction;
  let choice: ReactionKey | null;
  if (reactionRaw === null || reactionRaw === undefined || reactionRaw === "") {
    choice = null;
  } else if (isReactionKey(reactionRaw)) {
    choice = reactionRaw;
  } else {
    return Response.json({ error: "invalid_reaction" }, { status: 400 });
  }

  const result = await setGuildReaction(targetId, session.email, choice);
  if (!result.ok) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  // Notify the target's owner only on a genuinely new reaction (not a
  // switch or a remove), and never on a self-react. Best-effort.
  if (result.added) {
    void (async () => {
      try {
        const target =
          kind === "thread"
            ? await getThread(targetId)
            : await getReply(targetId);
        if (!target || target.deleted) return;
        const owner = target.authorEmail;
        if (!owner || owner === session.email.toLowerCase().trim()) return;

        const profile = await getProfile(session.email).catch(() => null);
        const fallback = session.email.split("@")[0] || "Member";
        const firstName =
          firstWord(profile?.displayName?.trim() || fallback) || fallback;
        const snippet =
          target.body.length > 60
            ? `${target.body.slice(0, 60).trim()}…`
            : target.body;
        const label = kind === "reply" ? "reply" : "thread";
        const base = threadId || targetId;
        const link =
          kind === "reply"
            ? `/guild/${base}#reply-${targetId}`
            : `/guild/${base}`;

        await createNotification({
          memberEmail: owner,
          type: "guild_reaction",
          title: `${firstName} reacted to your ${label}`,
          body: snippet,
          linkUrl: link,
        });
      } catch (err) {
        console.error("[notifications] guild_reaction write failed:", err);
      }
    })();
  }

  return Response.json({ ok: true, summary: result.summary });
}
