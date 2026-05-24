"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";
import { WatchWireControl } from "@/components/WatchWireControl";

// Admin controls for The Watch Feed (live broadcast surface above the
// lounge). Two pieces:
//   - WatchFeedComposer: textbox + optional link + post button
//   - WatchFeedRecent: list of recent posts with per-row delete
//
// Loaded inside /admin/desk. Uses fetch to /api/admin/watch-feed (no
// router.refresh) because the admin desk page renders many panels and
// re-running its server pass on every keystroke is wasteful — instead
// each composer / list keeps its own local state and replays the
// server snapshot on mount.

type WatchPost = {
  id: string;
  body: string;
  link: string | null;
  createdAt: number;
  audioUrl?: string | null;
  durationSeconds?: number | null;
};

const MAX_BODY = 600;
const MAX_LINK = 2048;
// Mirrors the voice-memo recorder cap (src/lib/voice-memos.ts).
const MAX_VOICE_DURATION = 90;

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type VoiceTake = {
  blob: Blob;
  url: string;
  durationSeconds: number;
  mime: string;
};

type AutoResizingTextareaProps =
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows" | "ref"> & {
    value: string;
    minRows?: number;
  };

function AutoResizingTextarea({
  value,
  minRows = 2,
  style,
  ...rest
}: AutoResizingTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      style={{ resize: "none", overflow: "hidden", ...style }}
      {...rest}
    />
  );
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type WatchFeedAdminProps = {
  initialPosts: WatchPost[];
};

export function WatchFeedAdmin({ initialPosts }: WatchFeedAdminProps) {
  const [posts, setPosts] = useState<WatchPost[]>(initialPosts);
  const [expanded, setExpanded] = useState<boolean>(false);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/watch-feed", { method: "GET" });
      const data: { ok?: boolean; posts?: WatchPost[] } = await res
        .json()
        .catch(() => ({}));
      if (res.ok && data.ok && Array.isArray(data.posts)) {
        setPosts(data.posts);
      }
    } catch {
      // Silent — the existing snapshot stays on the page.
    }
  }

  return (
    <div className="mb-10 pb-8 border-b border-rule">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="watch-feed-admin-body"
        className="flex items-center gap-3 w-full text-left"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          marginBottom: expanded ? "1.25rem" : 0,
        }}
      >
        <span
          className={
            posts.length > 0
              ? "desk-status-dot desk-status-dot-active"
              : "desk-status-dot desk-status-dot-quiet"
          }
          aria-hidden="true"
        />
        <span
          className="font-display uppercase text-ink flex-1"
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.24em",
            fontWeight: 600,
          }}
        >
          The Watch Feed &middot;{" "}
          {posts.length === 0
            ? "Empty"
            : posts.length === 1
              ? "1 post live"
              : `${posts.length} posts live`}
        </span>
        <span
          aria-hidden="true"
          className="text-ink-faint"
          style={{
            fontSize: "0.75rem",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.18s ease",
            display: "inline-block",
            lineHeight: 1,
          }}
        >
          &rsaquo;
        </span>
      </button>

      {expanded && (
        <div id="watch-feed-admin-body">
          <WatchFeedToggle />

          <WatchWireControl />

          <p
            className="font-serif italic text-ink-muted mb-5"
            style={{ fontSize: "0.92rem" }}
          >
            Live broadcast above the lounge chat. Cards appear in
            members&apos; feed within a few seconds. Newest first; cap
            at 50, older ones drop off the bottom.
          </p>

          <WatchFeedComposer onPosted={refresh} />

          <WatchFeedRecent posts={posts} onDeleted={refresh} />
        </div>
      )}
    </div>
  );
}

