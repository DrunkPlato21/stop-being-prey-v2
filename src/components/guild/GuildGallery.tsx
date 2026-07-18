"use client";

import type { GuildImageMedia } from "@/lib/guild-constants";
import { GuildImage } from "./GuildImage";

// Renders a post's attached images. One image keeps the standalone look it
// always had (natural aspect, its own lightbox). Two or more lay out as a
// square grid — two columns — each cell its own lightbox. A trailing odd
// image simply sits in the first column; a considered post caps at a few
// images, so the layouts stay clean without special-casing every count.
export function GuildGallery({ images }: { images: GuildImageMedia[] }) {
  if (!images.length) return null;
  if (images.length === 1) return <GuildImage media={images[0]} />;

  return (
    <div
      style={{
        marginTop: "1rem",
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "0.5rem",
      }}
    >
      {images.map((media, i) => (
        <GuildImage key={media.url + i} media={media} variant="cell" />
      ))}
    </div>
  );
}
