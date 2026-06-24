import { generateWallOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const alt =
  "Add your name. Stop Being Prey runs on readers, not ads or sponsors. Back it with a dollar and your name goes on the wall.";

export default async function WallOpengraphImage() {
  return generateWallOG();
}
