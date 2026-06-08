import { generateMembershipOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const alt =
  "The room behind the work. Comments, the desk, the lounge, and the book drafted in the open. From $13 a month.";

export default async function MembershipOpengraphImage() {
  return generateMembershipOG();
}
