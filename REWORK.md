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

1. [x] Get `feat/members-area-v2` current with main.
2. [x] Guild categories (composer + model + index). Required intent picker in the composer, `category` on the thread model (legacy threads default to Open floor on read), category tag on each index row, dev seed varied across all three. Follow-ups, not blockers: a category filter on the index (deferred on purpose until volume needs it, so we don't show empty rooms), and showing the tag on the thread detail page (`ThreadView`).
3. [ ] Seed the Guild starter threads.
4. [ ] Desk as hub: dashboard that pulls Guild + Lounge signals.
5. [ ] Public Rules page (free the doctrine).
6. [ ] Kill the podcast frame, add Listen on essays.
7. [ ] Homepage reframe.
8. [ ] Navigation pass.
