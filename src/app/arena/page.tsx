import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { boutHref, listBouts, type ArenaBout } from "@/lib/arena";
import {
  ARENA_LIVE_WINDOW_MS,
  CASE_KIND_LABEL,
  ARENA_MAX_SOURCE_URL,
  caseNoStr,
} from "@/lib/arena-constants";
import { markNavViewed } from "@/lib/nav-dots";
import { createBoutAction } from "./actions";
import { MoveChip } from "@/components/arena/MoveChip";

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
        // Only a bout can be live. A post-mortem dissects something that
        // already finished somewhere else, so a pulse on it would be
        // claiming heat the case does not have.
        const live =
          bout.kind === "bout" && now - bout.lastTileAt < ARENA_LIVE_WINDOW_MS;
        return (
          <Link
            key={bout.id}
            href={boutHref(bout)}
            className={`arena-bout-row slab${live ? " live" : ""}`}
          >
            {/* Banked, not sealed: this fight is still on the slab,
                it just hasn't moved in a while. */}
            <span className={`arena-chip ${live ? "open" : "banked"}`}>
              <span className="dot" />
              {live ? "Live" : "Open"}
            </span>
            <div className="row-title">
              {bout.kind !== "bout" && (
                <span className="arena-kind-tag">
                  {CASE_KIND_LABEL[bout.kind]}
                </span>
              )}
              {bout.title}
            </div>
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

// The archetype filter hides until the drawer needs it. A filter over
// four cases is chrome pretending the room is bigger than it is, and the
// room launches empty — so it stays invisible the way the Desk door does
// until there is furniture, then appears on its own.
const FILTER_MIN_CASES = 6;
const FILTER_MIN_ARCHETYPES = 3;

// Archetypes are free text typed at seal time, so the URL word is
// derived, never stored. Same shape as the bout slug: ASCII, hyphenated.
function archetypeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Filed cases: the drawer. Same stamp-plate grammar as the Arsenal
// wall, so the whole room speaks one language.
function CaseRows({ bouts, admin }: { bouts: ArenaBout[]; admin: boolean }) {
  return (
    <>
      {bouts.map((bout) => (
        <Link
          key={bout.id}
          href={boutHref(bout)}
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
            <span className="row-title">
              {bout.kind !== "bout" && (
                <span className="arena-kind-tag">
                  {CASE_KIND_LABEL[bout.kind]}
                </span>
              )}
              {bout.title}
            </span>
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
            {bout.moves.length > 0 && (
              <span className="arena-caserow-moves">
                {bout.moves.slice(0, 4).map((m) => (
                  <MoveChip key={m} tag={m} linked={false} />
                ))}
                {bout.moves.length > 4 && (
                  <span className="arena-chip-move more">
                    +{bout.moves.length - 4}
                  </span>
                )}
              </span>
            )}
          </span>
        </Link>
      ))}
    </>
  );
}

export default async function ArenaIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>;
}) {
  const sp = await searchParams;
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

  // The shelf, newest case first. NOTE: listBouts() reads the top 30, so
  // the drawer (and therefore this filter) covers the last 30 bouts. At
  // a weekly cadence that binds in about half a year; whoever raises the
  // cap should raise it here rather than let the filter quietly report
  // on a slice.
  const sealed = bouts
    .filter((b) => b.status === "sealed")
    .sort((a, b) => (b.caseNo ?? 0) - (a.caseNo ?? 0));

  const counts = new Map<string, { label: string; count: number }>();
  for (const bout of sealed) {
    const label = bout.archetype?.trim();
    if (!label) continue;
    const slug = archetypeSlug(label);
    if (!slug) continue;
    const seen = counts.get(slug);
    if (seen) seen.count += 1;
    else counts.set(slug, { label, count: 1 });
  }
  // Commonest first, so the chips a member reaches for sit leftmost.
  const archetypes = [...counts.entries()]
    .map(([slug, v]) => ({ slug, ...v }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const showFilter =
    sealed.length >= FILTER_MIN_CASES &&
    archetypes.length >= FILTER_MIN_ARCHETYPES;
  // An unknown or stale ?a= reads as no filter, so an old link lands on
  // the full drawer instead of an empty shelf.
  const active =
    showFilter && sp.a && archetypes.some((x) => x.slug === sp.a)
      ? sp.a
      : null;
  const shown = active
    ? sealed.filter(
        (b) => b.archetype && archetypeSlug(b.archetype) === active
      )
    : sealed;

  return (
    <div className="arena-wrap">
      <header className="arena-index-header">
        <h1 className="arena-title">The fights, broken down.</h1>
        <p className="arena-index-sub">
          Real fights. Dissected right in front of you.
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

      {sealed.length > 0 && (
        <>
          <h2 className="arena-shelf-head">The case files</h2>
          {showFilter && (
            <nav
              className="arena-filter"
              aria-label="Filter the case files by archetype"
            >
              <Link
                href="/arena"
                className={`arena-filter-chip${active ? "" : " on"}`}
                aria-current={active ? undefined : "page"}
              >
                All
                <span className="n">{sealed.length}</span>
              </Link>
              {archetypes.map((a) => (
                <Link
                  key={a.slug}
                  href={`/arena?a=${a.slug}`}
                  className={`arena-filter-chip${
                    active === a.slug ? " on" : ""
                  }`}
                  aria-current={active === a.slug ? "page" : undefined}
                >
                  {a.label}
                  <span className="n">{a.count}</span>
                </Link>
              ))}
            </nav>
          )}
          <CaseRows bouts={shown} admin={admin} />
        </>
      )}

      {admin && (
        <div className="arena-tools">
          <h2>Open a case</h2>
          <form action={createBoutAction}>
            <input
              name="title"
              required
              maxLength={120}
              placeholder="Case title. Name the fight."
            />
            {/* Same control the bench uses for the tile type, because
                this is the same job: pick one of a fixed few. Bare
                radios do not survive in here — .arena-tools styles every
                input as a flexing text field, which blows a radio row
                apart. Bout is the default; a post-mortem is a deliberate
                choice. Everything after this point is identical: same
                bench, same tiles, same seal, same number. */}
            <div className="row">
              <label>
                Kind
                <br />
                <select name="kind" defaultValue="bout">
                  <option value="bout">Bout (a fight I was in)</option>
                  <option value="post_mortem">
                    Post-mortem (someone else&apos;s exchange)
                  </option>
                </select>
              </label>
            </div>
            <input
              name="sourceUrl"
              type="url"
              maxLength={ARENA_MAX_SOURCE_URL}
              placeholder="Link to the post it came from (optional, private to you)"
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
