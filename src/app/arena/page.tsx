import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { listBouts, type ArenaBout } from "@/lib/arena";
import { caseNoStr } from "@/lib/arena-constants";
import { createBoutAction } from "./actions";

export const metadata: Metadata = {
  title: "The Arena",
  description: "Where the fights get broken down.",
};

export const dynamic = "force-dynamic";

// The bout index. Newest-active first; an open bout wears the live chip.
// Members read; Clay alone gets the "open a bout" tool at the foot.

function dateStr(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function BoutRows({ bouts }: { bouts: ArenaBout[] }) {
  return (
    <>
      {bouts.map((bout) => (
        <Link
          key={bout.id}
          href={`/arena/${bout.id}`}
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
          <div className="arena-meta">
            {[
              bout.status === "sealed" && bout.archetype
                ? bout.archetype
                : null,
              dateStr(bout.createdAt),
              `${bout.tileCount} ${bout.tileCount === 1 ? "tile" : "tiles"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </Link>
      ))}
    </>
  );
}

export default async function ArenaIndexPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/notes/sign-in?next=/arena");
  }

  const bouts = await listBouts();
  const admin = isAdmin(session.email);

  return (
    <div className="arena-wrap">
      <header className="arena-index-header">
        <span className="arena-eyebrow">The Arena</span>
        <h1 className="arena-title">The fights, broken down.</h1>
        <p className="arena-index-sub">
          Case files, written in front of you. React on any tile. Whisper
          when you have a better line.{" "}
          <Link href="/arena/arsenal">Browse the Arsenal &rarr;</Link>
        </p>
      </header>

      {bouts.length === 0 && (
        <p className="arena-empty">
          No bouts on the slab yet. The first fresh one opens the room.
        </p>
      )}

      <BoutRows bouts={bouts.filter((b) => b.status === "open")} />

      {bouts.some((b) => b.status === "sealed") && (
        <>
          <h2 className="arena-shelf-head">The case files</h2>
          <BoutRows
            bouts={bouts
              .filter((b) => b.status === "sealed")
              .sort((a, b) => (b.caseNo ?? 0) - (a.caseNo ?? 0))}
          />
        </>
      )}

      {admin && (
        <div className="arena-tools">
          <h2>Open a bout</h2>
          <form action={createBoutAction}>
            <input
              name="title"
              required
              maxLength={120}
              placeholder="Bout title. Name the fight."
            />
            <button type="submit" className="submit">
              Open it
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
