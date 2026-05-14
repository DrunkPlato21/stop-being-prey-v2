"use client";

import { useEffect, useRef, useState } from "react";
import type { VoiceMemo, VoiceMemoStatus } from "@/lib/voice-memos";

// Admin island for voice memos: in-browser recorder + past-memo list.
//
// Flow (idle → published):
//   1. Click Record → request mic permission (one-time per browser).
//   2. After permission granted, click Record again → MediaRecorder starts.
//      Visible elapsed counter + VU meter + 90s auto-stop.
//   3. Click Stop → recording captured. Audio preview appears.
//   4. Re-record (discard + back to step 2) or Use this recording.
//   5. Use → uploads to /api/admin/voice-memos. Server transcodes to MP3,
//      runs Whisper transcription, returns a *draft* memo.
//   6. Review form: title + auto-transcript (editable). Publish or Save
//      as draft → PATCHes the draft and resets the recorder.

const MAX_DURATION = 90;
const MAX_TITLE = 120;
const MAX_TRANSCRIPT = 10_000;

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function errorMessage(code: string): string {
  switch (code) {
    case "file_too_large":
      return "Recording is over the size cap. Try a shorter clip.";
    case "invalid_duration":
      return `Recording must be 1–${MAX_DURATION} seconds.`;
    case "blob_not_configured":
      return "Audio storage isn't configured (missing BLOB_READ_WRITE_TOKEN).";
    case "storage_unavailable":
      return "Storage backend is unavailable. Try again in a moment.";
    case "upload_failed":
      return "Upload failed. Try again.";
    case "transcode_failed":
      return "Couldn't convert the recording. Try again.";
    case "ffmpeg_unavailable":
      return "Audio transcoder is missing on the server. Contact deploy.";
    case "openai_not_configured":
      return "Transcript skipped (OpenAI key not set). You can type one below.";
    case "rate_limited":
      return "Transcription rate-limited. Try again or type a transcript.";
    case "audio_invalid":
      return "Transcription rejected the audio. Try re-recording.";
    case "transcribe_failed":
      return "Auto-transcript failed. You can type one below.";
    case "not_supported":
      return "Your browser doesn't support in-browser recording.";
    case "permission_denied":
      return "Microphone access denied. Allow it in your browser settings.";
    case "no_audio_device":
      return "No microphone found. Plug one in and try again.";
    default:
      return code;
  }
}

/**
 * Pick the best MediaRecorder mimeType available in this browser. We
 * still transcode server-side, so any captured format works — but we
 * prefer webm/opus where supported (smaller, more standard) and fall
 * back to mp4 (Safari) before the browser default.
 */
function pickMimeType(): string {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // ignore — some browsers throw on unsupported queries
    }
  }
  return "";
}

