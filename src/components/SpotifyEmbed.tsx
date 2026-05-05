type SpotifyEmbedProps = {
  episodeId?: string;
  showId?: string;
  type?: "episode" | "show";
  /** "compact" = 152px, "standard" = 232px, "large" = 352px (matches Spotify's actual player heights) */
  size?: "compact" | "standard" | "large";
  framed?: boolean;
};

const SIZE_HEIGHTS: Record<NonNullable<SpotifyEmbedProps["size"]>, number> = {
  compact: 152,
  standard: 232,
  large: 352,
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