// On/off switch for showing the Watch Feed on the live lounge. Self-
// contained: reads /api/admin/watch-toggle on mount, flips it on tap.
// Off by default, so the feed never resurfaces to members on its own.
function WatchFeedToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/watch-toggle", {
          cache: "no-store",
        });
        const data: { ok?: boolean; enabled?: boolean } = await res
          .json()
          .catch(() => ({}));
        if (!cancelled && res.ok && data.ok) setEnabled(!!data.enabled);
      } catch {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (pending || enabled === null) return;
    const next = !enabled;
    setPending(true);
    // Optimistic — snap the switch, reconcile on the response.
    setEnabled(next);
    try {
      const res = await fetch("/api/admin/watch-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data: { ok?: boolean; enabled?: boolean } = await res
        .json()
        .catch(() => ({}));
      if (res.ok && data.ok) setEnabled(!!data.enabled);
      else setEnabled(!next);
    } catch {
      setEnabled(!next);
    } finally {
      setPending(false);
    }
  }

  const on = enabled === true;

  return (
    <div
      className="flex items-center justify-between gap-4 mb-5 px-4 py-3"
      style={{
        background: on ? "rgba(52, 163, 86, 0.08)" : "var(--paper-deep)",
        border: `1px solid ${on ? "rgba(52, 163, 86, 0.4)" : "var(--rule)"}`,
      }}
    >
      <div className="min-w-0">
        <p
          className="font-display uppercase text-ink"
          style={{
            fontSize: "0.68rem",
            letterSpacing: "0.2em",
            fontWeight: 700,
          }}
        >
          {enabled === null
            ? "Show on lounge · …"
            : on
              ? "Live on the lounge"
              : "Hidden from members"}
        </p>
        <p
          className="font-serif italic text-ink-muted mt-0.5"
          style={{ fontSize: "0.82rem" }}
        >
          {on
            ? "Members see the Wire + Billboard right now."
            : "Flip on when the event starts."}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending || enabled === null}
        role="switch"
        aria-checked={on}
        aria-label="Show the Watch Feed on the lounge"
        style={{
          position: "relative",
          flex: "none",
          width: 46,
          height: 26,
          borderRadius: 999,
          border: `1px solid ${on ? "#2c8f49" : "var(--rule)"}`,
          background: on ? "#34a356" : "var(--paper)",
          padding: 0,
          cursor: pending ? "wait" : "pointer",
          opacity: enabled === null ? 0.6 : 1,
          transition: "background 0.18s ease, border-color 0.18s ease",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
            transform: on ? "translateX(20px)" : "translateX(0)",
            transition: "transform 0.18s ease",
          }}
        />
      </button>
    </div>
  );
}

function recorderErrorMessage(code: string): string {
  switch (code) {
    case "file_too_large":
      return "Recording is over the size cap. Try a shorter clip.";
    case "invalid_duration":
      return `Voice note must be 1–${MAX_VOICE_DURATION} seconds.`;
    case "blob_not_configured":
      return "Audio storage isn't configured (missing BLOB_READ_WRITE_TOKEN).";
    case "upload_failed":
      return "Upload failed. Try again.";
    case "transcode_failed":
      return "Couldn't convert the recording. Try again.";
    case "ffmpeg_unavailable":
      return "Audio transcoder is missing on the server. Contact deploy.";
    case "not_supported":
      return "This browser doesn't support in-browser recording.";
    case "permission_denied":
      return "Microphone access denied. Allow it in your browser settings.";
    case "no_audio_device":
      return "No microphone found. Plug one in and try again.";
    case "missing_body":
      return "Add a caption before posting.";
    default:
      return code;
  }
}

