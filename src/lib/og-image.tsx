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
async function loadFont(file: string): Promise<Buffer | null> {
  try {
    return await readFile(join(process.cwd(), "assets", file));
  } catch {
    return null;
  }
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
  const title = "What this is.";
  const deck =
    "A note from Clay. Recovering libertarian, writing the playbook. The work that doesn't fit on Facebook. On power, politics, and the apex class.";

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

export async function generateArticleOG(slug: string): Promise<ImageResponse> {
  const article = await getArticleBySlug(slug);
  const title = article?.title ?? "Stop Being Prey";
  const description =
    article?.description ?? "On power, politics, and the apex class.";
  const chapter = article?.chapter;

  // Cap the description so it fits on ~2 lines at 36px italic across the
  // full editorial column. Satori's WebkitLineClamp isn't reliable here, so
  // the truncation is the truth.
  const trimmedDesc =
    description.length > 140
      ? description.slice(0, 137).replace(/[\s,;.]+$/, "") + "…"
      : description;

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
              }}
            >
              {trimmedDesc}
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
