import type { ClayReaction } from "@/lib/notes";

// Facebook-style colorful reaction glyphs. Gradient-filled SVGs —
// these are the one place the page departs from the olive/serif
// monochrome aesthetic, on purpose. Reactions need to pop, feel
// playful, and be unmistakably interactive.

type Props = {
  type: ClayReaction;
  size?: number;
  className?: string;
};

export const REACTION_COLORS: Record<
  ClayReaction,
  { from: string; to: string; stroke: string; ring: string }
> = {
  heart: {
    from: "#ff6f8b",
    to: "#dc2654",
    stroke: "#9d1240",
    ring: "#ef4474",
  },
  thumb: {
    from: "#60a5fa",
    to: "#2563eb",
    stroke: "#1d4ed8",
    ring: "#3b82f6",
  },
  laugh: {
    from: "#fde047",
    to: "#f59e0b",
    stroke: "#b45309",
    ring: "#f59e0b",
  },
  fire: {
    from: "#fde047",
    to: "#dc2626",
    stroke: "#9a1d11",
    ring: "#f97316",
  },
  shock: {
    from: "#fde047",
    to: "#f59e0b",
    stroke: "#b45309",
    ring: "#f59e0b",
  },
};

export const REACTION_LABELS: Record<ClayReaction, string> = {
  heart: "Love",
  thumb: "Like",
  laugh: "Haha",
  fire: "Fire",
  shock: "Wow",
};

export function ReactionIcon({
  type,
  size = 24,
  className,
}: Props) {
  const c = REACTION_COLORS[type];
  if (!c) return null;
  const gid = `react-${type}-grad`;

  const grad = (
    <defs>
      <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={c.from} />
        <stop offset="100%" stopColor={c.to} />
      </linearGradient>
    </defs>
  );

  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    className,
    "aria-hidden": true,
  };

  if (type === "heart") {
    return (
      <svg {...common}>
        {grad}
        <path
          d="M12 21.2 C12 21.2 3 14.2 3 8.4 C3 5.4 5.4 3.2 8.2 3.2 C9.9 3.2 11.3 4.1 12 5.5 C12.7 4.1 14.1 3.2 15.8 3.2 C18.6 3.2 21 5.4 21 8.4 C21 14.2 12 21.2 12 21.2 Z"
          fill={`url(#${gid})`}
          stroke={c.stroke}
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (type === "thumb") {
    return (
      <svg {...common}>
        {grad}
        <path
          d="M7.2 11 L10.5 11 L10.5 7.5 C10.5 5.3 11.7 3.2 13.2 3.2 C14 3.2 14.5 3.8 14.5 4.6 L14.5 5.5 C14.5 7 14 8.5 13.5 10 L18.5 10 C19.7 10 20.6 11 20.4 12.2 L19.1 19 C18.8 20.7 17.4 22 15.7 22 L9 22 C8 22 7.2 21.2 7.2 20.2 Z"
          fill={`url(#${gid})`}
          stroke={c.stroke}
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
        <rect
          x="3.5"
          y="11"
          width="3.7"
          height="11"
          rx="0.8"
          fill={`url(#${gid})`}
          stroke={c.stroke}
          strokeWidth="0.6"
        />
      </svg>
    );
  }

  if (type === "laugh") {
    return (
      <svg {...common}>
        {grad}
        <circle
          cx="12"
          cy="12"
          r="9.5"
          fill={`url(#${gid})`}
          stroke={c.stroke}
          strokeWidth="0.6"
        />
        <path
          d="M6.5 9.5 Q8.5 7 10.5 9.5"
          fill="none"
          stroke="#1a1714"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M13.5 9.5 Q15.5 7 17.5 9.5"
          fill="none"
          stroke="#1a1714"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M6.5 13.5 Q12 19.5 17.5 13.5 Z"
          fill="#1a1714"
        />
        <path
          d="M9 16.4 Q12 18.5 15 16.4 Q12 17.4 9 16.4 Z"
          fill="#dc2654"
        />
      </svg>
    );
  }

  if (type === "shock") {
    return (
      <svg {...common}>
        {grad}
        <circle
          cx="12"
          cy="12"
          r="9.5"
          fill={`url(#${gid})`}
          stroke={c.stroke}
          strokeWidth="0.6"
        />
        {/* Wide round eyes — "wow" expression */}
        <circle cx="8.5" cy="10" r="1.45" fill="#1a1714" />
        <circle cx="15.5" cy="10" r="1.45" fill="#1a1714" />
        {/* O-shaped mouth */}
        <ellipse
          cx="12"
          cy="16"
          rx="1.7"
          ry="2.4"
          fill="#1a1714"
        />
      </svg>
    );
  }

  // fire — clean Lucide-style flame shape filled with a sunrise
  // gradient so it actually reads as a flame, not a blob.
  return (
    <svg {...common}>
      <defs>
        <linearGradient
          id={`${gid}-outer`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="40%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
        <linearGradient
          id={`${gid}-inner`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <path
        d="M8.5 14.5 A2.5 2.5 0 0 0 11 12 C11 10.62 10.5 10 10 9 C8.928 6.857 9.776 4.946 12 3 C12.5 5.5 14 7.9 16 9.5 C18 11.1 19 13 19 15 A7 7 0 1 1 5 15 C5 13.847 5.433 12.706 6 12 A2.5 2.5 0 0 0 8.5 14.5 Z"
        fill={`url(#${gid}-outer)`}
        stroke="#9a1d11"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* Inner brighter wick */}
      <path
        d="M10.5 16.5 C10.5 18 11.2 19 12 19 C12.8 19 13.5 18 13.5 16.5 C13.5 15.3 12.7 14.3 12 13 C11.3 14.3 10.5 15.3 10.5 16.5 Z"
        fill={`url(#${gid}-inner)`}
      />
    </svg>
  );
}
