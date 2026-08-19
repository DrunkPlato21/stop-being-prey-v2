import { listActiveMemberEmails } from "./members";
import { createForMembers } from "./notifications";
import { caseNoStr } from "./arena-constants";
import { boutHref, setBoutFlags, type ArenaBout } from "./arena";

// Arena bell fan-outs. Exactly two moments per fight, by design:
// "Fresh on the slab" when the first tile lands (a bout with no tiles
// is an empty page, so creation itself stays quiet), and "Case filed"
// when it seals. Tiles in between ring nobody — the open bout page is
// the live surface, and the seal is the payoff the first row promised.
// Guarded by announcedAt/sealAnnouncedAt so a reopen-and-reseal, or a
// double-submit, never rings twice. Fan-out is synchronous like the
// essay broadcast route: fine at current member counts.
//
// The claim is written BEFORE the fan-out (a concurrent double-submit
// must never double-ring), but a fan-out that dies would otherwise
// leave the claim standing and silence the bout's one ring for good.
// So: on failure the claim is released and the error swallowed — the
// next tile post (or re-seal) simply tries the bell again. At-least-
// once for the room beats a fight nobody heard about.

export async function announceBoutOpened(
  bout: ArenaBout,
  skipEmail: string
): Promise<void> {
  if (bout.announcedAt) return;
  // Claim first so a concurrent tile post can't double-ring.
  await setBoutFlags(bout.id, { announcedAt: Date.now() });
  try {
    const emails = await listActiveMemberEmails();
    await createForMembers(
      emails,
      {
        type: "arena_bout",
        title: "Fresh on the slab",
        body: bout.title,
        linkUrl: boutHref(bout),
      },
      { skipEmail }
    );
  } catch {
    await setBoutFlags(bout.id, { announcedAt: null }).catch(() => null);
  }
}

export async function announceCaseFiled(
  bout: ArenaBout,
  skipEmail: string
): Promise<void> {
  if (bout.sealAnnouncedAt) return;
  await setBoutFlags(bout.id, { sealAnnouncedAt: Date.now() });
  try {
    const emails = await listActiveMemberEmails();
    await createForMembers(
      emails,
      {
        type: "arena_case",
        title: bout.caseNo
          ? `Case № ${caseNoStr(bout.caseNo)} is on file`
          : "A bout was sealed",
        body: bout.title,
        linkUrl: boutHref(bout),
      },
      { skipEmail }
    );
  } catch {
    await setBoutFlags(bout.id, { sealAnnouncedAt: null }).catch(() => null);
  }
}
