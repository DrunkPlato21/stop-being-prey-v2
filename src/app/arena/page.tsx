import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { boutHref, listBouts, type ArenaBout } from "@/lib/arena";
import { isArenaSubscribed } from "@/lib/arena-watch";
import { ArenaMailToggle } from "@/components/arena/ArenaMailToggle";
import {
  ARENA_LIVE_WINDOW_MS,
  CASE_KIND_LABEL,
  ARENA_MAX_SOURCE_URL,
  caseNoStr,
  ARENA_TZ,
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
    timeZone: ARENA_TZ,
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
        // The plate is a div, not one big anchor, so the things inside
        // it can be clicked. The title's link is stretched over the
        // whole plate (see .plate-link::after), which keeps the fat
        // tap target the anchor used to give, and the chips sit above
        // that overlay so they can be their own links.
        <div
          key={bout.id}
          className={`arsenal-plate case${bout.caseNo ? "" : " unnumbered"}`}
        >
          <span className="arsenal-stampblock">
            <span aria-hidden="true" className="mk">
              &#10022;
            </span>
            {/* An off-the-record case has no number, and "CASE —" reads
                as a number that failed to load rather than one that was
                never given. It says what it is instead. */}
            <span className="num">
              {bout.caseNo ? (
                <>
                  CASE
                  <b>{caseNoStr(bout.caseNo)}</b>
                </>
              ) : (
                "FILED"
              )}
            </span>
          </span>
          <span className="arsenal-platebody">
            <Link href={boutHref(bout)} className="plate-link">
              <span className="row-title">
                {bout.kind !== "bout" && (
                  <span className="arena-kind-tag">
                    {CASE_KIND_LABEL[bout.kind]}
                  </span>
                )}
                {bout.title}
              </span>
            </Link>
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
                  <MoveChip key={m} tag={m} />
                ))}
                {bout.moves.length > 4 && (
                  // The rest, one tap away. A plate stays one line of
                  // chips at rest, which is what the truncation was
                  // for, and the count opens into the full set instead
                  // of being a number nobody can act on.
                  <details className="arena-more-moves">
                    <summary
                      className="arena-chip-move more"
                      aria-label={`Show ${bout.moves.length - 4} more moves`}
                    >
                      +{bout.moves.length - 4}
                    </summary>
                    <span className="extra">
                      {bout.moves.slice(4).map((m) => (
                        <MoveChip key={m} tag={m} />
                      ))}
                    </span>
                  </details>
                )}
              </span>
            )}
          </span>
        </div>
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
  // A stranger reading a public case has exactly one link out of it —
  // the eyebrow back to the room — and it used to land them on the
  // sign-in page, which is built for people who have already paid. The
  // one exploratory click the shared link earns was being spent on a
  // dead end. Send it to the sales page instead: /membership carries its
  // own "already a member? sign in" link, so the lapsed session that
  // used to be the reason for this redirect is still one click from
  // home, and the far commoner visitor gets the pitch.
  if (!session) {
    redirect("/membership?src=arena");
  }

  const [bouts, mailOn] = await Promise.all([
    listBouts(),
    isArenaSubscribed(session.email).catch(() => false),
    // Clears the nav's new-in-the-Arena dot, same as the Guild index.
    markNavViewed("arena", session.email),
  ]);
  const admin = isAdmin(session.email);

  // The shelf, newest case first. NOTE: listBouts() reads the top 30, so
  // the drawer (and therefore this filter) covers the last 30 bouts. At
  // a weekly cadence that binds in about half a year; whoever raises the
  // cap should raise it here rather than let the filter quietly report
  // on a slice.
  // The record is the numbered shelf, newest case first. A sealed bout
  // with no number was filed off the record: real, readable, permanently
  // linked, just not counted. It sorts by when it was sealed instead,
  // because it has no number to sort by.
  const sealed = bouts
    .filter((b) => b.status === "sealed" && b.caseNo != null)
    .sort((a, b) => (b.caseNo ?? 0) - (a.caseNo ?? 0));
  const offRecord = bouts
    .filter((b) => b.status === "sealed" && b.caseNo == null)
    .sort((a, b) => (b.sealedAt ?? 0) - (a.sealedAt ?? 0));

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
        {/* A fight has a 12-hour live window and starts whenever an
            opponent turns up. The bell announces it, but a bell only
            reaches someone already standing in the room. This is how
            you hear about it from outside. */}
        <ArenaMailToggle initialOn={mailOn} />
      </header>

      {bouts.length === 0 && (
        <p className="arena-empty">
          No bouts on the slab yet. The first fresh one opens the room.
        </p>
      )}

      {/* A bout with no tiles is a title Clay is still thinking about, not
          a fight. He sees it so he can get back to it; members do not,
          because there is nothing there to watch and he may yet bin it.
          It appears to the room the moment it has its first tile — which
          is also when the bell rings. One moment, one announcement. */}
      <OpenRows
        bouts={bouts.filter(
          (b) => b.status === "open" && (admin || b.tileCount > 0)
        )}
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

      {/* Off the record. Beneath the record and quieter, never a separate
          page: one address for the room, and a stranger who lands on one
          of these still sees the record sitting above it.

          Not hidden and not an apology. A fight that ended because one
          reply was enough is the method working; it just is not a
          document, and the case numbers stay worth something because
          this shelf exists to catch everything that should not have
          one. The filter above deliberately does not reach down here —
          it counts and filters the record. */}
      {offRecord.length > 0 && (
        <>
          <h2 className="arena-shelf-head off">Off the record</h2>
          <p className="arena-shelf-note">
            Fights that ended before they became case files. Still on
            file, just not numbered.
          </p>
          <CaseRows bouts={offRecord} admin={admin} />
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
