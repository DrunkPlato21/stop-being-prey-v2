import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getWritersDeskState } from "@/lib/writers-desk-state";
import { WritersDeskView } from "@/components/WritersDeskView";

// Server wrapper. Reads the session (the widget renders on /notes,
// which is auth-gated, so we always have one in practice) and hands
// the initial snapshot to the client view. The view polls the
// session-aware state endpoint to stay live.

export async function WritersDesk() {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  const initial = await getWritersDeskState(
    session ? { email: session.email } : undefined
  );
  return <WritersDeskView initialState={initial} />;
}
