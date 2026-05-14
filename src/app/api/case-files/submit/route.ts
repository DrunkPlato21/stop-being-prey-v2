import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile } from "@/lib/comments";
import {
  anonymizationLabel,
  attachCheckoutSession,
  createSubmission,
  isCaseSubmissionsConfigured,
  tierAmountCents,
  type Anonymization,
  type CaseTier,
} from "@/lib/case-submissions";
import { createCaseReviewCheckoutSession } from "@/lib/membership";
import {
  sendCaseReviewAdminNotification,
  sendCaseReviewMemberConfirmation,
} from "@/lib/email";

// Create a paid case-review submission and return a Stripe Checkout
// URL. The flow:
//   1. Session-auth the caller (must be signed in — /case-files is
//      already gated by proxy.ts, this is belt-and-suspenders).
//   2. Validate + sanitize fields, write the submission record as
//      `submitted`.
//   3. Create the Stripe Checkout session with case_id metadata.
//   4. Bind the checkout session id to the submission (reverse index)
//      so the webhook can resolve the case even if metadata is
//      stripped in transit.
//   5. Return { url } — the client redirects to Stripe.
//
// The webhook (checkout.session.completed → lane=case_review) flips
// the record to `paid` and fires the admin + member emails.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isCaseSubmissionsConfigured()) {
    return Response.json(
      { error: "storage_unavailable" },
      { status: 503 }
    );
  }

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const rawTier = b.tier;
  if (
    rawTier !== "free" &&
    rawTier !== "public_review" &&
    rawTier !== "private_review"
  ) {
    return Response.json({ error: "invalid_tier" }, { status: 400 });
  }
  const tier: CaseTier = rawTier;

  const title = typeof b.title === "string" ? b.title : "";
  const situation = typeof b.situation === "string" ? b.situation : "";
  const move = typeof b.move === "string" ? b.move : "";
  const attemptedResponse =
    typeof b.attemptedResponse === "string" ? b.attemptedResponse : "";
  const helpWanted = typeof b.helpWanted === "string" ? b.helpWanted : "";

  let anonymization: Anonymization | null = null;
  if (tier === "public_review") {
    const rawAnon = b.anonymization;
    if (
      rawAnon !== "full_name" &&
      rawAnon !== "first_name" &&
      rawAnon !== "anonymous"
    ) {
      return Response.json(
        { error: "missing_anonymization" },
        { status: 400 }
      );
    }
    anonymization = rawAnon;
  } else if (tier === "free") {
    // Free tier accepts an optional anonymization override; the lib
    // defaults to first_name when omitted.
    const rawAnon = b.anonymization;
    if (
      rawAnon === "full_name" ||
      rawAnon === "first_name" ||
      rawAnon === "anonymous"
    ) {
      anonymization = rawAnon;
    }
  }

  const profile = await getProfile(session.email).catch(() => null);
  const memberDisplayName =
    profile?.displayName?.trim() || session.email.split("@")[0] || "Member";

  const result = await createSubmission({
    memberEmail: session.email,
    memberDisplayName,
    tier,
    title,
    situation,
    move,
    attemptedResponse,
    helpWanted,
    anonymization,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  const submission = result.submission;

  // Free tier: no Stripe checkout. Record is already saved as
  // `submitted`; fire the admin + member emails directly and return
  // the in-app destination URL so the client can navigate without
  // bouncing through a payment processor.
  if (submission.tier === "free") {
    const adminTo = process.env.ADMIN_EMAIL ?? "clay@stopbeingprey.com";
    const baseUrl = (
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://stopbeingprey.com"
    ).replace(/\/$/, "");
    const caseFilesUrl = `${baseUrl}/case-files`;

    await sendCaseReviewAdminNotification({
      to: adminTo,
      tier: submission.tier,
      amountDollars: 0,
      memberDisplayName: submission.memberDisplayName,
      memberEmail: submission.memberEmail,
      caseId: submission.id,
      title: submission.title,
      situation: submission.situation,
      move: submission.move,
      attemptedResponse: submission.attemptedResponse,
      helpWanted: submission.helpWanted,
      anonymization: submission.anonymization
        ? anonymizationLabel(submission.anonymization)
        : null,
    }).catch((err) => {
      console.error(
        `[case-submit] free admin notification failed for ${submission.id}:`,
        err
      );
    });

    await sendCaseReviewMemberConfirmation({
      to: submission.memberEmail,
      memberDisplayName: submission.memberDisplayName,
      tier: submission.tier,
      title: submission.title,
      caseFilesUrl,
    }).catch((err) => {
      console.error(
        `[case-submit] free member confirmation failed for ${submission.id}:`,
        err
      );
    });

    return Response.json({
      url: "/case-files/submitted",
      caseId: submission.id,
    });
  }

  // Paid tiers continue through Stripe Checkout.
  const checkout = await createCaseReviewCheckoutSession({
    caseId: submission.id,
    tier: submission.tier,
    amountCents: tierAmountCents(submission.tier),
    memberEmail: submission.memberEmail,
    caseTitle: submission.title,
  });

  if ("error" in checkout) {
    const status =
      checkout.error === "stripe_not_configured" ||
      checkout.error === "no_url_returned"
        ? 500
        : 400;
    return Response.json({ error: checkout.error }, { status });
  }

  await attachCheckoutSession(submission.id, checkout.sessionId);

  return Response.json({ url: checkout.url, caseId: submission.id });
}
