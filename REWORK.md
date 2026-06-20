# Site Rework Blueprint

Branch: `feat/members-area-v2`. Decided 2026-06-18. This is a reorganization of how the site is structured and presented. It is NOT a rewrite of the working engine.

## The diagnosis

The site is packaged like a literary magazine. Masthead, Vol/No, "issues," "the lead," a podcast feed, "get the next one." But the brand is insurgent. Predator and prey, the apex class, stop being hunted. The wrapper fights the brand.

And the whole thing is organized around Clay's output, not the reader's transformation. Every surface answers "what did Clay make." Nothing answers "who am I becoming." So no reader has a thread of their own, and nobody has a reason to come back between drops.

## The reframe

Not a magazine. A field manual. A dojo with a doctrine.

- The **Doctrine** (the numbered Rules of Engagement) is the spine. It is what you come to learn.
- The **Essays** are the literature. They teach the rules through real stories.
- The **Case Files** are the drills. The rules applied to a live kill.
- The **Lounge and Desk** are the cell. Where you train and you are not alone.

## Preserve vs change

### Preserve (do not touch the engine)
- Auth: magic links, JWT sessions, the `/notes` middleware gate.
- Payments: Stripe checkout, customer portal, webhook seams.
- Redis layer and keyspaces (Lounge unprefixed, Guild dev-namespaced).
- Lounge (chat river), Comments (responses to pieces), content pipeline.
- Guild data model and server actions. We extend it, we do not rewrite it.

### Change (map and surfaces)
- Public framing, homepage, navigation.
- The "podcast" presentation.
- Where the Rules live and who can see them.
- The members-area shape: Desk as hub.
- The Guild: add categories, seed it.

## Public side

1. **Kill the podcast frame.** Essays with audio get a "Listen" option. No separate podcast section. Clay is a writer, not a podcaster. (The audio-attach convention itself, `spotifyEpisodeId` on an article, is unchanged. This is a presentation change.)
2. **Free the Rules as the front door.** The Doctrine (currently buried at `/notes/rules` behind the paywall) becomes public. Doctrine is the lure. Practice is the paid product: the drills, the cell, bring-your-own-fight. Be deliberate about which Case Files tease (public) versus drill (paid).
3. **Rework the homepage** so a stranger meets the doctrine, not a magazine masthead.

## Members area: hub and spoke

The **Desk is home base. The heartbeat.** Members land here on sign-in. Everything else is a spoke they step out to and return from.

- **The Desk** stays unmistakably Clay's presence (status, what he is on, latest note) but gets upgraded into the dashboard that pulls the whole cell into one "what is alive now" view: Clay's status at the center, "new in the Guild," "Lounge active now."
- **The Guild** is the deep room. Long-form threads.
- **The Lounge** is the live room. Chatter.

Clay's presence is the engine. The room lives if he shows up and replies.

## The Guild: categories

Add a **required** category picker to the thread composer. Forced because choosing the category scaffolds the post and kills the blank-page freeze, not for navigation (not enough volume yet to need filtering).

Categories are **intent-based, not topic-based.** Topics fragment and go empty. Intents stay alive at any size and read like prompts. Start with three. Names are Clay's to finalize.

- **The Field** — any real engagement. One you won and want to break down, or one you are in right now and need the move on. Past and present both live here.
- **The Doctrine** — the rules and the theory. Argue one, test one, ask about one.
- **Open floor** — ideas, thinking out loud, everything else.

Do not over-split. If "live help, I am in it now" becomes the dominant use, that is the signal to split it out, with the traffic to prove it will not sit empty. Emergence, not guessing.

Current Guild state to extend: threads are flat (no category field), one `guild:threads` ZSET, composer is title + body only. Adding a category means: a fixed list in `guild-constants.ts`, a `category` field on `GuildThread`, a required picker in `NewThreadComposer`, validation in `actions.ts`, and grouping/labeling on the index.

## Ghost-town defense

Do not launch the Guild empty. Seed five to eight strong starter threads, each a Rule written up as a post that ends in a real question. Few categories on purpose. Many empty rooms read "abandoned." One quiet room reads "new."

## Open questions to resolve

- Which Case Files are public teasers vs paid drills?
- What exactly does the Desk surface on landing (the dashboard spec)?
- Final category names in Clay's voice.
- Does the public Rules page get its own route, or take over `/notes/rules`?

## Build sequence

