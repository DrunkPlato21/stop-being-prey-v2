import { generateMembershipOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Reuses the membership card art for now — same brand, same act. If the
// patronage frame earns its own card later, swap the generator here and
// in twitter-image.tsx together.
export const alt =
  "Back the writing. Set your own rate and keep me at the desk.";

export default async function PatronageOpengraphImage() {
  return generateMembershipOG();
}
