"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  ensureDisplayName,
  getProfile,
  isAdmin,
  notifyOnReply,
} from "@/lib/comments";
import {
  autoWatchThread,
  claimReplyEmailCooldown,
  createReply,
  createThread,
  editReply,
  editThread,
  getReply,
  getThread,
  markReplyReadByClay,
  markThreadReadByClay,
  pinReply,
  pinThread,
  restoreReply,
  restoreThread,
  listWatchStates,
  setWatchState,
  softDeleteReply,
  softDeleteThread,
  unpinReply,
  unpinThread,
} from "@/lib/guild";
import { createNotification, upsertCollapsed } from "@/lib/notifications";
import { parseMentions, resolveMentionToEmail } from "@/lib/mentions";
import {
  sendGuildMentionNotification,
  sendGuildReplyNotification,
} from "@/lib/email";
import { markOnboardingStep } from "@/lib/onboarding";

// Server Actions for the Guild. Every action re-verifies the session
// inside the function body — Server Actions are reachable by direct POST,
// not only through our UI, so auth/authorization can never live solely in
// the page. Mutations revalidate the affected path so the next render
// shows fresh data; the Guild deliberately does NOT poll or push (calm,
// not a feed), so navigation/refresh is the update surface.

// Shape returned to useActionState-driven composers so they can show an
// inline error without a page reload.
export type GuildFormState = { ok: boolean; error?: string };

async function currentSession() {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE)?.value);
}

