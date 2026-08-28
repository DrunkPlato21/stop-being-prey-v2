"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  canvasToWebp,
  prepareImage,
  renderRedacted,
  type PreparedImage,
  type RedactMode,
  type RedactRegion,
} from "@/lib/image-redact";

// The step between pasting a screenshot and uploading it. Drag boxes
// over anything that should not leave this machine, then send it.
//
// It sits BEFORE the upload on purpose. Reviewing a screenshot after it
// is stored is not review, it is cleanup: the original is already in the
// Blob store with a public URL by then. Nothing here has left the
// browser, so a cancel costs nothing and an approve ships the covered
// pixels and only those.
//
// Skipping is one click, because most screenshots need no boxes at all
// and a redaction step that slows every paste down would get resented
// mid-fight and worked around.

export function RedactEditor({
  file,
  onDone,
  onCancel,
}: {
  file: File;
  /** Receives the final blob plus a data URL of the SAME pixels, so the
      caller can upload and transcribe the covered version. Handing the
      transcriber the original would read a blacked-out name straight
      back out of the screenshot and type it into the handle field. */
  onDone: (result: { blob: Blob; dataUrl: string; redacted: boolean }) => void;
  onCancel: () => void;
}) {
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [regions, setRegions] = useState<RedactRegion[]>([]);
  const [mode, setMode] = useState<RedactMode>("fill");
  const [drag, setDrag] = useState<RedactRegion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<PreparedImage | null>(null);

  useEffect(() => {
    let dead = false;
    prepareImage(file)
      .then((prepared) => {
        if (dead) {
          prepared.bitmap.close();
          return;
        }
        imageRef.current = prepared;
        setImage(prepared);
      })
      .catch(() => setError("Could not read that image."));
    return () => {
      dead = true;
      imageRef.current?.bitmap.close();
      imageRef.current = null;
    };
  }, [file]);

  // Repaint on every change. The canvas holds the real pixels at full
  // size and CSS scales it down to fit, so the preview is literally the
  // output rather than a representation of it.
  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const live = drag ? [...regions, drag] : regions;
    const painted = renderRedacted(image, live);
    const target = canvasRef.current;
    target.width = painted.width;
    target.height = painted.height;
    const ctx = target.getContext("2d");
    ctx?.drawImage(painted, 0, 0);
  }, [image, regions, drag]);

  // Screen coordinates to image coordinates. The canvas is displayed at
  // whatever width the bench allows, so every pointer position has to be
  // divided back through that scale or the boxes land somewhere other
  // than where they were drawn.
  const toImageSpace = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLCanvasElement;
    const rect = el.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * el.width,
      y: ((e.clientY - rect.top) / rect.height) * el.height,
    };
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!image) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImageSpace(e);
    setDrag({ x: p.x, y: p.y, w: 0, h: 0, mode });
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag) return;
    const p = toImageSpace(e);
    setDrag({ ...drag, w: p.x - drag.x, h: p.y - drag.y });
  }

  function onPointerUp() {
    if (!drag) return;
    // A click with no drag is not a box. Without this every stray tap
    // would push a zero-area region onto the stack and the undo button
    // would appear to do nothing.
    if (Math.abs(drag.w) >= 4 && Math.abs(drag.h) >= 4) {
      setRegions((prev) => [...prev, drag]);
    }
    setDrag(null);
  }

  async function send() {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = renderRedacted(image, regions);
      const blob = await canvasToWebp(canvas);
      // One canvas, two outputs. The data URL the transcriber reads is
      // taken from the same painted pixels as the blob that uploads, so
      // the model can never see something the reader did not approve.
      const dataUrl = canvas.toDataURL("image/webp", 0.82);
      onDone({ blob, dataUrl, redacted: regions.length > 0 });
    } catch {
      setError("Could not prepare that image.");
      setBusy(false);
    }
  }

  return (
    <div className="arena-redact">
      <div className="arena-redact-head">
        <span className="arena-eyebrow">Before it uploads</span>
        <p>
          Drag a box over anything that shouldn&apos;t leave. It gets
          painted into the picture here, so the original never reaches the
          server.
        </p>
      </div>

      <div className="arena-redact-modes" role="group" aria-label="Box type">
        {/* Solid is the default because names are the common case and
            the expensive mistake. */}
        <button
          type="button"
          className={`arena-redact-mode${mode === "fill" ? " on" : ""}`}
          onClick={() => setMode("fill")}
          aria-pressed={mode === "fill"}
        >
          Black out
          <span>names, handles, anything readable</span>
        </button>
        <button
          type="button"
          className={`arena-redact-mode${mode === "blur" ? " on" : ""}`}
          onClick={() => setMode("blur")}
          aria-pressed={mode === "blur"}
        >
          Blur
          <span>faces and profile pictures</span>
        </button>
      </div>

      {error && <div className="arena-bench-note error">{error}</div>}

      {image ? (
        <canvas
          ref={canvasRef}
          className="arena-redact-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      ) : (
        <div className="arena-bench-note">Opening the screenshot&hellip;</div>
      )}

      <div className="arena-redact-actions">
        <button
          type="button"
          className="arena-redact-send"
          onClick={() => void send()}
          disabled={busy || !image}
        >
          {busy
            ? "Preparing…"
            : regions.length > 0
              ? `Use it, ${regions.length} covered`
              : "Use it as is"}
        </button>
        <button
          type="button"
          className="arena-redact-minor"
          onClick={() => setRegions((p) => p.slice(0, -1))}
          disabled={busy || regions.length === 0}
        >
          Undo box
        </button>
        <button
          type="button"
          className="arena-redact-minor"
          onClick={() => setRegions([])}
          disabled={busy || regions.length === 0}
        >
          Clear
        </button>
        <button
          type="button"
          className="arena-redact-minor drop"
          onClick={onCancel}
          disabled={busy}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
