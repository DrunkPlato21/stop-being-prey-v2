import { listActiveMemberEmails } from "./members";
import { createForMembers } from "./notifications";
import { caseNoStr } from "./arena-constants";
import { boutHref, setBoutFlags, listTiles, type ArenaBout } from "./arena";
import {
  claimLiveEmailSlot,
  listArenaSubscribers,
  listBoutFollowers,
  releaseLiveEmailSlot,
} from "./arena-watch";
import {
  sendArenaLiveNotification,
  sendArenaSealedNotification,
} from "./arena-email";
import { signArenaToken } from "./auth";
import { baseUrl } from "./membership";

// Arena bell fan-outs. Exactly two moments per fight, by design:
// "Fresh on the slab" when the first tile lands (a bout with no tiles
// is an empty page, so creation itself stays quiet), and "Case filed"
// when it seals. Tiles in between ring nobody — the open bout page is
// the live surface, and the seal is the payoff the first row promised.
// Guarded by announcedAt/sealAnnouncedAt so a reopen-and-reseal, or a
// double-submit, never rings twice. Fan-out is synchronous like the
// essay broadcast route: fine at current member counts.
//
// EMAIL rides alongside the bell, on a different distribution:
//
//   Opened  goes to everyone who subscribed to the room. A live fight is
//           an event with a 12-hour window, and the bell only reaches a
//           member already on the site — the one person who does not need
//           telling. Capped to one send a day (claimLiveEmailSlot).
//
//   Sealed  goes ONLY to that bout's followers. A filed case is a
//           document, it keeps, and the Sunday digest already carries
//           every seal from the week. A list-wide sealed email would be
//           the third delivery of the same thing.
//
// Both are opt-in, both carry one-click unsubscribe, and both are
// best-effort: an email that fails must never cost the room its bell.
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

  await emailLiveFight(bout, skipEmail);
}

/** Per-recipient unsubscribe links. The token IS the credential: half
    the membership never signs in, and an unsubscribe that demands a
    session is not an unsubscribe. */
async function unsubLinks(
  email: string
): Promise<{ unsubUrl: string; unsubPostUrl: string }> {
  const token = await signArenaToken(email);
  const q = `token=${encodeURIComponent(token)}`;
  return {
    unsubUrl: `${baseUrl()}/arena/unsubscribe?${q}`,
    unsubPostUrl: `${baseUrl()}/api/arena/unsubscribe?${q}`,
  };
}

/**
 * Mail the room's subscribers that a fight has started.
 *
 * Separate from the bell fan-out above and deliberately quieter about
 * failure: the bell is the room's own record and must land, while a
 * missed email is a missed email. The daily slot is claimed BEFORE the
 * sends so two tiles landing together cannot both mail the list, and
 * released again if the whole batch failed, so a Resend outage costs
 * the alert rather than the day.
 */
async function emailLiveFight(
  bout: ArenaBout,
  skipEmail: string
): Promise<void> {
  try {
    const subscribers = await listArenaSubscribers();
    const skip = skipEmail.toLowerCase().trim();
    const recipients = subscribers.filter((e) => e !== skip);
    if (recipients.length === 0) return;

    if (!(await claimLiveEmailSlot())) return;

    // The opening tile names the opponent when there is one, and it is
    // the single most useful thing the subject line can carry.
    const handle =
      (await listTiles(bout.id).catch(() => [])).find((t) => t.handle)
        ?.handle ?? null;
    const boutUrl = `${baseUrl()}${boutHref(bout)}`;

    let sent = 0;
    for (const to of recipients) {
      const { unsubUrl, unsubPostUrl } = await unsubLinks(to);
      const result = await sendArenaLiveNotification({
        to,
        boutTitle: bout.title,
        handle,
        boutUrl,
        unsubUrl,
        unsubPostUrl,
      }).catch(() => ({ ok: false as const, error: "threw" }));
      if (result.ok) sent += 1;
    }
    if (sent === 0) await releaseLiveEmailSlot();
  } catch (err) {
    console.error("[arena] live email fan-out failed:", err);
  }
}

export async function announceCaseFiled(
  bout: ArenaBout,
  skipEmail: string,
  opts: { ringTheRoom?: boolean } = {}
): Promise<void> {
  // Two audiences, and only one of them is opted in.
  //
  // The room-wide row goes to every member whether they asked or not, so
  // it is spent only on a case entering the record. An off-the-record
  // seal passes ringTheRoom: false and the room hears nothing.
  //
  // The followers below are a different thing entirely and are NEVER
  // gated on that. Each of them stood on this bout and pressed a button
  // that promised them the ending. Whether Clay later decided the fight
  // was worth a case number has no bearing on a promise made to someone
  // who watched it happen, and a follow that can silently resolve to
  // nothing is worse than no follow button at all.
  const ringTheRoom = opts.ringTheRoom !== false;
  if (bout.sealAnnouncedAt) return;
  // Stamped in both paths, so this stays the idempotency guard for the
  // follower mail too: a re-seal cannot mail the same verdict twice.
  await setBoutFlags(bout.id, { sealAnnouncedAt: Date.now() });
  if (ringTheRoom) {
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

  await emailSealedToFollowers(bout, skipEmail);
}

/**
 * Mail the verdict to the people who watched the fight happen.
 *
 * No frequency cap and no room-wide list: a follow is a request for one
 * specific answer, and the answer arrives once. Someone who followed
 * three fights in a week asked for three verdicts.
 */
async function emailSealedToFollowers(
  bout: ArenaBout,
  skipEmail: string
): Promise<void> {
  try {
    const followers = await listBoutFollowers(bout.id);
    const skip = skipEmail.toLowerCase().trim();
    const recipients = followers.filter((e) => e !== skip);
    if (recipients.length === 0) return;

    const tileCount = (await listTiles(bout.id).catch(() => [])).length;
    const boutUrl = `${baseUrl()}${boutHref(bout)}`;

    for (const to of recipients) {
      const { unsubUrl, unsubPostUrl } = await unsubLinks(to);
      await sendArenaSealedNotification({
        to,
        boutTitle: bout.title,
        caseNo: bout.caseNo,
        dispatch: bout.dispatch,
        tileCount,
        boutUrl,
        unsubUrl,
        unsubPostUrl,
      }).catch(() => null);
    }
  } catch (err) {
    console.error("[arena] sealed email fan-out failed:", err);
  }
}
