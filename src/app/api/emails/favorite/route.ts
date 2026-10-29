import { markHandlers } from "../marks";

// The caller's starred emails. See ../marks.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = markHandlers("fav");
