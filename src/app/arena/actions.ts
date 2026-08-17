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
  getBout,
  getTile,
  isTileType,
  reopenBout,
  sealBout,
  setBoutPublic,
  setMyReaction,
} from "@/lib/arena";
import { announceBoutOpened, announceCaseFiled } from "@/lib/arena-notify";

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
  const tile = await addTile(boutId, {
    type,
    body: String(formData.get("body") ?? ""),
    handle: String(formData.get("handle") ?? "") || null,
    transcript: String(formData.get("transcript") ?? "") || null,
    // One input, comma-separated. Becomes a taxonomy picker later.
    moves: String(formData.get("moves") ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    // Set by the bench after a Ctrl+V paste uploads through
    // /api/arena/upload. Validated against our Blob host in addTile.
    imageUrl: String(formData.get("imageUrl") ?? "") || null,
  });
  // First tile = the fight is real: ring the bell once.
  if (tile) {
    const bout = await getBout(boutId);
    if (bout && bout.tileCount === 1) {
      await announceBoutOpened(bout, session.email);
    }
  }
  revalidatePath(`/arena/${boutId}`);
}

// Sealing IS filing: the stamp (case number, archetype, rules applied)
// lands with the seal, and the sealed bout is the case file.
export async function sealBoutAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  if (!boutId) return;
  const rawNo = Number.parseInt(String(formData.get("caseNo") ?? ""), 10);
  const bout = await sealBout(boutId, {
    caseNo: Number.isInteger(rawNo) && rawNo > 0 ? rawNo : null,
    archetype: String(formData.get("archetype") ?? "") || null,
    rulesApplied: String(formData.get("rulesApplied") ?? "") || null,
    dispatch: String(formData.get("dispatch") ?? "") || null,
  });
  // The filed case is the payoff the first bell row promised.
  if (bout) {
    await announceCaseFiled(bout, session.email);
  }
  revalidatePath(`/arena/${boutId}`);
  revalidatePath("/arena");
}

// Promotional unlock: flips a sealed bout publicly readable (the
// conversion sample) or takes it private again.
export async function setBoutPublicAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  if (!boutId) return;
  await setBoutPublic(boutId, String(formData.get("public") ?? "") === "1");
  revalidatePath(`/arena/${boutId}`);
  revalidatePath("/arena");
}

export async function reopenBoutAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  if (!boutId) return;
  await reopenBout(boutId);
  revalidatePath(`/arena/${boutId}`);
  revalidatePath("/arena");
}

// ---- Members -------------------------------------------------------

export async function setReactionAction(
  tileId: string,
  key: string | null
): Promise<void> {
  const session = await requireSession();
  if (!session || !tileId) return;
  await setMyReaction(tileId, session.email, key);
  // No revalidate: the client updates optimistically; the true counts
  // arrive on the next natural render. Calm surface, no refresh churn.
}

export async function whisperAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session) return;
  const tileId = String(formData.get("tileId") ?? "");
  const body = String(formData.get("body") ?? "");
  if (!tileId) return;
  // Whispers land on open bouts only; a filed case is settled.
  const tile = await getTile(tileId);
  if (!tile) return;
  const bout = await getBout(tile.boutId);
  if (!bout || bout.status !== "open") return;
  await addWhisper(tileId, session.email, body);
}
