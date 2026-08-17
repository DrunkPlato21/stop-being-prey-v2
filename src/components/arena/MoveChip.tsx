import Link from "next/link";
import { findMove } from "@/lib/arsenal";

// A move tag, rendered as the chip readers learn the grammar from:
// rust ◆ = their move, gold ✦ = Clay's technique, faint = spotted in
// the wild but not yet coined into the Library. Canonical chips link to
// the move's Arsenal page and carry the definition as a hover title.

export function MoveChip({ tag }: { tag: string }) {
  const move = findMove(tag);
  if (!move) {
    return (
      <span
        className="arena-chip-move unnamed"
        title="Unnamed move. Spotted, not yet in the Arsenal."
      >
        {tag}
      </span>
    );
  }
  return (
    <Link
      href={`/arena/arsenal/${move.slug}`}
      className={`arena-chip-move ${move.role}`}
      title={move.definition}
    >
      <span aria-hidden="true" className="mark">
        {move.role === "clay" ? "✦" : "◆"}
      </span>
      {move.name}
    </Link>
  );
}
