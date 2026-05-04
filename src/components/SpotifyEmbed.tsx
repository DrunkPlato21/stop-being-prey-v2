type SpotifyEmbedProps = {
  episodeId?: string;
  showId?: string;
  type?: "episode" | "show";
  /** "compact" = 80px, "standard" = 152px, "large" = 232px */
  size?: "compact" | "standard" | "large";
  framed?: boolean;
};

const SIZE_HEIGHTS: Record<NonNullable<SpotifyEmbedProps["size"]>, number> = {
  compact: 80,
  standard: 152,
  large: 232,
};

export function SpotifyEmbed({
  episodeId = "5beascnbNXkJNGZPtw3EhC",
  showId,
  type = "episode",
  size = "standard",
  framed = true,
}: SpotifyEmbedProps) {
  const id = type === "episode" ? episodeId : showId;
  const src = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
  const height = SIZE_HEIGHTS[size];

  const iframe = (
    <iframe
      src={src}
      width="100%"
      height={height}
      frameBorder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      className="block w-full"
    />
  );

  if (framed) {
    return <div className="spotify-frame">{iframe}</div>;
  }

  return (
    <div className="border border-border bg-surface">
      {iframe}
    </div>
  );
}
