"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import {
  addTile,
  addWhisper,
  createBout,
  isTileType,
  setBoutStatus,
  toggleReaction,
} from "@/lib/arena";

// Server Actions for the Arena. Same discipline as the Guild's: every
// action re-verifies the session in the body, because actions are
// reachable by direct POST. Authoring (bouts, tiles, seal) is Clay only
// — the Arena is a broadcast; members' actions are reactions and
// whispers, nothing else. NOT the /admin tree on purpose: admin is
// localhost-only in production, and Clay posts tiles from wherever the
// fight found him, so authoring rides his member session + isAdmin.

async function requireSession(): Promise<{ email: string } | null> {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE)?.value);
}

// ---- Clay only -----------------------------------------------------

export async function createBoutAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const title = String(formData.get("title") ?? "");
  const bout = await createBout(title);
  if (!bout) return;
  revalidatePath("/arena");
  redirect(`/arena/${bout.id}`);
}

export async function addTileAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!boutId || !isTileType(type)) return;
  await addTile(boutId, {
    type,
    body: String(formData.get("body") ?? ""),
    handle: String(formData.get("handle") ?? "") || null,
    transcript: String(formData.get("transcript") ?? "") || null,
    // One input, comma-separated. Becomes a taxonomy picker later.
    moves: String(formData.get("moves") ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
  });
  revalidatePath(`/arena/${boutId}`);
}

export async function setBoutStatusAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!boutId || (status !== "open" && status !== "sealed")) return;
  await setBoutStatus(boutId, status);
  revalidatePath(`/arena/${boutId}`);
  revalidatePath("/arena");
}

// ---- Members -------------------------------------------------------

export async function toggleReactionAction(
  tileId: string,
  key: string
): Promise<void> {
  const session = await requireSession();
  if (!session || !tileId) return;
  await toggleReaction(tileId, session.email, key);
  // No revalidate: the client updates optimistically; the true counts
  // arrive on the next natural render. Calm surface, no refresh churn.
}

export async function whisperAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) return;
  const tileId = String(formData.get("tileId") ?? "");
  const body = String(formData.get("body") ?? "");
  if (!tileId) return;
  await addWhisper(tileId, session.email, body);
}
