import { markHandlers } from "../marks";

// The caller's read marks. See ../marks.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = markHandlers("read");
