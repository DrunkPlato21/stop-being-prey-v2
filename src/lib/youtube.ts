// Client-safe YouTube helpers. Used server-side (lounge createPost derives
// a click-to-play embed from a pasted link) AND client-side (composer
// preview), so this stays free of any server/Redis import — importing it
// must never drag the backend into the browser bundle.

const ID = "[A-Za-z0-9_-]{11}";

// First capture group is the 11-char video id. Order doesn't matter; the
// id shape is fixed-length so it can't overrun into query params.
const PATTERNS: RegExp[] = [
  new RegExp(`youtu\\.be/(${ID})`),
  new RegExp(`youtube\\.com/watch\\?[^\\s]*v=(${ID})`),
  new RegExp(`youtube\\.com/embed/(${ID})`),
  new RegExp(`youtube\\.com/shorts/(${ID})`),
  new RegExp(`youtube\\.com/live/(${ID})`),
];

/** Pull the first YouTube video id out of arbitrary text, or null. */
export function extractYouTubeId(text: string): string | null {
  if (!text) return null;
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

export function isYouTubeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}

/**
 * Remove YouTube URLs from text and tidy the whitespace they leave
 * behind. Used at RENDER time on a post that has a YouTube embed, so the
 * raw link doesn't sit redundantly above the player. The stored body is
 * never mutated.
 */
export function stripYouTubeUrls(text: string): string {
  return text
    .replace(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S+/gi, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Thumbnail from YouTube's CDN (~10-30KB). */
export function youTubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** nocookie embed, only loaded after the user hits play (no tracking till then). */
export function youTubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}
