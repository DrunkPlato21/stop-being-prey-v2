import { Redis } from "@upstash/redis";

// AI-assisted analysis of social-post screenshots for the channels
// admin. Clay pastes a screenshot, the model reads it, returns
// suggested source + preview line + extracted text + timestamp. Form
// auto-fills the existing Source / Preview / Posted-at fields; Clay
// edits if needed and clicks Save.
//
// Backed by OpenRouter (sk-or-v1-...) calling Anthropic's Claude
// Sonnet via OpenRouter's OpenAI-compatible chat completions API.
// OpenRouter routes the request to Anthropic and bills against your
// OpenRouter credits. No Anthropic account required.
//
// Redis schema:
//   ai:analyze-log   ZSET, score=timestamp ms, member=JSON usage record
//     Doubles as the rate-limit window (ZCOUNT in last hour) and the
//     billing log. Trimmed to the last 500 entries on every write so
//     it doesn't grow unbounded.

const LOG_KEY = "ai:analyze-log";
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const LOG_TRIM_KEEP = 500;
const TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// OpenRouter model slug. Anthropic's Sonnet 4.5 (vision-capable,
// strong instruction-following, cheap). Adjust if you want Opus
// for higher accuracy or Haiku for lower cost — see openrouter.ai/models.
const MODEL = "anthropic/claude-sonnet-4.5";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are helping Clay surface social media posts to his Writer's Desk feed.

Given a screenshot of a social media post (X/Twitter, Facebook, or YouTube), extract:
1. Which platform it's from (X, Facebook, YouTube, or unknown). A YouTube screenshot shows a video page, channel, or community post with the YouTube player or red branding.
2. A short preview line, 80-100 characters max, that captures the gist of the post. For a YouTube video, use the video title or its hook. Match the voice of the post itself. If it appears to be Clay's post, preserve his cadence. If it's someone else's, be neutral.
3. The full text of the post (or video title + description) for reference.
4. The post's relative timestamp if visible (e.g., "9h", "1d", "May 11").

Respond ONLY in valid JSON matching this schema:
{
  "suggested_source": "X" | "Facebook" | "YouTube" | "unknown",
  "suggested_preview": "string, 80-100 chars",
  "extracted_text": "string, full text of the post",
  "extracted_timestamp": "string or null"
}

