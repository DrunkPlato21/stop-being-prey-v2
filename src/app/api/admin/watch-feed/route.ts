import type { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import {
  addWatchPost,
  isWatchFeedConfigured,
  listWatchPosts,
} from "@/lib/watch-feed";
import { transcodeToMp3 } from "@/lib/audio-transcode";
import {
  MAX_DURATION_SECONDS,
  MAX_FILE_BYTES,
  MIN_DURATION_SECONDS,
} from "@/lib/voice-memos";

// Admin endpoints for The Watch Feed. Gated by proxy.ts via HTTP Basic
// auth on /api/admin/*.
//   GET    → recent posts (for the admin form's "recent posts" list)
//   POST   → push a new post. Two shapes:
//     application/json        { body, link? }              text bulletin
//     multipart/form-data     audio + caption + link?      voice note
//
// Voice notes reuse the voice-memo pipeline: the raw browser recording
// is transcoded to MP3 (so iOS can play a Chrome-captured webm), the
// MP3 is uploaded to Vercel Blob, and the post stores the public URL +
// duration. The typed caption rides in `body` and does triple duty —
// the card hook, the Wire ticker line, and the text fallback. We
// deliberately skip Whisper here (unlike voice-memos) to keep a "live"
// card appearing within a couple of seconds of hitting send.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ffmpeg transcode of a <=90s clip runs a few seconds; 60s is ample.
export const maxDuration = 60;

export async function GET() {
  if (!isWatchFeedConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const posts = await listWatchPosts(20);
  return Response.json({ ok: true, posts });
}

// Admin Basic auth doesn't carry an identity beyond the env password,
// so the host email is sourced from ADMIN_EMAIL when present and a
// sentinel otherwise. Purely informational; not used for gating.
function hostEmail(): string {
  return process.env.ADMIN_EMAIL?.toLowerCase().trim() ?? "host";
}

function extensionFromMime(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes("webm")) return "webm";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac"))
    return "m4a";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  return "bin";
}

export async function POST(req: NextRequest) {
  if (!isWatchFeedConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return postVoiceNote(req);
  }
  return postTextBulletin(req);
}

async function postTextBulletin(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawBody = (payload as { body?: unknown })?.body;
  if (typeof rawBody !== "string") {
    return Response.json({ error: "missing_body" }, { status: 400 });
  }

  const rawLink = (payload as { link?: unknown })?.link;
  const link = typeof rawLink === "string" ? rawLink : undefined;

  const result = await addWatchPost({
    body: rawBody,
    link,
    hostEmail: hostEmail(),
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, post: result.post });
}

async function postVoiceNote(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "blob_not_configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const audio = form.get("audio");
  const captionRaw = form.get("body");
  const linkRaw = form.get("link");
  const durationRaw = form.get("durationSeconds");
  const mimeHintRaw = form.get("mimeHint");

  if (typeof captionRaw !== "string" || !captionRaw.trim()) {
    return Response.json({ error: "missing_body" }, { status: 400 });
  }
  if (!audio || typeof audio === "string") {
    return Response.json({ error: "missing_audio" }, { status: 400 });
  }
  if (audio.size === 0) {
    return Response.json({ error: "empty_audio" }, { status: 400 });
  }
  if (audio.size > MAX_FILE_BYTES) {
    return Response.json({ error: "file_too_large" }, { status: 400 });
  }

  const durationSeconds = Number.parseFloat(
    typeof durationRaw === "string" ? durationRaw : ""
  );
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < MIN_DURATION_SECONDS ||
    durationSeconds > MAX_DURATION_SECONDS
  ) {
    return Response.json(
      {
        error: "invalid_duration",
        message: `Voice note must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds.`,
      },
      { status: 400 }
    );
  }

  const incomingMime =
    typeof mimeHintRaw === "string" && mimeHintRaw.length > 0
      ? mimeHintRaw
      : audio.type || "application/octet-stream";
  const inputExt = extensionFromMime(incomingMime);

  const inputBuffer = Buffer.from(await audio.arrayBuffer());
  const transcode = await transcodeToMp3(inputBuffer, inputExt);
  if (!transcode.ok) {
    return Response.json(
      {
        error: transcode.error,
        message:
          transcode.error === "ffmpeg_unavailable"
            ? "Transcoding binary is unavailable. Check deploy."
            : "Couldn't convert the recording to MP3.",
      },
      { status: 500 }
    );
  }

  let blob;
  try {
    blob = await put("watch-feed/note.mp3", transcode.mp3, {
      access: "public",
      contentType: "audio/mpeg",
      addRandomSuffix: true,
    });
  } catch (err) {
    console.error("watch-feed voice blob upload failed", err);
    return Response.json({ error: "upload_failed" }, { status: 500 });
  }

  const link = typeof linkRaw === "string" ? linkRaw : undefined;
  const result = await addWatchPost({
    body: captionRaw,
    link,
    hostEmail: hostEmail(),
    audioUrl: blob.url,
    audioPathname: blob.pathname,
    durationSeconds,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, post: result.post });
}
