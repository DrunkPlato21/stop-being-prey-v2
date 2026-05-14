"use client";

import { useEffect, useRef, useState } from "react";
import type { VoiceMemo } from "@/lib/voice-memos";

// Member-facing voice memo player. Lives below the status panel on the
// Writer's Desk widget. One card per published memo — only the latest
// published memo is shown.
//
// Design priorities (in order):
//   1. Boomer-friendly: a clearly-labeled play affordance with both a
//      universal glyph and a small-caps text label, 44x44+ tap target,
//      high contrast.
//   2. Quiet: the card sits next to the rest of the widget without
//      shouting. The play action is the only thing that needs weight.
//   3. Read-or-listen: transcript is one click away, never auto-shown.

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelative(at: number, now: number): string {
  const diff = now - at;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function PlayGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path
        d="M7.5 5 L19 12 L7.5 19 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PauseGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <rect x="6.5" y="5" width="3.5" height="14" rx="0.6" fill="currentColor" />
      <rect x="14" y="5" width="3.5" height="14" rx="0.6" fill="currentColor" />
    </svg>
  );
}

function ReplayGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M3 12 A9 9 0 1 0 6 5.3" />
      <path d="M3 4 L3 9 L8 9" />
    </svg>
  );
}

export function VoiceMemoCard({
  memo,
  now,
}: {
  memo: VoiceMemo;
  /** Parent's `now` tick so the relative timestamp stays honest. */
  now: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasPlayedToEnd, setHasPlayedToEnd] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset playback when the memo itself changes (new memo polled in).
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setHasPlayedToEnd(false);
    setTranscriptOpen(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [memo.id]);

  async function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    setError(null);
    if (el.paused) {
      try {
        await el.play();
      } catch (err) {
        setError(
          err instanceof Error
            ? "Audio couldn't play. Try again in a moment."
            : "Audio couldn't play."
        );
      }
    } else {
      el.pause();
    }
  }

  function handleReplay() {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    setCurrentTime(0);
    setHasPlayedToEnd(false);
    el.play().catch(() => {
      setError("Audio couldn't play. Try again in a moment.");
    });
  }

  const duration = memo.durationSeconds;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  // Show "elapsed / total" in the meta line while the user is mid-
  // playback. Reverts to a clean static "0:03" before first play and
  // after the memo finishes.
  const showElapsed =
    isPlaying || (currentTime > 0 && !hasPlayedToEnd);
  const durationText = showElapsed
    ? `${formatDuration(currentTime)} / ${formatDuration(duration)}`
    : formatDuration(duration);

  const action: "play" | "pause" | "replay" = hasPlayedToEnd
    ? "replay"
    : isPlaying
      ? "pause"
      : "play";
  const buttonLabel =
    action === "replay" ? "Replay" : action === "pause" ? "Pause" : "Play memo";
  const buttonGlyph =
    action === "replay" ? (
      <ReplayGlyph />
    ) : action === "pause" ? (
      <PauseGlyph />
    ) : (
      <PlayGlyph />
    );

  return (
    <div className="voice-memo-card" data-playing={isPlaying ? "true" : "false"}>
      <audio
        ref={audioRef}
        src={memo.audioUrl}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setHasPlayedToEnd(true);
          setCurrentTime(memo.durationSeconds);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onError={() =>
          setError("Audio couldn't load. Refresh and try again.")
        }
      />

      <div className="voice-memo-card-top">
        <div className="voice-memo-control">
          <button
            type="button"
            onClick={action === "replay" ? handleReplay : togglePlay}
            aria-label={
              action === "replay"
                ? "Replay memo"
                : action === "pause"
                  ? "Pause"
                  : "Play memo"
            }
            className="voice-memo-circle"
            data-state={action}
          >
            {buttonGlyph}
          </button>
          <span className="voice-memo-circle-label">{buttonLabel}</span>
        </div>

        <div className="voice-memo-meta">
          <p className="voice-memo-title">{memo.title}</p>
          <p className="voice-memo-sub">
            <span>{durationText}</span>
            <span className="voice-memo-sub-sep" aria-hidden="true">
              ·
            </span>
            <span>
              {memo.publishedAt
                ? formatRelative(memo.publishedAt, now)
                : "just now"}
            </span>
          </p>
        </div>
      </div>

      <div
        className="voice-memo-progress"
        role="progressbar"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
      >
        <div
          className="voice-memo-progress-fill"
          style={{ width: `${(progress * 100).toFixed(2)}%` }}
        />
      </div>

      {memo.transcript && (
        <div className="voice-memo-transcript-wrap">
          <button
            type="button"
            onClick={() => setTranscriptOpen((o) => !o)}
            className="voice-memo-transcript-toggle"
            aria-expanded={transcriptOpen}
          >
            {transcriptOpen ? "Hide transcript" : "Read transcript"}
          </button>
          {transcriptOpen && (
            <div className="voice-memo-transcript">
              <p>{memo.transcript}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p
          className="font-serif italic"
          style={{ color: "#7a3a2e", fontSize: "0.9rem", marginTop: "0.5rem" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
