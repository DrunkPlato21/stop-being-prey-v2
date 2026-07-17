"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, isAdmin, notifyOnReply } from "@/lib/comments";
import {
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
  softDeleteReply,
  softDeleteThread,
  unpinReply,
  unpinThread,
} from "@/lib/guild";
import { createNotification } from "@/lib/notifications";
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
    default:
      return "Something went wrong. Try again.";
  }
}

// --- Compose: thread -------------------------------------------------

export async function postThreadAction(
  _prev: GuildFormState,
  formData: FormData
): Promise<GuildFormState> {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Sign in to post." };

  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const category = String(formData.get("category") ?? "");

  // Optional attached image: the composer uploads it client-side and posts
  // the resulting Blob URL + dimensions as hidden fields. createThread
  // re-validates the URL is from our own Blob store.
  const mediaUrl = String(formData.get("mediaUrl") ?? "");
  const media = mediaUrl
    ? {
        type: "image",
        url: mediaUrl,
        width: Number(formData.get("mediaWidth") ?? 0),
        height: Number(formData.get("mediaHeight") ?? 0),
      }
    : null;

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

  const threadId = String(formData.get("threadId") ?? "");
  const parentReplyId = formData.get("parentReplyId")
    ? String(formData.get("parentReplyId"))
    : null;
  const body = String(formData.get("body") ?? "");
  if (!threadId) return { ok: false, error: "Missing thread." };

  // Optional attached image, same hidden-field contract as postThreadAction.
  // createReply re-validates the URL is from our own Blob store.
  const mediaUrl = String(formData.get("mediaUrl") ?? "");
  const media = mediaUrl
    ? {
        type: "image",
        url: mediaUrl,
        width: Number(formData.get("mediaWidth") ?? 0),
        height: Number(formData.get("mediaHeight") ?? 0),
      }
    : null;

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
  try {
    const landedParentId = result.reply.parentReplyId;
    const [thread, parent] = await Promise.all([
      getThread(threadId),
      landedParentId ? getReply(landedParentId) : Promise.resolve(null),
    ]);
    const recipient = parent?.authorEmail ?? thread?.authorEmail ?? null;
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
