"use client";

import { useState, useTransition } from "react";
import {
  setArenaSubscribedAction,
  setBoutFollowAction,
} from "@/app/arena/actions";

// The room's two email switches. Both are off until someone presses
// them, both say plainly what they will send, and both report the state
// the server actually settled on rather than an optimistic guess — a
// toggle that lies about whether you are on a mailing list is worse than
// no toggle.
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

function useToggle(initialOn: boolean, run: (on: boolean) => Promise<boolean>) {
  const [on, setOn] = useState(initialOn);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const toggle = () => {
    const next = !on;
    setFailed(false);
    startTransition(async () => {
      const settled = await run(next).catch(() => null);
      if (settled === null) {
        // The server refused or the request died. Leave the switch where
        // it was: showing "on" after a failed subscribe would promise
        // mail that is never coming.
        setFailed(true);
        return;
      }
      setOn(settled);
    });
  };

  return { on, pending, failed, toggle };
}

export function ArenaMailToggle({ initialOn }: Props) {
  const { on, pending, failed, toggle } = useToggle(initialOn, async (next) => {
    const fd = new FormData();
    fd.set("on", next ? "1" : "0");
    return setArenaSubscribedAction(fd);
  });

  return (
    <div className="arena-mail-toggle">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
        className="arena-mail-btn"
        data-on={on ? "1" : "0"}
      >
        {on ? "Emailing you when a fight starts" : "Email me when a fight starts"}
      </button>
      <span className="arena-mail-note">
        {failed
          ? "That didn't save. Try again."
          : on
            ? "One email, at most once a day. Unsubscribe from any of them."
            : "The bell already tells you in here. This reaches you when you're not."}
      </span>
    </div>
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
    <div className="arena-mail-toggle">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
        className="arena-mail-btn"
        data-on={on ? "1" : "0"}
      >
        {on ? "You'll get the verdict" : "Tell me how this ends"}
      </button>
      <span className="arena-mail-note">
        {failed
          ? "That didn't save. Try again."
          : on
            ? "One email when this case is filed. Nothing else."
            : "One email when this one seals. Not the whole room, just this fight."}
      </span>
    </div>
  );
}
