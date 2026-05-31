# Lounge Watch — design notes

A synced video-watching experience inside the Lounge, with a live
reaction + annotation layer that turns each session into a permanent
artifact instead of an ephemeral hangout.

## The pitch

Discord-style Watch Together, sized for Stop Being Prey. Members
gather in a Lounge post and watch a video at the same beat —
Sowell on Phil Donahue, Rand on Mike Wallace, Friedman dismantling
a heckler — with reactions and timestamped notes floating across the
player in real time. After the session ends, the post is no longer
a chat room. It's a crowdsourced study guide: every "wait, rewind"
moment, every reframe, every apex line, pinned to the timeline by
the people who were there.

## Integration shape

A Lounge post **becomes** a watch room when it has a video attached.
No new section, no separate "theater" surface. Drop a YouTube URL
into a normal Lounge post titled "Ayn Rand on Mike Wallace, 1959"
and from then on that post's page renders the synced player at the
top, the existing reply thread below, and the existing reaction
infra. Each watch session lives at its own Lounge URL, which is
actually a feature: you can point at "the night we watched Rand"
as a permanent reference.

## The headline feature: Pinned Moments

While watching, any member can tap **📌 Pin** with a one-line note
("Here's where Rand reframes Wallace's whole question"). Pins are:

- timestamped to the video position they were dropped at
- attributed to the member who dropped them
- persistent — they live on the post forever
- visible as markers on the player's timeline
- clickable — tap a pin, seek there

The watch session leaves behind an annotated track. After three
Lounge nights, you have an archive of historic interviews with
member-curated tactics commentary. That's a tactics library, not
a video player.

## The three live layers around it

### 1. Floating reactions
Tap an icon, it floats across everyone's player for ~2 seconds,
attributed to the sender's display name. A custom reaction set
keyed to Stop Being Prey vocabulary, not generic emoji:

- 🎯 Apex moment
- 👁️ Prey spotted
- 🦅 Predator
- ⚔️ Frame break
- 📌 Pin this

Five icons, not the emoji wall. Each reaction is stored with its
video timestamp so it can replay later.

### 2. Live presence strip
Small row under the player: "3 watching · Janet, Mike, Trish."
Reuses the presence beacon already in place — we already know who's
on `/lounge/post-X` from the `presence:index` ZSET. Just surface
it inline on watch posts.

### 3. Replay-as-attended
When someone joins late, or watches the post a week later, prior
reactions and pins stream by at the moments they were originally
posted. The room always feels populated. Old sessions don't decay
into a static page.

## Optional fourth: the Apex Reel

Auto-generated "top moments" view from reaction density: the 5–7
timestamps where the most members reacted hardest. Clay drops in
the next morning, sees "these were the three moments the room lost
it last night," and can spin them into a Field Note, a clip, or a
Case File.

## Mobile shape

The hardest constraint, since the audience skews to phones.

- Player pinned to top, 16:9, full width
- Reaction icon row pinned just below the player, thumb-reachable
- Floating reactions overlay the video itself, not the chrome
- Pin composer slides up from the bottom as a single-line input
- Chat scrolls underneath everything
- Presence strip is a single-line, no avatars
- Single column the whole way down

## Tech sanity

Everything sits on the existing stack. No Pusher, no socket server,
no new services.

- **Playback sync**: YouTube IFrame Player API for control + state
  reads. Room state in Redis: `{ videoId, startedAt, isPlaying,
  lastEventBy, lastEventAt }`. Clients poll every 1–2s, reconcile
  to server state on drift > ~1.5s.
- **Reactions**: Redis sorted set keyed by `(postId, videoMs)`.
  Clients poll every ~1s with a `since` cursor so they only fetch
  new ones.
- **Pins**: stored as a Lounge reply variant with a `pinned_at_ms`
  field. Reuses moderation, attribution, and reply infrastructure
  already in place.
- **Presence**: already built. Just surface it on the watch post.

Polling at 1s gives a "feels live" experience for reactions and
pins. Sub-second sync for video position isn't needed — a 1–1.5s
drift between members is invisible for interview viewing.

## Two scopes

**MVP** (1–2 days of focused work):
- Synced player on Lounge posts that carry a video URL
- Floating reactions, 5 custom icons
- Live presence strip
- No persistence beyond the session

**Full vision** (closer to a week):
- Everything in MVP
- Pinned Moments + timeline markers + post-session annotation track
- Replay-as-attended layer
- Apex Reel summary

## Doctrine alignment

This isn't entertainment scaffolding. The whole point of Stop Being
Prey is teaching members to recognize and execute rhetorical moves.
Watching Rand pin Wallace together, dropping pins at every frame
break, building a permanent annotation track — that's the operator
gym. The Lounge stops being a chat room and starts being a film
school where members study the right's strongest fighters in
slow motion, together.