### DONE — members area (all committed on `feat/members-area-v2`, NOT deployed)
- [x] Branch current with main.
- [x] **Guild categories** — required intent picker (The Field / The Doctrine / Open floor), `category` on the model, tags on rows. Worry to watch: most posts may default to Open floor; fine early, kill the categories later if they're dead chrome.
- [~] **Guild dev seed** — throwaway preview threads; Clay writes the real launch threads.
- [x] **Desk as hub** — "The rooms" panel (Guild Question-of-the-Week + Active-now thread, Lounge presence + latest line), doorway headings with engraved marks (cat's-eye crest + club-armchair), folded into `getWritersDeskState`.
- [x] **Guild moderation** — two-step confirm-before-delete + admin restore on tombstones.
- [x] **Guild member-nav layout** — always a way home from inside a thread.
- [x] **Guild notifications** — in-app bell on every reply + batched email (prod-only, `notifyOnReply`-gated, one per thread per 2h).
- [x] **Guild reactions** — cloned the Lounge exactly (the seven emoji, hover popover, inline trigger) + owner bell notification. (First attempt used the wrong glyph set; fixed.)
- [x] **Guild** — URLs hyperlinked in bodies (via `Linkified`).
- [x] **New-member first run** — "Getting started" panel (set name / read Rules / answer QOTW / say hi in Lounge), steps marked when actually done, dismiss persists, 30-day gate. Dev preview: `/desk?firstrun=preview`. WelcomeModal retired.
- [x] **Notes** — reactions reach the member (notify + show under their note); "leave a note" moved up beside Clay's presence.
- [x] **Nav** — sidebar slimmed to 6 places (Account + Coins moved to the identity menu, Field Notes dropped); public strip hidden in the member area (`HeaderPublicNav`); mobile member nav is a 3×2 grid (no orphaned Book).

### DONE — public / conversion side (committed on `feat/members-area-v2`, NOT deployed) [2026-06-19/20]
5. [x] **Free the Rules** — public `/rules`, auth-aware. Strangers: clean axiom + 7 rules + "join to train" CTA. Members: case-file "demonstrated in" enrichments + onboarding tick. 301 from `/notes/rules`. The join CTA mirrors the live `/membership` state machine (founder sold out → charter $13).
6. [x] **Kill the podcast frame** — `/podcast` deleted (301 → `/writing`); "Podcast" dropped from every nav; audio stays on each essay (Listen pill + Spotify embed, untouched). Podcaster copy reframed (about/tip/join/welcome). Kept external Spotify/RSS links.
7. [x] **Homepage reframe** — doctrine-first spine: thesis hero → 7-rule teaser → cornerstones (proof) → dispatches stream → Rules email magnet. Killed the Vol/No masthead, "The Lead", "Get the next one".
8. [x] **Public nav pass** — podcast gone; "Issues" → "Writing"; route renamed `/issues` → `/writing` (301, also repointed the /podcast redirect).

Also this session:
- [x] **Doctrine restructure** — 1 axiom ("Power decides, not righteousness") + 7 rules, predator/prey frame throughout. Case files retagged to the single-rule-it-most-demonstrates convention (rules 2/3/5 intentionally bare). Axiom body, Rule 3, Rule 5 label all refined since.
- [x] **Two-tier writing model** — `cornerstone: true` frontmatter flag (legacy `issue` grandfathered via `isCornerstone()`), `getCornerstones()`/`getDispatches()`. Surfaced 7 essays that were previously invisible (non-issue pieces were never listed). Archive ("Writing") shows both tiers; Vol/No numbering gone.
- [x] **End-of-piece CTA** (FinisherAchievement) de-flattered + tier-aware recognition; comment-box copy.

### NEXT SESSION — finish + ship
Code is structurally done; most of what's left is Clay's copy, plus shipping.
- [ ] **Hero thesis line** (homepage) — PLACEHOLDER. Clay's to write. Biggest single "not done" on the public side.
- [ ] **`/membership` rewrite** — transformation-first (lead with who they become; the room is just *how*). The end-of-piece CTA copy (FinisherAchievement, `MEMBERSHIP_OPENER`/`ASK_LINES`) is PLACEHOLDER and should be rewritten in the SAME pass — one pitch, two surfaces. Highest-value remaining build; Clay flagged he'll rethink the CTA here.
- [ ] **Section names** — "Dispatches" / "Seen in practice" / "The major essays" are placeholders in Clay's voice.
- [ ] **Rules email-magnet delivery** — headline's in; wire the actual "email you the Rules on signup" automation (Resend/Kit). The lure isn't delivered yet, only promised.
- [ ] **A look inside the room** (public-preview case file / redacted Guild thread), **charter scarcity counter** beyond `/membership`, **Clay-live FOMO** — conversion amplifiers, optional/prioritize. (Social proof / member counts = LATER; don't advertise small numbers.)
- [ ] **SHIP IT** — the whole branch (members area + everything above) is NOT deployed. Merge `feat/members-area-v2` → `main` (Vercel auto-deploys stopbeingprey.com) when ready. This is the real finish line.

### Parked / later
- **Member standing / progress engine** — premature. Needs deeper doctrine + content. Year-two. (Clay: rules are "a paragraph each," membership too bare for it now.)
- **Weekly digest auto-recap** — auto-assemble "this week in the room" so the Sunday note half-writes itself. Only good once there's real activity; until then it advertises the quiet. Clay does the Sunday email manually via Kit for now — and the Sunday-Lounge gathering is his single best ghost-town weapon, don't lose it.
- **"Summon the room" button** — Clay taps it, opted-in members get pinged "Clay's in the Lounge now." Highest-leverage presence amplifier when ready. NOTE (2026-06-20): real-time needs **web push** (email's too slow for "live now"); for a small base the scheduled Sunday ritual beats ad-hoc pings. Shelved until push + a bigger core.
- **Lounge "you were away" email** — batched/capped re-engagement nudge: fire only when a reply is unseen AND the member's been away past a delay window (~30 min), at most one per few hours. Lounge already fires the in-app bell; this needs a periodic cron *sweep* (serverless can't hold a per-reply timer). Discussed 2026-06-20, not built. (Per-reply email on the Lounge = too much; wrong medium for ephemeral chat.)
- **`/admin/guild` panel** — find/restore deleted threads without the URL.
- **Guild category filter** — when volume needs it.

## The honest throughline (say it back to Clay)
Features are amplifiers, not saviors. The engine is Clay showing up — the Sunday gathering and replying to people while it's small. Win the first ten true believers (depth over breadth); they make the room feel alive for the eleventh. Notifications keep the core warm all week (fast loop); the Sunday digest catches drifters (slow loop). Everything multiplies the same input: Clay in the room.

## Email infra (for reference)
- **Resend** = all per-event site email (magic links, comment/guild reply notifications, gifts), from `noreply@stopbeingprey.com`, domain verified.
- **Kit** = Clay's broadcast tool (the manual Sunday email lives here).
