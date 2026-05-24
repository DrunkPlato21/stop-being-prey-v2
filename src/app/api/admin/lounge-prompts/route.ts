import type { NextRequest } from "next/server";
import {
  clearScheduledPrompts,
  enqueuePrompts,
  isLoungeConfigured,
  listScheduledPrompts,
} from "@/lib/lounge";

// Admin control for scheduled lounge prompts (conversation starters +
// drip). Gated by proxy.ts via HTTP Basic auth on /api/admin/*.
//   GET    → { ok, prompts }   pending queue, soonest first
//   POST   → { prompts: [{ text, delayMinutes, pin? }] }
//            Reveal times are computed server-side from delayMinutes so
//            there's no client/server clock skew. delayMinutes 0 = post
//            on the next poll (within a few seconds).
//   DELETE → clear the whole pending queue
//
// Prompts post as host-authored lounge posts when their reveal time
// passes; the reveal itself is driven by the lounge GET poll, so this
// route only schedules — it never posts directly.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROMPTS = 20;

export async function GET() {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const prompts = await listScheduledPrompts();
  return Response.json({ ok: true, prompts });
}

export async function POST(req: NextRequest) {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawPrompts = (payload as { prompts?: unknown })?.prompts;
  if (!Array.isArray(rawPrompts) || rawPrompts.length === 0) {
    return Response.json({ error: "no_prompts" }, { status: 400 });
  }

  const now = Date.now();
  const toEnqueue: Array<{ text: string; revealAt: number; pin?: boolean }> =
    [];
  for (const raw of rawPrompts.slice(0, MAX_PROMPTS)) {
    const text = (raw as { text?: unknown })?.text;
    if (typeof text !== "string" || !text.trim()) continue;
    const delayRaw = (raw as { delayMinutes?: unknown })?.delayMinutes;
    const delayMinutes =
      typeof delayRaw === "number" && Number.isFinite(delayRaw)
        ? Math.max(0, delayRaw)
        : 0;
    const pin = !!(raw as { pin?: unknown })?.pin;
    toEnqueue.push({
      text,
      revealAt: now + Math.round(delayMinutes * 60_000),
      pin,
    });
  }

  if (toEnqueue.length === 0) {
    return Response.json({ error: "no_prompts" }, { status: 400 });
  }

  const stored = await enqueuePrompts(toEnqueue);
  const prompts = await listScheduledPrompts();
  return Response.json({ ok: true, stored, prompts });
}

export async function DELETE() {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  await clearScheduledPrompts();
  return Response.json({ ok: true, prompts: [] });
}
