import { generateAboutOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const alt =
  "The fight I lost. How Clay stopped being prey: the 2015 argument, the Sowell page, the doctrine built in the comments.";

export default async function AboutOpengraphImage() {
  return generateAboutOG();
}
