"use server";

import { redirect } from "next/navigation";
import { verifyDigestToken } from "@/lib/auth";
import { setDigestUnsubscribed } from "@/lib/digest";

// Server action behind the human unsubscribe page's single button.
// One deliberate click, no login, per the house email rule. The token
// carries the email; nothing else identifies the visitor.

export async function unsubscribeFromDigest(formData: FormData) {
  const token = formData.get("token");
  const email = await verifyDigestToken(
    typeof token === "string" ? token : null
  );
  if (!email) {
    redirect("/digest/unsubscribe?error=1");
  }
  await setDigestUnsubscribed(email, true);
  redirect("/digest/unsubscribe?done=1");
}
