import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { ARSENAL_MOVES, MOVE_ROLE_LABEL, type MoveRole } from "@/lib/arsenal";
import { getArsenalDebutOrder, getMoveBoutCounts } from "@/lib/arena";
import { romanNumeral } from "@/lib/arena-constants";

export const metadata: Metadata = {
  title: "The Arsenal",
  description: "The moves, named.",
};

export const dynamic = "force-dynamic";

// The Arsenal index. Visibility law: a move appears the first time Clay
// tags it in a bout, never before — the site only teaches what has been
// demonstrated in the record. The full taxonomy stays loaded in the
// bench picker (and in Clay's backroom view below) as his private
// vocabulary; members watch the Arsenal fill as the record grows.

const SHELVES: MoveRole[] = ["opponent", "clay"];

// Notches cut into the plate: one per bout on record, grouped in fives
// (four strokes and a cross-stroke). Earned wear, straight off the
// record. Capped at five groups; the label always carries the true
// count.
function Notches({ count }: { count: number }) {
  const shown = Math.min(count, 25);
  const groups: number[] = [];
  for (let i = 0; i < Math.floor(shown / 5); i++) groups.push(5);
  if (shown % 5 > 0) groups.push(shown % 5);
  return (
    <span className="arsenal-notchrow">
      {groups.map((g, gi) => (
        <span key={gi} className="arsenal-notchgrp" aria-hidden="true">
          {Array.from({ length: g === 5 ? 4 : g }, (_, i) => (
            <span key={i} className="arsenal-notch" />
          ))}
          {g === 5 && <span className="arsenal-notchcross" />}
        </span>
      ))}
      <span className="arsenal-notchlabel">
        {count} {count === 1 ? "bout" : "bouts"} on record
      </span>
    </span>
  );
}

export default async function ArsenalPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/notes/sign-in?next=/arena/arsenal");
  }
  const admin = isAdmin(session.email);

  const counts = await getMoveBoutCounts(ARSENAL_MOVES.map((m) => m.slug));
  const debuted = ARSENAL_MOVES.filter((m) => (counts[m.slug] ?? 0) > 0);
  const backroom = ARSENAL_MOVES.filter((m) => (counts[m.slug] ?? 0) === 0);
  const order = await getArsenalDebutOrder(debuted.map((m) => m.slug));
  const numeralOf = (slug: string) => romanNumeral(order.indexOf(slug) + 1);

  return (
    <div className="arena-wrap">
      <header className="arena-index-header">
        <Link
          href="/arena"
          className="arena-eyebrow"
          style={{ textDecoration: "none" }}
        >
          The Arena
        </Link>
        <h1 className="arena-title">The Arsenal</h1>
        <p className="arena-index-sub">
          Every move on this wall has been used in the record. Naming it
          is half the defense.
        </p>
      </header>

      {debuted.length === 0 && (
        <p className="arena-empty">
          The wall is bare. A move earns its place the first time it
          shows up in a bout.
        </p>
      )}

      {SHELVES.map((role) => {
        const moves = debuted.filter((m) => m.role === role);
        if (moves.length === 0) return null;
        return (
          <section key={role}>
            <h2 className={`arena-shelf-head arsenal-${role}`}>
              <span aria-hidden="true">{role === "clay" ? "✦" : "◆"}</span>{" "}
              {MOVE_ROLE_LABEL[role]}
            </h2>
            {moves.map((m) => (
              <Link
                key={m.slug}
                href={`/arena/arsenal/${m.slug}`}
                className={`arsenal-plate ${m.role}`}
              >
                <span className="arsenal-stampblock">
                  <span aria-hidden="true" className="mk">
                    {m.role === "clay" ? "✦" : "◆"}
                  </span>
                  <span className="num">
                    MOVE<b>{numeralOf(m.slug)}</b>
                  </span>
                </span>
                <span className="arsenal-platebody">
                  <span className="row-title">{m.name}</span>
                  <span className="arsenal-def">
                    {m.definition.replace(/\*/g, "")}
                  </span>
                  <Notches count={counts[m.slug] ?? 0} />
                </span>
              </Link>
            ))}
          </section>
        );
      })}

      {admin && backroom.length > 0 && (
        <section className="arsenal-backroom">
          <h2 className="arena-shelf-head">
            The backroom &middot; only you see this
          </h2>
          <p className="arsenal-backroom-note">
            Drafted, not yet demonstrated. Each goes public the first
            time you tag it in a bout. Rewrite its entry in your own
            words when it debuts, if it needs it.
          </p>
          {backroom.map((m) => (
            <Link
              key={m.slug}
              href={`/arena/arsenal/${m.slug}`}
              className="arena-bout-row arsenal-row backroom"
            >
              <div className="row-title">
                <span aria-hidden="true">
                  {m.role === "clay" ? "✦" : "◆"}
                </span>{" "}
                {m.name}
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
