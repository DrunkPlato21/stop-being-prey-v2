"use client";

import { useRef, useState } from "react";
import { resizeImageToWebp } from "@/lib/image-resize";
import { addTileAction } from "@/app/arena/actions";
import {
  TILE_TYPES,
  tileTypeLabel,
  type ArenaCaseKind,
  type ArenaTileType,
} from "@/lib/arena-constants";
import { MovePicker } from "./MovePicker";
import { FormatToolbar } from "@/components/guild/FormatToolbar";
import {
  ComposerPreview,
  useComposerPreview,
} from "@/components/guild/ComposerPreview";
import { useAutoGrow } from "@/components/guild/useAutoGrow";

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

// `kind` only reaches the type picker, so the button Clay presses says
// the same words the tile will wear once it lands.
export function ArenaBench({
  boutId,
  kind = "bout",
}: {
  boutId: string;
  kind?: ArenaCaseKind;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // The type drives the form, not just the label the tile lands with:
  // handle and transcript are the specimen's own fields, so they are
  // not on screen when the tile being written cannot use them.
  const [type, setType] = useState<ArenaTileType>(TILE_TYPES[0]);
  // Bumped after a post to remount the move picker. A native
  // form.reset() clears the DOM inputs but cannot touch React state,
  // so without this the chips from the last tile sit in the bench and
  // ride along onto the next one.
  const [pickerKey, setPickerKey] = useState(0);
  // The tile body is controlled so the formatting buttons can rewrite
  // it around the cursor. That means form.reset() no longer clears it
  // and the transcriber can no longer poke the DOM node directly, so
  // both go through setBody instead.
  const [body, setBody] = useState("");
  // Controlled for the same reason, minus the buttons: a box can only
  // grow to fit what it holds if something knows what it holds.
  const [transcript, setTranscript] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const preview = useComposerPreview(bodyRef);

  // Both boxes size themselves to what is in them, so a long read is
  // never written through a letterbox. The body passes an empty string
  // while previewing: the textarea is display:none then, measures zero,
  // and the swap back to Write has to re-measure it or it comes back
  // collapsed. The transcript passes empty when it isn't a specimen,
  // for the same reason - the box is gone from the DOM, and the height
  // has to be taken again when it returns.
  useAutoGrow(bodyRef, preview.previewing ? "" : body);
  useAutoGrow(transcriptRef, type === "specimen" ? transcript : "");

  // The screenshot gets read as well as stored: the vision model
  // returns handle + verbatim transcript + timestamp, and the bench
  // fills any field Clay hasn't already typed in. Fails soft — a
  // transcription miss just leaves the fields manual.
  async function transcribe(dataUrl: string) {
    setReading(true);
    setReadNote(null);
    try {
      const res = await fetch("/api/arena/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        // Never a blocker, but never a mystery either: a silent
        // no-fill mid-fight reads as a broken bench.
        setReadNote(
          data?.error === "rate_limited"
            ? "Screenshot reading is capped for this hour. Transcript is yours to type."
            : "Could not read that screenshot. Transcript is yours to type."
        );
        return;
      }
      const stamp = data.timestamp ? `[${data.timestamp}] ` : "";
      setTranscript((prev) =>
        prev.trim() ? prev : `${stamp}${data.transcript}`
      );
      // The tile's own words too, not just the archive copy. The reader
      // used to fill only the optional field and leave the required one
      // empty, so every screenshot-built specimen hit "please fill out
      // this field" pointing at a box that looked already done. Same
      // rule as the others: only ever fills what is still blank.
      setBody((prev) => (prev.trim() ? prev : data.transcript));
      if (handleRef.current && !handleRef.current.value.trim() && data.handle) {
        handleRef.current.value = data.handle;
      }
    } catch {
      setReadNote("Could not read that screenshot. Transcript is yours to type.");
    } finally {
      setReading(false);
    }
  }

  async function attach(file: File) {
    setError(null);
    setReadNote(null);
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
          setBody("");
          setTranscript("");
          setType(TILE_TYPES[0]);
          setPickerKey((k) => k + 1);
          formRef.current?.reset();
        }}
      >
        <input type="hidden" name="boutId" value={boutId} />
        <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />
        <div className="row">
          <label>
            Tile
            <br />
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as ArenaTileType)}
            >
              {TILE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {tileTypeLabel(t, kind)}
                </option>
              ))}
            </select>
          </label>
          {type === "specimen" && (
            <input
              ref={handleRef}
              name="handle"
              maxLength={60}
              placeholder="Handle (optional)"
            />
          )}
        </div>
        {/* A specimen is their words, verbatim, and renders raw - no
            formatting pass runs on it, so offering the buttons there
            would only bake asterisks into the evidence. */}
        {type !== "specimen" && (
          <FormatToolbar
            textareaRef={bodyRef}
            value={body}
            onChange={setBody}
            hideQuote={type === "counter"}
            previewing={preview.previewing}
            onTogglePreview={preview.toggle}
          />
        )}
        {preview.previewing && (
          <ComposerPreview text={body} minHeight={preview.minHeight} />
        )}
        {/* Hidden, never unmounted: the form still has to submit a body
            while the preview is the thing on screen. */}
        <textarea
          ref={bodyRef}
          name="body"
          // Not required while it is hidden: the browser refuses to
          // submit a form whose invalid control cannot be focused, and
          // it does it silently. The button below carries the rule
          // instead, and addTile refuses an empty body regardless.
          required={!preview.previewing}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={preview.previewing ? { display: "none" } : undefined}
          placeholder="The tile. Their words for a specimen, your line for a counter, your read for the rest. Ctrl+V a screenshot anywhere in here."
        />
        {type === "specimen" && (
          <textarea
            ref={transcriptRef}
            name="transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Full transcript (optional). The durable record. Pasting a screenshot fills this in for you."
          />
        )}
        <MovePicker key={pickerKey} />

        {uploading && <div className="arena-bench-note">Attaching&hellip;</div>}
        {reading && (
          <div className="arena-bench-note">Reading the screenshot&hellip;</div>
        )}
        {!reading && readNote && (
          <div className="arena-bench-note">{readNote}</div>
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

        <button
          type="submit"
          className="submit"
          disabled={uploading || !body.trim()}
        >
          Post tile
        </button>
      </form>
    </div>
  );
}
