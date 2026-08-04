"use client";

import { revealComment } from "@/lib/comment-spotlight";

// "Show me my comment" for a member who already commented on this piece.
//
// Separate from the post-time confirmation: this is for the return visit.
// Coin-ranking means a member's own comment can sit anywhere in a long
// list, so on a piece with 25 comments there is otherwise no way to find
// your own except reading every one. Renders next to the form area.

export function JumpToMyComment({
  commentId,
  label,
}: {
  commentId: string;
  label: string;
}) {
  return (
    <button
      type="button"
      className="jump-to-my-comment"
      onClick={() => void revealComment(commentId)}
    >
      {label}
    </button>
  );
}
