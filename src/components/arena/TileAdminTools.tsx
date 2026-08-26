"use client";

import { useRef, useState } from "react";
import { resizeImageToWebp } from "@/lib/image-resize";
import { deleteTileAction, updateTileAction } from "@/app/arena/actions";
import {
  ARENA_MAX_TILE_TITLE,
  carriesTheirWords,
  TILE_TYPES,
  tileTypeLabel,
  type ArenaCaseKind,
  type ArenaTileType,
} from "@/lib/arena-constants";
import type { ArenaTile } from "@/lib/arena";
import { MovePicker } from "./MovePicker";
import { FormatToolbar } from "@/components/guild/FormatToolbar";
import {
  ComposerPreview,
  useComposerPreview,
} from "@/components/guild/ComposerPreview";
import { useAutoGrow } from "@/components/guild/useAutoGrow";

// Clay's per-tile tools, open bouts only. A fight is written at speed
// from a phone, so a tile has to be fixable in place: the editor is the
// bench's own form, prefilled, and it keeps the tile's id and its
// position (the order of a bout IS its meaning, so an edit must never
// move anything). Delete confirms inline rather than through a browser
// dialog, same calm-surface rule as the rest of the room.

export function TileAdminTools({
  tile,
  kind = "bout",
}: {
  tile: ArenaTile;
  kind?: ArenaCaseKind;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(tile.imageUrl);
  // Same rule as the bench: the specimen's own fields are on screen
  // only while the tile is a specimen. Retyping a specimen into
  // something else therefore drops its handle and transcript, which is
  // the point - a read has no transcript to keep.
  const [type, setType] = useState<ArenaTileType>(tile.type);
  // Controlled for the same reason as the bench: the formatting
  // buttons rewrite the body around the cursor.
  const [body, setBody] = useState(tile.body);
  const [transcript, setTranscript] = useState(tile.transcript ?? "");
  const [tileTitle, setTileTitle] = useState(tile.title ?? "");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const preview = useComposerPreview(bodyRef);
  // Both boxes open at the size of what they already hold, which is the
  // whole point here: a fix should never start by dragging a corner to
  // find the sentence being fixed. See the bench for why the value
  // passed goes empty while the box is hidden.
  // `editing` is part of the value on purpose: the boxes only exist
  // once the editor is open, and the hook re-measures when the value it
  // is given changes, not when the element happens to remount.
  useAutoGrow(bodyRef, editing && !preview.previewing ? body : "");
  useAutoGrow(
    transcriptRef,
    editing && carriesTheirWords(type) ? transcript : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload only. Reading the screenshot is the bench's job: an edit is
  // a correction, and the last thing a correction should do is
  // overwrite the transcript Clay just fixed by hand.
  async function attach(file: File) {
    setError(null);
    setBusy(true);
    try {
      const { blob } = await resizeImageToWebp(file);
      const webp = new File([blob], "paste.webp", { type: "image/webp" });
      const fd = new FormData();
      fd.append("file", webp);
      const res = await fetch("/api/arena/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) setImageUrl(data.url as string);
      else setError("Upload failed. Try again.");
    } catch {
      setError("Could not read that image.");
    } finally {
      setBusy(false);
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

  if (!editing) {
    return (
      <div className="arena-tile-admin">
        <button type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
        {confirming ? (
          <form action={deleteTileAction} style={{ display: "inline" }}>
            <input type="hidden" name="tileId" value={tile.id} />
            <button type="submit" className="danger">
              Delete for good
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="arena-tools arena-tile-editor" onPaste={onPaste}>
      <h2>Fix this tile</h2>
      <form
        action={async (formData: FormData) => {
          await updateTileAction(formData);
          setEditing(false);
        }}
      >
        <input type="hidden" name="tileId" value={tile.id} />
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
          {carriesTheirWords(type) && (
            <input
              name="handle"
              maxLength={60}
              defaultValue={tile.handle ?? ""}
              placeholder="Handle (optional)"
            />
          )}
        </div>
        <input
          name="tileTitle"
          maxLength={ARENA_MAX_TILE_TITLE}
          value={tileTitle}
          onChange={(e) => setTileTitle(e.target.value)}
          placeholder={`Name this tile (optional). Blank = ${tileTypeLabel(
            type,
            kind
          )}.`}
        />
        {!carriesTheirWords(type) && (
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
          required={!preview.previewing}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={preview.previewing ? { display: "none" } : undefined}
        />
        {carriesTheirWords(type) && (
          <textarea
            ref={transcriptRef}
            name="transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Full transcript (optional)."
          />
        )}
        <MovePicker initial={tile.moves} />

        {busy && <div className="arena-bench-note">Attaching&hellip;</div>}
        {error && <div className="arena-bench-err">{error}</div>}
        {imageUrl ? (
          <div className="arena-bench-preview">
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
        ) : (
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

        <div className="row">
          <button
            type="submit"
            className="submit"
            disabled={busy || !body.trim()}
          >
            Save the fix
          </button>
          <button
            type="button"
            className="submit"
            onClick={() => {
              setImageUrl(tile.imageUrl);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
