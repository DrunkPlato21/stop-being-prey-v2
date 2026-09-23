import { generateMembershipOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Re-render hourly instead of baking the price in at build time. The
// deck names the live floor, which steps $13 -> $18 by itself when the
// charter cap fills; without this the card would keep advertising the
// old rate until the next deploy. One Redis read an hour at most.
export const revalidate = 3600;

export const alt =
  "Back the writing. Set your own rate and keep me at the desk.";

export default async function PatronageTwitterImage() {
  return generateMembershipOG();
}
