"use client";

import { useState } from "react";
import { deleteBoutAction } from "@/app/arena/actions";

// Binning a whole case is the one action in the room with no undo, so
// it asks twice and says what it takes with it. Inline, like the tile
// delete: no browser dialog, nothing that can freeze the page.

export function DeleteBoutButton({ boutId }: { boutId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className="arena-seal-btn danger"
        onClick={() => setConfirming(true)}
      >
        Delete this case
      </button>
    );
  }

  return (
    <div className="arena-delete-confirm">
      <p>
        This bins the case and everything in it: every tile, the
        reactions and whispers on them, its number (which goes back in
        the pool) and its link. There is no undo.
      </p>
      <div className="row">
        <form action={deleteBoutAction}>
          <input type="hidden" name="boutId" value={boutId} />
          <button type="submit" className="arena-seal-btn danger">
            Bin it for good
          </button>
        </form>
        <button
          type="button"
          className="arena-seal-btn"
          onClick={() => setConfirming(false)}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
