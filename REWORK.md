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

### NEXT SESSION — the PUBLIC / CONVERSION side (untouched; strangers → members)
The other half of the vision. Wants a clear head.

5. [ ] **Free the Rules** — the doctrine as the public front door. ONE Rules page, not two: public, the eight rules clean; *deepens when signed in* (Case File "demonstrated in" links + discussion) with a "join to train" CTA for strangers. Move `/notes/rules` to a public route, gate the enrichments. Doctrine public = the lure; practice (Case Files, Guild, presence) = the paid product. (Short/sharp rules are a GOOD lure — like the 48 Laws titles. Don't fatten them.)
6. [ ] **Kill the podcast frame** — drop the "Podcast" nav item + `/podcast`; audio becomes a "Listen" option on essays. Writer, not podcaster.
7. [ ] **Homepage reframe** — a stranger meets the doctrine, not a magazine masthead (Vol/No / "the lead" / issues).
8. [ ] **Public nav pass** — once podcast dies and the Rules surface publicly.

### Conversion adds for the public page (beyond freeing the Rules)
- **Rules as the email magnet** — "Get the Rules of Engagement" replaces "get the next one." Captures the email AND delivers the lure. Biggest top-of-funnel upgrade; my #1 pick after freeing the Rules.
- **A look inside the room** — a stranger sees nothing of the members area. Show one full Case File / a redacted Guild thread / a Desk peek. Proof it's real and alive.
- **Sell the transformation on `/membership`**, not the feature list. Lead with who they become (un-modelable, stop being prey); the room is just *how*.
- **Clay-live FOMO** — public "Clay is in the room now (members only)" when he's active.
- **Founder/charter scarcity counter** surfaced beyond `/membership` (honest scarcity, works at any size).
- Social proof / testimonials / member count = LATER, once there's a base. Don't advertise small numbers (same lesson as "quiet right now").

### Parked / later
- **Member standing / progress engine** — premature. Needs deeper doctrine + content. Year-two. (Clay: rules are "a paragraph each," membership too bare for it now.)
- **Weekly digest auto-recap** — auto-assemble "this week in the room" so the Sunday note half-writes itself. Only good once there's real activity; until then it advertises the quiet. Clay does the Sunday email manually via Kit for now — and the Sunday-Lounge gathering is his single best ghost-town weapon, don't lose it.
- **"Summon the room" button** — Clay taps it, opted-in members get pinged "Clay's in the Lounge now." Highest-leverage presence amplifier when ready.
- **`/admin/guild` panel** — find/restore deleted threads without the URL.
- **Guild category filter** — when volume needs it.

## The honest throughline (say it back to Clay)
Features are amplifiers, not saviors. The engine is Clay showing up — the Sunday gathering and replying to people while it's small. Win the first ten true believers (depth over breadth); they make the room feel alive for the eleventh. Notifications keep the core warm all week (fast loop); the Sunday digest catches drifters (slow loop). Everything multiplies the same input: Clay in the room.

## Email infra (for reference)
- **Resend** = all per-event site email (magic links, comment/guild reply notifications, gifts), from `noreply@stopbeingprey.com`, domain verified.
- **Kit** = Clay's broadcast tool (the manual Sunday email lives here).
