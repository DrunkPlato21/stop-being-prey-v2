import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";

const wallsDirectory = path.join(process.cwd(), "content", "walls");

export type WallStatus = "active" | "closed";

export type WallMeta = {
  slug: string;
  title: string;
  /** Optional one-line context that sits directly under the title in
      the compact hero, e.g. "Tied to the Charlie Kirk thread on
      Facebook · May 9, 2026". */
  context?: string;
  /** Optional URL to the source artifact (Facebook comment thread,
      tweet, etc.) — surfaced as a small external-link icon next to
      the hero context. */
  facebookUrl?: string;
  /** Optional subtitle line, rendered as the deck inside the expandable
      takedown section (NOT in the compact hero). */
  subtitle?: string;
  /** Per-wall donation form copy. Each takedown has a different
      subject, so the heading and pitch live with the content. */
  donateOverline?: string;
  donateHeading?: string;
  donateSubtitle?: string;
  /** Italic hint block rendered directly above the note textarea —
      sets tone for what kind of note belongs on this wall. */
  noteGuidelines?: string;
  /** Short framing sentence rendered directly above the donation form,
      after the wall stats. Use for "what this wall is about" copy that
      shouldn't compete with the hero. */
  donateContext?: string;
  /** Time-sensitive line rendered directly above the preset amount
      buttons, e.g. "Marek reads these tomorrow morning." */
  urgencyLine?: string;
  /** Stretch-goal ladder in dollars, sorted ascending. Once total raised
      crosses a tier, the bar snaps to the next tier and starts filling
      again (Tiltify-style). Single-tier ladders behave like a fixed goal.
      Accepts `goal_tiers: [250, 500, 1000]` or legacy `goal_dollars: 250`. */
  goalTiers?: number[];
  /** Cold-reader summary paragraph rendered below the wall, above the
      expandable takedown. */
  intro: string;
  status: WallStatus;
  /** ISO date when the founding-window prize period ends. After this,
      the top donor is identified manually for the v1 prize fulfillment. */
  foundingWindowEndsAt?: string;
};

export type Wall = WallMeta & {
  takedownHtml: string;
};

export function getAllWallSlugs(): string[] {
  if (!fs.existsSync(wallsDirectory)) return [];
  return fs
    .readdirSync(wallsDirectory)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

function parseGoalTiers(data: Record<string, unknown>): number[] | undefined {
  if (Array.isArray(data.goal_tiers)) {
    const tiers = data.goal_tiers
      .filter((n): n is number => typeof n === "number" && n > 0)
      .sort((a, b) => a - b);
    return tiers.length > 0 ? tiers : undefined;
  }
  if (typeof data.goal_dollars === "number" && data.goal_dollars > 0) {
    return [data.goal_dollars];
  }
  return undefined;
}

function parseMeta(slug: string, data: Record<string, unknown>): WallMeta {
  const status =
    data.status === "closed" ? "closed" : "active";
  return {
    slug: typeof data.slug === "string" ? data.slug : slug,
    title: typeof data.title === "string" ? data.title : slug,
    context:
      typeof data.context === "string" && data.context.trim().length > 0
        ? data.context
        : undefined,
    facebookUrl:
      typeof data.facebook_url === "string" && data.facebook_url.trim().length > 0
        ? data.facebook_url
        : undefined,
    subtitle:
      typeof data.subtitle === "string" && data.subtitle.trim().length > 0
        ? data.subtitle
        : undefined,
    donateOverline:
      typeof data.donate_overline === "string" &&
      data.donate_overline.trim().length > 0
        ? data.donate_overline
        : undefined,
    donateHeading:
      typeof data.donate_heading === "string" &&
      data.donate_heading.trim().length > 0
        ? data.donate_heading
        : undefined,
    donateSubtitle:
      typeof data.donate_subtitle === "string" &&
      data.donate_subtitle.trim().length > 0
        ? data.donate_subtitle
        : undefined,
    noteGuidelines:
      typeof data.note_guidelines === "string" &&
      data.note_guidelines.trim().length > 0
        ? data.note_guidelines
        : undefined,
    donateContext:
      typeof data.donate_context === "string" &&
      data.donate_context.trim().length > 0
        ? data.donate_context
        : undefined,
    urgencyLine:
      typeof data.urgency_line === "string" &&
      data.urgency_line.trim().length > 0
        ? data.urgency_line
        : undefined,
    goalTiers: parseGoalTiers(data),
    intro: typeof data.intro === "string" ? data.intro : "",
    status,
    foundingWindowEndsAt:
      typeof data.founding_window_ends_at === "string"
        ? data.founding_window_ends_at
        : undefined,
  };
}

export function getAllWalls(): WallMeta[] {
  return getAllWallSlugs().map((slug) => {
    const fullPath = path.join(wallsDirectory, `${slug}.md`);
    const { data } = matter(fs.readFileSync(fullPath, "utf8"));
    return parseMeta(slug, data);
  });
}

export async function getWallBySlug(slug: string): Promise<Wall | null> {
  const fullPath = path.join(wallsDirectory, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;

  const { data, content } = matter(fs.readFileSync(fullPath, "utf8"));
  const processed = await remark().use(html).process(content);

  return {
    ...parseMeta(slug, data),
    takedownHtml: processed.toString(),
  };
}
