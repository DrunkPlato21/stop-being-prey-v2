import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  getProfilesByEmails,
  isAdmin,
  isApproved,
  listCommentsForSlug,
} from "@/lib/comments";
import {
  ARENA_MAX_ARCHETYPE,
  ARENA_MAX_RULES,
  boutHref,
  getBoutByParam,
  getBoutSource,
  getPublicBoutView,
  getTileReactions,
  isBoutPublic,
  listTiles,
  listTileReactors,
  listWhispers,
  nextCaseNo,
  TILE_TYPE_LABEL,
  type ArenaTile,
  type ArenaWhisper,
  tileImages,
} from "@/lib/arena";
import {
  ARENA_LIVE_WINDOW_MS,
  showsPostedLive,
  carriesTheirWords,
  tileTypeLabel,
  CASE_KIND_LABEL,
  type ArenaCaseKind,
  ARENA_MAX_SOURCE_URL,
  caseNoStr,
  ARENA_TZ,
} from "@/lib/arena-constants";
import { REACTION_EMOJI, type ReactionKey } from "@/lib/lounge";
import { markNavViewed } from "@/lib/nav-dots";
import { RULE_ROMAN, RULE_SHORT_LABEL } from "@/lib/case-files";
import { formatGuildBody, GUILD_BODY_STYLE } from "@/components/guild/format-body";
import { TileEngage } from "@/components/arena/TileEngage";
import { BoutFollowToggle } from "@/components/arena/ArenaMailToggle";
import { isFollowingBout } from "@/lib/arena-watch";
import { MoveChip } from "@/components/arena/MoveChip";
import { Comments } from "@/components/Comments";
import { ShareButtons } from "@/components/ShareButtons";
import { ArenaBench } from "@/components/arena/ArenaBench";
import { TileAdminTools } from "@/components/arena/TileAdminTools";
import { DeleteBoutButton } from "@/components/arena/DeleteBoutButton";
import { BoutLiveRefresh } from "@/components/arena/BoutLiveRefresh";
import {
  reopenBoutAction,
  sealBoutAction,
  setBoutPublicAction,
  setBoutSourceAction,
  updateBoutStampAction,
} from "../actions";

export const dynamic = "force-dynamic";

// Members see every bout; anonymous readers see only bouts Clay has
// deliberately made public (sealed, promotional). Public pages get real
// metadata so the shared link carries a title on social cards.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const bout = await getBoutByParam(id);
  if (bout && isBoutPublic(bout)) {
    return {
      title: bout.title,
      description: bout.caseNo
        ? `Case № ${caseNoStr(bout.caseNo)} from the Arena. A real fight, broken down move by move.`
        : "A real fight from the Arena, broken down move by move.",
      // The case has one address: the slug. Reached by id (an old link,
      // a member coming from the index), the page still points search
      // engines and shares at the readable one.
      alternates: { canonical: boutHref(bout) },
    };
  }
  return { title: "The Arena" };
}

// One bout: the fight as it unfolded, tile by tile. Clay's tools (the
// tile composer, the seal) render only for him, beneath the bout —
// members see a broadcast, he sees the workshop bench.

function stamp(ms: number): string {
  return new Date(ms)
    .toLocaleString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: ARENA_TZ,
    })
    .toUpperCase();
}

// A pasted share URL is mostly tracking tail. The bench shows the part
// that tells him which fight it was — host plus path — and lets the
// anchor carry the rest. Falls back to the raw string: this only ever
// renders a value that already passed the http(s) check on write, but a
// label helper has no business throwing either way.
function sourceLabel(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    const path = pathname === "/" ? "" : pathname;
    const label = `${host}${path}`;
    return label.length > 58 ? `${label.slice(0, 57)}…` : label;
  } catch {
    return url;
  }
}

function fileDate(ms: number): string {
  return new Date(ms)
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: ARENA_TZ,
    })
    .toUpperCase();
}