export function VoiceMemoAdmin({
  initialMemos,
}: {
  initialMemos: VoiceMemo[];
}) {
  const [memos, setMemos] = useState<VoiceMemo[]>(initialMemos);

  function onCreated(memo: VoiceMemo) {
    setMemos((prev) => [memo, ...prev]);
  }
  function onUpdated(memo: VoiceMemo) {
    setMemos((prev) => prev.map((m) => (m.id === memo.id ? memo : m)));
  }
  function onDeleted(id: string) {
    setMemos((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="flex flex-col gap-12">
      <RecorderForm onCreated={onCreated} onUpdated={onUpdated} />

      <section>
        <h2
          className="font-display text-ink mb-5"
          style={{ fontSize: "1.15rem", fontWeight: 700 }}
        >
          Past memos
        </h2>

        {memos.length === 0 ? (
          <p className="font-serif italic text-ink-faint">
            No memos yet. Record one above.
          </p>
        ) : (
          <ul className="flex flex-col">
            {memos.map((memo, idx) => (
              <li
                key={memo.id}
                className={idx === 0 ? "py-6" : "py-6 border-t border-rule"}
              >
                <MemoRow
                  memo={memo}
                  onUpdated={onUpdated}
                  onDeleted={onDeleted}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type RecorderStage =
  | "idle" // before permission requested
  | "arming" // requesting permission
  | "armed" // permission granted, stream live, ready to record
  | "recording" // MediaRecorder.start in progress
  | "recorded" // have a blob, awaiting review
  | "uploading" // sent to server for transcode + transcribe
  | "review" // server returned a draft; editing title + transcript
  | "publishing"; // PATCHing the draft

type RecordingBundle = {
  blob: Blob;
  url: string;
  durationSeconds: number;
  mime: string;
};

function RecorderForm({
  onCreated,
  onUpdated,
}: {
  onCreated: (memo: VoiceMemo) => void;
  onUpdated: (memo: VoiceMemo) => void;
}) {
  const [stage, setStage] = useState<RecorderStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcriptNotice, setTranscriptNotice] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean>(true);

  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<RecordingBundle | null>(null);
  const [draft, setDraft] = useState<VoiceMemo | null>(null);
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");

  // Imperative refs for the audio pipeline. None of these should live
  // in React state — they're not used for rendering and would cause
  // re-renders on every frame of the VU meter.
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("");
  const startedAtRef = useRef<number>(0);
  const tickTimerRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok =
      typeof MediaRecorder !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function";
    setSupported(ok);
  }, []);

  // Tear down everything on unmount. Microphone permission stays
  // granted at the browser level; we just release the active tracks.
  useEffect(() => {
    return () => {
      teardownAll();
      if (recording?.url) URL.revokeObjectURL(recording.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function teardownAll() {
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    try {
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
    } catch {
      // ignore
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }

  /** Acquire the mic stream and the analyser. Idempotent. */
  async function arm(): Promise<boolean> {
    if (streamRef.current && analyserRef.current) return true;
    setError(null);
    setStage("arming");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as DOMException)?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError(errorMessage("permission_denied"));
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError(errorMessage("no_audio_device"));
      } else {
        setError("Couldn't access the microphone.");
      }
      setStage("idle");
      return false;
    }
    streamRef.current = stream;

    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch (err) {
      console.warn("VU meter unavailable", err);
    }

    setStage("armed");
    return true;
  }

  async function handleRecordButton() {
    if (!supported) {
      setError(errorMessage("not_supported"));
      return;
    }
    if (stage === "idle" || stage === "arming") {
      await arm();
      return;
    }
    if (stage === "armed") {
      startRecording();
      return;
    }
    if (stage === "recording") {
      stopRecording();
    }
  }

  function startRecording() {
    if (!streamRef.current) return;
    setError(null);
    const mime = pickMimeType();
    mimeRef.current = mime;
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(streamRef.current, { mimeType: mime })
        : new MediaRecorder(streamRef.current);
    } catch (err) {
      console.error("MediaRecorder construct failed", err);
      setError(errorMessage("not_supported"));
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      handleRecorderStopped();
    };
    rec.onerror = (e) => {
      console.error("MediaRecorder error", e);
      setError("Recording errored out. Try again.");
      cleanupAfterRecording();
      setStage("armed");
    };

    recorderRef.current = rec;
    startedAtRef.current = performance.now();
    setElapsed(0);
    rec.start(250); // collect chunks every 250ms

    // Elapsed counter + 90s auto-stop guard.
    tickTimerRef.current = window.setInterval(() => {
      const secs = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_DURATION) {
        stopRecording();
      }
    }, 100) as unknown as number;

    // VU meter animation loop.
    runVuLoop();

    setStage("recording");
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch (err) {
        console.error("stop failed", err);
      }
    }
    // The rest happens in `handleRecorderStopped` (onstop callback).
  }

  function handleRecorderStopped() {
    const finalElapsed = (performance.now() - startedAtRef.current) / 1000;
    cleanupAfterRecording();

    const chunks = chunksRef.current;
    chunksRef.current = [];
    const mime = mimeRef.current || chunks[0]?.type || "audio/webm";
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    setRecording({
      blob,
      url,
      durationSeconds: Math.max(1, Math.min(MAX_DURATION, finalElapsed)),
      mime,
    });
    setStage("recorded");
  }

  function cleanupAfterRecording() {
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    // Leave the stream + analyser running so "Re-record" doesn't have
    // to re-prompt or rebuild. They tear down on unmount.
  }

  function runVuLoop() {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const bins = analyser.frequencyBinCount;
    const data = new Uint8Array(bins);

    function draw() {
      if (!analyser || !canvas || !ctx2d) return;
      analyser.getByteFrequencyData(data);
      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      const cols = 24;
      const colW = w / cols;
      const gap = Math.max(2, Math.floor(colW * 0.2));
      const barW = colW - gap;
      const binsPerCol = Math.max(1, Math.floor(bins / cols));

      for (let i = 0; i < cols; i++) {
        let sum = 0;
        for (let b = 0; b < binsPerCol; b++) {
          sum += data[i * binsPerCol + b] ?? 0;
        }
        const level = sum / binsPerCol / 255; // 0..1
        // Slight gamma to make low signals readable.
        const lit = Math.pow(level, 0.7);
        const barH = Math.max(2, lit * h);
        const x = i * colW + gap / 2;
        const y = (h - barH) / 2;
        // Olive/gold gradient on the lit portion.
        const grad = ctx2d.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, "#d6c14b");
        grad.addColorStop(1, "#a59624");
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(x, y, barW, barH);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }
    draw();
  }

  function discardRecording() {
    if (recording?.url) URL.revokeObjectURL(recording.url);
    setRecording(null);
    setElapsed(0);
    setError(null);
    setTranscriptNotice(null);
    setStage("armed");
  }

  async function uploadRecording() {
    if (!recording) return;
    setError(null);
    setTranscriptNotice(null);
    setStage("uploading");
    try {
      const form = new FormData();
      form.append(
        "audio",
        recording.blob,
        `memo.${recording.mime.includes("mp4") ? "m4a" : "webm"}`
      );
      form.append("durationSeconds", String(recording.durationSeconds));
      form.append("mimeHint", recording.mime);
      const res = await fetch("/api/admin/voice-memos", {
        method: "POST",
        body: form,
      });
      const data: {
        ok?: boolean;
        memo?: VoiceMemo;
        error?: string;
        message?: string;
        transcriptError?: string | null;
      } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.memo) {
        setError(
          data.message || errorMessage(data.error ?? "upload_failed")
        );
        setStage("recorded");
        return;
      }
      onCreated(data.memo);
      if (data.transcriptError) {
        setTranscriptNotice(errorMessage(data.transcriptError));
      }
      setDraft(data.memo);
      setTitle("");
      setTranscript(data.memo.transcript ?? "");
      setStage("review");
    } catch (err) {
      console.error(err);
      setError("Upload failed. Try again.");
      setStage("recorded");
    }
  }

  async function finalize(publish: boolean) {
    if (!draft) return;
    setError(null);
    setStage("publishing");
    const status: VoiceMemoStatus = publish ? "published" : "draft";
    const payload: Record<string, unknown> = {
      title: title.trim() || "Untitled voice memo",
      transcript: transcript.trim() ? transcript.trim() : null,
      status,
    };
    try {
      const res = await fetch(`/api/admin/voice-memos/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: { ok?: boolean; memo?: VoiceMemo; error?: string } =
        await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.memo) {
        setError(errorMessage(data.error ?? "save_failed"));
        setStage("review");
        return;
      }
      onUpdated(data.memo);
      resetAll();
    } catch (err) {
      console.error(err);
      setError("Save failed. Try again.");
      setStage("review");
    }
  }

  function resetAll() {
    if (recording?.url) URL.revokeObjectURL(recording.url);
    setRecording(null);
    setDraft(null);
    setTitle("");
    setTranscript("");
    setElapsed(0);
    setError(null);
    setTranscriptNotice(null);
    setStage(streamRef.current ? "armed" : "idle");
  }

  /* === Render branches ===================================== */

  const showRecorder =
    stage === "idle" ||
    stage === "arming" ||
    stage === "armed" ||
    stage === "recording" ||
    stage === "recorded";

  return (
    <section className="flex flex-col gap-5">
      <h2
        className="font-display text-ink"
        style={{ fontSize: "1.15rem", fontWeight: 700 }}
      >
        New memo
      </h2>

      {!supported && (
        <div
          className="border border-border bg-paper px-4 py-3"
          style={{ borderRadius: "2px" }}
        >
          <p
            className="font-serif italic"
            style={{ color: "#7a3a2e", fontSize: "0.95rem" }}
          >
            {errorMessage("not_supported")}
          </p>
        </div>
      )}

      {showRecorder && (
        <RecorderPanel
          stage={stage}
          elapsed={elapsed}
          recording={recording}
          canvasRef={canvasRef}
          onRecordClick={handleRecordButton}
          onDiscard={discardRecording}
          onUse={uploadRecording}
        />
      )}

      {stage === "uploading" && (
        <div
          className="border border-border bg-paper px-5 py-6 text-center"
          style={{ borderRadius: "2px" }}
        >
          <p
            className="font-display uppercase text-ink-muted mb-2"
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.22em",
              fontWeight: 600,
            }}
          >
            Working
          </p>
          <p className="font-serif text-ink" style={{ fontSize: "1rem" }}>
            Converting audio and writing the transcript…
          </p>
          <p
            className="font-serif italic text-ink-faint mt-1"
            style={{ fontSize: "0.85rem" }}
          >
            Usually 10–15 seconds.
          </p>
        </div>
      )}

      {(stage === "review" || stage === "publishing") && draft && (
        <ReviewPanel
          draft={draft}
          title={title}
          transcript={transcript}
          transcriptNotice={transcriptNotice}
          pending={stage === "publishing"}
          onTitleChange={setTitle}
          onTranscriptChange={setTranscript}
          onPublish={() => finalize(true)}
          onDraft={() => finalize(false)}
        />
      )}

      {error && (
        <p
          className="font-serif italic"
          style={{ color: "#7a3a2e", fontSize: "0.9rem" }}
        >
          {error}
        </p>
      )}
    </section>
  );
}

function RecorderPanel({
  stage,
  elapsed,
  recording,
  canvasRef,
  onRecordClick,
  onDiscard,
  onUse,
}: {
  stage: RecorderStage;
  elapsed: number;
  recording: RecordingBundle | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onRecordClick: () => void;
  onDiscard: () => void;
  onUse: () => void;
}) {
  const remaining = Math.max(0, MAX_DURATION - elapsed);

  let buttonLabel: string;
  let buttonClass = "voice-record-btn";
  if (stage === "idle") {
    buttonLabel = "Record";
  } else if (stage === "arming") {
    buttonLabel = "Requesting mic…";
  } else if (stage === "armed") {
    buttonLabel = "Start Recording";
  } else if (stage === "recording") {
    buttonLabel = "Stop Recording";
    buttonClass += " voice-record-btn-recording";
  } else {
    buttonLabel = "Recorded";
  }

  return (
    <div className="voice-record-shell">
      {stage !== "recorded" && (
        <button
          type="button"
          onClick={onRecordClick}
          disabled={stage === "arming"}
          className={buttonClass}
          aria-label={buttonLabel}
        >
          <span className="voice-record-glyph" aria-hidden="true">
            {stage === "recording" ? <StopGlyph /> : <MicGlyph />}
          </span>
          <span className="voice-record-label">{buttonLabel}</span>
        </button>
      )}

      {stage === "armed" && (
        <p
          className="font-serif italic text-ink-muted text-center mt-3"
          style={{ fontSize: "0.92rem" }}
        >
          Mic is live. Click <strong>Start Recording</strong> when you&apos;re
          ready.
        </p>
      )}

      {stage === "recording" && (
        <div className="voice-record-live">
          <div className="voice-record-elapsed">
            <span className="voice-record-rec-dot" aria-hidden="true" />
            <span>{formatDuration(elapsed)}</span>
            <span className="voice-record-elapsed-sep" aria-hidden="true">
              /
            </span>
            <span className="voice-record-elapsed-max">
              {formatDuration(MAX_DURATION)}
            </span>
          </div>
          <canvas
            ref={canvasRef}
            width={420}
            height={56}
            className="voice-record-vu"
            aria-hidden="true"
          />
          {remaining <= 10 && (
            <p
              className="font-display uppercase text-center"
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.22em",
                color: "#7a3a2e",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              Auto-stops in {Math.ceil(remaining)}s
            </p>
          )}
        </div>
      )}

      {stage === "recorded" && recording && (
        <div className="voice-record-preview">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span
              className="font-display uppercase"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.22em",
                fontWeight: 700,
                color: "var(--eye-deep)",
              }}
            >
              Take captured
            </span>
            <span
              className="font-display uppercase text-ink-muted"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.22em",
                fontWeight: 600,
              }}
            >
              · {formatDuration(recording.durationSeconds)}
            </span>
          </div>
          <audio
            src={recording.url}
            controls
            preload="metadata"
            style={{ width: "100%" }}
          />
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <button
              type="button"
              onClick={onDiscard}
              className="btn-secondary"
            >
              <span>Re-record</span>
            </button>
            <button
              type="button"
              onClick={onUse}
              className="btn-primary"
            >
              <span>Use this recording</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewPanel({
  draft,
  title,
  transcript,
  transcriptNotice,
  pending,
  onTitleChange,
  onTranscriptChange,
  onPublish,
  onDraft,
}: {
  draft: VoiceMemo;
  title: string;
  transcript: string;
  transcriptNotice: string | null;
  pending: boolean;
  onTitleChange: (v: string) => void;
  onTranscriptChange: (v: string) => void;
  onPublish: () => void;
  onDraft: () => void;
}) {
  return (
    <div
      className="border border-border bg-paper px-5 py-6"
      style={{ borderRadius: "2px" }}
    >
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span
          className="font-display uppercase"
          style={{
            fontSize: "0.65rem",
            letterSpacing: "0.22em",
            fontWeight: 700,
            color: "var(--eye-deep)",
          }}
        >
          Review
        </span>
        <span
          className="font-display uppercase text-ink-muted"
          style={{
            fontSize: "0.65rem",
            letterSpacing: "0.22em",
            fontWeight: 600,
          }}
        >
          · {formatDuration(draft.durationSeconds)}
        </span>
      </div>

      <audio
        src={draft.audioUrl}
        controls
        preload="metadata"
        style={{ width: "100%", marginBottom: "1.25rem" }}
      />

      <label className="block mb-4">
        <span className="eyebrow block mb-2">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value.slice(0, MAX_TITLE))}
          maxLength={MAX_TITLE}
          placeholder="e.g. Quick note on Field Note 4"
          disabled={pending}
          autoFocus
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "1rem" }}
        />
      </label>

      <label className="block">
        <span className="eyebrow block mb-2">
          Transcript
          <span className="text-ink-faint normal-case tracking-normal">
            {" "}
            (auto-generated — edit before publishing)
          </span>
        </span>
        <textarea
          value={transcript}
          onChange={(e) =>
            onTranscriptChange(e.target.value.slice(0, MAX_TRANSCRIPT))
          }
          rows={6}
          maxLength={MAX_TRANSCRIPT}
          placeholder={
            transcriptNotice ? "Type a transcript here." : "Transcribing…"
          }
          disabled={pending}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink resize-y w-full"
          style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
        />
        <p
          className="font-serif italic text-ink-faint mt-2"
          style={{ fontSize: "0.78rem" }}
        >
          {transcript.length} / {MAX_TRANSCRIPT}
        </p>
      </label>

      {transcriptNotice && (
        <p
          className="font-serif italic mt-3"
          style={{ color: "#7a3a2e", fontSize: "0.88rem" }}
        >
          {transcriptNotice}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 mt-6 flex-wrap">
        <button
          type="button"
          onClick={onDraft}
          disabled={pending}
          className="btn-secondary"
          style={{
            opacity: pending ? 0.6 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>{pending ? "saving…" : "Save as draft"}</span>
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={pending}
          className="btn-primary"
          style={{
            opacity: pending ? 0.6 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>{pending ? "publishing…" : "Publish"}</span>
        </button>
      </div>
    </div>
  );
}

function MicGlyph() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5.5 11 A6.5 6.5 0 0 0 18.5 11" />
      <line x1="12" y1="17.5" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function MemoRow({
  memo,
  onUpdated,
  onDeleted,
}: {
  memo: VoiceMemo;
  onUpdated: (memo: VoiceMemo) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(memo.title);
  const [transcript, setTranscript] = useState(memo.transcript ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(payload: Record<string, unknown>) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/voice-memos/${memo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: { ok?: boolean; memo?: VoiceMemo; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok || !data.memo) {
        setError(errorMessage(data.error ?? "save_failed"));
        setPending(false);
        return;
      }
      onUpdated(data.memo);
      setEditing(false);
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
      setPending(false);
    }
  }

  async function handleDelete() {
    if (pending) return;
    if (!confirm(`Delete "${memo.title}"? The audio file is removed too.`))
      return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/voice-memos/${memo.id}`, {
        method: "DELETE",
      });
      const data: { ok?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(errorMessage(data.error ?? "delete_failed"));
        setPending(false);
        return;
      }
      onDeleted(memo.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete_failed");
      setPending(false);
    }
  }

  function togglePublish() {
    const next: VoiceMemoStatus =
      memo.status === "published" ? "draft" : "published";
    patch({ status: next });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="font-display uppercase"
              style={{
                fontSize: "0.6rem",
                letterSpacing: "0.22em",
                fontWeight: 700,
                color:
                  memo.status === "published"
                    ? "var(--eye-deep)"
                    : "var(--ink-faint)",
              }}
            >
              {memo.status === "published" ? "Published" : "Draft"}
            </span>
            <span
              className="font-display uppercase text-ink-muted"
              style={{
                fontSize: "0.6rem",
                letterSpacing: "0.22em",
                fontWeight: 600,
              }}
            >
              · {formatDuration(memo.durationSeconds)} ·{" "}
              {formatDate(memo.createdAt)}
            </span>
          </div>
          {!editing ? (
            <p
              className="font-display text-ink leading-snug"
              style={{ fontSize: "1.05rem", fontWeight: 700 }}
            >
              {memo.title}
            </p>
          ) : (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
              maxLength={MAX_TITLE}
              disabled={pending}
              className="font-display text-ink bg-paper border border-border px-3 py-2 outline-none focus:border-ink w-full"
              style={{ fontSize: "1.05rem", fontWeight: 700 }}
            />
          )}
        </div>
      </div>

      <audio
        src={memo.audioUrl}
        controls
        preload="none"
        style={{ width: "100%" }}
      />

      {!editing ? (
        memo.transcript ? (
          <details>
            <summary
              className="font-display uppercase text-ink-muted cursor-pointer"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.22em",
                fontWeight: 600,
              }}
            >
              Transcript
            </summary>
            <p
              className="font-serif text-ink leading-relaxed whitespace-pre-wrap mt-2"
              style={{ fontSize: "0.92rem" }}
            >
              {memo.transcript}
            </p>
          </details>
        ) : null
      ) : (
        <label className="block">
          <span className="eyebrow block mb-2">Transcript</span>
          <textarea
            value={transcript}
            onChange={(e) =>
              setTranscript(e.target.value.slice(0, MAX_TRANSCRIPT))
            }
            rows={4}
            disabled={pending}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink resize-y w-full"
            style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
          />
        </label>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {!editing ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="font-display uppercase tracking-[0.22em] text-ink-muted hover:text-ink no-underline transition-colors"
              style={{
                fontSize: "0.65rem",
                fontWeight: 500,
                background: "transparent",
                border: 0,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              edit
            </button>
            <button
              type="button"
              onClick={togglePublish}
              disabled={pending}
              className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
              style={{
                fontSize: "0.65rem",
                fontWeight: 600,
                background: "transparent",
                border: 0,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              {memo.status === "published" ? "unpublish" : "publish"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep no-underline transition-colors ml-auto"
              style={{
                fontSize: "0.65rem",
                fontWeight: 500,
                background: "transparent",
                border: 0,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              delete
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                patch({
                  title: title.trim() || memo.title,
                  transcript: transcript.trim() ? transcript.trim() : null,
                })
              }
              disabled={pending}
              className="btn-secondary"
              style={{
                opacity: pending ? 0.6 : 1,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              <span>{pending ? "saving…" : "save"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setTitle(memo.title);
                setTranscript(memo.transcript ?? "");
              }}
              disabled={pending}
              className="font-display uppercase tracking-[0.22em] text-ink-muted hover:text-ink transition-colors"
              style={{
                fontSize: "0.65rem",
                fontWeight: 500,
                background: "transparent",
                border: 0,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              cancel
            </button>
          </>
        )}
      </div>

      {error && (
        <p
          className="font-serif italic"
          style={{ color: "#7a3a2e", fontSize: "0.85rem" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
