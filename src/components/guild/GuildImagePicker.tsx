"use client";

import React, { useRef, useState } from "react";
import { resizeImageToWebp } from "@/lib/image-resize";
import { MAX_IMAGES, type GuildImageMedia } from "@/lib/guild-constants";

// Up to MAX_IMAGES for a Guild thread or reply. Kept deliberately plain: an
// "Add a photo" button, a row of thumbnails once chosen (each with its own
// remove), and the button hiding itself at the cap. Every file is downscaled
// to WebP in the browser and uploaded to our Blob store (the shared Lounge
// endpoint); the resulting list rides along as ONE hidden JSON field, which
// the post action parses. Renders inside the composer <form>, so it submits
// with it.

type Pending = GuildImageMedia & { preview: string };

export function GuildImagePicker({
  onUploadingChange,
  onImageChange,
}: {
  onUploadingChange?: (uploading: boolean) => void;
  // Fires true once at least one image is attached, false when the last is
  // cleared. Lets a composer enable "send" for an image-only post.
  onImageChange?: (hasImage: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setUp(next: boolean) {
    setUploading(next);
    onUploadingChange?.(next);
  }

  function removeAt(index: number) {
    setImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      const next = prev.filter((_, i) => i !== index);
      onImageChange?.(next.length > 0);
      return next;
    });
    setError(null);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // let them re-pick the same file
    if (!files.length) return;
    setError(null);

    // How many more we can take. Extra picks past the cap are dropped with
    // a note rather than silently ignored.
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`You can add up to ${MAX_IMAGES} photos.`);
      return;
    }
    const take = files.slice(0, room);
    if (files.length > room) {
      setError(`You can add up to ${MAX_IMAGES} photos. Some weren't added.`);
    }

    setUp(true);
    try {
      for (const file of take) {
        if (!file.type.startsWith("image/")) {
          setError("That doesn't look like a photo. Try a JPG or PNG.");
          continue;
        }
        const preview = URL.createObjectURL(file);
        try {
          const { blob, width, height } = await resizeImageToWebp(file);
          const fd = new FormData();
          fd.append(
            "file",
            new File([blob], "image.webp", { type: "image/webp" })
          );
          const res = await fetch("/api/lounge/upload", {
            method: "POST",
            body: fd,
          });
          const data: { ok?: boolean; url?: string; error?: string } = await res
            .json()
            .catch(() => ({}));
          if (!res.ok || !data.ok || !data.url) {
            setError(
              data.error === "daily_limit"
                ? "You've hit today's photo limit."
                : "That photo didn't upload. Try again."
            );
            URL.revokeObjectURL(preview);
            continue;
          }
          setImages((prev) => {
            const next = [
              ...prev,
              { type: "image" as const, url: data.url!, width, height, preview },
            ];
            onImageChange?.(next.length > 0);
            return next;
          });
        } catch {
          setError("Couldn't read that photo. Try another one.");
          URL.revokeObjectURL(preview);
        }
      }
    } finally {
      setUp(false);
    }
  }

  // The serialized list the post action reads. Strip the client-only preview.
  const hiddenValue = JSON.stringify(
    images.map(({ type, url, width, height }) => ({ type, url, width, height }))
  );

  return (
    <div style={{ marginTop: "0.9rem" }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPick}
        style={{ display: "none" }}
      />

      {images.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.7rem",
            marginBottom: "0.7rem",
          }}
        >
          {images.map((img, i) => (
            <div key={img.url} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.preview}
                alt=""
                style={{
                  width: 110,
                  height: 110,
                  objectFit: "cover",
                  borderRadius: 5,
                  border: "1px solid var(--rule)",
                  display: "block",
                }}
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Remove photo"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 24,
                  height: 24,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "50%",
                  border: "1px solid var(--rule)",
                  background: "var(--surface)",
                  color: "var(--ink-muted)",
                  fontSize: "1rem",
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length < MAX_IMAGES && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            border: "1px dashed var(--rule)",
            borderRadius: 6,
            background: "var(--surface)",
            color: "var(--ink-muted)",
            padding: "0.65rem 1.1rem",
            fontFamily: "var(--font-source-serif), Georgia, serif",
            fontSize: "0.98rem",
            cursor: uploading ? "default" : "pointer",
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: "1.1rem", lineHeight: 1 }}>
            +
          </span>
          {uploading
            ? "Adding photo…"
            : images.length > 0
              ? "Add another"
              : "Add a photo"}
        </button>
      )}

      {images.length > 0 && (
        <input type="hidden" name="media" value={hiddenValue} />
      )}

      {error && (
        <p
          style={{
            color: "var(--blood)",
            fontSize: "0.88rem",
            marginTop: "0.55rem",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
