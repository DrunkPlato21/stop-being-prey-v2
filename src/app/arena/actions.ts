"use server";

import { cookies } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import {
  addTile,
  addWhisper,
  ARENA_PUBLIC_TAG,
  boutHref,
  createBout,
  isCaseKind,
  deleteBout,
  deleteTile,
  getBout,
  getTile,
  isTileType,
  reopenBout,
  sealBout,
  setBoutPublic,
  setBoutSource,
  setMyReaction,
  updateBoutStamp,
  updateTile,
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

// Every authoring action lands here. The path revalidations are for the
// member view; the tag busts the cached copy anonymous readers get of a
// public case, so a fixed typo is never left standing on the one page
// strangers can see. updateTag (not revalidateTag) because this is
// read-your-own-writes: the next reader waits for fresh rather than
// being handed the stale copy while it refills.
function refreshBout(boutId: string, slug?: string | null): void {
  revalidatePath(`/arena/${boutId}`);
  if (slug) revalidatePath(`/arena/${slug}`);
  revalidatePath("/arena");
  updateTag(ARENA_PUBLIC_TAG);
}

// ---- Clay only -----------------------------------------------------

export async function createBoutAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const title = String(formData.get("title") ?? "");
  // Bout unless the bench explicitly says post-mortem. Anything
  // unrecognised falls back to a bout inside createBout, so a mangled
  // form can never mint a case of an unknown kind.
  const kind = String(formData.get("kind") ?? "bout");
  const bout = await createBout(title, isCaseKind(kind) ? kind : "bout");
  if (!bout) return;
  // Where it came from, if he had the link to hand. Optional on purpose:
  // a fight is often opened before the tab it happened in gets found
  // again, so the bench carries the same field for filling in later.
  await setBoutSource(bout.id, { url: String(formData.get("sourceUrl") ?? "") });
  revalidatePath("/arena");
  redirect(`/arena/${bout.id}`);
}

/** Record or clear a bout's source link. Private to Clay: nothing this
    writes is ever read by a member-facing surface. */
export async function setBoutSourceAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  if (!boutId) return;
  const bout = await getBout(boutId);
  if (!bout) return;
  await setBoutSource(boutId, {
    url: String(formData.get("sourceUrl") ?? ""),
    archiveUrl: String(formData.get("archiveUrl") ?? ""),
  });
  // The note is invisible to the room, so only the bench needs redrawing
  // — no tag bust, nothing anonymous readers can see has changed.
  revalidatePath(`/arena/${boutId}`);
  if (bout.slug) revalidatePath(`/arena/${bout.slug}`);
}

export async function addTileAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!boutId || !isTileType(type)) return;
  const tile = await addTile(boutId, {
    type,
    title: String(formData.get("tileTitle") ?? "") || null,
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
  refreshBout(boutId);
}

// Fix a tile in place. Same fields as the bench, because it IS the
// bench: the editor reuses the composer's shape so there is one way to
// write a tile, not two.
export async function updateTileAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const tileId = String(formData.get("tileId") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!tileId || !isTileType(type)) return;
  const tile = await updateTile(tileId, {
    type,
    title: String(formData.get("tileTitle") ?? "") || null,
    body: String(formData.get("body") ?? ""),
    handle: String(formData.get("handle") ?? "") || null,
    transcript: String(formData.get("transcript") ?? "") || null,
    moves: String(formData.get("moves") ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    imageUrl: String(formData.get("imageUrl") ?? "") || null,
  });
  if (tile) refreshBout(tile.boutId);
}

// Pull a tile out of the bout entirely. The screenshot goes with it:
// nothing else can reference that blob (every paste uploads its own),
// so leaving it would just be paying to store an orphan.
export async function deleteTileAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const tileId = String(formData.get("tileId") ?? "");
  if (!tileId) return;
  const tile = await deleteTile(tileId);
  if (!tile) return;
  if (tile.imageUrl) {
    // Never let a storage hiccup fail the delete the tile already got.
    await del(tile.imageUrl).catch(() => null);
  }
  refreshBout(tile.boutId);
}

