"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EmailMeta } from "@/lib/email-archive";
import { dayParts, emailHref, monthKey, shortDate } from "./format";
import { FavMark, ReadMark } from "./ReadMark";
import { useEmailFavorites, useEmailReads } from "./useEmailReads";

// The patron archive index: search box, "Start here" picks, then every
// email grouped by month. Search is client-side. Subjects and previews
// ship with the page and filter on the first keystroke; the full text
// of every email loads from /api/emails/search the first time the box
// is touched, and body matches join the results when it lands.

type Corpus = Map<string, string>;

type Hit = {
  email: EmailMeta;
  inTitle: boolean;
  snippet: string | null;
};

const SNIPPET_RADIUS = 90;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One pattern per word, anchored to the start of a word so "ross" finds
// Ross but not "across". Straight and curly apostrophes/quotes match
// each other, since Kit stored a mix of both.
function termPatterns(q: string): RegExp[] {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((t) => {
      const body = escapeRegExp(t)
        .replace(/['‘’]/g, "['‘’]")
        .replace(/["“”]/g, '["“”]');
      return new RegExp(/^[a-z0-9]/i.test(t) ? `\\b${body}` : body, "i");
    });
}

function makeSnippet(text: string, first: RegExp): string | null {
  const m = first.exec(text);
  if (!m) return null;
  let start = Math.max(0, m.index - SNIPPET_RADIUS);
  let end = Math.min(text.length, m.index + m[0].length + SNIPPET_RADIUS);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) || end;
  return (
    (start > 0 ? "…" : "") +
    text.slice(start, end).replace(/\s+/g, " ").trim() +
    (end < text.length ? "…" : "")
  );
}

function search(
  emails: EmailMeta[],
  corpus: Corpus | null,
  q: string
): Hit[] {
  const pats = termPatterns(q);
  if (pats.length === 0) return [];
  const titleHits: Hit[] = [];
  const bodyHits: Hit[] = [];
  for (const email of emails) {
    const head = `${email.subject}\n${email.preview}`;
    const body = corpus?.get(email.slug) ?? "";
    const all = `${head}\n${body}`;
    if (!pats.every((p) => p.test(all))) continue;
    const inTitle = pats.every((p) => p.test(email.subject));
    const snippet =
      makeSnippet(body, pats.find((p) => p.test(body)) ?? pats[0]) ?? null;
    (inTitle ? titleHits : bodyHits).push({ email, inTitle, snippet });
  }
  return [...titleHits, ...bodyHits];
}

function Highlight({ text, q }: { text: string; q: string }) {
  const pats = termPatterns(q);
  if (pats.length === 0) return <>{text}</>;
  const re = new RegExp(`(${pats.map((p) => p.source).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  );
}

export function EmailArchive({
  emails,
  startHere,
  initialRead,
  initialFavs,
}: {
  emails: EmailMeta[];
  startHere: EmailMeta[];
  initialRead: number[];
  initialFavs: number[];
}) {
  const { read, setRead } = useEmailReads(initialRead);
  const { favs, setFav } = useEmailFavorites(initialFavs);
  const [view, setView] = useState<"all" | "favorites">("all");
  const favorites = useMemo(
    () => emails.filter((e) => favs.has(e.kitId)),
    [emails, favs]
  );
  const readCount = useMemo(
    () => emails.filter((e) => read.has(e.kitId)).length,
    [emails, read]
  );
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [corpusState, setCorpusState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  const loadCorpus = useCallback(() => {
    if (corpusState !== "idle") return;
    setCorpusState("loading");
    const devPreview = new URLSearchParams(window.location.search).get("dev_preview");
    fetch(`/api/emails/search${devPreview ? `?dev_preview=${devPreview}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((body: { emails: { slug: string; text: string }[] }) => {
        setCorpus(new Map(body.emails.map((e) => [e.slug, e.text])));
        setCorpusState("ready");
      })
      .catch(() => setCorpusState("failed"));
  }, [corpusState]);

  // A search survives the round trip to an email and back: it lives in
  // the URL (?q=), read once on arrival and kept current as you type.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) {
      setQ(initial);
      loadCorpus();
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "favorites") {
      setView("favorites");
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (q.trim()) url.searchParams.set("q", q.trim());
    else url.searchParams.delete("q");
    if (view === "favorites") url.searchParams.set("view", "favorites");
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", url);
  }, [q, view]);

  // The bar only takes a backdrop once it has pinned; at rest it sits
  // on the page's own paper texture.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let frame = 0;
    // Pin just under whatever full-width strip is already pinned at the
    // top (the member nav on phones), measured rather than guessed.
    const placeBar = () => {
      let offset = 0;
      document.querySelectorAll<HTMLElement>('nav[aria-label="Member area"]').forEach((nav) => {
        const r = nav.getBoundingClientRect();
        if (getComputedStyle(nav).position === "sticky" && r.height > 0 && r.width >= window.innerWidth * 0.9) {
          offset = Math.max(offset, r.height);
        }
      });
      bar.style.top = `${offset}px`;
    };
    const check = () => {
      frame = 0;
      const pinTop = parseFloat(getComputedStyle(bar).top) || 0;
      setStuck(bar.getBoundingClientRect().top <= pinTop + 0.5 && window.scrollY > 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    const onResize = () => {
      placeBar();
      onScroll();
    };
    placeBar();
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // "/" jumps to the search box on a keyboard, as on most archives.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Starting a search from deep in the list brings the results up to
  // sit right under the pinned search bar.
  const wasSearching = useRef(false);
  useEffect(() => {
    const now = deferredQ.trim() !== "";
    const bar = barRef.current;
    if (now && !wasSearching.current && bar) {
      const pinTop = parseFloat(bar.style.top) || 0;
      const barTop = bar.parentElement!.getBoundingClientRect().top + window.scrollY;
      if (window.scrollY > barTop - pinTop) {
        window.scrollTo({ top: barTop - pinTop, behavior: "auto" });
      }
    }
    wasSearching.current = now;
  }, [deferredQ]);

  const hits = useMemo(
    () => (deferredQ.trim() ? search(emails, corpus, deferredQ) : null),
    [emails, corpus, deferredQ]
  );

  const months = useMemo(() => {
    const groups: { label: string; emails: EmailMeta[] }[] = [];
    for (const e of emails) {
      const label = monthKey(e.sentAt);
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.emails.push(e);
      else groups.push({ label, emails: [e] });
    }
    return groups;
  }, [emails]);

  const searching = hits !== null;
  const item = (e: EmailMeta, row: React.ReactNode) => (
    <li key={e.slug} className="ar-item">
      {row}
      <ReadMark read={read.has(e.kitId)} subject={e.subject} onToggle={() => setRead(e.kitId, !read.has(e.kitId))} />
      <FavMark on={favs.has(e.kitId)} subject={e.subject} onToggle={() => setFav(e.kitId, !favs.has(e.kitId))} />
    </li>
  );
  // Email pages carry the search back to the index; essays live outside
  // the archive, so they just link to the essay.
  const hrefFor = (e: EmailMeta) =>
    searching && !e.essay
      ? `${emailHref(e)}?q=${encodeURIComponent(deferredQ.trim())}`
      : emailHref(e);

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-6 pb-20">
      <div ref={barRef} className={`ar-search-bar${stuck ? " is-stuck" : ""}`}>
        <label className="ar-search">
          <svg aria-hidden viewBox="0 0 20 20" className="ar-search-icon">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Search every email</span>
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search every email"
            value={q}
            onFocus={loadCorpus}
            onChange={(e) => {
              setQ(e.target.value);
              loadCorpus();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQ("");
                e.currentTarget.blur();
              }
            }}
          />
          {q && (
            <button
              type="button"
              className="ar-search-clear"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
        </label>
      </div>

      {!searching && (
        <>
          <ReadProgress read={readCount} total={emails.length} />
          <div className="ar-views" role="group" aria-label="Show">
            <button
              type="button"
              className="ar-view"
              aria-pressed={view === "all"}
              onClick={() => setView("all")}
            >
              All emails
            </button>
            <button
              type="button"
              className="ar-view"
              aria-pressed={view === "favorites"}
              onClick={() => setView("favorites")}
            >
              Favorites{favorites.length > 0 ? ` (${favorites.length})` : ""}
            </button>
          </div>
        </>
      )}

      {searching ? (
        <section aria-live="polite" className="pt-6">
          <p className="ar-result-count">
            {hits.length === 0
              ? corpusState === "loading"
                ? "Searching the full text…"
                : `Nothing found for “${deferredQ.trim()}”.`
              : `${hits.length} ${hits.length === 1 ? "email" : "emails"}`}
            {hits.length > 0 && corpusState === "loading" && (
              <span className="text-ink-faint"> so far, still searching the full text…</span>
            )}
            {corpusState === "failed" && (
              <span className="text-ink-faint"> (titles only right now; full text didn&apos;t load)</span>
            )}
          </p>
          <ul className="ar-list">
            {hits.map((h) => (
              item(h.email, <EmailRow email={h.email} href={hrefFor(h.email)} isRead={read.has(h.email.kitId)} q={deferredQ} snippet={h.inTitle ? null : h.snippet} showYear />)
            ))}
          </ul>
        </section>
      ) : view === "favorites" ? (
        <section className="pt-8" aria-label="Favorites">
          {favorites.length === 0 ? (
            <p className="ar-empty">
              Star an email and it waits for you here.
            </p>
          ) : (
            <ul className="ar-list">
              {favorites.map((e) =>
                item(e, <EmailRow email={e} href={hrefFor(e)} isRead={read.has(e.kitId)} showYear />)
              )}
            </ul>
          )}
        </section>
      ) : (
        <>
          {startHere.length > 0 && (
            <section className="pt-10" aria-labelledby="ar-start-here">
              <p className="ar-section-label" id="ar-start-here">
                <span>Start here</span>
              </p>
              <ol className="ar-picks">
                {startHere.map((e, i) => (
                  <li key={e.slug}>
                    <Link
                      href={emailHref(e)}
                      className={`ar-pick${e.essay ? " is-essay" : ""}${read.has(e.kitId) ? " is-read" : ""}`}
                    >
                      <span className="ar-pick-num">
                        {String(i + 1).padStart(2, "0")}
                        {e.essay && <span className="ar-essay-tag">Essay</span>}
                        {read.has(e.kitId) && <span className="ar-pick-read">Read</span>}
                      </span>
                      <span className="ar-pick-title">{e.subject}</span>
                      {e.preview && <span className="ar-pick-preview">{e.preview}</span>}
                      <span className="ar-pick-date">{shortDate(e.sentAt)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {months.map((m) => (
            <section key={m.label} className="pt-12" aria-label={m.label}>
              <h2 className="ar-month">
                <span>{m.label}</span>
                <span className="ar-month-count">{m.emails.length}</span>
              </h2>
              <ul className="ar-list">
                {m.emails.map((e) => (
                  item(e, <EmailRow email={e} href={hrefFor(e)} isRead={read.has(e.kitId)} />)
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function EmailRow({
  email,
  href,
  q = "",
  snippet = null,
  showYear = false,
  isRead = false,
}: {
  email: EmailMeta;
  href: string;
  isRead?: boolean;
  q?: string;
  snippet?: string | null;
  showYear?: boolean;
}) {
  const { day, weekday } = dayParts(email.sentAt);
  const essay = email.essay;
  // Name the essay when the email went out under a different subject
  // ("gimme shelter" carried "It's Just a Shot Away").
  const essayRenamed =
    essay && essay.title.toLowerCase() !== email.subject.toLowerCase();
  return (
    <Link
      href={href}
      className={`ar-row group${essay ? " is-essay" : ""}${isRead ? " is-read" : ""}`}
    >
      <span className="ar-row-date" aria-hidden>
        <span className="ar-row-day">{day}</span>
        <span className="ar-row-weekday">{weekday}</span>
      </span>
      <span className="ar-row-body">
        <span className="ar-row-title">
          <Highlight text={email.subject} q={q} />
        </span>
        {snippet ? (
          <span className="ar-row-snippet">
            <Highlight text={snippet} q={q} />
          </span>
        ) : (
          email.preview && (
            <span className="ar-row-preview">
              <Highlight text={email.preview} q={q} />
            </span>
          )
        )}
        <span className="ar-row-meta">
          {essay && <span className="ar-essay-tag">Essay</span>}
          {showYear ? `${shortDate(email.sentAt)} · ` : ""}
          {essay
            ? essayRenamed
              ? `Read it as “${essay.title}” →`
              : "Read the essay →"
            : `${email.readMin} min read`}
        </span>
      </span>
    </Link>
  );
}

// A quiet line above the list. Before the first mark, it explains how
// marks happen instead of announcing a zero. "Surprise me" is a plain
// <a>, not a Link: it's a random redirect, and prefetching it would
// spend the pick before anyone clicks.
function ReadProgress({ read, total }: { read: number; total: number }) {
  // Built after mount: the dev preview flag lives in the URL, and reading
  // it during render would differ between server and browser.
  const [href, setHref] = useState("/emails/surprise");
  useEffect(() => setHref(surpriseHref()), []);
  const surprise = (
    <a href={href} className="ar-surprise">
      Surprise me
    </a>
  );
  if (read === 0) {
    return (
      <p className="ar-progress">
        Read to the end of an email and it&apos;s marked read. Use the circle
        beside any email to mark the ones you already read in your inbox.{" "}
        <span className="ar-progress-sep" aria-hidden>·</span> {surprise}
      </p>
    );
  }
  return (
    <div className="ar-progress">
      <p>
        {read === total
          ? `You've read all ${total}`
          : `You've read ${read} of ${total}`}{" "}
        <span className="ar-progress-sep" aria-hidden>·</span> {surprise}
      </p>
      <span className="ar-progress-bar" aria-hidden>
        <span style={{ width: `${Math.round((read / total) * 100)}%` }} />
      </span>
    </div>
  );
}

function surpriseHref(): string {
  const params = new URLSearchParams();
  const dev = new URLSearchParams(window.location.search).get("dev_preview");
  if (dev) params.set("dev_preview", dev);
  const qs = params.toString();
  return `/emails/surprise${qs ? `?${qs}` : ""}`;
}
