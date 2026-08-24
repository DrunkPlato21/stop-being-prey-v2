"use client";

import { useRef, useState } from "react";
import { resizeImageToWebp } from "@/lib/image-resize";
import { deleteTileAction, updateTileAction } from "@/app/arena/actions";
import {
  TILE_TYPES,
  tileTypeLabel,
  type ArenaCaseKind,
} from "@/lib/arena-constants";
import type { ArenaTile } from "@/lib/arena";
import { MovePicker } from "./MovePicker";

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
            <select name="type" defaultValue={tile.type}>
              {TILE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {tileTypeLabel(t, kind)}
                </option>
              ))}
            </select>
          </label>
          <input
            name="handle"
            maxLength={60}
            defaultValue={tile.handle ?? ""}
            placeholder="Handle (specimen only, optional)"
          />
        </div>
        <textarea name="body" required defaultValue={tile.body} />
        <textarea
          name="transcript"
          defaultValue={tile.transcript ?? ""}
          placeholder="Full transcript (specimen only, optional)."
        />
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
          <button type="submit" className="submit" disabled={busy}>
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
