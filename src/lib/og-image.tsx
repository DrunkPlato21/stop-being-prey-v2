import { ImageResponse } from "next/og";
import { getArticleBySlug } from "@/lib/articles";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

async function loadGoogleFont(
  family: string,
  weight: number,
  style: "normal" | "italic"
): Promise<ArrayBuffer | null> {
  const styleParam =
    style === "italic" ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(
    / /g,
    "+"
  )}:${styleParam}`;
  try {
    const css = await fetch(cssUrl, {
      // Old-IE UA → Google Fonts serves TTF, which Satori can decode.
      // Modern UAs get WOFF2, which @vercel/og doesn't decompress.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)",
      },
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.text());
    const match = css.match(/src:\s*url\((https:[^)]+)\)\s*format/);
    if (!match) return null;
    const fontRes = await fetch(match[1], {
      signal: AbortSignal.timeout(5000),
    });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
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
    loadGoogleFont("Cormorant Garamond", 700, "normal"),
    loadGoogleFont("Source Serif 4", 400, "italic"),
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
