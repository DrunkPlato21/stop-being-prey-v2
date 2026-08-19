import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { findMove, MOVE_ROLE_LABEL } from "@/lib/arsenal";
import { boutHref, getArsenalDebutOrder, listBoutsForMove } from "@/lib/arena";
import { caseNoStr, romanNumeral } from "@/lib/arena-constants";
import {
  formatGuildBody,
  GUILD_BODY_STYLE,
} from "@/components/guild/format-body";

export const dynamic = "force-dynamic";

// One move's page: the Library entry (definition, mechanism, counter)
// over "Seen in the record" — every bout the move has been tagged in,
// fed automatically by the bench. The entry text is canon from
// one-shot-db; nothing here edits it.

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

  return (
    <div className="arena-wrap">
      <header className="arena-bout-header">
        <div className="arena-bout-line">
          <Link
            href="/arena/arsenal"
            className="arena-eyebrow"
            style={{ textDecoration: "none" }}
          >
            The Arsenal
          </Link>
          <span className={`arena-chip-move ${move.role}`}>
            <span aria-hidden="true" className="mark">
              {move.role === "clay" ? "✦" : "◆"}
            </span>
            {MOVE_ROLE_LABEL[move.role]}
          </span>
          {debutIdx >= 0 && (
            <span className="arsenal-stamp-inline">
              MOVE {romanNumeral(debutIdx + 1)}
            </span>
          )}
        </div>
        <h1 className="arena-title">{move.name}</h1>
        {move.status && <div className="arena-meta">{move.status}</div>}
      </header>

      <div className="arsenal-entry">
        <section>
          <h2 className="arena-shelf-head">What it is</h2>
          <div style={GUILD_BODY_STYLE}>{formatGuildBody(move.definition)}</div>
        </section>
        {move.mechanism && (
          <section>
            <h2 className="arena-shelf-head">How it works</h2>
            <div style={GUILD_BODY_STYLE}>{formatGuildBody(move.mechanism)}</div>
          </section>
        )}
        {move.counterMove && move.role === "opponent" && (
          <section>
            <h2 className="arena-shelf-head">The counter</h2>
            <div style={GUILD_BODY_STYLE}>
              {formatGuildBody(move.counterMove)}
            </div>
          </section>
        )}
        {move.source && <p className="arsenal-source">{move.source}</p>}
      </div>

      <section>
        <h2 className="arena-shelf-head">Seen in the record</h2>
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
            className="arena-bout-row"
          >
            <span className={`arena-chip ${bout.status}`}>
              <span className="dot" />
              {bout.status === "open"
                ? "Open"
                : bout.caseNo
                  ? `Case ${caseNoStr(bout.caseNo)}`
                  : "Sealed"}
            </span>
            <div className="row-title">{bout.title}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
