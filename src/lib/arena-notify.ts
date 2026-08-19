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

export async function announceBoutOpened(
  bout: ArenaBout,
  skipEmail: string
): Promise<void> {
  if (bout.announcedAt) return;
  // Claim first so a concurrent tile post can't double-ring.
  await setBoutFlags(bout.id, { announcedAt: Date.now() });
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
}

export async function announceCaseFiled(
  bout: ArenaBout,
  skipEmail: string
): Promise<void> {
  if (bout.sealAnnouncedAt) return;
  await setBoutFlags(bout.id, { sealAnnouncedAt: Date.now() });
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
}
