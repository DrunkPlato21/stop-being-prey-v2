// The Rules of Engagement are gated: a stranger reads Rule I free, then
// unlocks II-VII with an email (or by being a member). This cookie marks a
// reader who unlocked with their email. It's httpOnly — the /rules server
// component reads it to decide whether to send the full rule bodies, so it
// never needs to be visible to client JS. Members are gated by session, not
// this cookie.
export const RULES_UNLOCK_COOKIE = "sbp_rules_unlocked";

// One year. The reader paid (their email) once; don't make them pay again.
export const RULES_UNLOCK_MAX_AGE = 60 * 60 * 24 * 365;
