// Plain desk-note limits with no server dependencies, so client
// components (the leave-a-note form, the admin reply box) can import
// them without pulling the Redis-backed notes.ts into the client
// bundle. Same pattern as guild-constants.ts.

/** Member-submitted note body. A forcing function for brevity: a note
    is a knock at the door, not a letter. */
export const MAX_BODY = 150;

/** Clay's reply to a note. Deliberately longer than the note it
    answers, because a real answer needs more room than a question.
    Not a display constraint — replies render in PastNotes with
    whitespace-pre-wrap and no clamp, so this is an editorial ceiling
    only. If a reply wants more than this, the exchange wanted to be a
    Field Note, and the admin row has a Convert button for that. */
export const MAX_REPLY = 500;
