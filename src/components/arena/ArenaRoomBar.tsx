"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The room's own nav.
//
// The member sidebar gets you as far as "The Arena" and then stops
// caring: every page in here — a bout, the wall, one move — sits under
// that single lit item. So a member who tapped a move chip on a tile
// landed on a move page with no way out except the browser's back
// button. The gold "The Arsenal" eyebrow at the top was a link, but it
// was dressed as a label, and nobody clicks a label.
//
// Two destinations, stated plainly, on every page in the room: the
// Record (the bouts and the filed cases) and the Arsenal (the moves).
// Whichever one you are standing in is lit. That is the whole fix for
// "I clicked a tag and now I'm stuck."

const TABS = [
  { href: "/arena", label: "The Record" },
  { href: "/arena/arsenal", label: "The Arsenal" },
];

export function ArenaRoomBar() {
  const pathname = usePathname() ?? "";
  // Which half of the room you are in, and whether you are standing on
  // its index or one level down inside it. A tab lights only for the
  // page you are actually on: lighting "The Record" on a bout page
  // dressed the way out as the place you already were, which is the
  // whole reason a case file felt like it had no exit.
  const section = pathname.startsWith("/arena/arsenal")
    ? "/arena/arsenal"
    : "/arena";
  const atIndex = pathname === section;

  return (
    <div className="arena-roombar-slot">
      <nav className="arena-roombar" aria-label="The Arena">
        <span className="room">The Arena</span>
        {TABS.map((tab) => {
          const on = tab.href === section && atIndex;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`arena-roombar-tab${on ? " on" : ""}`}
              aria-current={on ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
