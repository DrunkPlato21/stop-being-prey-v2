import { generateAboutOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const alt =
  "What this is. A note from Clay. Recovering libertarian, writing the playbook.";

export default async function AboutOpengraphImage() {
  return generateAboutOG();
}