function WatchFeedComposer({ onPosted }: { onPosted: () => void }) {
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [take, setTake] = useState<VoiceTake | null>(null);
  // Bumping this remounts the recorder block, resetting it to idle
  // after a successful post (cleaner than threading reset callbacks).
  const [recorderKey, setRecorderKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVoice = take !== null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!body.trim()) return;

    setPending(true);
    setError(null);
    try {
      let res: Response;
      if (take) {
        // Voice note → multipart. The caption rides in `body`; the
        // browser sets the multipart boundary, so no Content-Type here.
        const form = new FormData();
        form.append(
          "audio",
          take.blob,
          `note.${take.mime.includes("mp4") ? "m4a" : "webm"}`
        );
        form.append("body", body);
        if (link.trim()) form.append("link", link.trim());
        form.append("durationSeconds", String(take.durationSeconds));
        form.append("mimeHint", take.mime);
        res = await fetch("/api/admin/watch-feed", {
          method: "POST",
          body: form,
        });
      } else {
        res = await fetch("/api/admin/watch-feed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, link: link.trim() || undefined }),
        });
      }
      const data: { ok?: boolean; error?: string; message?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || recorderErrorMessage(data.error ?? "post_failed"));
        setPending(false);
        return;
      }
      if (take?.url) URL.revokeObjectURL(take.url);
      setBody("");
      setLink("");
      setTake(null);
      setRecorderKey((k) => k + 1);
      setPending(false);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "post_failed");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mb-8">
      <label className="block">
        <span className="eyebrow block mb-2" style={{ fontSize: "0.65rem" }}>
          {isVoice ? "Caption" : "New post"}
        </span>
        <AutoResizingTextarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          minRows={3}
          maxLength={MAX_BODY}
          placeholder={
            isVoice
              ? "One-line hook for the voice note. Shows on the card and in The Wire."
              : "What does the room need to see right now?"
          }
          disabled={pending}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
      </label>

      <label className="block">
        <span className="eyebrow block mb-2" style={{ fontSize: "0.65rem" }}>
          Link (optional)
        </span>
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value.slice(0, MAX_LINK))}
          placeholder="https://…"
          disabled={pending}
          spellCheck={false}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "0.95rem" }}
        />
      </label>

      <div className="pt-1">
        <span className="eyebrow block mb-2" style={{ fontSize: "0.65rem" }}>
          Voice note (optional)
        </span>
        <VoiceRecorderBlock
          key={recorderKey}
          disabled={pending}
          onTake={setTake}
          onError={setError}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.8rem" }}
        >
          {body.length} / {MAX_BODY}
        </span>
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="btn-primary"
          style={{
            opacity: pending || !body.trim() ? 0.6 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>
            {pending
              ? isVoice
                ? "posting voice…"
                : "posting…"
              : isVoice
                ? "post voice note"
                : "post to feed"}
          </span>
        </button>
      </div>
      {error && (
        <p
          className="font-serif italic text-sm"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}

// Self-contained in-browser recorder for the Watch Feed composer.
// Ported from the voice-memo recorder (VoiceMemoAdmin) and trimmed to
// record → preview → emit. Reuses the shared `voice-record-*` styles.
// Lifecycle: idle → arming → armed → recording → recorded. On a
// captured take it calls `onTake(bundle)`; "Clear" returns to armed and
// calls `onTake(null)`. Parent resets it by remounting via `key`.
type RecorderStage =
  | "idle"
  | "arming"
  | "armed"
  | "recording"
  | "recorded";

function VoiceRecorderBlock({
  disabled,
  onTake,
  onError,
}: {
  disabled: boolean;
  onTake: (take: VoiceTake | null) => void;
  onError: (msg: string | null) => void;
}) {
  const [stage, setStage] = useState<RecorderStage>("idle");
  const [supported, setSupported] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTakeLocal] = useState<VoiceTake | null>(null);

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
    setSupported(
      typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function"
    );
  }, []);

  useEffect(() => {
    return () => {
      teardownAll();
      if (take?.url) URL.revokeObjectURL(take.url);
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
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
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

  async function arm(): Promise<boolean> {
    if (streamRef.current && analyserRef.current) return true;
    onError(null);
    setStage("arming");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as DOMException)?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        onError(recorderErrorMessage("permission_denied"));
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        onError(recorderErrorMessage("no_audio_device"));
      } else {
        onError("Couldn't access the microphone.");
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
    } catch {
      // VU meter is decorative — fine without it.
    }
    setStage("armed");
    return true;
  }

  function pickMimeType(): string {
    if (typeof MediaRecorder === "undefined") return "";
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
        // ignore
      }
    }
    return "";
  }

  async function handleRecordButton() {
    if (!supported) {
      onError(recorderErrorMessage("not_supported"));
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
    onError(null);
    const mime = pickMimeType();
    mimeRef.current = mime;
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(streamRef.current, { mimeType: mime })
        : new MediaRecorder(streamRef.current);
    } catch {
      onError(recorderErrorMessage("not_supported"));
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => handleRecorderStopped();
    rec.onerror = () => {
      onError("Recording errored out. Try again.");
      cleanupAfterRecording();
      setStage("armed");
    };
    recorderRef.current = rec;
    startedAtRef.current = performance.now();
    setElapsed(0);
    rec.start(250);
    tickTimerRef.current = window.setInterval(() => {
      const secs = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_VOICE_DURATION) stopRecording();
    }, 100) as unknown as number;
    runVuLoop();
    setStage("recording");
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
  }

  function handleRecorderStopped() {
    const finalElapsed = (performance.now() - startedAtRef.current) / 1000;
    cleanupAfterRecording();
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const mime = mimeRef.current || chunks[0]?.type || "audio/webm";
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const bundle: VoiceTake = {
      blob,
      url,
      durationSeconds: Math.max(1, Math.min(MAX_VOICE_DURATION, finalElapsed)),
      mime,
    };
    setTakeLocal(bundle);
    onTake(bundle);
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
  }

  function clearTake() {
    if (take?.url) URL.revokeObjectURL(take.url);
    setTakeLocal(null);
    onTake(null);
    setElapsed(0);
    onError(null);
    setStage(streamRef.current ? "armed" : "idle");
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
        const level = sum / binsPerCol / 255;
        const lit = Math.pow(level, 0.7);
        const barH = Math.max(2, lit * h);
        const x = i * colW + gap / 2;
        const y = (h - barH) / 2;
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

  if (!supported) {
    return (
      <p
        className="font-serif italic text-ink-faint"
        style={{ fontSize: "0.85rem" }}
      >
        {recorderErrorMessage("not_supported")} Post text instead.
      </p>
    );
  }

  const remaining = Math.max(0, MAX_VOICE_DURATION - elapsed);
  let buttonLabel = "Record";
  let buttonClass = "voice-record-btn";
  if (stage === "arming") buttonLabel = "Requesting mic…";
  else if (stage === "armed") buttonLabel = "Start recording";
  else if (stage === "recording") {
    buttonLabel = "Stop recording";
    buttonClass += " voice-record-btn-recording";
  }

  return (
    <div className="voice-record-shell">
      {stage !== "recorded" && (
        <button
          type="button"
          onClick={handleRecordButton}
          disabled={disabled || stage === "arming"}
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
          Mic is live. Click <strong>Start recording</strong> when ready.
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
              {formatDuration(MAX_VOICE_DURATION)}
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

      {stage === "recorded" && take && (
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
              Voice note attached
            </span>
            <span
              className="font-display uppercase text-ink-muted"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.22em",
                fontWeight: 600,
              }}
            >
              · {formatDuration(take.durationSeconds)}
            </span>
          </div>
          <audio
            src={take.url}
            controls
            preload="metadata"
            style={{ width: "100%" }}
          />
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <button
              type="button"
              onClick={clearTake}
              disabled={disabled}
              className="btn-secondary"
            >
              <span>Clear / re-record</span>
            </button>
          </div>
        </div>
      )}
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

function WatchFeedRecent({
  posts,
  onDeleted,
}: {
  posts: WatchPost[];
  onDeleted: () => void;
}) {
  const [now, setNow] = useState<number>(Date.now());

  // Tick relative timestamps once per minute.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (posts.length === 0) {
    return (
      <p
        className="font-serif italic text-ink-faint"
        style={{ fontSize: "0.95rem" }}
      >
        Nothing posted yet. Drop the first card to start the room.
      </p>
    );
  }

  return (
    <div>
      <p
        className="eyebrow mb-3"
        style={{ fontSize: "0.6rem" }}
      >
        Live cards
      </p>
      <ul className="flex flex-col">
        {posts.map((p, idx) => (
          <li
            key={p.id}
            className={
              idx === 0 ? "py-4" : "py-4 border-t border-rule"
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p
                  className="font-serif italic text-ink-faint mb-1"
                  style={{ fontSize: "0.78rem" }}
                >
                  {formatRelative(p.createdAt, now)} &middot;{" "}
                  {formatTimestamp(p.createdAt)}
                  {p.audioUrl && (
                    <span
                      className="font-display uppercase text-eye-deep"
                      style={{
                        fontSize: "0.6rem",
                        letterSpacing: "0.2em",
                        fontWeight: 700,
                      }}
                    >
                      {" "}
                      &middot; 🎙 Voice
                      {typeof p.durationSeconds === "number"
                        ? ` · ${formatDuration(p.durationSeconds)}`
                        : ""}
                    </span>
                  )}
                </p>
                <p
                  className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                  style={{ fontSize: "0.98rem" }}
                >
                  {p.body}
                </p>
                {p.audioUrl && (
                  <audio
                    src={p.audioUrl}
                    controls
                    preload="none"
                    style={{ width: "100%", marginTop: "0.5rem" }}
                  />
                )}
                {p.link && (
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-serif text-eye-deep hover:text-ink no-underline break-all"
                    style={{ fontSize: "0.85rem" }}
                  >
                    {p.link}
                  </a>
                )}
              </div>
              <DeleteButton id={p.id} onDeleted={onDeleted} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeleteButton({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/admin/watch-feed/${id}`, {
        method: "DELETE",
      });
      if (res.ok) onDeleted();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep no-underline transition-colors"
      style={{
        fontSize: "0.62rem",
        fontWeight: 500,
        background: "transparent",
        border: 0,
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "…" : "delete"}
    </button>
  );
}

function formatRelative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}
