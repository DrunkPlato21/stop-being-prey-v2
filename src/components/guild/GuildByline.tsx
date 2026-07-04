import { MemberBadge } from "@/components/MemberBadge";
import type { TierBadge } from "@/lib/members";

// Author byline for the Guild: the display name plus the member's
// standing, resolved at read time. Reuses the shared MemberBadge so the
// founder/charter/tier chips are pixel-identical to the Lounge. Clay
// (the admin author) gets the AUTHOR treatment instead — olive name +
// AUTHOR chip — matching the comments convention. Renders the name span
// and chip(s) as flat flex siblings so the parent meta row's `gap`
// spaces them uniformly.
//
// The Guild Host (Trish) gets her own chip: her real display name plus a
// terracotta HOST badge (--ember), a hue deliberately distinct from the
// founder gold. The chip stands in for her tier badge so she carries one
// clean identity. Resolved from GUILD_HOST_EMAIL, threaded in as
// hostEmail exactly like adminEmail.

export type GuildBadgeInfo = {
  founderSlot: number | null;
  charterSlot: number | null;
  tierBadge: TierBadge | null;
};

export function GuildByline({
  email,
  names,
  badges,
  adminEmail,
  hostEmail,
  size = "default",
}: {
  email: string;
  names: Record<string, string>;
  badges: Record<string, GuildBadgeInfo>;
  adminEmail: string | null;
  hostEmail: string | null;
  size?: "default" | "small";
}) {
  const norm = email.toLowerCase().trim();
  const isAuthor = !!adminEmail && norm === adminEmail;
  const isHost = !isAuthor && !!hostEmail && norm === hostEmail;

  if (isAuthor) {
    return (
      <>
        <span
          className="font-display"
          style={{ fontWeight: 700, color: "var(--eye-deep)" }}
        >
          Clay
        </span>
        <span
          className="font-display uppercase"
          style={{
            fontSize: size === "small" ? "0.54rem" : "0.58rem",
            fontWeight: 700,
            color: "var(--eye-deep)",
            background: "var(--paper-deep)",
            border: "1px solid var(--eye-deep)",
            padding: "0.12rem 0.5rem",
            letterSpacing: "0.24em",
          }}
        >
          Author
        </span>
      </>
    );
  }

  if (isHost) {
    return (
      <>
        <span style={{ fontWeight: 600 }}>{names[norm] || "A member"}</span>
        <span
          className="font-display uppercase"
          style={{
            fontSize: size === "small" ? "0.54rem" : "0.58rem",
            fontWeight: 700,
            color: "var(--ember)",
            background: "var(--paper-deep)",
            border: "1px solid var(--ember)",
            padding: "0.12rem 0.5rem",
            letterSpacing: "0.24em",
          }}
        >
          Host
        </span>
      </>
    );
  }

  const name = names[norm] || "A member";
  const b = badges[norm];
  return (
    <>
      <span style={{ fontWeight: 600 }}>{name}</span>
      {b && (
        <MemberBadge
          founderSlot={b.founderSlot}
          charterSlot={b.charterSlot}
          tierBadge={b.tierBadge}
          size={size}
        />
      )}
    </>
  );
}
