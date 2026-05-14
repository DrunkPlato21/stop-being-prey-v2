import type { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import {
  MAX_DURATION_SECONDS,
  MAX_FILE_BYTES,
  MIN_DURATION_SECONDS,
  createMemo,
  isVoiceMemosConfigured,
  listAll,
} from "@/lib/voice-memos";
import { transcodeToMp3 } from "@/lib/audio-transcode";
import { transcribeAudio } from "@/lib/audio-transcribe";

// Admin endpoints for voice memos. Gated by proxy.ts via HTTP Basic Auth.
//
//   POST /api/admin/voice-memos
//     multipart/form-data:
//       audio:            File (recorded blob, any format MediaRecorder
//                         produced — server transcodes to MP3)
//       durationSeconds:  string (client-measured, server caps at 90)
//       mimeHint:         string (browser-reported mime, optional)
//
//     Behavior:
//       1. Validates size + duration.
//       2. Runs ffmpeg transcode → MP3 AND Whisper transcription in
//          parallel (Whisper accepts the raw recording).
//       3. Uploads the MP3 to Vercel Blob.
//       4. Creates a *draft* memo with the audio URL and auto-transcript.
//       5. Returns the draft so the admin can edit title/transcript and
//          publish via PATCH.
//
//     If transcription is unavailable or fails, the memo is still
//     created with an empty transcript — the admin can fill it in later.
//
//   GET /api/admin/voice-memos
//     newest-first list of all memos (drafts + published)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ffmpeg transcoding + Whisper call together can run 10-20s on a 90s
// clip. 60s ceiling gives plenty of headroom without being abusive.
export const maxDuration = 60;

export async function GET() {
  if (!isVoiceMemosConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const memos = await listAll(100);
  return Response.json({ ok: true, memos });
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
  if (!isVoiceMemosConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
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
  const durationRaw = form.get("durationSeconds");
  const mimeHintRaw = form.get("mimeHint");

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
        message: `Memo must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds.`,
      },
      { status: 400 }
    );
  }

  const incomingMime =
    typeof mimeHintRaw === "string" && mimeHintRaw.length > 0
      ? mimeHintRaw
      : audio.type || "application/octet-stream";
  const inputExt = extensionFromMime(incomingMime);

  // Pull the raw recording into a Buffer once. Used both as ffmpeg input
  // and as Whisper input (Whisper accepts webm/mp4 directly).
  const inputBuffer = Buffer.from(await audio.arrayBuffer());

  // Run transcode + transcription in parallel. Transcription is best-
  // effort — if it fails or no key is configured, we still publish the
  // audio with an empty transcript and let the admin fill it in.
  const [transcodeResult, transcribeResult] = await Promise.all([
    transcodeToMp3(inputBuffer, inputExt),
    transcribeAudio(
      inputBuffer,
      `memo.${inputExt}`,
      incomingMime
    ).catch((err): Awaited<ReturnType<typeof transcribeAudio>> => {
      console.error("transcribe threw", err);
      return { ok: false, error: "transcribe_failed" as const };
    }),
  ]);

  if (!transcodeResult.ok) {
    return Response.json(
      {
        error: transcodeResult.error,
        message:
          transcodeResult.error === "ffmpeg_unavailable"
            ? "Transcoding binary is unavailable. Check deploy."
            : "Couldn't convert the recording to MP3.",
      },
      { status: 500 }
    );
  }

  // Upload the MP3 to Vercel Blob.
  let blob;
  try {
    blob = await put("voice-memos/memo.mp3", transcodeResult.mp3, {
      access: "public",
      contentType: "audio/mpeg",
      addRandomSuffix: true,
    });
  } catch (err) {
    console.error("voice-memo blob upload failed", err);
    return Response.json({ error: "upload_failed" }, { status: 500 });
  }

  const transcript = transcribeResult.ok ? transcribeResult.text : null;
  const transcriptError = transcribeResult.ok ? null : transcribeResult.error;

  // Create as draft. The admin reviews title + transcript and flips to
  // published with a PATCH.
  const result = await createMemo({
    title: "Untitled voice memo",
    audioUrl: blob.url,
    audioPathname: blob.pathname,
    durationSeconds,
    transcript,
    publish: false,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({
    ok: true,
    memo: result.memo,
    transcriptError, // non-fatal flag the client can show as a notice
  });
}
