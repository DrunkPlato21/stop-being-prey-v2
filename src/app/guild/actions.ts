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
  claimWatcherNotifications,
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
  listWatchers,
  setWatchState,
  softDeleteReply,
  softDeleteThread,
  unpinReply,
  unpinThread,
} from "@/lib/guild";
import { createNotification } from "@/lib/notifications";
import { parseMentions, resolveMentionToEmail } from "@/lib/mentions";
import { sendGuildReplyNotification } from "@/lib/email";
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
 * Fan out `guild_mention` notifications for everyone @-tagged in a body.
 *
 * Mirrors the Lounge's block (same parser, same resolution), with the
 * Guild's own dedupe: `skip` carries whoever already got a guild_reply
 * for this exact post, so being named in the reply you're already being
 * notified about doesn't ring the bell twice. Self-mentions are skipped —
 * writing your own name doesn't ping you.
 *
 * Fire-and-forget by design: a notification hiccup must never fail a post
 * that already landed.
 */
function notifyGuildMentions(args: {
  body: string;
  authorEmail: string;
  authorName: string;
  threadTitle: string;
  linkUrl: string;
  skip?: string | null;
}): void {
  void (async () => {
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
        const target = await resolveMentionToEmail(token);
        if (!target) continue;
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
      }
    } catch (err) {
      console.error("[notifications] guild_mention write failed:", err);
    }
  })();
}

/** The name to sign a notification with. Clay presides under his own. */
async function notifierName(email: string): Promise<string> {
  if (isAdmin(email)) return "Clay";
  const profile = await getProfile(email).catch(() => null);
  return profile?.displayName?.trim() || "A member";
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

  notifyGuildMentions({
    body: result.thread.body,
    authorEmail: session.email,
    authorName: await notifierName(session.email),
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

  // Notify the person being replied to: the parent reply's author for a
  // nested reply, otherwise the thread author. Resolve against the reply's
  // LANDED parent (createReply re-parents a grandchild up one tier), and
  // use the thread title as the body so the notification is legible. Never
  // notify yourself, and never let a notification hiccup break the reply.
  // (Dev never touches prod here — the notifications keyspace is now
  // dev-namespaced, same as the Guild.)
  // Held outside the try so the mention fan-out below can skip whoever
  // already got a reply notification for this exact post.
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
      // In-app bell: always, on every reply.
      await createNotification({
        memberEmail: recipient,
        type: "guild_reply",
        title: "New reply in the Guild",
        body: thread.title,
        linkUrl: `/guild/${threadId}#reply-${result.reply.id}`,
      });

      // Email: preference-gated and batched to one per thread per window
      // (the bell already covered the rest). Never sends from dev.
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

  // Tell the rest of the room's participants. Until now a reply notified
  // exactly one person — the parent author — so everyone else in a long
  // thread was deaf to it, and a conversation they were part of carried on
  // without them. The direct recipient already has their own, more
  // specific notification, and nobody is told about their own reply.
  void (async () => {
    try {
      const watchers = await listWatchers(threadId);
      const author = session.email.toLowerCase().trim();
      const direct = directRecipient?.toLowerCase().trim() ?? null;
      const candidates = watchers.filter((w) => w !== author && w !== direct);
      const due = await claimWatcherNotifications(threadId, candidates);
      if (!due.length) return;
      const replier = await getProfile(session.email).catch(() => null);
      const replierName = isAdmin(session.email)
        ? "Clay"
        : replier?.displayName?.trim() || "A member";
      const path = `/guild/${threadId}#reply-${result.reply.id}`;
      for (const email of due) {
        await createNotification({
          memberEmail: email,
          type: "guild_reply",
          title: "New reply in a thread you're in",
          body: threadTitle,
          linkUrl: path,
        });
        // And email, on the same terms as the direct recipient's: the
        // member's own preference, and at most one per thread per window.
        // A bell alone reaches nobody who isn't already on the site, which
        // is most of them — watching without email doesn't pull anyone back.
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
      console.error("[notifications] guild watcher fan-out failed:", err);
    }
  })();

  notifyGuildMentions({
    body: result.reply.body,
    authorEmail: session.email,
    authorName: await notifierName(session.email),
    threadTitle,
    linkUrl: `/guild/${threadId}#reply-${result.reply.id}`,
    skip: directRecipient,
  });

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
