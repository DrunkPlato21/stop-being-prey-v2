import { generateJoinOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const alt =
  "Join the list. Original writing on politics, power, and the apex class.";

export default async function JoinTwitterImage() {
  return generateJoinOG();
}
