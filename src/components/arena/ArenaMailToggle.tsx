"use client";

import { useState, useTransition } from "react";
import {
  setArenaSubscribedAction,
  setBoutFollowAction,
  type MailToggleResult,
} from "@/app/arena/actions";

// The room's two email switches. Both are off until someone presses
// them, and both report the state the server actually settled on rather
// than an optimistic guess — a toggle that lies about whether you are on
// a mailing list is worse than no toggle.
//
// The label NEVER changes with state. That is the whole trick, and it
// is not a style choice. A button that reads "Emailing you when a fight
// starts" when it is already on reads to most people as an offer, not a
// status: they press it to accept, and silently turn the thing off. The
// label says what the switch is for, permanently. The tick and the line
// underneath say whether it is on, and the line always says how to undo
// it, because a gold fill means "on" to nobody outside our trade.
//
// Deliberately not a bell icon. The bell in the nav means something else
// on this site (in-app notifications, which every member already gets
// for the Arena), and reusing it here would suggest turning this off
// quiets the room. It does not. It only quiets the inbox.

type Props = {
  initialOn: boolean;
  /** Absent for the room subscription; set for a single bout's follow. */
  boutId?: string;
};

function useToggle(
  initialOn: boolean,
  run: (on: boolean) => Promise<MailToggleResult>
) {
  const [on, setOn] = useState(initialOn);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const toggle = () => {
    const next = !on;
    setFailed(false);
    startTransition(async () => {
      const result = await run(next).catch(() => null);
      if (!result || !result.ok) {
        // The request died, or the server refused it — an expired
        // session being the likely one on a page left open. Say so and
        // leave the switch where it was. Both silent failures are bad
        // in the same way: one promises mail that is never coming, the
        // other claims you are off a list you are still on.
        setFailed(true);
        return;
      }
      setOn(result.on);
    });
  };

  return { on, pending, failed, toggle };
}

function Switch({
  label,
  on,
  pending,
  failed,
  offNote,
  onNote,
  onToggle,
}: {
  label: string;
  on: boolean;
  pending: boolean;
  failed: boolean;
  offNote: string;
  onNote: string;
  onToggle: () => void;
}) {
  // "Saving" matters more here than on most controls: pressing this is
  // a promise about someone's inbox, and on a slow phone a disabled
  // button at 55% opacity is not an answer to "did that work?".
  const note = pending
    ? "Saving…"
    : failed
      ? "That didn't save. Reload the page and try again."
      : on
        ? onNote
        : offNote;

  return (
    <div className="arena-mail-toggle">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={on}
        className="arena-mail-btn"
        data-on={on ? "1" : "0"}
      >
        <span aria-hidden="true" className="arena-mail-tick">
          {on ? "✓" : ""}
        </span>
        {label}
      </button>
      {/* Polite live region: the state change is announced rather than
          left to a colour a screen reader cannot see. */}
      <span className="arena-mail-note" aria-live="polite">
        {note}
      </span>
    </div>
  );
}

export function ArenaMailToggle({ initialOn }: Props) {
  const { on, pending, failed, toggle } = useToggle(initialOn, async (next) => {
    const fd = new FormData();
    fd.set("on", next ? "1" : "0");
    return setArenaSubscribedAction(fd);
  });

  return (
    <Switch
      label="Email me when a fight starts"
      on={on}
      pending={pending}
      failed={failed}
      onToggle={toggle}
      offNote="Off. The bell tells you in here; email reaches you when you're not."
      onNote="On. One email, at most once a day. Press again to turn it off."
    />
  );
}

export function BoutFollowToggle({ initialOn, boutId }: Props) {
  const { on, pending, failed, toggle } = useToggle(initialOn, async (next) => {
    const fd = new FormData();
    fd.set("on", next ? "1" : "0");
    fd.set("boutId", boutId ?? "");
    return setBoutFollowAction(fd);
  });

  return (
    <Switch
      label="Email me the verdict"
      on={on}
      pending={pending}
      failed={failed}
      onToggle={toggle}
      offNote="One email when this fight seals. Just this fight, nothing else."
      onNote="On. You'll get one email when this seals. Press again to stop."
    />
  );
}
