import { type NextRequest, NextResponse } from "next/server";
import {
  attachPaidCommentCheckout,
  createPaidCommentDraft,
  PAID_COMMENT_MIN_CENTS,
} from "@/lib/paid-comments";
import { createPaidCommentCheckoutSession } from "@/lib/membership";
import { getAllArticles } from "@/lib/articles";
import { getAllFieldNotes } from "@/lib/field-notes";

// POST /api/paid-comments/create
// Body: { email, displayName, kind, slug, body, amountCents, showAmount }
// Public — no auth gate, this is the non-member path. Reserves the
// comment as a draft, creates a Stripe Checkout for the chosen
// amount (floor $1), returns the URL so the client can hard-redirect.

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 4000;
// Reasonable ceiling so a typo-fat-finger can't drop a 5-figure
// Stripe charge. $1000 is plenty of room for an enthusiastic guest.
const PAID_COMMENT_MAX_CENTS = 100_000;

function isCommentKind(value: unknown): value is "article" | "note" {
  return value === "article" || value === "note";
}

function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length < 200 &&
    /^[a-z0-9-]+$/.test(value)
  );
}

function pieceTitle(kind: "article" | "note", slug: string): string {
  if (kind === "article") {
    return getAllArticles().find((x) => x.slug === slug)?.title ?? slug;
  }
  return getAllFieldNotes().find((x) => x.slug === slug)?.title ?? slug;
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const obj = payload as Record<string, unknown>;
  const email = obj.email;
  const displayName = obj.displayName;
  const kind = obj.kind;
  const slug = obj.slug;
  const body = obj.body;
  const rawAmount = obj.amountCents;
  const rawShow = obj.showAmount;

  if (typeof email !== "string" || email.trim().length === 0) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (typeof displayName !== "string" || displayName.trim().length === 0) {
    return NextResponse.json(
      { error: "display_name_required" },
      { status: 400 }
    );
  }
  if (!isCommentKind(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (!isSlug(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }
  if (
    typeof body !== "string" ||
    body.length === 0 ||
    body.length > MAX_BODY_LENGTH
  ) {
    return NextResponse.json({ error: "invalid_body_field" }, { status: 400 });
  }
  // Amount validation — clamp to integer cents inside the [floor, cap]
  // window. Reject anything else so a malformed request fails fast
  // rather than dropping a weird charge.
  if (
    typeof rawAmount !== "number" ||
    !Number.isFinite(rawAmount) ||
    rawAmount < PAID_COMMENT_MIN_CENTS ||
    rawAmount > PAID_COMMENT_MAX_CENTS
  ) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  const amountCents = Math.round(rawAmount);
  const showAmount = rawShow === true;

  // Resolve the piece title for Stripe's line-item display before
  // touching Redis — if the slug doesn't match any known piece, fail
  // early so the visitor doesn't hit Stripe and then nowhere.
  const title = pieceTitle(kind, slug);
  if (title === slug) {
    return NextResponse.json({ error: "unknown_piece" }, { status: 404 });
  }

  const draft = await createPaidCommentDraft({
    email,
    displayName,
    kind,
    slug,
    body,
    amountCents,
    showAmount,
  });
  if (!draft.ok) {
    const status =
      draft.error === "already_commented"
        ? 409
        : draft.error === "name_taken"
          ? 409
          : draft.error === "storage_unavailable"
            ? 503
            : 400;
    return NextResponse.json({ error: draft.error }, { status });
  }

  const session = await createPaidCommentCheckoutSession({
    commentId: draft.commentId,
    amountCents,
    email,
    pieceKind: kind,
    pieceSlug: slug,
    pieceTitle: title,
  });
  if ("error" in session) {
    return NextResponse.json({ error: session.error }, { status: 500 });
  }

  await attachPaidCommentCheckout(draft.commentId, session.sessionId);

  return NextResponse.json({ url: session.url });
}
