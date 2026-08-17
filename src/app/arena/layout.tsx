import type { ReactNode } from "react";
import "./arena.css";

// The Arena's dark room. The site is warm paper; the Arena deliberately
// is not — walking in should feel like entering a different kind of
// place. Tokens are scoped to .arena-room (see arena.css) so the dark
// palette can't leak into the rest of the site.

export default function ArenaLayout({ children }: { children: ReactNode }) {
  return <div className="arena-room">{children}</div>;
}