// Sealing IS filing: the stamp (case number, archetype, rules applied)
// lands with the seal, and the sealed bout is the case file.
export async function sealBoutAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  if (!boutId) return;
  const rawNo = Number.parseInt(String(formData.get("caseNo") ?? ""), 10);
  const result = await sealBout(boutId, {
    caseNo: Number.isInteger(rawNo) && rawNo > 0 ? rawNo : null,
    archetype: String(formData.get("archetype") ?? "") || null,
    rulesApplied: String(formData.get("rulesApplied") ?? "") || null,
    dispatch: String(formData.get("dispatch") ?? "") || null,
  });
  if (!result) return;
  const { bout, renumberedFrom } = result;
  // The filed case is the payoff the first bell row promised.
  await announceCaseFiled(bout, session.email);
  refreshBout(boutId, bout.slug);
  // Sealing mints the readable link, so land on it. `filed` fires the
  // stamp's one-time settle; `renumbered` only rides along when the
  // register had to move the stamp.
  redirect(
    renumberedFrom
      ? `${boutHref(bout)}?filed=1&renumbered=${renumberedFrom}`
      : `${boutHref(bout)}?filed=1`
  );
}

// The filed case's cover: title, number, archetype, rules, dispatch.
// Editable without unsealing, because a case file is a document Clay
// keeps accurate, not a stone tablet.
export async function updateBoutStampAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  if (!boutId) return;
  const rawNo = Number.parseInt(String(formData.get("caseNo") ?? ""), 10);
  const result = await updateBoutStamp(boutId, {
    title: String(formData.get("title") ?? "") || null,
    caseNo: Number.isInteger(rawNo) && rawNo > 0 ? rawNo : null,
    archetype: String(formData.get("archetype") ?? ""),
    rulesApplied: String(formData.get("rulesApplied") ?? ""),
    dispatch: String(formData.get("dispatch") ?? ""),
  });
  if (!result) return;
  refreshBout(boutId, result.bout.slug);
  // A rename changes the canonical link, so land on the new one. The
  // taken-number note rides the same query param as the seal's.
  redirect(
    result.renumberedFrom
      ? `${boutHref(result.bout)}?taken=${result.renumberedFrom}`
      : boutHref(result.bout)
  );
}

// Bin the whole case. Used to clear out an import that didn't earn its
// place; there is no undo, so the UI asks twice before calling this.
export async function deleteBoutAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  if (!boutId) return;
  const result = await deleteBout(boutId);
  if (!result) return;
  for (const url of result.imageUrls) {
    // Only our own uploads are ours to bin. Screenshots that live in
    // /assets ship with the repo and belong to the old archive.
    if (url.startsWith("https://")) await del(url).catch(() => null);
  }
  refreshBout(boutId);
  redirect("/arena");
}

// Promotional unlock: flips a sealed bout publicly readable (the
// conversion sample) or takes it private again.
export async function setBoutPublicAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  if (!boutId) return;
  const bout = await setBoutPublic(
    boutId,
    String(formData.get("public") ?? "") === "1"
  );
  refreshBout(boutId, bout?.slug);
}

export async function reopenBoutAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session || !isAdmin(session.email)) return;
  const boutId = String(formData.get("boutId") ?? "");
  if (!boutId) return;
  const bout = await reopenBout(boutId);
  refreshBout(boutId, bout?.slug);
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

// Returns whether the whisper actually landed, so the client never
// confirms one that was dropped (bout sealed mid-typing, tile deleted,
// empty body). The member deserves the truth about whether Clay will
// see it.
export async function whisperAction(formData: FormData): Promise<boolean> {
  const session = await requireSession();
  if (!session) return false;
  const tileId = String(formData.get("tileId") ?? "");
  const body = String(formData.get("body") ?? "");
  if (!tileId) return false;
  // Whispers land on open bouts only; a filed case is settled.
  const tile = await getTile(tileId);
  if (!tile) return false;
  const bout = await getBout(tile.boutId);
  if (!bout || bout.status !== "open") return false;
  return addWhisper(tileId, session.email, body);
}
