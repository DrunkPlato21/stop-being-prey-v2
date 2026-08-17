import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin, isApproved, listCommentsForSlug } from "@/lib/comments";
import {
  ARENA_MAX_ARCHETYPE,
  ARENA_MAX_RULES,
  getBout,
  getTileReactions,
  isBoutPublic,
  listTiles,
  listWhispers,
  nextCaseNo,
  TILE_TYPE_LABEL,
  type ArenaTile,
  type ArenaWhisper,
} from "@/lib/arena";
import { caseNoStr } from "@/lib/arena-constants";
import { formatGuildBody, GUILD_BODY_STYLE } from "@/components/guild/format-body";
import { TileEngage } from "@/components/arena/TileEngage";
import { MoveChip } from "@/components/arena/MoveChip";
import { Comments } from "@/components/Comments";
import { ArenaBench } from "@/components/arena/ArenaBench";
import {
  reopenBoutAction,
  sealBoutAction,
  setBoutPublicAction,
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
  const bout = await getBout(id);
  if (bout && isBoutPublic(bout)) {
    return {
      title: bout.title,
      description: bout.caseNo
        ? `Case № ${caseNoStr(bout.caseNo)} from the Arena. A real fight, broken down move by move.`
        : "A real fight from the Arena, broken down move by move.",
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
    })
    .toUpperCase();
}

function fileDate(ms: number): string {
  return new Date(ms)
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

// Plain <img> for tile shots on purpose: Blob URLs on a member-only
// page; next/image transforms would bill per unique screenshot for an
// audience of members.
function TileShot({ url }: { url: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="arena-tile-img" src={url} alt="Screenshot" />;
}

function TileBody({ tile }: { tile: ArenaTile }) {
  if (tile.type === "specimen") {
    return (
      <>
        <div className="arena-shot">
          {tile.imageUrl && <TileShot url={tile.imageUrl} />}
          {tile.handle && <div className="arena-shot-handle">{tile.handle}</div>}
          <div className="arena-shot-body">{tile.body}</div>
        </div>
        {tile.transcript && (
          <details className="arena-transcript">
            <summary>Full transcript</summary>
            <div className="arena-transcript-body">{tile.transcript}</div>
          </details>
        )}
      </>
    );
  }
  if (tile.type === "counter") {
    return (
      <>
        <div className="arena-counter-line">&ldquo;{tile.body}&rdquo;</div>
        <div className="arena-byline">Clay &middot; posted live</div>
        {tile.imageUrl && <TileShot url={tile.imageUrl} />}
      </>
    );
  }
  return (
    <>
      <div style={GUILD_BODY_STYLE}>{formatGuildBody(tile.body)}</div>
      {tile.imageUrl && <TileShot url={tile.imageUrl} />}
    </>
  );
}

function AdminWhispers({ whispers }: { whispers: ArenaWhisper[] }) {
  if (whispers.length === 0) return null;
  return (
    <div>
      {whispers.map((w, i) => (
        <div key={i} className="arena-whisper-quote">
          <div>{w.body}</div>
          <div className="who">
            {w.email} &middot; {stamp(w.createdAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function BoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  const bout = await getBout(id);
  if (!bout) notFound();

  // Anonymous readers pass only on a deliberately-public sealed bout;
  // everything else redirects to sign-in as before.
  if (!session && !isBoutPublic(bout)) {
    redirect(`/notes/sign-in?next=/arena/${id}`);
  }

  const anon = !session;
  const admin = session ? isAdmin(session.email) : false;
  const sealed = bout.status === "sealed";
  // Public readers only see the comments sheet when there's real member
  // discussion on it (social proof). An empty sheet would be a glowing
  // blank rectangle whose only content is a second membership pitch —
  // the "Take a seat" block below stays the single pitch instead.
  const showCommons =
    sealed &&
    (!anon ||
      (await listCommentsForSlug("case-file", bout.id)).filter(isApproved)
        .length > 0);
  const tiles = await listTiles(id);
  const [reactions, whispers, defaultCaseNo] = await Promise.all([
    Promise.all(
      tiles.map((t) => getTileReactions(t.id, session?.email ?? null))
    ),
    admin
      ? Promise.all(tiles.map((t) => listWhispers(t.id)))
      : Promise.resolve(tiles.map(() => [] as ArenaWhisper[])),
    admin && !sealed
      ? bout.caseNo ?? nextCaseNo()
      : Promise.resolve(null),
  ]);

  return (
    <div className="arena-wrap">
      <header className="arena-bout-header">
        <div className="arena-bout-line">
          <Link href="/arena" className="arena-eyebrow" style={{ textDecoration: "none" }}>
            The Arena
          </Link>
          <span className={`arena-chip ${bout.status}`}>
            <span className="dot" />
            {!sealed
              ? "Open"
              : bout.caseNo
                ? `Case ${caseNoStr(bout.caseNo)}`
                : "Sealed"}
          </span>
        </div>
        <h1 className="arena-title">{bout.title}</h1>
        {sealed ? (
          <div className="arena-case-meta">
            {[
              bout.caseNo ? `CASE № ${caseNoStr(bout.caseNo)}` : null,
              bout.archetype ? `ARCHETYPE: ${bout.archetype}` : null,
              bout.rulesApplied ? `RULES APPLIED: ${bout.rulesApplied}` : null,
              bout.sealedAt ? `FILED ${fileDate(bout.sealedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        ) : (
          <div className="arena-meta">
            {bout.tileCount} {bout.tileCount === 1 ? "tile" : "tiles"} &middot;
            full transcripts on file
          </div>
        )}
      </header>

      <div className="arena-tiles">
        {tiles.map((tile, i) => (
          <div key={tile.id} className={`arena-tile ${tile.type}`}>
            <div className="arena-tile-no">{i + 1}</div>
            <div className="arena-tile-card">
              <div className="arena-tile-head">
                <span className="arena-eyebrow">{TILE_TYPE_LABEL[tile.type]}</span>
                <span className="arena-stamp">{stamp(tile.createdAt)}</span>
              </div>
              <TileBody tile={tile} />
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
              {admin && <AdminWhispers whispers={whispers[i]} />}
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
      </div>

      {sealed && (
        <div className="arena-seal">
          <div className="mark">&#10022; SEALED &#10022;</div>
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
          <div className="arena-eyebrow">You just watched one fight</div>
          <p>
            This is how predators argue, and how you stop being prey.
            Members are in the room for every bout: live, move by move,
            verdict on file.
          </p>
          <Link href="/membership?src=arena" className="arena-join-cta">
            Take a seat
          </Link>
        </section>
      )}

      {admin && !sealed && (
        <>
          <ArenaBench boutId={bout.id} />
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
              <button type="submit" className="arena-seal-btn">
                Seal the bout. File it.
              </button>
            </form>
          </div>
        </>
      )}

      {admin && sealed && (
        <div className="arena-tools" style={{ marginTop: 14 }}>
          <div className="row">
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
            </p>
          ) : (
            <p className="arena-public-note">
              Members-only. Make it public to use this case as the free
              sample: the link becomes shareable, readers get a seat
              pitch at the end.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
