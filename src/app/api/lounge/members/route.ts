import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, isAdmin } from "@/lib/comments";
import {
  getCharterSlot,
  getFounderSlot,
  getMember,
  getTierBadge,
  listAllMemberEmails,
  type TierBadge,
} from "@/lib/members";
import { mentionTokenFor } from "@/lib/display-name";

// GET /api/lounge/members
//
// Returns the directory used by the lounge @-mention picker: every
// member who has set a display name, plus Clay (the admin). Sorted by
// displayName, case-insensitive. The mentionToken is what gets dropped
// into the textarea — `mentionTokenFor("Mary S.")` collapses to
// "MaryS" which the server-side mention parser round-trips back to
// her email via resolveMentionToEmail.
//
// Member-gated. Cache disabled: tier/founder state changes need to
// reflect in the picker quickly enough that a fresh poll catches them.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectoryEntry = {
  displayName: string;
  mentionToken: string;
  isAdmin: boolean;
  isSelf: boolean;
  founderSlot: number | null;
  charterSlot: number | null;
  tierBadge: TierBadge | null;
};

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  const callerEmail = session.email.toLowerCase().trim();
  const adminEmailRaw = process.env.ADMIN_EMAIL?.toLowerCase().trim() ?? "";

  const memberEmails = await listAllMemberEmails();
  const seen = new Set<string>();
  const allEmails: string[] = [];
  if (adminEmailRaw) {
    allEmails.push(adminEmailRaw);
    seen.add(adminEmailRaw);
  }
  for (const email of memberEmails) {
    const norm = email.toLowerCase().trim();
    if (seen.has(norm)) continue;
    seen.add(norm);
    allEmails.push(norm);
  }

  const entries: DirectoryEntry[] = [];
  for (const email of allEmails) {
    const profile = await getProfile(email).catch(() => null);
    const displayName = profile?.displayName?.trim();
    if (!displayName) continue;
    const token = mentionTokenFor(displayName);
    if (!token) continue;

    const admin = isAdmin(email);
    const member = admin ? null : await getMember(email).catch(() => null);

    entries.push({
      displayName,
      mentionToken: token,
      isAdmin: admin,
      isSelf: email === callerEmail,
      founderSlot: getFounderSlot(member),
      charterSlot: getCharterSlot(member),
      tierBadge: getTierBadge(member),
    });
  }

  entries.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    })
  );

  return Response.json(
    { ok: true, members: entries },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