// The rules a case turned on, as links rather than as a number. The
// field is free text so the bench stays one box to type "1, 5" into,
// and the numbers are pulled back out here: a reader who does not yet
// know Rule V by heart gets its name and a way to go read it, which is
// the whole reason the doctrine and the record live on one site. The
// old markdown case files did exactly this and the Arena had lost it.
// A field with no rule number in it at all is printed as typed, so a
// note in the box is never swallowed. A number outside 1-7 mixed in
// with good ones is dropped, which is the right call for a typo when
// there are only seven rules to pick from.
function rulesFrom(raw: string | null): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  for (const m of raw.matchAll(/\d+/g)) {
    const n = Number(m[0]);
    if (n >= 1 && n <= RULE_ROMAN.length) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

function RulesApplied({ raw }: { raw: string | null }) {
  const rules = rulesFrom(raw);
  if (rules.length === 0) {
    return raw ? (
      <div className="arena-rules-line">Rules applied: {raw}</div>
    ) : null;
  }
  return (
    <div className="arena-rules-line">
      <span className="lead">Rules applied</span>
      {rules.map((n) => (
        <Link key={n} href={`/rules#rule-${n}`}>
          Rule {RULE_ROMAN[n - 1]} &middot; {RULE_SHORT_LABEL[n]}
        </Link>
      ))}
    </div>
  );
}

// Plain <img> for tile shots on purpose: Blob URLs on a member-only
// page; next/image transforms would bill per unique screenshot for an
// audience of members.
function TileShots({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  // Every shot gets the full column, however many there are. These are
  // documents: a screenshot of a comment is there to be READ, so it is
  // never cropped to fit a cell and never shrunk to share a row.
  return (
    <div className="arena-tile-shots">
      {urls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          className="arena-tile-img"
          src={url}
          alt={urls.length > 1 ? `Screenshot ${i + 1} of ${urls.length}` : "Screenshot"}
        />
      ))}
    </div>
  );
}

function TileBody({
  tile,
  kind,
}: {
  tile: ArenaTile;
  kind: ArenaCaseKind;
}) {
  if (carriesTheirWords(tile.type)) {
    // Say it once. A specimen can carry three copies of the same
    // sentence — the screenshot, the body, and the transcript — which is
    // right for a forty-reply thread (proof, the line being dissected,
    // the full record) and pure stutter for a single post, which is most
    // of them. So: with a screenshot, the picture is the proof and the
    // words move into the fold beneath it. Without one, the words are
    // all there is, so they lead. The text is never dropped either way —
    // it is what stays searchable, readable to a screen reader, and
    // legible after the image URL rots.
    const shots = tileImages(tile);
    const hasShot = shots.length > 0;
    const folded = hasShot ? tile.transcript || tile.body : tile.transcript;
    const showFold =
      !!folded &&
      folded.trim().length > 0 &&
      (hasShot || folded.trim() !== tile.body.trim());
    return (
      <>
        <div className="arena-shot">
          <TileShots urls={shots} />
          {tile.handle && <div className="arena-shot-handle">{tile.handle}</div>}
          {!hasShot && <div className="arena-shot-body">{tile.body}</div>}
        </div>
        {showFold && (
          <details className="arena-transcript">
            <summary>Full transcript</summary>
            <div className="arena-transcript-body">{folded}</div>
          </details>
        )}
      </>
    );
  }
  if (tile.type === "counter") {
    // The counter is Clay's own line, and he writes with emphasis:
    // same tiny markdown subset as the Guild (**bold**, *italic*),
    // so a posted reply keeps its weight instead of showing asterisks.
    // Say it once, the same rule the specimen follows: with a
    // screenshot, the picture is the proof and the words move into the
    // fold beneath it, because a counter shot is a picture of the very
    // sentence Clay typed and printing both reads it to you twice.
    // Without one, the line is all there is, so it leads. The text is
    // never dropped either way - it is what stays searchable, readable
    // to a screen reader, and legible after the image URL rots.
    const line = (
      <div className="arena-counter-line">
        &ldquo;{formatGuildBody(tile.body)}&rdquo;
      </div>
    );
    const counterShots = tileImages(tile);
    return (
      <>
        {counterShots.length > 0 ? <TileShots urls={counterShots} /> : line}
        {showsPostedLive(kind) && (
          <div className="arena-byline">Clay &middot; posted live</div>
        )}
        {counterShots.length > 0 && (
          <details className="arena-transcript">
            <summary>Full text</summary>
            {line}
          </details>
        )}
      </>
    );
  }
  return (
    <>
      <div style={GUILD_BODY_STYLE}>{formatGuildBody(tile.body)}</div>
      <TileShots urls={tileImages(tile)} />
    </>
  );
}

