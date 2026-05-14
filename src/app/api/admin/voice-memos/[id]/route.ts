import type { NextRequest } from "next/server";
import { del } from "@vercel/blob";
import {
  deleteMemo,
  getMemo,
  isVoiceMemosConfigured,
  updateMemo,
  type VoiceMemoStatus,
} from "@/lib/voice-memos";
import { listActiveMemberEmails } from "@/lib/members";
import { createForMembers } from "@/lib/notifications";

// Per-memo admin endpoints.
//   PATCH  { title?, transcript?, status? }  → edit fields / toggle publish
//   DELETE                                   → remove record + blob

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isStatus(v: unknown): v is VoiceMemoStatus {
  return v === "published" || v === "draft";
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isVoiceMemosConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const patch: {
    title?: string;
    transcript?: string | null;
    status?: VoiceMemoStatus;
  } = {};
  if (typeof b.title === "string") patch.title = b.title;
  if (b.transcript === null) {
    patch.transcript = null;
  } else if (typeof b.transcript === "string") {
    patch.transcript = b.transcript;
  }
  if (isStatus(b.status)) patch.status = b.status;

  // Capture prior state so we only fan out a notification when the
  // memo crosses from non-published to published (toggling between
  // draft and published shouldn't spam every member each click).
  const prior = await getMemo(id);
  const wasPublished = prior?.status === "published";

  const next = await updateMemo(id, patch);
  if (!next) return Response.json({ error: "not_found" }, { status: 404 });

  if (next.status === "published" && !wasPublished) {
    void (async () => {
      try {
        const emails = await listActiveMemberEmails();
        const duration = next.durationSeconds
          ? ` (${Math.round(next.durationSeconds)}s)`
          : "";
        await createForMembers(
          emails,
          {
            type: "voice_memo",
            title: "New voice memo from Clay",
            body: `${next.title}${duration}`,
            linkUrl: "/desk",
          }
        );
      } catch (err) {
        console.error(
          `[notifications] voice_memo fan-out failed for ${id}:`,
          err
        );
      }
    })();
  }

  return Response.json({ ok: true, memo: next });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isVoiceMemosConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const { id } = await ctx.params;
  const result = await deleteMemo(id);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 404 });
  }
  // Best-effort blob cleanup. If the blob is already gone (manual cleanup,
  // partial prior delete) we still consider the operation successful —
  // the record is gone, which is what the admin asked for.
  if (result.memo.audioUrl) {
    try {
      await del(result.memo.audioUrl);
    } catch (err) {
      console.warn("voice-memo blob delete failed (ignored)", err);
    }
  }
  return Response.json({ ok: true });
}
