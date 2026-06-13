import { getPoolStats } from "@/lib/pool";

// Public aggregate for the community pool. NUMBERS ONLY, ever — never a
// name, an email, or a claimer's note. Reads the pool stats from the
// environment's own keyspace (prod reads prod; local dev reads its dev
// sandbox), so the live counter is always honest. COPY IS DRAFT — Clay
// finalizes.
//
// No fake urgency: when nothing has been funded yet we say exactly that,
// rather than dressing up a zero.

export async function PoolCounter() {
  const { funded, claimed, waiting } = await getPoolStats();

  if (funded === 0 && waiting === 0) {
    return (
      <p
        className="font-serif italic text-ink-muted text-center"
        style={{ fontSize: "0.95rem" }}
      >
        No seats funded yet. Be the first to put one in the pool.
      </p>
    );
  }

  const parts = [
    `${funded} ${funded === 1 ? "seat" : "seats"} funded by readers`,
    `${claimed} claimed`,
    `${waiting} waiting`,
  ];

  return (
    <p
      className="font-serif text-ink-muted text-center"
      style={{ fontSize: "0.95rem", letterSpacing: "0.01em" }}
    >
      {parts.join("  ·  ")}
    </p>
  );
}