// Whispers are private to Clay, and the point of one is usually "who
// is this, and do they know what they're talking about". A raw email
// answers neither, so the name he'd recognize from the Lounge and the
// Guild leads, with the email under it for the members who never set
// one (and for when he needs to reply outside the room).
// Who reacted, for Clay alone. The room sees a count; this is the
// register behind it. Grouped by reaction rather than listed per
// person, because the question he actually has is "who laughed at
// this one" - one line per emoji answers it at a glance, where a
// name-then-emoji list makes him scan. Falls back to the email only
// when a member has never set a display name.
function AdminReactors({
  reactors,
  names,
}: {
  reactors: { email: string; key: ReactionKey }[];
  names: Map<string, string | null>;
}) {
  if (reactors.length === 0) return null;
  const byKey = new Map<ReactionKey, string[]>();
  for (const r of reactors) {
    const who = names.get(r.email.toLowerCase()) ?? r.email;
    byKey.set(r.key, [...(byKey.get(r.key) ?? []), who]);
  }
  return (
    <div className="arena-reactedby">
      {Array.from(byKey.entries()).map(([key, who]) => (
        <div key={key} className="row">
          <span className="emoji" aria-hidden="true">
            {REACTION_EMOJI[key]}
          </span>
          <span className="who">{who.join(", ")}</span>
        </div>
      ))}
    </div>
  );
}

