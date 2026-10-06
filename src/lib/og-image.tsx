import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getArticleBySlug } from "@/lib/articles";
import {
  getCaseFileBySlug,
  RULE_ROMAN,
  RULE_SHORT_LABEL,
} from "@/lib/case-files";
import { unstable_cache } from "next/cache";
import { getPublicFloorCents } from "@/lib/membership";
import { floorLabel } from "@/lib/pricing";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// Brand fonts are bundled in /assets and read from disk, so OG cards never
// depend on a render-time Google Fonts fetch (which could time out and
// silently fall back to an off-brand sans-serif). The assets dir is opted
// into the OG routes' function bundle via outputFileTracingIncludes in
// next.config.ts. Returns null on any read failure so the card still
// renders (Satori's default font) rather than erroring.
async function loadAsset(file: string): Promise<Buffer | null> {
  try {
    return await readFile(join(process.cwd(), "assets", file));
  } catch {
    return null;
  }
}

async function loadFont(file: string): Promise<Buffer | null> {
  return loadAsset(file);
}

/**
 * Read a bundled image out of /assets as a data URI. Satori can't fetch a
 * URL at render time in any way we'd want to depend on, so the bytes go
 * inline. Pre-crop the source to 1200x630 before committing it — nothing
 * here resizes. Returns null on any failure so the card falls back to the
 * plain dark chassis rather than erroring the whole route.
 */
