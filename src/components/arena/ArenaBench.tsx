"use client";

import { useRef, useState } from "react";
import { resizeImageToWebp } from "@/lib/image-resize";
import { addTileAction } from "@/app/arena/actions";
import { TILE_TYPES, TILE_TYPE_LABEL } from "@/lib/arena-constants";

// Clay's bench: the tile composer. The one ergonomic requirement that
// decides whether the Arena gets used at all: Ctrl+V a screenshot
// anywhere in the bench and it's attached — resized to WebP in the
// browser (same pipeline as the Lounge), uploaded to Blob, done. No
// file dialogs mid-fight. A picker fallback exists for the days the
// screenshot is a file.

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

export function ArenaBench({ boutId }: { boutId: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);

  // The screenshot gets read as well as stored: the vision model
  // returns handle + verbatim transcript + timestamp, and the bench
  // fills any field Clay hasn't already typed in. Fails soft — a
  // transcription miss just leaves the fields manual.
  async function transcribe(dataUrl: string) {
    setReading(true);
    try {
      const res = await fetch("/api/arena/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) return;
      if (transcriptRef.current && !transcriptRef.current.value.trim()) {
        const stamp = data.timestamp ? `[${data.timestamp}] ` : "";
        transcriptRef.current.value = `${stamp}${data.transcript}`;
      }
      if (handleRef.current && !handleRef.current.value.trim() && data.handle) {
        handleRef.current.value = data.handle;
      }
    } catch {
      // Silent: the transcript is a convenience, never a gate.
    } finally {
      setReading(false);
    }
  }

  async function attach(file: File) {
    setError(null);
    setUploading(true);
    try {
      const { blob } = await resizeImageToWebp(file);
      const webp = new File([blob], "paste.webp", { type: "image/webp" });
      const fd = new FormData();
      fd.append("file", webp);
      // Store and read in parallel — neither waits on the other.
      const dataUrlPromise = blobToDataUrl(blob);
      const uploadPromise = fetch("/api/arena/upload", {
        method: "POST",
        body: fd,
      });
      void dataUrlPromise.then((dataUrl) => void transcribe(dataUrl));
      const res = await uploadPromise;
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) setImageUrl(data.url as string);
      else setError("Upload failed. Try again.");
    } catch {
      setError("Could not read that image.");
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) =>
      i.type.startsWith("image/")
    );
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    void attach(file);
  }

  return (
    <div className="arena-tools" onPaste={onPaste}>
      <h2>The bench</h2>
      <form
        ref={formRef}
        action={async (formData: FormData) => {
          await addTileAction(formData);
          setImageUrl(null);
          formRef.current?.reset();
        }}
      >
        <input type="hidden" name="boutId" value={boutId} />
        <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />
        <div className="row">
          <label>
            Tile
            <br />
            <select name="type">
              {TILE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TILE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={handleRef}
            name="handle"
            maxLength={60}
            placeholder="Handle (specimen only, optional)"
          />
        </div>
        <textarea
          name="body"
          required
          placeholder="The tile. Their words for a specimen, your line for a counter, your read for the rest. Ctrl+V a screenshot anywhere in here."
        />
        <textarea
          ref={transcriptRef}
          name="transcript"
          placeholder="Full transcript (specimen only, optional). The durable record. Pasting a screenshot fills this in for you."
        />
        <input
          name="moves"
          maxLength={260}
          placeholder="Move tags, comma-separated (optional)"
        />

        {uploading && <div className="arena-bench-note">Attaching&hellip;</div>}
        {reading && (
          <div className="arena-bench-note">Reading the screenshot&hellip;</div>
        )}
        {error && <div className="arena-bench-err">{error}</div>}
        {imageUrl && (
          <div className="arena-bench-preview">
            {/* Plain img on purpose: Blob URLs, member-only page, no
                next/image transform costs for a preview thumbnail. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Attached screenshot" />
            <button
              type="button"
              className="arena-bench-remove"
              onClick={() => setImageUrl(null)}
            >
              Remove
            </button>
          </div>
        )}
        {!imageUrl && !uploading && (
          <div className="arena-bench-note">
            Screenshot: paste it (Ctrl+V), or{" "}
            <button
              type="button"
              className="arena-bench-pick"
              onClick={() => fileRef.current?.click()}
            >
              attach a file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void attach(f);
                e.target.value = "";
              }}
            />
          </div>
        )}

        <button type="submit" className="submit" disabled={uploading}>
          Post tile
        </button>
      </form>
    </div>
  );
}
