"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitLetter } from "./actions";

type ArticleOption = { slug: string; title: string };

const ATTRIBUTION_OPTIONS = [
  { value: "Full name and city", hint: "e.g., Carla Streff, Lansing" },
  { value: "First name and last initial", hint: "e.g., Carla S." },
  { value: "First name only", hint: "e.g., Carla" },
  { value: "Anonymous", hint: "a reader writes…" },
];

const inputClass =
  "w-full bg-paper border border-ink/30 px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink transition-colors font-serif text-base";

const labelClass = "eyebrow block mb-2";
const helperClass =
  "text-xs italic text-ink-muted mt-1.5 leading-relaxed";

export function SubmitLetterForm({ articles }: { articles: ArticleOption[] }) {
  const router = useRouter();
  const [letter, setLetter] = useState("");
  const [respondingTo, setRespondingTo] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [attribution, setAttribution] = useState<string>("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const letterLength = letter.length;
  const letterTooShort = letterLength > 0 && letterLength < 100;
  const letterTooLong = letterLength > 4000;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (letterLength < 100) {
      setError("Your letter must be at least 100 characters.");
      return;
    }
    if (letterLength > 4000) {
      setError("Your letter must be 4000 characters or fewer.");
      return;
    }
    if (!name.trim()) {
      setError("Your name is required.");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("A valid email is required.");
      return;
    }
    if (!attribution) {
      setError("Please choose how you'd like to be attributed.");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("letter", letter);
      fd.set("responding_to", respondingTo);
      fd.set("name", name);
      fd.set("city", city);
      fd.set("email", email);
      fd.set("attribution", attribution);
      fd.set("website", website);

      const result = await submitLetter(fd);
      if (!result.success) {
        setError(result.error);
        setSubmitting(false);
        return;
      }
      router.push("/letters/submit/thanks");
    } catch {
      setError("Couldn't send your letter just now. Try again in a moment.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {/* Honeypot */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label>
          Leave this field blank
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {/* Letter */}
      <div>
        <label htmlFor="letter" className={labelClass}>
          Your letter
        </label>
        <textarea
          id="letter"
          name="letter"
          rows={10}
          required
          minLength={100}
          maxLength={4000}
          placeholder="What landed, what didn't, what you're carrying after reading."
          value={letter}
          onChange={(e) => setLetter(e.target.value)}
          className={inputClass + " resize-y leading-relaxed"}
        />
        <p
          className={
            "text-xs italic mt-1.5 leading-relaxed " +
            (letterTooLong || letterTooShort ? "text-ink-soft" : "text-ink-faint")
          }
        >
          {letterLength} / 4000 characters
          {letterTooShort && " — minimum 100"}
          {letterTooLong && " — over the limit"}
        </p>
      </div>

      {/* Responding to */}
      <div>
        <label htmlFor="responding_to" className={labelClass}>
          Responding to
        </label>
        <select
          id="responding_to"
          name="responding_to"
          value={respondingTo}
          onChange={(e) => setRespondingTo(e.target.value)}
          className={inputClass + " appearance-none cursor-pointer"}
        >
          <option value="">general / multiple essays</option>
          {articles.map((a) => (
            <option key={a.slug} value={a.title}>
              {a.title}
            </option>
          ))}
        </select>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="name" className={labelClass}>
          Your name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <p className={helperClass}>Used for attribution per your selection below.</p>
      </div>

      {/* City */}
      <div>
        <label htmlFor="city" className={labelClass}>
          Your city (optional)
        </label>
        <input
          type="text"
          id="city"
          name="city"
          autoComplete="address-level2"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className={labelClass}>
          Your email
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <p className={helperClass}>
          Will not be published. I use this to send you the proof if your
          letter runs.
        </p>
      </div>

      {/* Attribution */}
      <fieldset>
        <legend className={labelClass}>How would you like to be attributed?</legend>
        <div className="space-y-2.5 mt-1">
          {ATTRIBUTION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-baseline gap-3 cursor-pointer"
            >
              <input
                type="radio"
                name="attribution"
                value={opt.value}
                checked={attribution === opt.value}
                onChange={(e) => setAttribution(e.target.value)}
                required
                className="mt-1 accent-eye"
              />
              <span className="font-serif text-base text-ink leading-snug">
                {opt.value}
                <span className="text-ink-muted italic ml-2">— {opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Terms */}
      <p className="text-xs italic text-ink-muted leading-relaxed max-w-2xl">
        By submitting, you grant Stop Being Prey permission to publish your
        letter on the site and in the email newsletter. Letters may be edited
        for length and clarity. You&apos;ll be attributed as selected above.
        You retain copyright. No compensation.
      </p>

      {error && (
        <p className="text-sm italic text-ink-soft" style={{ color: "#7a3a2e" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-ink text-paper hover:bg-eye-deep disabled:opacity-60 px-8 py-4 font-display transition-colors text-sm uppercase tracking-widest cursor-pointer disabled:cursor-not-allowed"
        style={{ fontWeight: 600, letterSpacing: "0.22em" }}
      >
        {submitting ? "Sending…" : "Submit letter"}
      </button>
    </form>
  );
}
