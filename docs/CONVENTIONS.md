# Stop Being Prey — Publication Conventions

This site is structured as an institutional-prestige publication, not
a blog. These conventions define how the site evolves as essays are
published. Future Claude Code sessions should follow this when working
on the site.

## Canonical unit

The essay is the canonical unit of the publication. Every essay has an
audiobook edition delivered via podcast feed (Spotify, Apple, RSS). The
site has TWO views of ONE catalog:

- **Essay pages** (`/[slug]`) — read-first view, with the audio edition
  embedded at the top
- **Podcast page** (`/podcast`) — audio-first view of the same catalog,
  optimized for listeners, plus subscribe-wherever links

Both views pull from the same markdown source files. Never build parallel
content systems.

## Issue numbering

The masthead displays issue identity in the format:

  VOL. {volume} · NO. {number} · {date}

Rules:
- **Volume** increments by year. 2026 = Vol I. 2027 = Vol II. 2028 = Vol III.
  Use Roman numerals.
- **Number** is the count of essays published in the current year, starting
  at 1 and incrementing with each new essay. Resets to 1 each January.
- **Date** matches the publish date of the LATEST essay in the catalog.
  NOT today's calendar date. The masthead represents "the current issue."

This is the LRB / NYRB / Atlantic pattern.

## Lead Essay slot

The "LEAD ESSAY" block on the homepage always features the MOST RECENT
essay. It rotates automatically whenever a new essay is published.

## Foundational Essay slot

A separate, permanent block on the homepage features `the-losertarian-problem`
as the foundational text of the publication. This slot does NOT rotate.
It is the doctrine entry point for new visitors.

This block should be labeled "START HERE" or "FOUNDATIONAL TEXT" or
"CHAPTER 1" — pick one and stay consistent.

The Foundational block is hidden when the catalog only contains the
foundational essay itself (currently the case — only The Losertarian
Problem exists). It activates once a second essay is published, at which
point both the rotating LEAD ESSAY slot and the permanent FOUNDATIONAL
slot are visible.

## Naming hierarchy

- "Audio edition" — the audiobook version of an essay. Use this phrase,
  not "transcript" or "podcast version."
- "Lead essay" — the current rotating feature
- "Foundational text" / "Chapter 1" — the permanent Losertarian feature
- "All episodes" — the audio-archive entry point (links to /podcast)
