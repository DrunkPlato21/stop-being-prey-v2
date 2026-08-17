import { Redis } from "@upstash/redis";

// AI transcription of Arena specimen screenshots. Clay pastes a
// screenshot into the bench; the model reads it and returns the
// opponent's handle, a verbatim transcript, and the visible timestamp.
// The bench auto-fills the handle + transcript fields; Clay edits
// rather than types. Fails soft in every direction — a transcription
// error never blocks the tile; the fields just stay manual.
//
// Pattern-replicated from screenshot-analyze.ts (the channels admin's
// analyzer): same OpenRouter -> Claude vision call shape, and the SAME
// rate-limit log key, so both features share one 10-calls-per-hour
// budget and one billing trail.

const LOG_KEY = "ai:analyze-log";
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const LOG_TRIM_KEEP = 500;
const TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MODEL = "anthropic/claude-sonnet-4.5";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are transcribing a screenshot of a social media exchange (usually X/Twitter) for Clay's fight archive. Screenshots rot; the transcript is the durable record, so accuracy matters more than polish.

Extract:
1. The handle of the post's author (e.g. "@username"). If several authors appear, the author of the MAIN/hostile post Clay is capturing.
2. A verbatim transcript of ALL post text visible in the screenshot. Do not paraphrase, do not correct spelling, do not censor. If multiple messages are visible, one line per message in the form: [timestamp if visible] @handle: text
3. The main post's visible timestamp (e.g. "9:41 PM", "9h", "May 11"), if any.

Respond ONLY in valid JSON matching this schema:
{
  "handle": "string or null",
  "transcript": "string, verbatim",
  "timestamp": "string or null"
}

No code blocks, no markdown, no commentary. JSON only.`;

export type SpecimenTranscript = {
  handle: string | null;
  transcript: string;
  timestamp: string | null;
};

export type TranscribeResult =
  | { ok: true; result: SpecimenTranscript }
  | {
      ok: false;
      error:
        | "rate_limited"
        | "ai_unavailable"
        | "ai_timeout"
        | "ai_parse_failed"
        | "ai_error"
        | "image_too_large"
        | "invalid_image";
      detail?: string;
    };

let cachedRedis: Redis | null = null;
function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

const DATA_URL_RE =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i;

function parseResult(text: string): SpecimenTranscript | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const transcript =
    typeof r.transcript === "string" ? r.transcript.trim() : "";
  if (!transcript) return null;
  return {
    handle:
      typeof r.handle === "string" && r.handle.trim()
        ? r.handle.trim().slice(0, 60)
        : null,
    transcript: transcript.slice(0, 8000),
    timestamp:
      typeof r.timestamp === "string" && r.timestamp.trim()
        ? r.timestamp.trim().slice(0, 40)
        : null,
  };
}

export async function transcribeSpecimen(
  imageDataUrl: string,
  now: number = Date.now()
): Promise<TranscribeResult> {
  const m = imageDataUrl.trim().match(DATA_URL_RE);
  if (!m) return { ok: false, error: "invalid_image" };
  if (Math.floor((m[2].length * 3) / 4) > MAX_IMAGE_BYTES) {
    return { ok: false, error: "image_too_large" };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: "ai_unavailable" };

  const client = getRedis();
  if (client) {
    const since = now - RATE_LIMIT_WINDOW_MS;
    const calls = await client.zcount(LOG_KEY, since, now).catch(() => 0);
    if (typeof calls === "number" && calls >= RATE_LIMIT_MAX) {
      return { ok: false, error: "rate_limited" };
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const referer =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://stopbeingprey.com";
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": referer,
        "X-Title": "Stop Being Prey: arena bench",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageDataUrl.trim() } },
              {
                type: "text",
                text: "Transcribe this screenshot and respond with the JSON schema only.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      return {
        ok: false,
        error: "ai_error",
        detail: `${res.status}: ${bodyText.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    if (data.error) {
      return { ok: false, error: "ai_error", detail: data.error.message };
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      return { ok: false, error: "ai_parse_failed" };
    }
    const parsed = parseResult(content);
    if (!parsed) return { ok: false, error: "ai_parse_failed" };

    // Log into the shared window (source: "arena") for rate limiting +
    // the admin usage trail; trimmed the same way.
    if (client) {
      await client
        .zadd(LOG_KEY, {
          score: now,
          member: JSON.stringify({
            ts: now,
            model: MODEL,
            inputTokens: data.usage?.prompt_tokens ?? 0,
            outputTokens: data.usage?.completion_tokens ?? 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            source: "arena",
          }),
        })
        .catch(() => null);
      const total = await client.zcard(LOG_KEY).catch(() => 0);
      if (typeof total === "number" && total > LOG_TRIM_KEEP) {
        await client
          .zremrangebyrank(LOG_KEY, 0, total - LOG_TRIM_KEEP - 1)
          .catch(() => null);
      }
    }

    return { ok: true, result: parsed };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: aborted ? "ai_timeout" : "ai_error" };
  } finally {
    clearTimeout(timeout);
  }
}
