import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getArticleBySlug } from "@/lib/articles";

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

/**
 * Membership-themed OG card. Same visual chassis as the /join and article
 * cards (pattern replication, not abstraction) with the membership pitch.
 * Smaller title size than /join since the line is longer.
 */
export async function generateMembershipOG(): Promise<ImageResponse> {
  const eyebrow = "Membership · Stop Being Prey";
  const title = "The room behind the work.";
  const deck =
    "Comments, the desk, the lounge, and the book drafted in the open. The room where you learn to see the moves before they're run on you. From $13 a month.";

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
