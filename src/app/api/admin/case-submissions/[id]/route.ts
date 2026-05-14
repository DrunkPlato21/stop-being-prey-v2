import type { NextRequest } from "next/server";
import {
  ALL_STATUSES,
  isCaseSubmissionsConfigured,
  setStatus,
  type CaseStatus,
} from "@/lib/case-submissions";
import { createNotification } from "@/lib/notifications";

// Admin status mutation for a single case submission. Gated by
// proxy.ts via HTTP Basic auth on /api/admin/*. The handler is
// intentionally narrow: one field, the new status. All other shape
// is enforced upstream.

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCaseSubmissionsConfigured()) {
    return Response.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 }
    );
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_body" },
      { status: 400 }
    );
  }

  const rawStatus = (body as { status?: unknown })?.status;
  if (
    typeof rawStatus !== "string" ||
    !ALL_STATUSES.includes(rawStatus as CaseStatus)
  ) {
    return Response.json(
      { ok: false, error: "invalid_status" },
      { status: 400 }
    );
  }

  const updated = await setStatus(id, rawStatus as CaseStatus);
  if (!updated) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // Notify the submitter when their case is published. Fire-and-
  // forget; failure to write the notification shouldn't break the
  // status mutation Clay just confirmed.
  if (rawStatus === "published") {
    await createNotification({
      memberEmail: updated.memberEmail,
      type: "case_published",
      title: "Your Case File is live",
      body: updated.title,
      linkUrl: "/case-files",
    }).catch((err) => {
      console.error(
        `[notifications] case_published write failed for ${updated.id}:`,
        err
      );
    });
  }

  return Response.json({ ok: true, submission: updated });
}
