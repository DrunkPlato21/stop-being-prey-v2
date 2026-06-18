"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import {
  createReply,
  createThread,
  editReply,
  editThread,
  markReplyReadByClay,
  markThreadReadByClay,
  pinThread,
  softDeleteReply,
  softDeleteThread,
  unpinThread,
} from "@/lib/guild";

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

  const result = await createThread({
    authorEmail: session.email,
    title,
    body,
    category,
  });
  if (!result.ok) return { ok: false, error: messageFor(result.error) };

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

  const result = await createReply({
    authorEmail: session.email,
    threadId,
    parentReplyId,
    body,
  });
  if (!result.ok) return { ok: false, error: messageFor(result.error) };

  // ---------------------------------------------------------------
  // NOTIFICATION SEAM (deferred to the next layer, intentionally off).
  //
  // Recipient resolution is worked out here so turning notifications on
  // later is a few lines, not a redesign: a reply under another reply
  // notifies that reply's author; a top-level reply notifies the thread
  // author. Never notify yourself.
  //
  // Not wired yet for two reasons: (1) the notifications keyspace is
  // unprefixed and shared with prod, so emitting during local dev would
  // mint real notifications against real members; (2) the "calm, no
  // red-dot" feel of Guild notifications is its own design decision we
  // haven't made. When ready, add the guild_* types and uncomment:
  //
  // const recipient = parentReplyId
  //   ? (await getReply(parentReplyId))?.authorEmail
  //   : (await getThread(threadId))?.authorEmail;
  // if (recipient && recipient !== session.email) {
  //   await createNotification({
  //     memberEmail: recipient,
  //     type: "guild_reply",
  //     title: "New reply in the Guild",
  //     body: "Someone replied to your thread.",
  //     linkUrl: `/guild/${threadId}#reply-${result.reply.id}`,
  //   });
  // }
  // ---------------------------------------------------------------

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
