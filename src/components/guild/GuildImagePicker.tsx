"use client";

import React, { useRef, useState } from "react";
import { resizeImageToWebp } from "@/lib/image-resize";

// One optional image for a Guild thread. Kept deliberately plain: a clear
// "Add a photo" button, a thumbnail once chosen, and a "Remove photo"
// button. The file is downscaled to WebP in the browser and uploaded to our
// Blob store (the shared Lounge endpoint); the resulting URL + dimensions
// ride along as hidden form fields, which the post action reads. Renders
// inside the composer <form>, so the hidden inputs submit with it.

type Pending = { url: string; width: number; height: number };

export function GuildImagePicker({
  onUploadingChange,
}: {
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setUp(next: boolean) {
    setUploading(next);
    onUploadingChange?.(next);
  }

  function clear() {
    setImage(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let them re-pick the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That doesn't look like a photo. Try a JPG or PNG.");
      return;
    }
    clear();
    setUp(true);
    setPreview(URL.createObjectURL(file));
    try {
      const { blob, width, height } = await resizeImageToWebp(file);
      const fd = new FormData();
      fd.append("file", new File([blob], "image.webp", { type: "image/webp" }));
      const res = await fetch("/api/lounge/upload", { method: "POST", body: fd });
      const data: { ok?: boolean; url?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok || !data.url) {
        setError(
          data.error === "daily_limit"
            ? "You've hit today's photo limit."
            : "That photo didn't upload. Try again."
        );
        clear();
        return;
      }
      setImage({ url: data.url, width, height });
    } catch {
      setError("Couldn't read that photo. Try another one.");
      clear();
    } finally {
      setUp(false);
    }
  }

  return (
    <div style={{ marginTop: "0.9rem" }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onPick}
        style={{ display: "none" }}
      />

      {image ? (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "0.9rem" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview ?? image.url}
            alt=""
            style={{
              width: 150,
              height: 150,
              objectFit: "cover",
              borderRadius: 5,
              border: "1px solid var(--rule)",
            }}
          />
          <button
            type="button"
            onClick={clear}
            style={{
              background: "transparent",
              border: "1px solid var(--rule)",
              borderRadius: 5,
              color: "var(--ink-muted)",
              padding: "0.5rem 0.9rem",
              fontFamily: "var(--font-source-serif), Georgia, serif",
              fontSize: "0.92rem",
              cursor: "pointer",
            }}
          >
            Remove photo
          </button>
          <input type="hidden" name="mediaUrl" value={image.url} />
          <input type="hidden" name="mediaWidth" value={image.width} />
          <input type="hidden" name="mediaHeight" value={image.height} />
        </div>
      ) : (
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
          {uploading ? "Adding photo…" : "Add a photo"}
        </button>
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
