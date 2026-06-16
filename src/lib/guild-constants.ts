// Plain Guild constants with no server dependencies, so client
// components (composers, edit forms) can import limits without pulling
// the Redis/crypto-backed guild.ts module into the client bundle.

export const MAX_TITLE = 140;
export const MAX_BODY = 6000;
export const MAX_REPLY = 4000;

// Authors may edit their own thread/reply for this long after posting.
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
