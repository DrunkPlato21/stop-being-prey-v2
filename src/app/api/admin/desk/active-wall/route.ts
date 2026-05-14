import type { NextRequest } from "next/server";
import {
  extractWallSlug,
  getWallOverride,
  setWallOverride,
} from "@/lib/active-wall";
import { getAllWalls } from "@/lib/walls";

// Admin control for the Writer's Desk widget's Active Wall panel.
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*.
//
// GET  -> { ok, override, resolvedSlug, resolvedTitle, knownSlugs }
// PUT  { enabled?: boolean, featuredInput?: string }
//      enabled   -- master on/off for the widget panel.
//      featuredInput -- raw pasted value (URL or slug). Server extracts
//                       the canonical slug and stores it. Pass "" to
//                       clear the pin (returns to auto-selection).

export const runtime = "nodejs";

type WallChoice = { slug: string; title: string; status: string };

function buildResponse(
  override: { enabled: boolean; featuredSlug: string },
  walls: WallChoice[]
) {
  const resolvedSlug = override.featuredSlug || null;
  const matched = resolvedSlug
    ? walls.find((w) => w.slug === resolvedSlug)
    : null;
  return {
    ok: true,
    override,
    walls,
    resolvedSlug,
    resolvedTitle: matched?.title ?? null,
    isKnown: resolvedSlug ? !!matched : true,
  };
}

function listWallChoices(): WallChoice[] {
  return getAllWalls().map((w) => ({
    slug: w.slug,
    title: w.title,
    status: w.status,
  }));
}

export async function GET() {
  const override = await getWallOverride();
  return Response.json(buildResponse(override, listWallChoices()));
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawEnabled = (body as { enabled?: unknown })?.enabled;
  const rawInput = (body as { featuredInput?: unknown })?.featuredInput;

  const patch: { enabled?: boolean; featuredSlug?: string } = {};
  if (typeof rawEnabled === "boolean") {
    patch.enabled = rawEnabled;
  }
  if (typeof rawInput === "string") {
    patch.featuredSlug = extractWallSlug(rawInput);
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "nothing_to_update" }, { status: 400 });
  }

  // Soft-validate the pinned slug: warn (not block) on unknown slugs so
  // a typo doesn't strand the admin with a save error. The selection
  // logic falls back to auto when the slug doesn't match a wall.
  const override = await setWallOverride(patch);
  return Response.json(buildResponse(override, listWallChoices()));
}