Do not include code blocks, markdown, or commentary. JSON only. Never use em dashes in the preview line.`;

export type AnalyzeSuggestion = {
  suggested_source: "X" | "Facebook" | "YouTube" | "unknown";
  suggested_preview: string;
  extracted_text: string;
  extracted_timestamp: string | null;
};

export type AnalyzeUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
};

export type AnalyzeResult =
  | { ok: true; suggestion: AnalyzeSuggestion; usage: AnalyzeUsage }
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
      retryAfterSeconds?: number;
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

export function isAnalyzeConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i;

type DecodedImage = {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  base64: string;
  dataUrl: string;
};

function decodeImage(input: string):
  | { ok: true; image: DecodedImage }
  | { ok: false; error: "invalid_image" | "image_too_large" } {
  const trimmed = input.trim();
  const m = trimmed.match(DATA_URL_RE);
  if (!m) return { ok: false, error: "invalid_image" };
  const rawMedia = m[1].toLowerCase();
  if (
    rawMedia !== "image/png" &&
    rawMedia !== "image/jpeg" &&
    rawMedia !== "image/webp" &&
    rawMedia !== "image/gif"
  ) {
    return { ok: false, error: "invalid_image" };
  }
  const base64 = m[2];
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return { ok: false, error: "image_too_large" };
  }
  return {
    ok: true,
    image: { mediaType: rawMedia, base64, dataUrl: trimmed },
  };
}

/**
 * Count how many analyze calls landed in the last hour. Used both for
 * the rate-limit gate and the admin "usage today" line on the form.
 */
export async function recentCallCount(now: number = Date.now()): Promise<number> {
  const client = getRedis();
  if (!client) return 0;
  const since = now - RATE_LIMIT_WINDOW_MS;
  // The log is shared with the Arena's screenshot reader (one billing
  // trail), but the fuses are separate: its entries carry source
  // "arena" and count against its own cap, never this one's. A bare
  // ZCOUNT here would let a busy fight blow the analyzer's fuse.
  const window = await client
    .zrange<string[]>(LOG_KEY, since, now, { byScore: true })
    .catch(() => [] as string[]);
  return window.filter((entry) => {
    try {
      const parsed =
        typeof entry === "string" ? JSON.parse(entry) : (entry as unknown);
      return (parsed as { source?: string })?.source !== "arena";
    } catch {
      return true;
    }
  }).length;
}

export type AnalyzeLogEntry = {
  ts: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  source: string;
};

/**
 * Recent calls for the admin sidebar. Newest first.
 */
export async function recentCalls(
  limit = 25
): Promise<AnalyzeLogEntry[]> {
  const client = getRedis();
  if (!client) return [];
  const raw = await client
    .zrange(LOG_KEY, 0, limit - 1, { rev: true })
    .catch(() => [] as unknown[]);
  const arr = Array.isArray(raw) ? raw : [];
  const out: AnalyzeLogEntry[] = [];
  for (const item of arr) {
    try {
      const parsed =
        typeof item === "string" ? (JSON.parse(item) as AnalyzeLogEntry) : (item as AnalyzeLogEntry);
      if (parsed && typeof parsed.ts === "number") out.push(parsed);
    } catch {
      // Skip malformed entries.
    }
  }
  return out;
}

async function logCall(
  usage: AnalyzeUsage,
  suggestion: AnalyzeSuggestion,
  now: number
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  const entry: AnalyzeLogEntry = {
    ts: now,
    model: MODEL,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadInputTokens: usage.cacheReadInputTokens,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
    source: suggestion.suggested_source,
  };
  await client
    .zadd(LOG_KEY, { score: now, member: JSON.stringify(entry) })
    .catch(() => null);
  const total = await client.zcard(LOG_KEY).catch(() => 0);
  if (typeof total === "number" && total > LOG_TRIM_KEEP) {
    await client
      .zremrangebyrank(LOG_KEY, 0, total - LOG_TRIM_KEEP - 1)
      .catch(() => null);
  }
}

function parseSuggestion(text: string): AnalyzeSuggestion | null {
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

  const sourceRaw = r.suggested_source;
  const source: AnalyzeSuggestion["suggested_source"] =
    sourceRaw === "X" || sourceRaw === "Facebook" || sourceRaw === "YouTube"
      ? sourceRaw
      : "unknown";

  const preview =
    typeof r.suggested_preview === "string"
      ? r.suggested_preview.trim().slice(0, 200)
      : "";
  const fullText =
    typeof r.extracted_text === "string" ? r.extracted_text.trim() : "";
  const ts =
    typeof r.extracted_timestamp === "string" && r.extracted_timestamp.trim().length > 0
      ? r.extracted_timestamp.trim()
      : null;

  if (!preview && !fullText) return null;

  return {
    suggested_source: source,
    suggested_preview: preview,
    extracted_text: fullText,
    extracted_timestamp: ts,
  };
}

type OpenRouterChoice = {
  message?: {
    role?: string;
    content?: string | null;
  };
  finish_reason?: string;
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    // Anthropic-via-OpenRouter sometimes surfaces these; default to 0.
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
  error?: {
    message?: string;
    code?: number | string;
    type?: string;
  };
};

/**
 * Run a screenshot through Claude (via OpenRouter). `imageDataUrl` is
 * the full `data:image/png;base64,...` string from the client.
 * Returns a tagged union — callers branch on `ok`.
 */
export async function analyzeScreenshot(
  imageDataUrl: string,
  now: number = Date.now()
): Promise<AnalyzeResult> {
  const decoded = decodeImage(imageDataUrl);
  if (!decoded.ok) return { ok: false, error: decoded.error };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: "ai_unavailable" };

  const callsInWindow = await recentCallCount(now);
  if (callsInWindow >= RATE_LIMIT_MAX) {
    return {
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const referer =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://stopbeingprey.com";

    // OpenAI-compatible request shape. System prompt is a "system"
    // message rather than a top-level field, and images use the
    // image_url content block.
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // Optional but recommended by OpenRouter for analytics +
        // anti-abuse. Doesn't affect billing.
        "HTTP-Referer": referer,
        "X-Title": "Stop Being Prey: channels admin",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: decoded.image.dataUrl },
              },
              {
                type: "text",
                text: "Analyze this screenshot and respond with the JSON schema only.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      let parsed: OpenRouterResponse | null = null;
      try {
        parsed = JSON.parse(bodyText) as OpenRouterResponse;
      } catch {
        // Non-JSON error body — fall through with raw text.
      }
      const message =
        parsed?.error?.message ?? bodyText.slice(0, 200) ?? "request_failed";
      return {
        ok: false,
        error: "ai_error",
        detail: `${res.status}: ${message}`,
      };
    }

    const data = (await res.json()) as OpenRouterResponse;
    if (data.error) {
      return {
        ok: false,
        error: "ai_error",
        detail: data.error.message ?? "openrouter_error",
      };
    }

    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      return {
        ok: false,
        error: "ai_parse_failed",
        detail: "empty_content",
      };
    }

    const suggestion = parseSuggestion(content);
    if (!suggestion) {
      return {
        ok: false,
        error: "ai_parse_failed",
        detail: content.slice(0, 200),
      };
    }

    const usage: AnalyzeUsage = {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cacheReadInputTokens:
        data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      cacheCreationInputTokens: 0,
    };

    await logCall(usage, suggestion, now).catch(() => null);

    return { ok: true, suggestion, usage };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "ai_timeout" };
    }
    return {
      ok: false,
      error: "ai_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}