async function loadImageDataUri(file: string): Promise<string | null> {
  const buf = await loadAsset(file);
  if (!buf) return null;
  const ext = file.toLowerCase().split(".").pop();
  const mime =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * /join-themed OG card. Title is the call-to-action, italic deck is
 * the pitch line. Same visual chassis as the article cards so a link
 * shared from the join URL still reads as part of the site.
 */
export async function generateJoinOG(): Promise<ImageResponse> {
  const eyebrow = "Stay close · Stop Being Prey";
  const title = "Join the list.";
  const deck =
    "Original writing on politics, power, and the apex class. Algorithms don't deliver this writing. It only arrives if you ask.";

  const [cormorant700, sourceSerifItalic] = await Promise.all([
    loadFont("cormorant-garamond-700.ttf"),
    loadFont("source-serif-4-italic.ttf"),
  ]);

  const fonts: NonNullable<
    ConstructorParameters<typeof ImageResponse>[1]
  >["fonts"] = [];
  if (cormorant700) {
    fonts.push({
      name: "Cormorant Garamond",
      data: cormorant700,
      weight: 700,
      style: "normal",
    });
  }
  if (sourceSerifItalic) {
    fonts.push({
      name: "Source Serif",
      data: sourceSerifItalic,
      weight: 400,
      style: "italic",
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0c0a08",
          display: "flex",
          fontFamily: "Cormorant Garamond, serif",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: "96px",
            left: "96px",
            right: "96px",
            bottom: "96px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: "#b8a82c",
                fontSize: 22,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 48,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                color: "#f5efe1",
                fontSize: 120,
                fontWeight: 700,
                lineHeight: 1.02,
                letterSpacing: "-0.025em",
                marginBottom: 40,
              }}
            >
              {title}
            </div>
            <div
              style={{
                color: "#d8cfb8",
                fontSize: 34,
                fontStyle: "italic",
                lineHeight: 1.35,
                fontFamily: "Source Serif, Cormorant Garamond, serif",
                fontWeight: 400,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
                maxWidth: 980,
              }}
            >
              {deck}
            </div>
          </div>

          <div
            style={{
              color: "#8a7d20",
              fontSize: 18,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            stopbeingprey.com/join
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  );
}

// Hourly-cached floor read, shared by every render of the membership
// card. Keyed on nothing: there is exactly one public floor at a time.
const cachedFloorCents = unstable_cache(
  async () => getPublicFloorCents("monthly"),
  ["og-membership-floor"],
  { revalidate: 3600 }
);

/**
 * Membership-themed OG card. Same visual chassis as the /join and article
 * cards (pattern replication, not abstraction) with the membership pitch.
 * Smaller title size than /join since the line is longer.
 */
export async function generateMembershipOG(): Promise<ImageResponse> {
  const eyebrow = "Membership · Stop Being Prey";
  const title = "The room behind the work.";
  // The price is read live rather than written into the deck, because
  // the floor steps $13 -> $18 on its own the moment the charter cap
  // fills, with no deploy. The read is cached for an hour: an uncached
  // Redis call here would opt these four card routes out of static
  // rendering entirely, turning every social scrape into a PNG render
  // on a serverless function. An hour-stale price on a social card is
  // nothing; four newly-dynamic image routes are a real bill.
  const { cents } = await cachedFloorCents();
  const deck =
    `Comments, the desk, the lounge, and the book drafted in the open. The room where you learn to see the moves before they're run on you. From ${floorLabel(
      cents
    )} a month.`;

  const [cormorant700, sourceSerifItalic] = await Promise.all([
    loadFont("cormorant-garamond-700.ttf"),
    loadFont("source-serif-4-italic.ttf"),
  ]);

  const fonts: NonNullable<
    ConstructorParameters<typeof ImageResponse>[1]
  >["fonts"] = [];
  if (cormorant700) {
    fonts.push({
      name: "Cormorant Garamond",
      data: cormorant700,
      weight: 700,
      style: "normal",
    });
  }
  if (sourceSerifItalic) {
    fonts.push({
      name: "Source Serif",
      data: sourceSerifItalic,
      weight: 400,
      style: "italic",
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0c0a08",
          display: "flex",
          fontFamily: "Cormorant Garamond, serif",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: "96px",
            left: "96px",
            right: "96px",
            bottom: "96px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: "#b8a82c",
                fontSize: 22,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 48,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                color: "#f5efe1",
                fontSize: 84,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
                marginBottom: 40,
              }}
            >
              {title}
            </div>
            <div
              style={{
                color: "#d8cfb8",
                fontSize: 32,
                fontStyle: "italic",
                lineHeight: 1.35,
                fontFamily: "Source Serif, Cormorant Garamond, serif",
                fontWeight: 400,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
                maxWidth: 980,
              }}
            >
              {deck}
            </div>
          </div>

          <div
            style={{
              color: "#8a7d20",
              fontSize: 18,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            stopbeingprey.com/membership
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  );
}

/**
 * About-page OG card. Same chassis as the others (pattern replication).
 * Title mirrors the page's own headline ("What this is.").
 */
export async function generateAboutOG(): Promise<ImageResponse> {
  const eyebrow = "About · Stop Being Prey";
  const title = "The fight I lost.";
  const deck =
    "The argument I lost in 2015, the Sowell page it built, and the doctrine I forged in the comments. How I stopped being prey.";

  const [cormorant700, sourceSerifItalic] = await Promise.all([
    loadFont("cormorant-garamond-700.ttf"),
    loadFont("source-serif-4-italic.ttf"),
  ]);

  const fonts: NonNullable<
    ConstructorParameters<typeof ImageResponse>[1]
  >["fonts"] = [];
  if (cormorant700) {
    fonts.push({
      name: "Cormorant Garamond",
      data: cormorant700,
      weight: 700,
      style: "normal",
    });
  }
  if (sourceSerifItalic) {
    fonts.push({
      name: "Source Serif",
      data: sourceSerifItalic,
      weight: 400,
      style: "italic",
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0c0a08",
          display: "flex",
          fontFamily: "Cormorant Garamond, serif",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: "96px",
            left: "96px",
            right: "96px",
            bottom: "96px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: "#b8a82c",
                fontSize: 22,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 48,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                color: "#f5efe1",
                fontSize: 104,
                fontWeight: 700,
                lineHeight: 1.02,
                letterSpacing: "-0.025em",
                marginBottom: 40,
              }}
            >
              {title}
            </div>
            <div
              style={{
                color: "#d8cfb8",
                fontSize: 33,
                fontStyle: "italic",
                lineHeight: 1.35,
                fontFamily: "Source Serif, Cormorant Garamond, serif",
                fontWeight: 400,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
                maxWidth: 980,
              }}
            >
              {deck}
            </div>
          </div>

          <div
            style={{
              color: "#8a7d20",
              fontSize: 18,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            stopbeingprey.com/about
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  );
}

/**
 * Wall-themed OG card. Same chassis as the others (pattern replication).
 * Title mirrors the page's own headline ("Add your name.").
 */
export async function generateWallOG(): Promise<ImageResponse> {
  const eyebrow = "The Wall · Stop Being Prey";
  const title = "Add your name.";
  const deck =
    "Stop Being Prey runs on readers, not ads or sponsors. Back it with a dollar and your name goes on the wall.";

  const [cormorant700, sourceSerifItalic] = await Promise.all([
    loadFont("cormorant-garamond-700.ttf"),
    loadFont("source-serif-4-italic.ttf"),
  ]);

  const fonts: NonNullable<
    ConstructorParameters<typeof ImageResponse>[1]
  >["fonts"] = [];
  if (cormorant700) {
    fonts.push({
      name: "Cormorant Garamond",
      data: cormorant700,
      weight: 700,
      style: "normal",
    });
  }
  if (sourceSerifItalic) {
    fonts.push({
      name: "Source Serif",
      data: sourceSerifItalic,
      weight: 400,
      style: "italic",
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0c0a08",
          display: "flex",
          fontFamily: "Cormorant Garamond, serif",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: "96px",
            left: "96px",
            right: "96px",
            bottom: "96px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: "#b8a82c",
                fontSize: 22,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 48,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                color: "#f5efe1",
                fontSize: 104,
                fontWeight: 700,
                lineHeight: 1.02,
                letterSpacing: "-0.025em",
                marginBottom: 40,
              }}
            >
              {title}
            </div>
            <div
              style={{
                color: "#d8cfb8",
                fontSize: 33,
                fontStyle: "italic",
                lineHeight: 1.35,
                fontFamily: "Source Serif, Cormorant Garamond, serif",
                fontWeight: 400,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
                maxWidth: 980,
              }}
            >
              {deck}
            </div>
          </div>

          <div
            style={{
              color: "#8a7d20",
              fontSize: 18,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            stopbeingprey.com/wall
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  );
}

/**
 * Rules / doctrine OG card. Same chassis as the others (pattern
 * replication). The most-shared page — the doctrine front door.
 */
export async function generateRulesOG(): Promise<ImageResponse> {
  const eyebrow = "The Doctrine · Stop Being Prey";
  const title = "The 7 Rules.";
  const deck =
    "Power decides, not righteousness. Seven rules for everyone tired of being the prey. The first one's free.";

  const [cormorant700, sourceSerifItalic] = await Promise.all([
    loadFont("cormorant-garamond-700.ttf"),
    loadFont("source-serif-4-italic.ttf"),
  ]);

  const fonts: NonNullable<
    ConstructorParameters<typeof ImageResponse>[1]
  >["fonts"] = [];
  if (cormorant700) {
    fonts.push({
      name: "Cormorant Garamond",
      data: cormorant700,
      weight: 700,
      style: "normal",
    });
  }
  if (sourceSerifItalic) {
    fonts.push({
      name: "Source Serif",
      data: sourceSerifItalic,
      weight: 400,
      style: "italic",
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0c0a08",
          display: "flex",
          fontFamily: "Cormorant Garamond, serif",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: "96px",
            left: "96px",
            right: "96px",
            bottom: "96px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: "#b8a82c",
                fontSize: 22,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 48,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                color: "#f5efe1",
                fontSize: 104,
                fontWeight: 700,
                lineHeight: 1.02,
                letterSpacing: "-0.025em",
                marginBottom: 40,
              }}
            >
              {title}
            </div>
            <div
              style={{
                color: "#d8cfb8",
                fontSize: 33,
                fontStyle: "italic",
                lineHeight: 1.35,
                fontFamily: "Source Serif, Cormorant Garamond, serif",
                fontWeight: 400,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
                maxWidth: 980,
              }}
            >
              {deck}
            </div>
          </div>

          <div
            style={{
              color: "#8a7d20",
              fontSize: 18,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            stopbeingprey.com/rules
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  );
}

export async function generateArticleOG(slug: string): Promise<ImageResponse> {
  const article = await getArticleBySlug(slug);
  const title = article?.title ?? "Stop Being Prey";
  const description =
    article?.description ?? "On power, politics, and the apex class.";
  const chapter = article?.chapter;

  // Optional photo background (frontmatter `ogImage`). Loaded first because
  // it decides the deck: over a photo the card runs the article's subtitle,
  // which is the one-line hook, since a two-line description fights the
  // image for the same space. Plain cards keep the description they've
  // always had — this must not restyle every card that's already been
  // scraped and cached by the platforms.
  const photo = article?.ogImage
    ? await loadImageDataUri(article.ogImage)
    : null;
  const deckSource = photo ? article?.subtitle || description : description;

  // Cap the deck so it fits on ~2 lines at 36px italic across the
  // full editorial column. Satori's WebkitLineClamp isn't reliable here, so
  // the truncation is the truth.
  const trimmedDesc =
    deckSource.length > 140
      ? deckSource.slice(0, 137).replace(/[\s,;.]+$/, "") + "…"
      : deckSource;

  const eyebrow = chapter
    ? `Chapter ${chapter} · Stop Being Prey`
    : "Stop Being Prey";

  const [cormorant700, sourceSerifItalic] = await Promise.all([
    loadFont("cormorant-garamond-700.ttf"),
    loadFont("source-serif-4-italic.ttf"),
  ]);

  const fonts: NonNullable<
    ConstructorParameters<typeof ImageResponse>[1]
  >["fonts"] = [];
  if (cormorant700) {
    fonts.push({
      name: "Cormorant Garamond",
      data: cormorant700,
      weight: 700,
      style: "normal",
    });
  }
  if (sourceSerifItalic) {
    fonts.push({
      name: "Source Serif",
      data: sourceSerifItalic,
      weight: 400,
      style: "italic",
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0c0a08",
          display: "flex",
          fontFamily: "Cormorant Garamond, serif",
          position: "relative",
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            width={1200}
            height={630}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "1200px",
              height: "630px",
              objectFit: "cover",
            }}
          />
        ) : null}
        {photo ? (
          // Scrim. The type sits left, so the darkness is heaviest there and
          // thins toward the flock on the right. Without it the cream title
          // lands on open sky and turns to mush at thumbnail size, which is
          // the size these cards are actually read at.
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "1200px",
              height: "630px",
              display: "flex",
              backgroundImage:
                "linear-gradient(90deg, rgba(12,10,8,0.86) 0%, rgba(12,10,8,0.76) 34%, rgba(12,10,8,0.48) 62%, rgba(12,10,8,0.20) 100%)",
            }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: "96px",
            left: "96px",
            right: "96px",
            bottom: "96px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: "#b8a82c",
                fontSize: 22,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 48,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                color: "#f5efe1",
                fontSize: 96,
                fontWeight: 700,
                // Spread, never `key: undefined`. Satori chokes on a style
                // key present with an undefined value and the whole card
                // fails to render, so the photo-only styles have to be
                // absent, not empty, on the plain cards.
                ...(photo
                  ? {
                      textShadow: "0 2px 24px rgba(0,0,0,0.75)",
                      maxWidth: 880,
                    }
                  : {}),
                lineHeight: 1.02,
                letterSpacing: "-0.025em",
                marginBottom: 36,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
              }}
            >
              {title}
            </div>
            <div
              style={{
                color: "#d8cfb8",
                fontSize: 36,
                fontStyle: "italic",
                lineHeight: 1.35,
                fontFamily: "Source Serif, Cormorant Garamond, serif",
                fontWeight: 400,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
                ...(photo
                  ? {
                      textShadow: "0 2px 20px rgba(0,0,0,0.8)",
                      maxWidth: 860,
                    }
                  : {}),
              }}
            >
              {trimmedDesc}
            </div>
          </div>

          <div
            style={{
              // Brighter gold over a photo. The deep #8a7d20 is tuned for a
              // flat black field; on the sunset at the bottom of a picture
              // it sinks into the background.
              color: photo ? "#c4ac35" : "#8a7d20",
              ...(photo ? { textShadow: "0 1px 12px rgba(0,0,0,0.9)" } : {}),
              fontSize: 18,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            stopbeingprey.com
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  );
}

/**
 * Case file share card. Same dark chassis as the essay card (pattern
 * replication) with the case file's own furniture: the Case File number
 * in the eyebrow, the title, and the rules it drills along the foot.
 *
 * Only what is already public goes on it. A public-preview file shows
 * its one-shot line, because the whole page is open to anyone. A
 * members-only file never does: it gets the title and rules (both of
 * which the public /rules page already lists) and a plain members-only
 * deck. The route sits behind the members gate for those files anyway
 * (proxy.ts), so this is the second lock, not the only one.
 */
export async function generateCaseFileOG(slug: string): Promise<ImageResponse> {
  const cf = getCaseFileBySlug(slug);
  const title = cf?.title ?? "Case Files";
  const eyebrow = cf?.number
    ? `Case File №${cf.number} · Stop Being Prey`
    : "Case Files · Stop Being Prey";
  const oneShot = cf?.publicPreview ? cf.oneShot.replace(/^["“]+|["”]+$/g, "") : "";
  // Same 140-character cap as the essay deck: two lines at 36px italic.
  const deck = oneShot
    ? `“${oneShot.length > 132 ? oneShot.slice(0, 129).replace(/[\s,;.]+$/, "") + "…" : oneShot}”`
    : "A members-only case file.";
  const rules = (cf?.rulesApplied ?? [])
    .filter((n) => RULE_SHORT_LABEL[n])
    .slice(0, 2)
    .map((n) => `Rule ${RULE_ROMAN[n - 1]} · ${RULE_SHORT_LABEL[n]}`);

  const [cormorant700, sourceSerifItalic] = await Promise.all([
    loadFont("cormorant-garamond-700.ttf"),
    loadFont("source-serif-4-italic.ttf"),
  ]);

  const fonts: NonNullable<
    ConstructorParameters<typeof ImageResponse>[1]
  >["fonts"] = [];
  if (cormorant700) {
    fonts.push({
      name: "Cormorant Garamond",
      data: cormorant700,
      weight: 700,
      style: "normal",
    });
  }
  if (sourceSerifItalic) {
    fonts.push({
      name: "Source Serif",
      data: sourceSerifItalic,
      weight: 400,
      style: "italic",
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0c0a08",
          display: "flex",
          fontFamily: "Cormorant Garamond, serif",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: "96px",
            left: "96px",
            right: "96px",
            bottom: "96px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: "#b8a82c",
                fontSize: 22,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 44,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                color: "#f5efe1",
                fontSize: 96,
                fontWeight: 700,
                lineHeight: 1.02,
                letterSpacing: "-0.025em",
                marginBottom: 32,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
              }}
            >
              {title}
            </div>
            <div
              style={{
                color: "#d8cfb8",
                fontSize: 36,
                fontStyle: "italic",
                lineHeight: 1.35,
                fontFamily: "Source Serif, Cormorant Garamond, serif",
                fontWeight: 400,
                // Balanced, not clamped: the deck is already capped to
                // two lines' worth above, and balancing keeps a short
                // one-shot from leaving one word alone on line two.
                display: "flex",
                textWrap: "balance",
                maxWidth: 980,
              }}
            >
              {deck}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              color: "#8a7d20",
              fontSize: 18,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              {rules.map((r) => (
                <div key={r} style={{ display: "flex", marginTop: 6 }}>
                  {r}
                </div>
              ))}
            </div>
            <div style={{ display: "flex" }}>stopbeingprey.com</div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  );
}

// ---------------------------------------------------------------------
// Quote cards. The line a reader highlighted, set on paper. Unlike the
// link-preview cards above (dark chassis, built to read at thumbnail
// size in a feed), a quote card is the thing itself: it gets posted as
// an image, so it's set like a page, cream stock and ink, with the
// credit underneath where a pull quote's attribution would sit.
// ---------------------------------------------------------------------

export type QuoteCardFormat = "landscape" | "portrait";

export const QUOTE_CARD_SIZE: Record<
  QuoteCardFormat,
  { width: number; height: number }
> = {
  // The link-preview shape. What X and Facebook show inline.
  landscape: { width: 1200, height: 630 },
  // Instagram's tallest feed shape (4:5). More of the screen on a phone.
  portrait: { width: 1080, height: 1350 },
};

/**
 * Quote size from its length. Satori can't measure-and-shrink, so this
 * is an estimate: Cormorant italic runs about half its size per
 * character, so N characters at size s need roughly N * 0.5s * 1.2s of
 * area. Solve for s, then clamp so a short line doesn't turn into a
 * poster and a long one stays readable. The box is the quote's real
 * space on each card, less a margin for ragged lines.
 */
function quoteFontSize(quote: string, format: QuoteCardFormat): number {
  const box =
    format === "landscape"
      ? { w: 1000, h: 330, min: 34, max: 86 }
      : { w: 880, h: 760, min: 46, max: 108 };
  const fit = Math.sqrt((box.w * box.h) / (Math.max(quote.length, 1) * 0.62));
  return Math.round(Math.min(box.max, Math.max(box.min, fit)));
}

/**
 * Typesetting, not editing: the words and punctuation stay exactly as
 * written, only the glyphs change to what a printer would set.
 *   - Straight quotes become curly ones. The markdown is typed with
 *     straight marks, which read as feet-and-inches at poster size.
 *   - Three dots become the ellipsis glyph. Satori swallows the space
 *     after a "..." run (it set "me... He" as "me...He").
 *   - The last two words are tied with a no-break space, so the card
 *     never ends on one orphaned word.
 */
function typesetQuote(quote: string): string {
  return quote
    .replace(/\.\.\./g, "…")
    .replace(/(^|[\s(—–-])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s(—–-])'/g, "$1‘")
    .replace(/'/g, "’")
    .replace(/\s+(\S+)$/, " $1");
}

export async function generateQuoteCard({
  quote,
  title,
  format,
}: {
  quote: string;
  title: string;
  format: QuoteCardFormat;
}): Promise<ImageResponse> {
  const size = QUOTE_CARD_SIZE[format];
  const portrait = format === "portrait";
  const fontSize = quoteFontSize(quote, format);
  const set = typesetQuote(quote);

  const [cormorant700, cormorantItalic, sourceSerifItalic] = await Promise.all([
    loadFont("cormorant-garamond-700.ttf"),
    loadFont("cormorant-garamond-500-italic.ttf"),
    loadFont("source-serif-4-italic.ttf"),
  ]);

  const fonts: NonNullable<
    ConstructorParameters<typeof ImageResponse>[1]
  >["fonts"] = [];
  if (cormorant700) {
    fonts.push({
      name: "Cormorant Garamond",
      data: cormorant700,
      weight: 700,
      style: "normal",
    });
  }
  if (cormorantItalic) {
    fonts.push({
      name: "Cormorant Garamond",
      data: cormorantItalic,
      weight: 500,
      style: "italic",
    });
  }
  if (sourceSerifItalic) {
    fonts.push({
      name: "Source Serif",
      data: sourceSerifItalic,
      weight: 400,
      style: "italic",
    });
  }

  const pad = portrait ? 104 : 96;

  return new ImageResponse(
    (
      <div
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          background: "#f5efe1",
          display: "flex",
          fontFamily: "Cormorant Garamond, serif",
          position: "relative",
        }}
      >
        {/* Hairline frame, inset like a plate in a printed book. */}
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 28,
            right: 28,
            bottom: 28,
            border: "1px solid #d8cfb8",
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: portrait ? 120 : 76,
            left: pad,
            right: pad,
            bottom: portrait ? 112 : 72,
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              justifyContent: "center",
            }}
          >
            {/* The open-quote mark in the eye gold: the one saturated
                color in the system, used once. */}
            <div
              style={{
                color: "#b8a82c",
                fontSize: portrait ? 200 : 150,
                fontWeight: 700,
                lineHeight: 1,
                height: portrait ? 104 : 74,
                marginLeft: -6,
                display: "flex",
              }}
            >
              {"“"}
            </div>
            <div
              style={{
                color: "#1a1714",
                fontSize,
                fontStyle: "italic",
                fontWeight: 500,
                lineHeight: 1.16,
                letterSpacing: "-0.005em",
                textWrap: "balance",
                display: "flex",
              }}
            >
              {set}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: portrait ? 56 : 32,
            }}
          >
            {/* The same short olive rule the site's quote attributions use. */}
            <div
              style={{
                width: 64,
                height: 2,
                background: "#8a7d20",
                marginBottom: portrait ? 28 : 20,
                display: "flex",
              }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: portrait ? "column" : "row",
                justifyContent: "space-between",
                alignItems: portrait ? "flex-start" : "flex-end",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    color: "#8a7d20",
                    fontSize: portrait ? 24 : 19,
                    letterSpacing: "0.28em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: portrait ? 12 : 8,
                  }}
                >
                  Clay · Stop Being Prey
                </div>
                <div
                  style={{
                    color: "#5c544c",
                    fontSize: portrait ? 30 : 23,
                    fontStyle: "italic",
                    fontFamily: "Source Serif, Cormorant Garamond, serif",
                    fontWeight: 400,
                    maxWidth: portrait ? 860 : 760,
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 1,
                    overflow: "hidden",
                  }}
                >
                  {title}
                </div>
              </div>
              <div
                style={{
                  color: "#8a8077",
                  fontSize: portrait ? 20 : 16,
                  letterSpacing: "0.24em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginTop: portrait ? 40 : 0,
                }}
              >
                stopbeingprey.com
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  );
}
