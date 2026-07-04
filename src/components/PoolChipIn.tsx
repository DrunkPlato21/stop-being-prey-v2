import {
  getPoolStats,
  POOL_CONTRIBUTION_FLOOR_CENTS,
  POOL_SEAT_FILL_PRICE_CENTS,
} from "@/lib/pool";
import { PoolChipInForm } from "@/components/PoolChipInForm";

// The chip-in surface: a live progress bar toward the next pooled seat
// plus the open-amount contribute form. Reads the pot from the env's own
// keyspace (prod reads prod; dev reads its sandbox), so the bar is always
// honest. NUMBERS ONLY on the bar — never a name or a note. COPY IS DRAFT.

function money(cents: number): string {
  return cents % 100 === 0
    ? `$${cents / 100}`
    : `$${(cents / 100).toFixed(2)}`;
}

export async function PoolChipIn() {
  const { potCents } = await getPoolStats();
  const price = POOL_SEAT_FILL_PRICE_CENTS;
  const remaining = Math.max(0, price - potCents);
  const pct = Math.max(
    0,
    Math.min(100, Math.round((potCents / price) * 100))
  );

  return (
    <div className="w-full max-w-md mx-auto">
      <p
        className="font-serif text-ink-muted text-center mb-3"
        style={{ fontSize: "0.95rem", lineHeight: 1.5 }}
      >
        {potCents > 0 ? (
          <>
            Readers have put{" "}
            <span className="font-display text-eye-deep">
              {money(potCents)}
            </span>{" "}
            toward the next seat.{" "}
            <span className="text-ink">{money(remaining)} to go.</span>
          </>
        ) : (
          <>A few readers together fund a seat. Start the next one.</>
        )}
      </p>

      {/* Progress toward one seat. Purely a bar — no names, no notes. */}
      <div
        className="w-full mb-6"
        style={{
          height: 8,
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          overflow: "hidden",
        }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="progress toward the next pooled seat"
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--eye-deep)",
            transition: "width 300ms ease",
          }}
        />
      </div>

      <PoolChipInForm floorCents={POOL_CONTRIBUTION_FLOOR_CENTS} />
    </div>
  );
}
