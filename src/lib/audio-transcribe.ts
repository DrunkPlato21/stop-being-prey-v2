// Voice transcription via OpenAI Whisper. Light wrapper: no SDK, just
// the multipart REST call. Whisper accepts webm/mp4/mp3/m4a/wav out of
// the box, so we can transcribe the raw recording directly without
// waiting for our MP3 transcode to finish.

export type TranscribeResult =
  | { ok: true; text: string }
  | {
      ok: false;
      error:
        | "openai_not_configured"
        | "transcribe_failed"
        | "rate_limited"
        | "audio_invalid";
    };

/**
 * Send the given audio buffer to Whisper and return the transcript.
 * `filename` is what we tell the API the file is called (with a real
 * extension so Whisper picks the right decoder). Mime is informational.
 */
export async function transcribeAudio(
  audio: Buffer,
  filename: string,
  mime: string
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "openai_not_configured" };
  }

  const form = new FormData();
  // Convert Buffer → ArrayBuffer slice so we can hand a Blob to FormData.
  const ab = audio.buffer.slice(
    audio.byteOffset,
    audio.byteOffset + audio.byteLength
  ) as ArrayBuffer;
  form.append("file", new Blob([ab], { type: mime }), filename);
  form.append("model", "whisper-1");
  form.append("response_format", "json");
  // English-only memos so far; Whisper auto-detects but biasing toward
  // English improves accuracy on short clips.
  form.append("language", "en");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (err) {
    console.error("whisper fetch failed", err);
    return { ok: false, error: "transcribe_failed" };
  }

  if (res.status === 429) {
    return { ok: false, error: "rate_limited" };
  }
  if (res.status === 400) {
    return { ok: false, error: "audio_invalid" };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("whisper non-200", res.status, detail.slice(0, 500));
    return { ok: false, error: "transcribe_failed" };
  }

  let data: { text?: unknown };
  try {
    data = (await res.json()) as { text?: unknown };
  } catch {
    return { ok: false, error: "transcribe_failed" };
  }
  if (typeof data.text !== "string") {
    return { ok: false, error: "transcribe_failed" };
  }
  return { ok: true, text: data.text.trim() };
}