// The composer serializes its attached-image list into one hidden "media"
// field as a JSON array. Parse it back to an unknown the guild lib will
// re-validate (host + dimensions + count) — a malformed value just posts
// without images rather than erroring.
function parseMediaField(formData: FormData): unknown {
  const raw = formData.get("media");
  if (typeof raw !== "string" || !raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function messageFor(error: string): string {
  switch (error) {
    case "rate_limited":
      return "You're posting quickly. Give it a moment.";
    case "invalid":
      return "Add a title and a body before posting.";
    case "window_closed":
      return "The edit window for this has closed.";
    case "thread_missing":
      return "That thread is no longer here.";
    case "storage_unavailable":
      return "The Guild is briefly unavailable. Try again.";
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
    default:
      return "Something went wrong. Try again.";
  }
}

// Gate a would-be Guild poster to a real display name. Admin (Clay) is
// exempt — his posts render as "Clay". Returns an inline error message on
// failure, or null to proceed. The submitted name (the composer's inline
// field) becomes the member's profile via ensureDisplayName.
async function guildNameGate(
  email: string,
  formData: FormData
): Promise<string | null> {
  if (isAdmin(email)) return null;
  const submittedName = String(formData.get("displayName") ?? "");
  const named = await ensureDisplayName(email, submittedName);
  if (named.ok) return null;
  return messageFor(named.error);
}

/**
 * Fan out `guild_mention` notices for everyone @-tagged in a body: the
 * bell for all of them, and an email for anyone who hasn't turned reply
 * email off.
 *
 * Mirrors the Lounge's block (same parser, same resolution), with the
 * Guild's own dedupe: `skip` carries whoever already got a guild_reply
 * for this exact post, so being named in the reply you're already being
 * notified about doesn't ring the bell twice. Self-mentions are skipped:
 * writing your own name doesn't ping you.
 *
 * The email reuses the reply path's per-thread lock
 * (claimReplyEmailCooldown), which is the whole double-email defence.
 * One Guild email per member per thread per window, whichever sweep gets
 * there first. Callers run this BEFORE the watcher sweep so a tagged
 * watcher gets "tagged you" rather than the vaguer "replied".
 *
 * Awaited by its callers only from inside a fire-and-forget block: a
 * notification hiccup must never fail a post that already landed.
 */
async function notifyGuildMentions(args: {
  body: string;
  authorEmail: string;
  authorName: string;
  threadId: string;
  threadTitle: string;
  linkUrl: string;
  skip?: string | null;
}): Promise<void> {
  try {
    const tokens = parseMentions(args.body);
    if (!tokens.length) return;
    const excerpt =
      args.body.length > 60
        ? `${args.body.slice(0, 60).trim()}…`
        : args.body;
    const author = args.authorEmail.toLowerCase().trim();
    const skip = args.skip?.toLowerCase().trim() ?? null;
    const notified = new Set<string>();
    for (const token of tokens) {
      const targetRaw = await resolveMentionToEmail(token);
      if (!targetRaw) continue;
      const target = targetRaw.toLowerCase().trim();
      if (target === author || target === skip) continue;
      if (notified.has(target)) continue;
      notified.add(target);
      await createNotification({
        memberEmail: target,
        type: "guild_mention",
        title: `${args.authorName} mentioned you in the Guild`,
        body: args.threadTitle || excerpt,
        linkUrl: args.linkUrl,
      });

      // Email is the deliberate half. Gated on the member's own account
      // toggle (the same one that governs reply email, so nobody has two
      // switches for one idea), then on the shared per-thread lock.
      const profile = await getProfile(target).catch(() => null);
      if (!notifyOnReply(profile)) continue;
      if (!(await claimReplyEmailCooldown(target, args.threadId))) continue;
      await sendGuildMentionNotification({
        to: target,
        recipientDisplayName: profile?.displayName ?? "",
        mentionAuthorDisplayName: args.authorName,
        threadTitle: args.threadTitle,
        threadPath: args.linkUrl,
        bodyText: args.body || "Shared a photo",
      });
    }
  } catch (err) {
    console.error("[notifications] guild_mention fan-out failed:", err);
  }
}

/** The name to sign a notification with. Clay presides under his own. */
async function notifierName(email: string): Promise<string> {
  if (isAdmin(email)) return "Clay";
  const profile = await getProfile(email).catch(() => null);
  return profile?.displayName?.trim() || "A member";
}

// The title of a collapsed reply row. It has to carry the whole story on
// one line, because the panel renders only title + thread title:
//   "Trish replied"
//   "Trish replied (3 new)"
//   "Trish and Mark replied"
//   "Trish, Mark and 2 others replied (7 new)"
function guildReplyTitle(actors: string[], count: number): string {
  const extra = actors.length - 2;
  const names =
    actors.length === 1
      ? actors[0]
      : actors.length === 2
        ? `${actors[0]} and ${actors[1]}`
        : `${actors[0]}, ${actors[1]} and ${extra} ${extra === 1 ? "other" : "others"}`;
  const suffix = count > actors.length ? ` (${count} new)` : "";
  return `${names} replied${suffix}`;
}

// --- Compose: thread -------------------------------------------------

export async function postThreadAction(
  _prev: GuildFormState,
  formData: FormData
): Promise<GuildFormState> {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Sign in to post." };

  const nameError = await guildNameGate(session.email, formData);
  if (nameError) return { ok: false, error: nameError };

  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const category = String(formData.get("category") ?? "");

  // Optional attached images: the composer uploads them client-side and
  // posts the resulting list (Blob URL + dimensions per image) as one JSON
  // hidden field. createThread re-validates each URL is from our own Blob
  // store and caps the count.
  const media = parseMediaField(formData);

  const result = await createThread({
    authorEmail: session.email,
    title,
    body,
    category,
    media,
  });
  if (!result.ok) return { ok: false, error: messageFor(result.error) };

  // First-run: posting in the Guild ticks that onboarding step.
  await markOnboardingStep(session.email, "guild").catch(() => {});

  // Starting a thread means watching it. No opt-in step.
  await autoWatchThread(result.thread.id, session.email).catch(() => {});

  void notifyGuildMentions({
    body: result.thread.body,
    authorEmail: session.email,
    authorName: await notifierName(session.email),
    threadId: result.thread.id,
    threadTitle: result.thread.title,
    linkUrl: `/guild/${result.thread.id}`,
  });

  revalidatePath("/guild");
  // Drop the author straight into their new thread.
  redirect(`/guild/${result.thread.id}`);
}

// --- Compose: reply --------------------------------------------------

export async function postReplyAction(
  _prev: GuildFormState,
  formData: FormData
): Promise<GuildFormState> {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Sign in to reply." };

  const nameError = await guildNameGate(session.email, formData);
  if (nameError) return { ok: false, error: nameError };

  const threadId = String(formData.get("threadId") ?? "");
  const parentReplyId = formData.get("parentReplyId")
    ? String(formData.get("parentReplyId"))
    : null;
  const body = String(formData.get("body") ?? "");
  if (!threadId) return { ok: false, error: "Missing thread." };

  // Optional attached images, same hidden-field contract as postThreadAction.
  // createReply re-validates each URL is from our own Blob store.
  const media = parseMediaField(formData);

  const result = await createReply({
    authorEmail: session.email,
    threadId,
    parentReplyId,
    body,
    media,
  });
  if (!result.ok) return { ok: false, error: messageFor(result.error) };

  // First-run: replying in the Guild ticks that onboarding step.
  await markOnboardingStep(session.email, "guild").catch(() => {});

  // Resolve who this reply lands on: the parent reply's author for a
  // nested reply, otherwise the thread author. Resolve against the reply's
  // LANDED parent (createReply re-parents a grandchild up one tier). They
  // still get the direct EMAIL below, and the mention fan-out skips them;
  // their in-app notice now travels with everyone else's.
  let directRecipient: string | null = null;
  let threadTitle = "";
  try {
    const landedParentId = result.reply.parentReplyId;
    const [thread, parent] = await Promise.all([
      getThread(threadId),
      landedParentId ? getReply(landedParentId) : Promise.resolve(null),
    ]);
    const recipient = parent?.authorEmail ?? thread?.authorEmail ?? null;
    directRecipient = recipient;
    threadTitle = thread?.title ?? "";
    if (
      thread &&
      recipient &&
      recipient.toLowerCase() !== session.email.toLowerCase()
    ) {
      // Email: preference-gated and batched to one per thread per window.
      // Never sends from dev, and never notifies yourself. A hiccup here
      // must never break posting the reply.
      const [recipientProfile, replierProfile] = await Promise.all([
        getProfile(recipient),
        getProfile(session.email),
      ]);
      if (
        notifyOnReply(recipientProfile) &&
        (await claimReplyEmailCooldown(recipient, threadId))
      ) {
        await sendGuildReplyNotification({
          to: recipient,
          recipientDisplayName: recipientProfile?.displayName ?? "",
          replyAuthorDisplayName: replierProfile?.displayName ?? "A member",
          threadTitle: thread.title,
          threadPath: `/guild/${threadId}#reply-${result.reply.id}`,
          replyBody: result.reply.body || "Shared a photo",
        });
      }
    }
  } catch {
    // A notification hiccup must never break posting a reply.
  }

  // Answering a thread means watching it, unless they've muted it before.
  await autoWatchThread(threadId, session.email).catch(() => {});

  const replierName = await notifierName(session.email);

  // In-app: ONE rule for the whole room, one live alert per member per
  // thread. Everyone still listening (bell-clickers and participants,
  // plus whoever this reply landed on unless they muted) shares the same
  // collapsed row: the first reply creates it, later replies fold in and
  // bump it. A hot thread reads "Trish and 2 others replied", not ten
  // identical rows. Nobody is told about their own reply. (Dev never
  // touches prod here — the notifications keyspace is dev-namespaced,
  // same as the Guild.)
  void (async () => {
    // Mentions go FIRST. Both sweeps claim the same per-thread email
    // lock, so whichever runs first decides which email a tagged watcher
    // receives. Being named by hand is the more specific signal, so it
    // takes the lock and the generic "replied" mail stands down. The
    // person actually being answered claimed the lock further up and is
    // skipped by the mention sweep, so they still get exactly one.
    await notifyGuildMentions({
      body: result.reply.body,
      authorEmail: session.email,
      authorName: replierName,
      threadId,
      threadTitle,
      linkUrl: `/guild/${threadId}#reply-${result.reply.id}`,
      skip: directRecipient,
    });

    try {
      const states = await listWatchStates(threadId);
      const author = session.email.toLowerCase().trim();
      const direct = directRecipient?.toLowerCase().trim() ?? null;
      const recipients = new Set(
        Object.entries(states)
          .filter(([, s]) => s === "on" || s === "auto")
          .map(([email]) => email)
      );
      // Threads older than watching itself have no watch entry for their
      // author; being replied to still has to ring unless they muted.
      if (direct && states[direct] !== "off") recipients.add(direct);
      recipients.delete(author);
      const path = `/guild/${threadId}#reply-${result.reply.id}`;
      for (const email of recipients) {
        await upsertCollapsed({
          memberEmail: email,
          type: "guild_reply",
          collapseKey: `guild-thread:${threadId}`,
          actorName: replierName,
          formatTitle: guildReplyTitle,
          body: threadTitle,
          linkUrl: path,
        });
        // Email only for a deliberate opt-in (the bell), on the member's
        // own preference, at most one per thread per window. The direct
        // recipient had their (more specific) email shot above.
        if (states[email] !== "on" || email === direct) continue;
        const profile = await getProfile(email).catch(() => null);
        if (!notifyOnReply(profile)) continue;
        if (!(await claimReplyEmailCooldown(email, threadId))) continue;
        await sendGuildReplyNotification({
          to: email,
          recipientDisplayName: profile?.displayName ?? "",
          replyAuthorDisplayName: replierName,
          threadTitle,
          threadPath: path,
          replyBody: result.reply.body || "Shared a photo",
          watching: true,
        });
      }
    } catch (err) {
      console.error("[notifications] guild reply fan-out failed:", err);
    }
  })();

  revalidatePath(`/guild/${threadId}`);
  return { ok: true };
}

// --- Edit ------------------------------------------------------------

export async function editThreadAction(
  _prev: GuildFormState,
  formData: FormData
): Promise<GuildFormState> {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Sign in to edit." };
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const result = await editThread(id, session.email, { title, body });
  if (!result.ok) return { ok: false, error: messageFor(result.error) };
  revalidatePath(`/guild/${id}`);
  revalidatePath("/guild");
  return { ok: true };
}

export async function editReplyAction(
  _prev: GuildFormState,
  formData: FormData
): Promise<GuildFormState> {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Sign in to edit." };
  const id = String(formData.get("id") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "");
  const result = await editReply(id, session.email, body);
  if (!result.ok) return { ok: false, error: messageFor(result.error) };
  revalidatePath(`/guild/${threadId}`);
  return { ok: true };
}

// --- Delete (author or admin) ---------------------------------------

export async function deleteThreadAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  const admin = isAdmin(session.email);
  const result = await softDeleteThread(id, session.email, admin);
  if (result.ok) {
    revalidatePath("/guild");
    redirect("/guild");
  }
}

export async function deleteReplyAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const admin = isAdmin(session.email);
  await softDeleteReply(id, session.email, admin);
  revalidatePath(`/guild/${threadId}`);
}

