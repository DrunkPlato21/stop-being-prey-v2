import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { ARSENAL_MOVES, MOVE_ROLE_LABEL, type MoveRole } from "@/lib/arsenal";

export const metadata: Metadata = {
  title: "The Arsenal",
  description: "The moves, named.",
};

export const dynamic = "force-dynamic";

// The Arsenal index: the whole taxonomy, visible from day one (Clay's
// call — the entries are finished weapons, not loot to drip-feed). Two
// shelves mirroring the book: their moves in rust, his in gold. New
// moves appear here when Clay coins them upstream and re-runs
// scripts/pull-arsenal.py.

const SHELVES: MoveRole[] = ["opponent", "clay"];

export default async function ArsenalPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/notes/sign-in?next=/arena/arsenal");
  }

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
          Every move, named. Naming it is half the defense.
        </p>
      </header>

      {SHELVES.map((role) => (
        <section key={role}>
          <h2 className={`arena-shelf-head arsenal-${role}`}>
            <span aria-hidden="true">{role === "clay" ? "✦" : "◆"}</span>{" "}
            {MOVE_ROLE_LABEL[role]}
          </h2>
          {ARSENAL_MOVES.filter((m) => m.role === role).map((m) => (
            <Link
              key={m.slug}
              href={`/arena/arsenal/${m.slug}`}
              className={`arena-bout-row arsenal-row ${m.role}`}
            >
              <div className="row-title">{m.name}</div>
              <div className="arsenal-def">{m.definition}</div>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
