"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { subscribeToList } from "@/lib/kit";
import { emailProblem, normalizeEmail } from "@/lib/email-guard";
import { RULES_UNLOCK_COOKIE, RULES_UNLOCK_MAX_AGE } from "@/lib/rules-unlock";

// Server Action behind the Rules unlock gate. A stranger drops their email
// to read rules II-VII. We subscribe them to the list (the whole point of
// the gate) and set the unlock cookie; revalidatePath re-renders /rules so
// the full bodies appear inline without a navigation. Reachable by direct
// POST, so it re-validates its own input — never trusts the caller.

export type UnlockState = { ok: boolean; error?: string };

export async function unlockRules(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const email = normalizeEmail(formData.get("email_address"));
  const problem = emailProblem(email);
  if (problem === "format") {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (problem === "disposable") {
    return { ok: false, error: "Use a real email address you check." };
  }

  // Subscribe first. A real Kit failure (bad address, rate limit) blocks
  // the unlock — the email landing on the list is the price of the rules,
  // so we don't hand them over for free on a failed capture. The one
  // exception is a missing-config state (dev without a key): unlock anyway
  // rather than punish the reader for our env gap.
  const result = await subscribeToList(email);
  if (!result.ok && result.reason !== "not_configured") {
    console.error(
      `[rules-unlock] subscribe failed: ${result.reason}` +
        (result.status ? ` (${result.status}) ${result.body ?? ""}` : ""),
    );
    return { ok: false, error: "That didn't go through. Try again." };
  }

  const cookieStore = await cookies();
  cookieStore.set(RULES_UNLOCK_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RULES_UNLOCK_MAX_AGE,
  });

  revalidatePath("/rules");
  return { ok: true };
}