function AdminWhispers({
  whispers,
  names,
}: {
  whispers: ArenaWhisper[];
  names: Map<string, string | null>;
}) {
  if (whispers.length === 0) return null;
  return (
    <div>
      {whispers.map((w, i) => {
        const name = names.get(w.email.toLowerCase()) ?? null;
        return (
          <div key={i} className="arena-whisper-quote">
            <div>{w.body}</div>
            <div className="who">
              {name && <b>{name}</b>}
              {name ? " · " : ""}
              {w.email} &middot; {stamp(w.createdAt)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function BoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ renumbered?: string; taken?: string; filed?: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  // Two read paths on purpose. Members get the live record (their own
  // reaction has to be theirs, and Clay's bench has to show what he
  // just posted). Anonymous readers get the cached public view: this
  // is the shared link, the one strangers and crawlers land on, and it
  // costs the same whether one of them arrives or a thousand.
  const publicView = session ? null : await getPublicBoutView(id);
  const bout = publicView?.bout ?? (await getBoutByParam(id));
  if (!bout) notFound();

  // Anonymous readers pass only on a deliberately-public sealed bout;
  // everything else redirects to sign-in as before.
  if (!session && !isBoutPublic(bout)) {
    redirect(`/notes/sign-in?next=/arena/${id}`);
  }

  const anon = !session;
  const admin = session ? isAdmin(session.email) : false;
  // Reading a bout counts as reading the room. The index was the only
  // surface that cleared the nav dot, so a member who arrived here from
  // the bell or the Sunday digest could read the whole filed case and
  // still carry the dot afterwards, with nothing left to go and see.
  // The case files and field notes have always marked from their detail
  // pages; this brings the Arena in line. Fire-and-forget: a failed
  // write costs a stale dot, never the page.
  if (session) {
    void markNavViewed("arena", session.email).catch(() => null);
  }
  const sealed = bout.status === "sealed";
  // Offered on an open bout only: the seal is the one thing that mails
  // followers, so a button on a filed case would promise an email that
  // can never arrive. Anonymous preview readers have no inbox we know
  // of and no session to hang a follow on.
  const following =
    !sealed && session
      ? await isFollowingBout(bout.id, session.email).catch(() => false)
      : false;
  // Set when the case-number register had to move the stamp Clay typed.
  const stampNote = admin ? await searchParams : {};
  const renumberedFrom = stampNote.renumbered;
  const numberTaken = stampNote.taken;
  // Same time-honest badge as the index: LIVE while the breakdown
  // moved inside the window, OPEN after, never a stale LIVE.
  const liveNow =
    !sealed &&
    bout.kind === "bout" &&
    Date.now() - bout.lastTileAt < ARENA_LIVE_WINDOW_MS;
  // Public readers only see the comments sheet when there's real member
  // discussion on it (social proof). An empty sheet would be a glowing
  // blank rectangle whose only content is a second membership pitch —
  // the "Take a seat" block below stays the single pitch instead.
  const showCommons =
    sealed &&
    (!anon ||
      (await listCommentsForSlug("case-file", bout.id)).filter(isApproved)
        .length > 0);
  const tiles = publicView?.tiles ?? (await listTiles(bout.id));

  const [reactions, whispers, reactors, defaultCaseNo, source] = await Promise.all([
    publicView
      ? Promise.resolve(publicView.reactions)
      : Promise.all(
          tiles.map((t) => getTileReactions(t.id, session?.email ?? null))
        ),
    admin
      ? Promise.all(tiles.map((t) => listWhispers(t.id)))
      : Promise.resolve(tiles.map(() => [] as ArenaWhisper[])),
    // The register behind the counts, his eyes only. A member's render
    // never asks for it, the same rule the whispers follow.
    admin
      ? Promise.all(tiles.map((t) => listTileReactors(t.id)))
      : Promise.resolve(
          tiles.map(() => [] as { email: string; key: ReactionKey }[])
        ),
    admin && !sealed
      ? bout.caseNo ?? nextCaseNo()
      : Promise.resolve(null),
    // Provenance, and only ever for him: a member's render never asks
    // Redis for this key at all.
    admin ? getBoutSource(bout.id) : Promise.resolve(null),
  ]);

  // One batched read for everyone who whispered or reacted anywhere on
  // the bout, so a tile with five of each doesn't cost ten profile
  // lookups. Both lists read from the same map.
  const whisperNames = admin
    ? new Map(
        Array.from(
          (
            await getProfilesByEmails([
              ...whispers.flat().map((w) => w.email),
              ...reactors.flat().map((r) => r.email),
            ]).catch(() => new Map())
          ).entries()
        ).map(([email, profile]) => [
          email,
          (profile as { displayName?: string } | null)?.displayName ?? null,
        ])
      )
    : new Map<string, string | null>();
  // What's waiting for him, and where: a count at the head of the bout
  // beats scrolling eight tiles to find out whether anyone whispered.
  const whisperTiles = whispers
    .map((list, i) => ({ n: i + 1, count: list.length }))
    .filter((t) => t.count > 0);
  const whisperTotal = whisperTiles.reduce((sum, t) => sum + t.count, 0);

  // Where the fight came from. Rendered on the bench in both states —
  // open, because the link usually turns up after the bout does; sealed,
  // because that is when he goes looking for it again. One definition,
  // used twice, so the two can never drift apart.
  const sourceTools = (
    <div className="arena-source">
      <h3>Where it came from</h3>
      <form action={setBoutSourceAction}>
        <input type="hidden" name="boutId" value={bout.id} />
        <input
          name="sourceUrl"
          type="url"
          maxLength={ARENA_MAX_SOURCE_URL}
          defaultValue={source?.url ?? ""}
          placeholder="Link to the original post"
        />
        <input
          name="archiveUrl"
          type="url"
          maxLength={ARENA_MAX_SOURCE_URL}
          defaultValue={source?.archiveUrl ?? ""}
          placeholder="Archive copy (optional — for when the original goes)"
        />
        <button type="submit" className="submit">
          {source ? "Update the link" : "Save the link"}
        </button>
      </form>
      {source ? (
        <p className="arena-source-note">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="arena-source-link"
          >
            {sourceLabel(source.url)}
          </a>
          {source.archiveUrl && (
            <>
              {" · "}
              <a
                href={source.archiveUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="arena-source-link"
              >
                archived copy
              </a>
            </>
          )}
          <br />
          Caught {fileDate(source.capturedAt)}. Yours only — never
          rendered for members, never in the Sunday email.
        </p>
      ) : (
        <p className="arena-source-note">
          No link on file. The transcript stays the record; this is only
          the way back to where it happened.
        </p>
      )}
    </div>
  );

  return (
    <div className="arena-wrap">
      {/* The way out, dressed as navigation rather than as a label —
          the same step-back the Arsenal's move page gives. The room bar
          overhead names the two halves of the room, but it says where
          the room's indexes are, not "leave this case", and a member
          deep in a long transcript wants the one obvious tap back up.
          Preview readers get the eyebrow below instead: they have no
          room bar and no member chrome at all. */}
      {!anon && (
        <Link href="/arena" className="arena-backlink">
          <span aria-hidden="true">&larr;</span> The Record
        </Link>
      )}
      <header className="arena-bout-header">
        <div className="arena-bout-line">
          {/* The preview reader has no room bar and no backlink above,
              so the eyebrow stays for them as the one thread back out
              of the page. */}
          {anon && (
            <Link href="/arena" className="arena-eyebrow" style={{ textDecoration: "none" }}>
              The Arena
            </Link>
          )}
          <span
            className={`arena-chip ${
              liveNow ? "open" : sealed ? "sealed" : "banked"
            }`}
          >
            <span className="dot" />
            {!sealed
              ? liveNow
                ? "Live"
                : "Open"
              : bout.caseNo
                ? `Case ${caseNoStr(bout.caseNo)}`
                : "Sealed"}
          </span>
          {/* What kind of case this is, stated where the reader meets it.
              Only the post-mortem announces itself: a bout is the room's
              default and labelling it would put chrome on every case to
              distinguish the occasional one. */}
          {bout.kind !== "bout" && (
            <span className="arena-kind-tag">{CASE_KIND_LABEL[bout.kind]}</span>
          )}
        </div>
        <h1 className="arena-title">{bout.title}</h1>
        {sealed ? (
          <div className="arena-case-meta">
            {[
              bout.caseNo ? `CASE № ${caseNoStr(bout.caseNo)}` : null,
              bout.kind !== "bout"
                ? CASE_KIND_LABEL[bout.kind].toUpperCase()
                : null,
              bout.archetype ? `ARCHETYPE: ${bout.archetype}` : null,
              bout.sealedAt ? `FILED ${fileDate(bout.sealedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            <RulesApplied raw={bout.rulesApplied} />
          </div>
        ) : (
          <div className="arena-meta">
            {bout.tileCount} {bout.tileCount === 1 ? "tile" : "tiles"} &middot;
            full transcripts on file
          </div>
        )}
      </header>

      {renumberedFrom && (
        <p className="arena-renumbered">
          Case &#8470; {caseNoStr(Number(renumberedFrom))} was already on
          file. This one filed as &#8470;{" "}
          {bout.caseNo ? caseNoStr(bout.caseNo) : "—"}.
        </p>
      )}
      {numberTaken && (
        <p className="arena-renumbered">
          Case &#8470; {caseNoStr(Number(numberTaken))} belongs to another
          case, so this one kept &#8470;{" "}
          {bout.caseNo ? caseNoStr(bout.caseNo) : "—"}. Free the other one
          first if you want to swap them.
        </p>
      )}

      {admin && whisperTotal > 0 && (
        <p className="arena-whisper-tally">
          <b>
            {whisperTotal} {whisperTotal === 1 ? "whisper" : "whispers"}
          </b>{" "}
          on this bout, under{" "}
          {whisperTiles.map((t, i) => (
            <span key={t.n}>
              {i > 0 ? ", " : ""}
              <a href={`#tile-${t.n}`}>
                tile {t.n}
                {t.count > 1 ? ` (${t.count})` : ""}
              </a>
            </span>
          ))}
          . Only you can see them.
        </p>
      )}

      {!sealed && !anon && (
        <BoutLiveRefresh boutId={bout.id} version={bout.updatedAt} />
      )}

      <div className="arena-tiles">
        {tiles.map((tile, i) => (
          <div
            key={tile.id}
            id={`tile-${i + 1}`}
            className={`arena-tile ${tile.type}`}
          >
            <div className="arena-tile-no">{i + 1}</div>
            <div className="arena-tile-card">
              <div className="arena-tile-head">
                <span className="arena-eyebrow">
                  {tile.title ?? tileTypeLabel(tile.type, bout.kind)}
                </span>
                <span className="arena-stamp">{stamp(tile.createdAt)}</span>
              </div>
              <TileBody tile={tile} kind={bout.kind} />
              {tile.moves.length > 0 && (
                <div className="arena-tile-moves">
                  {tile.moves.map((m) => (
                    <MoveChip key={m} tag={m} />
                  ))}
                </div>
              )}
              <TileEngage
                tileId={tile.id}
                counts={reactions[i].counts}
                mine={reactions[i].mine}
                sealed={sealed}
                canEngage={!anon}
              />
              {admin && <TileAdminTools tile={tile} kind={bout.kind} />}
              {admin && (
                <AdminReactors reactors={reactors[i]} names={whisperNames} />
              )}
              {admin && (
                <AdminWhispers whispers={whispers[i]} names={whisperNames} />
              )}
            </div>
          </div>
        ))}

        {bout.status === "open" && (
          <div className="arena-developing">
            <span className="pulse" />
            <em>
              Bout open. The verdict lands when the fight is over. You&rsquo;ll
              know.
            </em>
          </div>
        )}

        {/* "Tell me how this ends", hung off the line above it. That
            note already ends "the verdict lands when the fight is over,
            you'll know" — this button is HOW they'll know, so it
            answers that sentence rather than restating it. Kept INSIDE
            .arena-tiles so it sits in the same 46px column the note's
            text does; outside, it hung 46px further left, adrift in the
            gutter the tile numbers use. */}
        {!sealed && !anon && (
          <div className="arena-followup">
            <BoutFollowToggle initialOn={following} boutId={bout.id} />
          </div>
        )}
      </div>

      {sealed && (
        <div className="arena-seal">
          {/* just-filed rides the seal redirect: the stamp lands once,
              for the person who just sealed, never on a later visit. */}
          <div className={`mark${stampNote.filed ? " just-filed" : ""}`}>
            &#10022; SEALED &#10022;
          </div>
          <div>
            {bout.caseNo
              ? `Filed as Case № ${caseNoStr(bout.caseNo)}. Part of the record.`
              : "This bout is part of the record."}
          </div>
          {bout.sealedAt && <div className="when">{stamp(bout.sealedAt)}</div>}
        </div>
      )}

      {/* The social symmetry of the Arena: while a bout is open the
          room is Clay's and members whisper, privately, into the work.
          When it seals, whispers close and the commons opens: public,
          approval-gated comments under the filed case, rendered as a
          sheet of paper in the dark room. Nothing ever races the
          verdict. Keyed by bout id (immutable), not case number. */}
      {showCommons && (
        <section className="arena-commons">
          <p className="arena-commons-note">
            The bout is filed. The floor is open.
          </p>
          <div className="arena-commons-paper">
            <Comments kind="case-file" slug={bout.id} />
          </div>
        </section>
      )}

      {/* The conversion block, public readers only: they just read one
          finished fight; the pitch is the room where all of them
          happen. Speaks in the Arena's own voice, links the membership
          funnel with its own source tag. */}
      {anon && (
        <section className="arena-join">
          <p className="arena-join-line">You just watched one fight.</p>
          <p>
            The rest of the record is inside. Fights run live, and members
            are in the room while they happen.
          </p>
          <p>
            Send me a note mid-fight that nobody else sees. Argue with the
            verdict once it&apos;s sealed.
          </p>
          <Link href="/membership?src=arena" className="arena-join-cta">
            Take a seat
          </Link>
        </section>
      )}

      {/* Pass it on, after the ask and not before it. A stranger who has
          just finished the fight is being asked to come in; handing them
          "forward this" first spends the moment on the smaller favour.
          Members skip the pitch entirely, so for them this simply closes
          the page.

          Gated on the case being PUBLIC rather than on who
          is reading: a member handed the share row for a members-only
          bout would mint links that dead-end every recipient at the
          sign-in page. Public is the one state where the link works for
          whoever receives it, and in that state both audiences should
          have it — the member forwarding a fight is the cheapest reach
          the room has.

          The row is the site's own, so it arrives painted in paper ink
          (--ink-muted, --eye-deep) against the dark ground. The wrapper
          remaps those three tokens to the room's palette, the same move
          arena.css already makes for --ink-soft; nothing is restyled.

          The email and copy-link buttons tag themselves ?ref=share, so
          a forward lands in its own channel instead of the "direct"
          bucket where every untagged paste has been going. */}
      {isBoutPublic(bout) && (
        <div className="arena-share">
          <ShareButtons
            url={boutHref(bout)}
            title={bout.title}
            slug={bout.slug ?? bout.id}
          />
        </div>
      )}


      {admin && !sealed && (
        <>
          <ArenaBench boutId={bout.id} kind={bout.kind} />
          <div className="arena-tools" style={{ marginTop: 14 }}>
            <h2>Seal &amp; file</h2>
            <form action={sealBoutAction}>
              <input type="hidden" name="boutId" value={bout.id} />
              <div className="row">
                <label>
                  Case &#8470;
                  <br />
                  <input
                    name="caseNo"
                    type="number"
                    min={1}
                    defaultValue={defaultCaseNo ?? undefined}
                    className="arena-caseno-input"
                  />
                </label>
                <input
                  name="archetype"
                  maxLength={ARENA_MAX_ARCHETYPE}
                  defaultValue={bout.archetype ?? undefined}
                  placeholder="Archetype (The Sniper, The Moralizer...)"
                />
              </div>
              <input
                name="rulesApplied"
                maxLength={ARENA_MAX_RULES}
                defaultValue={bout.rulesApplied ?? undefined}
                placeholder="Rules applied (e.g. 1, 5)"
              />
              <input
                name="dispatch"
                maxLength={280}
                defaultValue={bout.dispatch ?? undefined}
                placeholder="One line for the Sunday email, your voice: how this one found you (optional)"
              />
              {/* The two doors out of a fight. Every bout opens looking
                  like it might end after one reply, so this cannot be
                  decided when the bout is created — only here, when he
                  knows how it went. Off the record still seals: readable,
                  linked, shareable, just not counted in the record. */}
              <label className="arena-offrecord">
                <input type="checkbox" name="offTheRecord" value="1" />
                <span>
                  Off the record. Seal it without a case number, and
                  don&apos;t ring the bell.
                </span>
              </label>
              <button type="submit" className="arena-seal-btn">
                Seal the bout. File it.
              </button>
            </form>
            {sourceTools}
            <div className="arena-danger">
              <DeleteBoutButton boutId={bout.id} />
            </div>
          </div>
        </>
      )}

      {admin && sealed && (
        <div className="arena-tools" style={{ marginTop: 14 }}>
          <h2>The stamp</h2>
          <form action={updateBoutStampAction}>
            <input type="hidden" name="boutId" value={bout.id} />
            <input
              name="title"
              maxLength={120}
              defaultValue={bout.title}
              placeholder="Title. Name the fight."
            />
            <div className="row">
              <label>
                Case &#8470;
                <br />
                <input
                  name="caseNo"
                  type="number"
                  min={1}
                  defaultValue={bout.caseNo ?? undefined}
                  className="arena-caseno-input"
                />
              </label>
              <input
                name="archetype"
                maxLength={ARENA_MAX_ARCHETYPE}
                defaultValue={bout.archetype ?? ""}
                placeholder="Archetype (The Sniper, The Moralizer...)"
              />
            </div>
            <input
              name="rulesApplied"
              maxLength={ARENA_MAX_RULES}
              defaultValue={bout.rulesApplied ?? ""}
              placeholder="Rules applied (e.g. 1, 5)"
            />
            <input
              name="dispatch"
              maxLength={280}
              defaultValue={bout.dispatch ?? ""}
              placeholder="One line for the Sunday email, your voice: how this one found you (optional)"
            />
            <button type="submit" className="submit">
              Save the stamp
            </button>
          </form>
          <p className="arena-public-note">
            Tiles stay fixable after the seal. Use Edit on any tile above.
            Adding a NEW tile still needs a reopen, because that changes
            what the case says.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <form action={reopenBoutAction}>
              <input type="hidden" name="boutId" value={bout.id} />
              <button type="submit" className="arena-seal-btn">
                Reopen the bout
              </button>
            </form>
            <form action={setBoutPublicAction}>
              <input type="hidden" name="boutId" value={bout.id} />
              <input
                type="hidden"
                name="public"
                value={bout.publicAt ? "" : "1"}
              />
              <button type="submit" className="arena-seal-btn">
                {bout.publicAt ? "Take it private" : "Make it public"}
              </button>
            </form>
          </div>
          {bout.publicAt ? (
            <p className="arena-public-note">
              Public. Anyone with the link can read this case; the rest
              of the Arena stays members-only. Reopening takes it
              private again.
              <br />
              <span className="arena-public-link">
                stopbeingprey.com{boutHref(bout)}
              </span>
            </p>
          ) : (
            <p className="arena-public-note">
              Members-only. Make it public to use this case as the free
              sample: the link becomes shareable, readers get a seat
              pitch at the end.
            </p>
          )}
          {sourceTools}
          <div className="arena-danger">
            <DeleteBoutButton boutId={bout.id} />
          </div>
        </div>
      )}
    </div>
  );
}
