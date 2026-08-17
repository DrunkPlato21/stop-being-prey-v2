import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import {
  getBout,
  getTileReactions,
  listTiles,
  listWhispers,
  TILE_TYPE_LABEL,
  type ArenaTile,
  type ArenaWhisper,
} from "@/lib/arena";
import { formatGuildBody, GUILD_BODY_STYLE } from "@/components/guild/format-body";
import { TileEngage } from "@/components/arena/TileEngage";
import { ArenaBench } from "@/components/arena/ArenaBench";
import { setBoutStatusAction } from "../actions";

export const metadata: Metadata = { title: "The Arena" };
export const dynamic = "force-dynamic";

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
  if (!session) {
    redirect(`/notes/sign-in?next=/arena/${id}`);
  }

  const bout = await getBout(id);
  if (!bout) notFound();

  const admin = isAdmin(session.email);
  const tiles = await listTiles(id);
  const [reactions, whispers] = await Promise.all([
    Promise.all(tiles.map((t) => getTileReactions(t.id, session.email))),
    admin
      ? Promise.all(tiles.map((t) => listWhispers(t.id)))
      : Promise.resolve(tiles.map(() => [] as ArenaWhisper[])),
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
            {bout.status === "open" ? "Open" : "Sealed"}
          </span>
        </div>
        <h1 className="arena-title">{bout.title}</h1>
        <div className="arena-meta">
          {bout.tileCount} {bout.tileCount === 1 ? "tile" : "tiles"} &middot;
          full transcripts on file
        </div>
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
                <div>
                  {tile.moves.map((m) => (
                    <span key={m} className="arena-move-tag">
                      {m}
                    </span>
                  ))}
                </div>
              )}
              <TileEngage
                tileId={tile.id}
                counts={reactions[i].counts}
                mine={reactions[i].mine}
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

      {bout.status === "sealed" && (
        <div className="arena-seal">
          <div className="mark">&#10022; SEALED &#10022;</div>
          <div>This bout is part of the record.</div>
          {bout.sealedAt && <div className="when">{stamp(bout.sealedAt)}</div>}
        </div>
      )}

      {admin && (
        <>
          <ArenaBench boutId={bout.id} />
          <div className="arena-tools" style={{ marginTop: 14 }}>
            <form action={setBoutStatusAction}>
              <input type="hidden" name="boutId" value={bout.id} />
              <input
                type="hidden"
                name="status"
                value={bout.status === "open" ? "sealed" : "open"}
              />
              <button type="submit" className="arena-seal-btn">
                {bout.status === "open" ? "Seal the bout" : "Reopen the bout"}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
