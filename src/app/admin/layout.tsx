import type { Metadata } from "next";
import { AdminDeskDarkToggle } from "@/components/AdminDeskDarkToggle";
import { AdminPersistentNav } from "@/components/AdminPersistentNav";

// Admin section layout. Three jobs:
//
//   1. PWA installability — exports a `manifest` in metadata so the
//      <link rel="manifest"> tag is injected only on /admin/* pages.
//      Chrome / Edge will show an install icon in the URL bar when
//      visiting localhost:3000/admin/desk; once installed, the
//      desktop "app" launches straight into the Writer's Desk with
//      no browser chrome (display: standalone in the manifest).
//
//   2. Theme color override — admin gets the olive accent on the
//      title bar of the installed PWA window.
//
//   3. Dark-mode toggle — pinned to the top-right of every admin
//      page as a fixed-position button. The light/dark preference
//      persists in localStorage and applies a data-theme attribute
//      to <body> that the CSS in globals.css keys off. A no-flash
//      inline script at the top of the layout body reads the
//      stored value and stamps the attribute before any color-
//      bearing markup paints, so dark-mode reloads don't flicker.
//
// The /admin/* surface is gated to localhost only via proxy.ts
// (404s in production), so this layout effectively runs only on
// the dev server.

export const metadata: Metadata = {
  title: {
    default: "SBP Admin",
    template: "%s · SBP Admin",
  },
  manifest: "/admin-manifest.webmanifest",
  themeColor: "#8a7d20",
  // Don't index admin under any circumstance — robots stay out even
  // though the surface 404s in production anyway.
  robots: {
    index: false,
    follow: false,
  },
};

const NO_FLASH_THEME_SCRIPT = `
(function() {
  try {
    if (localStorage.getItem('sbp:admin-desk-theme') === 'dark') {
      document.body.setAttribute('data-theme', 'admin-desk-dark');
    }
  } catch (e) {}
})();
`;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }}
      />
      {/* Fixed top-right toggle. Mirrors the placement on every
          admin page so muscle memory carries between routes. The
          component itself handles state + the body attribute on
          mount/unmount, so leaving the admin section restores
          paper-and-ink defaults for the rest of the site. */}
      <div className="admin-theme-toggle-anchor">
        <AdminDeskDarkToggle />
      </div>
      {/* Persistent admin nav. Renders once here so every /admin/*
          page shares the same Desk · Elsewhere · Voice memos · …
          row with an olive underline on the current section. Replaces
          the older fixed top-left back-to-desk pill — "Desk" is the
          leftmost item and does the same homing job. */}
      <AdminPersistentNav />
      {children}
    </>
  );
}
