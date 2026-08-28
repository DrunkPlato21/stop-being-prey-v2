// Client-only screenshot redaction. Runs in the browser BEFORE upload,
// on the same canvas the downscale already uses, so what leaves this
// machine is the covered version and the original never leaves at all.
//
// THIS IS THE WHOLE POINT, so it is worth saying plainly: a CSS blur or
// an overlay div is not redaction. It leaves the untouched file in Blob
// storage with its URL sitting in the page source, and anyone who opens
// that URL reads the name straight off a screenshot that looked covered.
// Every function here works on pixels, and the pixels it covers are gone
// — there is no original kept anywhere to recover them from.
//
// Two modes, because they defend against different things:
//
//   fill   a solid rectangle. For TEXT. Blurred and pixelated text is
//          frequently recoverable — the glyph shapes survive the filter
//          and there is published work on reversing exactly this — so a
//          name never gets a blur, it gets painted out.
//
//   blur   a heavy gaussian. For FACES and avatars, where the job is
//          "you cannot tell who this is" rather than "you cannot read
//          this", and nobody is de-blurring a 40px profile picture into
//          an identification.

export type RedactMode = "fill" | "blur";

/** A rectangle in IMAGE pixel coordinates, not screen coordinates. The
    editor scales its canvas to fit the bench, so it converts on the way
    in; everything downstream of that works in the image's own space. */
export type RedactRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: RedactMode;
};

// Matches lib/image-resize.ts. Redaction happens AFTER the downscale so
// the boxes are drawn against the pixels that will actually ship, never
// against a larger original that gets resampled underneath them.
const MAX_EDGE = 1600;
const QUALITY = 0.82;

/** What the fill mode paints. Near-black rather than pure, so a covered
    strip reads as a deliberate mark on a screenshot rather than a hole
    punched in the page. */
const FILL = "#0b0906";

export type PreparedImage = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
};

/**
 * Decode and downscale, without encoding yet. The editor needs to show
 * the reader exactly the pixels that will be shipped, so the resize has
 * to happen before any box is drawn rather than after.
 *
 * Caller owns the bitmap and must call `.close()` when done with it.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const src = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(src.width, src.height));
  if (scale === 1) return { bitmap: src, width: src.width, height: src.height };
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  // Resample once, into a bitmap the editor and the encoder both use, so
  // the preview and the output cannot drift apart by a rounding step.
  const scaled = await createImageBitmap(src, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });
  src.close();
  return { bitmap: scaled, width, height };
}

/** A blur radius that scales with the box. A fixed radius smears a large
    face and barely touches a small one; a quarter of the shorter side
    keeps "unidentifiable" true at any size, with a floor so a tiny box
    still gets a real blur rather than a soft edge. */
function blurRadiusFor(w: number, h: number): number {
  return Math.max(6, Math.round(Math.min(Math.abs(w), Math.abs(h)) / 4));
}

/**
 * Paint the regions into a canvas and hand it back. Used for the live
 * preview and for the final encode, from one definition, so what the
 * reader approves is byte-for-byte what gets uploaded.
 */
export function renderRedacted(
  image: PreparedImage,
  regions: RedactRegion[]
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(image.bitmap, 0, 0, image.width, image.height);

  for (const r of regions) {
    // Boxes can be dragged in any direction, so normalise before use:
    // a negative width would clip to nothing and silently redact
    // nothing at all, which is the one failure this must not have.
    const x = Math.round(Math.min(r.x, r.x + r.w));
    const y = Math.round(Math.min(r.y, r.y + r.h));
    const w = Math.round(Math.abs(r.w));
    const h = Math.round(Math.abs(r.h));
    if (w < 2 || h < 2) continue;

    if (r.mode === "fill") {
      ctx.fillStyle = FILL;
      ctx.fillRect(x, y, w, h);
      continue;
    }

    // Blur: clip to the box, then redraw the WHOLE source through the
    // filter. Blurring only the cropped region would pull in the canvas
    // edge as transparent black and leave a dark halo inside the box;
    // redrawing everything means the blur samples the real neighbouring
    // pixels, and the clip keeps it inside the lines.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.filter = `blur(${blurRadiusFor(w, h)}px)`;
    ctx.drawImage(image.bitmap, 0, 0, image.width, image.height);
    ctx.restore();
  }
  return canvas;
}

/**
 * Encode a redacted canvas to the WebP that gets uploaded. Re-encoding
 * through the canvas also drops EXIF, same free win the plain resize
 * path already takes.
 */
export async function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode_failed"))),
      "image/webp",
      QUALITY
    );
  });
}

/** Prepared image straight to a shippable blob, with or without boxes.
    One path for both so an untouched screenshot and a redacted one are
    encoded identically. */
export async function redactToWebp(
  image: PreparedImage,
  regions: RedactRegion[]
): Promise<Blob> {
  return canvasToWebp(renderRedacted(image, regions));
}
