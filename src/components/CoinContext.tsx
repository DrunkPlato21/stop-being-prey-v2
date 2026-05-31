"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Shared, reactive coin state for one article's comment section.
//
// Why this exists: each comment renders its own CoinButton, but "have I
// spent my coin on this article?" is a SINGLE fact shared across all of
// them. Without shared state, giving a coin only updates the one button
// that was clicked — every other button keeps showing "Give your coin"
// until a manual refresh, and a member could click one and walk the
// whole confirm flow only to be rejected. So the spent-comment id lives
// here, in a client context that wraps the whole list. The instant a
// give succeeds, markSpent() flips this value and every CoinButton
// re-derives: the funded comment shows its marker, every other give
// button disappears, and the top-of-section notice updates — no refresh.

type CoinContextValue = {
  /** A signed-in member (only members can ever give). */
  signedIn: boolean;
  /** Normalized viewer email, or null when signed out. */
  viewerEmail: string | null;
  /** The comment this member funded on this article, or null if their
      coin is still unspent here. Reactive. */
  spentCommentId: string | null;
  /** Commit the spend locally. No-op once already spent (a coin is
      permanent — it can never move to a second comment). */
  markSpent: (commentId: string) => void;
};

const CoinContext = createContext<CoinContextValue | null>(null);

export function useCoinContext(): CoinContextValue {
  const ctx = useContext(CoinContext);
  if (!ctx) {
    // Render-safe fallback: a coin component mounted outside a provider
    // behaves as a signed-out viewer (read-only, no give).
    return {
      signedIn: false,
      viewerEmail: null,
      spentCommentId: null,
      markSpent: () => {},
    };
  }
  return ctx;
}

export function CoinProvider({
  signedIn,
  viewerEmail,
  initialSpentCommentId,
  children,
}: {
  signedIn: boolean;
  viewerEmail: string | null;
  initialSpentCommentId: string | null;
  children: ReactNode;
}) {
  const [spentCommentId, setSpent] = useState<string | null>(
    initialSpentCommentId
  );

  // Adopt a non-null server value when it arrives (e.g. after a
  // background router.refresh, or a give made in another tab). Never
  // revert to null: a spent coin is permanent, so once we know it's
  // spent we stay spent for the life of this view.
  useEffect(() => {
    if (initialSpentCommentId) {
      setSpent((cur) => cur ?? initialSpentCommentId);
    }
  }, [initialSpentCommentId]);

  const value: CoinContextValue = {
    signedIn,
    viewerEmail: viewerEmail ? viewerEmail.toLowerCase().trim() : null,
    spentCommentId,
    // First spend wins; later calls are ignored.
    markSpent: (commentId) => setSpent((cur) => cur ?? commentId),
  };

  return (
    <CoinContext.Provider value={value}>{children}</CoinContext.Provider>
  );
}

// Top-of-section line for signed-in members. Reactive: flips to the
// confirmation the instant the coin is spent. Non-members get a
// separate join nudge rendered server-side (they never change state).
export function CoinMemberNotice() {
  const { signedIn, spentCommentId } = useCoinContext();
  if (!signedIn) return null;
  return (
    <>
      <p
        className="font-serif italic text-ink-muted leading-relaxed"
        style={{ fontSize: "0.9rem" }}
      >
        {spentCommentId
          ? "You've used your coin on this article."
          : "Members get one coin per article to highlight the best comment."}
      </p>
      {/* Quiet pointer so members learn their received-coins collection
          exists. Reaches givers here too, not just on receipt. */}
      <p
        className="font-serif italic text-ink-faint leading-relaxed mt-1"
        style={{ fontSize: "0.8rem" }}
      >
        Coins you receive are saved to{" "}
        <a
          href="/notes/coins"
          className="text-eye-deep"
          style={{ textDecoration: "underline" }}
        >
          Your Coins
        </a>
        .
      </p>
    </>
  );
}
