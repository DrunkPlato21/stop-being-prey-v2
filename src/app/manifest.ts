import type { MetadataRoute } from "next";

// Public web manifest: gives Android "Add to home screen" a proper name
// and icon. display "browser" keeps it a website, not an app shell; the
// admin desk has its own standalone manifest (src/app/admin/layout.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stop Being Prey",
    short_name: "SBP",
    start_url: "/",
    display: "browser",
    background_color: "#f5efe1",
    theme_color: "#f5efe1",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
