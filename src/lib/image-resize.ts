// Client-only image downscale + re-encode. Runs in the browser BEFORE
// upload so we never store or serve multi-MB phone photos — the whole
// reason lounge images stay cheap. Re-encoding through a canvas also
// strips EXIF (kills location-data leaks) for free. WebP output ~halves
// size again vs JPEG at the same quality.

export type ResizedImage = { blob: Blob; width: number; height: number };

const MAX_EDGE = 1600; // longest side after resize
const QUALITY = 0.82;

export async function resizeImageToWebp(file: File): Promise<ResizedImage> {
  // imageOrientation:"from-image" applies EXIF rotation so portrait phone
  // photos don't come out sideways.
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("encode_failed"))),
        "image/webp",
        QUALITY
      );
    });
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
