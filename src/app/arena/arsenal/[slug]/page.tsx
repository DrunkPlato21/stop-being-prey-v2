import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { findMove, MOVE_ROLE_LABEL } from "@/lib/arsenal";
import { boutHref, getArsenalDebutOrder, listBoutsForMove } from "@/lib/arena";
import {
  ARENA_LIVE_WINDOW_MS,
  caseNoStr,
  romanNumeral,
} from "@/lib/arena-constants";
import {
  formatGuildBody,
  GUILD_BODY_STYLE,
} from "@/components/guild/format-body";

export const dynamic = "force-dynamic";

// One move, up close.
//
// The wall mounts every move on the same plate — screws, stamp block,
// notches. This page is that plate taken down and read: the same
// mounting, enlarged, holding the entry (definition, mechanism, counter)
// as a spec sheet instead of a stack of loose paragraphs separated by
// full-width rules. Underneath sits "Seen in the record", every bout the
// move has been tagged in, fed automatically by the bench and dressed in
// the same case plates as the drawer on the index — so the way out of
// this page looks like the way in.
//
// The entry text is canon from one-shot-db; nothing here edits it.

function dateStr(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const move = findMove(slug);
  return { title: move ? move.name : "The Arsenal" };
}

export default async function MovePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect(`/notes/sign-in?next=/arena/arsenal/${slug}`);
  }

  const move = findMove(slug);
  if (!move) notFound();

  const admin = isAdmin(session.email);
  const bouts = await listBoutsForMove(move.slug);
  // Visibility law: a move is public only once it has appeared in a
  // bout. Until then it exists solely in Clay's backroom.
  if (bouts.length === 0 && !admin) notFound();

  const order =
    bouts.length > 0 ? await getArsenalDebutOrder([move.slug]) : [];
  const debutIdx = order.indexOf(move.slug);
  const mark = move.role === "clay" ? "✦" : "◆";
  const now = Date.now();

  return (
    <div className="arena-wrap">
      <Link href="/arena/arsenal" className="arena-backlink">
        <span aria-hidden="true">&larr;</span> All moves
      </Link>

      <article className={`arsenal-card ${move.role}`}>
        <header className="arsenal-card-head">
          <span className="arsenal-card-stamp">
            <span aria-hidden="true" className="mk">
              {mark}
            </span>
            {debutIdx >= 0 ? `Move ${romanNumeral(debutIdx + 1)}` : "Undebuted"}
          </span>
          <span className="arsenal-card-role">
            {MOVE_ROLE_LABEL[move.role]}
          </span>
        </header>

        <div className="arsenal-card-title">
          <h1 className="arena-title">{move.name}</h1>
          {move.status && (
            <p className="arsenal-card-status">{move.status}</p>
          )}
        </div>

        <dl className="arsenal-card-rows">
          <div className="arsenal-def-row">
            <dt className="label">What it is</dt>
            <dd className="body" style={GUILD_BODY_STYLE}>
              {formatGuildBody(move.definition)}
            </dd>
          </div>
          {move.mechanism && (
            <div className="arsenal-def-row">
              <dt className="label">How it works</dt>
              <dd className="body" style={GUILD_BODY_STYLE}>
                {formatGuildBody(move.mechanism)}
              </dd>
            </div>
          )}
          {move.counterMove && move.role === "opponent" && (
            <div className="arsenal-def-row counter">
              <dt className="label">The counter</dt>
              <dd className="body" style={GUILD_BODY_STYLE}>
                {formatGuildBody(move.counterMove)}
              </dd>
            </div>
          )}
        </dl>

        {move.source && (
          <footer className="arsenal-card-foot">{move.source}</footer>
        )}
      </article>

      <section>
        <h2 className="arena-shelf-head">
          Seen in the record
          {bouts.length > 0 && (
            <span className="n">
              {bouts.length} {bouts.length === 1 ? "bout" : "bouts"}
            </span>
          )}
        </h2>
        {bouts.length === 0 && (
          <p className="arena-empty">
            Still in the backroom. It goes public the first time you tag
            it in a bout.
          </p>
        )}
        {bouts.map((bout) => (
          <Link
            key={bout.id}
            href={boutHref(bout)}
            className={`arsenal-plate case${
              bout.status === "open" &&
              now - bout.lastTileAt < ARENA_LIVE_WINDOW_MS
                ? " live"
                : ""
            }`}
          >
            <span className="arsenal-stampblock">
              <span aria-hidden="true" className="mk">
                &#10022;
              </span>
              <span className="num">
                {bout.status === "open" ? (
                  <>
                    ON THE
                    <b>SLAB</b>
                  </>
                ) : (
                  <>
                    CASE
                    <b>{bout.caseNo ? caseNoStr(bout.caseNo) : "—"}</b>
                  </>
                )}
              </span>
            </span>
            <span className="arsenal-platebody">
              <span className="row-title">{bout.title}</span>
              <span
                className="arena-meta"
                style={{ display: "block", marginTop: 4 }}
              >
                {[
                  bout.archetype,
                  bout.sealedAt ? `filed ${dateStr(bout.sealedAt)}` : null,
                  `${bout.tileCount} ${bout.tileCount === 1 ? "tile" : "tiles"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
