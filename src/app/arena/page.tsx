import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { listBouts, type ArenaBout } from "@/lib/arena";
import { ARENA_LIVE_WINDOW_MS, caseNoStr } from "@/lib/arena-constants";
import { markNavViewed } from "@/lib/nav-dots";
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

function relative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${Math.max(1, min)}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return dateStr(ms);
}


// Open bouts: the slab. LIVE with a pulse while the breakdown is
// moving, OPEN after; relative time so freshness reads at a glance.
function OpenRows({ bouts, now }: { bouts: ArenaBout[]; now: number }) {
  return (
    <>
      {bouts.map((bout) => {
        const live = now - bout.lastTileAt < ARENA_LIVE_WINDOW_MS;
        return (
          <Link
            key={bout.id}
            href={`/arena/${bout.id}`}
            className={`arena-bout-row slab${live ? " live" : ""}`}
          >
            <span className={`arena-chip ${live ? "open" : "sealed"}`}>
              <span className="dot" />
              {live ? "Live" : "Open"}
            </span>
            <div className="row-title">{bout.title}</div>
            <div className="arena-meta">
              {bout.tileCount === 0
                ? `opened ${relative(bout.createdAt, now)}`
                : `${bout.tileCount} ${bout.tileCount === 1 ? "tile" : "tiles"} · ${relative(bout.lastTileAt, now)}`}
            </div>
          </Link>
        );
      })}
    </>
  );
}

// Filed cases: the drawer. Same stamp-plate grammar as the Arsenal
// wall, so the whole room speaks one language.
function CaseRows({ bouts, admin }: { bouts: ArenaBout[]; admin: boolean }) {
  return (
    <>
      {bouts.map((bout) => (
        <Link
          key={bout.id}
          href={`/arena/${bout.id}`}
          className="arsenal-plate case"
        >
          <span className="arsenal-stampblock">
            <span aria-hidden="true" className="mk">
              &#10022;
            </span>
            <span className="num">
              CASE
              <b>{bout.caseNo ? caseNoStr(bout.caseNo) : "—"}</b>
            </span>
          </span>
          <span className="arsenal-platebody">
            <span className="row-title">{bout.title}</span>
            <span className="arena-meta" style={{ display: "block", marginTop: 4 }}>
              {[
                bout.archetype,
                bout.sealedAt ? `filed ${dateStr(bout.sealedAt)}` : null,
                `${bout.tileCount} ${bout.tileCount === 1 ? "tile" : "tiles"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
              {admin && bout.publicAt && (
                <span className="arena-public-tag">PUBLIC</span>
              )}
            </span>
          </span>
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

  const [bouts] = await Promise.all([
    listBouts(),
    // Clears the nav's new-in-the-Arena dot, same as the Guild index.
    markNavViewed("arena", session.email),
  ]);
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

      <OpenRows
        bouts={bouts.filter((b) => b.status === "open")}
        now={Date.now()}
      />

      {bouts.some((b) => b.status === "sealed") && (
        <>
          <h2 className="arena-shelf-head">The case files</h2>
          <CaseRows
            bouts={bouts
              .filter((b) => b.status === "sealed")
              .sort((a, b) => (b.caseNo ?? 0) - (a.caseNo ?? 0))}
            admin={admin}
          />
          <p className="arena-archive-link">
            Cases 001&ndash;006 predate the room.{" "}
            <Link href="/case-files">They live in the archive &rarr;</Link>
          </p>
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
