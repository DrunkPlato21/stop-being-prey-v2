import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
// ffmpeg-static exports the absolute path to the prebuilt binary for
// the current platform. Marked `serverExternalPackages` in next.config
// so the binary doesn't get rewritten / lost by the bundler.
import ffmpegPath from "ffmpeg-static";

// Transcode whatever the browser captured (webm/opus, mp4/aac, etc)
// into an MP3 we can serve to every browser uniformly. Keeps a 90s
// guard so a runaway input can't burn CPU forever.

const MAX_INPUT_BYTES = 12 * 1024 * 1024; // 12MB raw recording cap
const FFMPEG_TIMEOUT_MS = 30_000;

export type TranscodeResult =
  | { ok: true; mp3: Buffer }
  | { ok: false; error: "ffmpeg_unavailable" | "input_too_large" | "transcode_failed" };

/**
 * Encode `input` (a buffer of recorded audio in whatever format the
 * browser produced) into an MP3 buffer at 96 kbps mono. Uses
 * /tmp scratch files so ffmpeg can rely on seekable input.
 */
export async function transcodeToMp3(
  input: Buffer,
  extensionHint?: string
): Promise<TranscodeResult> {
  if (!ffmpegPath) {
    return { ok: false, error: "ffmpeg_unavailable" };
  }
  if (input.length > MAX_INPUT_BYTES) {
    return { ok: false, error: "input_too_large" };
  }

  // Sanitize extension hint — only used for ffmpeg's autodetect hint.
  const ext =
    extensionHint && /^[a-z0-9]{2,5}$/i.test(extensionHint)
      ? extensionHint.toLowerCase()
      : "bin";

  const dir = await mkdtemp(path.join(tmpdir(), "voice-memo-"));
  const inputPath = path.join(dir, `in.${ext}`);
  const outputPath = path.join(dir, `out.mp3`);

  try {
    await writeFile(inputPath, input);

    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1", // mono — voice memos don't need stereo
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "96k",
      outputPath,
    ];

    const ok = await runFfmpeg(ffmpegPath, args);
    if (!ok) {
      return { ok: false, error: "transcode_failed" };
    }
    const mp3 = await readFile(outputPath);
    return { ok: true, mp3 };
  } catch (err) {
    console.error("transcode error", err);
    return { ok: false, error: "transcode_failed" };
  } finally {
    // Best-effort scratch cleanup.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runFfmpeg(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, FFMPEG_TIMEOUT_MS);
    proc.stderr.on("data", (d) => {
      // Keep last ~2KB of stderr for diagnostics on failure.
      stderr = (stderr + d.toString()).slice(-2048);
    });
    proc.on("error", (err) => {
      clearTimeout(killTimer);
      console.error("ffmpeg spawn error", err);
      resolve(false);
    });
    proc.on("close", (code) => {
      clearTimeout(killTimer);
      if (code === 0) {
        resolve(true);
      } else {
        console.error("ffmpeg exited", code, stderr);
        resolve(false);
      }
    });
  });
}
