"use client";

import { useEffect, useState } from "react";

// Dark-mode toggle scoped to the admin Writer's Desk page. Sets
// body[data-theme="admin-desk-dark"] while active, which the CSS in
// globals.css uses to swap the color variables. Preference persists in
// localStorage under STORAGE_KEY so it survives reloads + sessions.
//
// On unmount (Clay navigates away), the body attribute is cleared so
// dark mode doesn't bleed into other admin pages. The localStorage
// flag stays — when he returns to /admin/desk, it re-applies.
//
// First paint is handled by the inline no-flash script on the page,
// not by this component — by the time React hydrates, the attribute
// is already set if it should be. This component just owns the live
// state + the button.

const STORAGE_KEY = "sbp:admin-desk-theme";
const BODY_ATTR = "data-theme";
const DARK_VALUE = "admin-desk-dark";

function readStoredTheme(): "light" | "dark" {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: "light" | "dark") {
  if (theme === "dark") {
    document.body.setAttribute(BODY_ATTR, DARK_VALUE);
  } else {
    if (document.body.getAttribute(BODY_ATTR) === DARK_VALUE) {
      document.body.removeAttribute(BODY_ATTR);
    }
  }
}

function SunIcon() {
  return (
    <svg
      className="sun-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2.5" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="21.5" />
      <line x1="2.5" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="21.5" y2="12" />
      <line x1="5.2" y1="5.2" x2="6.95" y2="6.95" />
      <line x1="17.05" y1="17.05" x2="18.8" y2="18.8" />
      <line x1="5.2" y1="18.8" x2="6.95" y2="17.05" />
      <line x1="17.05" y1="6.95" x2="18.8" y2="5.2" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="moon-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 14.5 A8.5 8.5 0 1 1 9.5 4 A6.5 6.5 0 0 0 20 14.5 Z" />
    </svg>
  );
}

export function AdminDeskDarkToggle() {
  // Default to "light" on the server to match a first-time visitor;
  // useEffect below re-syncs to the stored preference on mount. The
  // page's inline no-flash script ensures the body attribute is
  // already correct before this hydrates, so the icon flip is the
  // only thing this effect adjusts.
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(stored);
    applyTheme(stored);
    return () => {
      // Strip the attribute on navigation away so other admin pages
      // (which weren't built for dark mode) don't inherit it.
      if (document.body.getAttribute(BODY_ATTR) === DARK_VALUE) {
        document.body.removeAttribute(BODY_ATTR);
      }
    };
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage blocked — the in-memory state still works for
      // this session, just doesn't survive a reload.
    }
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      className="admin-desk-theme-toggle"
      aria-label={label}
      aria-pressed={theme === "dark"}
      title={label}
    >
      <span className="admin-desk-theme-toggle-icons">
        <SunIcon />
        <MoonIcon />
      </span>
    </button>
  );
}
