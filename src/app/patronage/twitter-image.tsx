import { generateMembershipOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const alt =
  "Back the writing. Set your own rate and keep me at the desk.";

export default async function PatronageTwitterImage() {
  return generateMembershipOG();
}
