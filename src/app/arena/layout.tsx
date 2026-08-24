import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { MemberNavServer } from "@/components/MemberNavServer";
import { MemberNavPreview } from "@/components/MemberNavPreview";
import { ArenaRoomBar } from "@/components/arena/ArenaRoomBar";
import "./arena.css";

// The Arena's dark room. The site is warm paper; the Arena deliberately
// is not — walking in should feel like entering a different kind of
// place. Tokens are scoped to .arena-room (see arena.css) so the dark
// palette can't leak into the rest of the site.
//
// Chrome follows the /case-files pattern: members get the member nav
// (the public header/sticky suppress themselves on /arena), and the
// anonymous reader who lands on the one public case gets the
// MemberNavPreview — the member-area chrome with every link routing to
// /membership, so the free sample sits inside the room it is selling.
//
// Members also get the room bar: the Arena holds two places (the record
// and the wall) under one nav item, so the room states its own map at
// the top of every page. The preview reader has one page and nowhere to
// go but the membership pitch, so the bar stays off for them.

export default async function ArenaLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  const previewMode = !session?.email;

  return (
    <div className="md:flex md:max-w-6xl md:mx-auto md:gap-10 md:px-6">
      {previewMode ? <MemberNavPreview active="The Arena" /> : <MemberNavServer />}
      <div className="md:flex-1 md:min-w-0">
        <div className="arena-room">
          {!previewMode && <ArenaRoomBar />}
          {children}
        </div>
      </div>
    </div>
  );
}
