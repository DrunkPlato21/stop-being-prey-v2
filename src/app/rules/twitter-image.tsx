import { generateRulesOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const alt =
  "The 7 Rules. Power decides, not righteousness. Seven rules for everyone tired of being the prey. The first one's free.";

export default async function RulesTwitterImage() {
  return generateRulesOG();
}
