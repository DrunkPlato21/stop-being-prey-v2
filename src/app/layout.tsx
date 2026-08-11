import type { Metadata } from "next";
import { Cormorant_Garamond, Source_Serif_4 } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { StickyNavChrome } from "@/components/StickyNavChrome";
import { ReadingProgressBar } from "@/components/ReadingProgressBar";
import { PresenceBeacon } from "@/components/PresenceBeacon";
import { FirstTouchTracker } from "@/components/FirstTouchTracker";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://stopbeingprey.com"),
  title: {
    default: "Stop Being Prey",
    template: "%s · Stop Being Prey",
  },
  description:
    "Politics, power, and predator/prey dynamics in 2026. Original writing and audio by Clay. Recovering libertarian. Unapologetic right-wing realpolitik.",
  authors: [{ name: "Clay" }],
  creator: "Clay",
  // Auto-discovery for RSS readers (<link rel="alternate" ...>).
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
  openGraph: {
    title: "Stop Being Prey",
    description:
      "Politics, power, and predator/prey dynamics in 2026. Original writing and audio by Clay.",
    url: "https://stopbeingprey.com",
    siteName: "Stop Being Prey",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stop Being Prey",
    description: "Politics, power, and predator/prey dynamics in 2026.",
    creator: "@stopbeingprey",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* Skip link for keyboard / screen-reader users: hidden until
            focused, then jumps past the nav to the main content. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-ink focus:text-paper focus:px-4 focus:py-2 focus:font-display focus:text-sm focus:no-underline"
        >
          Skip to content
        </a>
        {/* StickyNavChrome renders at root (not inside Header) so its
            position:fixed scroll bar isn't trapped in Header's stacking
            context. Self-suppresses on member routes via pathname. */}
        <StickyNavChrome />
        {/* Reading-progress line. Rendered at root (beside StickyNav) so
            its position:fixed isn't trapped in a page-level stacking
            context. Self-hides on any route without an article body. */}
        <ReadingProgressBar />
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
        {/* Site-wide presence beacon. Renders nothing; pings the
            ping endpoint from every member route change so the
            admin /admin/presence panel shows who's on the site. */}
        <PresenceBeacon />
        {/* First-touch acquisition channel: cookie + one channel view on
            the first visit, read back server-side at checkout. */}
        <FirstTouchTracker />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics
            gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
          />
        )}
      </body>
    </html>
  );
}