// --- Restore (admin only — undo a soft delete) ----------------------

export async function restoreThreadAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session || !isAdmin(session.email)) return;
  const id = String(formData.get("id") ?? "");
  await restoreThread(id);
  revalidatePath("/guild");
  revalidatePath(`/guild/${id}`);
}

export async function restoreReplyAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session || !isAdmin(session.email)) return;
  const id = String(formData.get("id") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  await restoreReply(id);
  revalidatePath(`/guild/${threadId}`);
}

// --- Clay presiding: pin + read-mark (admin only) -------------------

export async function pinThreadAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session || !isAdmin(session.email)) return;
  const id = String(formData.get("id") ?? "");
  const pinned = formData.get("pinned") === "1";
  if (pinned) {
    await unpinThread(id);
  } else {
    await pinThread(id);
  }
  revalidatePath("/guild");
  revalidatePath(`/guild/${id}`);
}

export async function markThreadReadAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session || !isAdmin(session.email)) return;
  const id = String(formData.get("id") ?? "");
  await markThreadReadByClay(id);
  revalidatePath(`/guild/${id}`);
  revalidatePath("/guild");
}

export async function markReplyReadAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session || !isAdmin(session.email)) return;
  const id = String(formData.get("id") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  await markReplyReadByClay(id);
  revalidatePath(`/guild/${threadId}`);
}

// Pin / unpin a single reply to the top of the thread (admin only). The
// hidden "pinned" flag tells us which way the one toggle button is firing.
export async function pinReplyAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session || !isAdmin(session.email)) return;
  const id = String(formData.get("id") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const alreadyPinned = formData.get("pinned") === "1";
  if (alreadyPinned) {
    await unpinReply(threadId);
  } else {
    await pinReply(threadId, id);
  }
  revalidatePath(`/guild/${threadId}`);
}

// --- Watching --------------------------------------------------------

/**
 * Start or stop watching a thread. Members are joined automatically when
 * they start or answer one, so this is the way out (and the way back in
 * for a thread someone read but never posted in).
 */
export async function setWatchAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) return;
  const threadId = String(formData.get("threadId") ?? "");
  if (!threadId) return;
  const watching = String(formData.get("watching") ?? "") === "1";
  await setWatchState(threadId, session.email, watching);
  revalidatePath(`/guild/${threadId}`);
}
