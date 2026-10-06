// Canonical + og:url for a public page, in one place.
//
// A child page's `alternates` replaces the root's wholesale, so the RSS
// autodiscovery link has to be restated here or the page loses it.
// Paths resolve against metadataBase (https://stopbeingprey.com).

const RSS = { "application/rss+xml": "/feed.xml" } as const;

export function canonicalFor(path: string) {
  return { canonical: path, types: RSS };
}
