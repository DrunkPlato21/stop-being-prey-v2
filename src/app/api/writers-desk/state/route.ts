import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getWritersDeskState } from "@/lib/writers-desk-state";

// Polling endpoint for the DEN's Writer's Desk widget. Session-aware:
// signed-in members get their own past notes folded into the response
// so the polling loop refreshes everything in one round-trip.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  const state = await getWritersDeskState(
    session ? { email: session.email } : undefined
  );
  return Response.json(state, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
