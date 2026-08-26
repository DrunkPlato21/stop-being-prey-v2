"use server";

import { redirect } from "next/navigation";
import { verifyArenaToken } from "@/lib/auth";
import { setArenaSubscribed } from "@/lib/arena-watch";

// Server action behind the human unsubscribe page's single button.
// One deliberate click, no login, per the house email rule. The token
// carries the email; nothing else identifies the visitor.

export async function unsubscribeFromArena(formData: FormData) {
  const token = formData.get("token");
  const email = await verifyArenaToken(
    typeof token === "string" ? token : null
  );
  if (!email) {
    redirect("/arena-unsubscribe?error=1");
  }
  await setArenaSubscribed(email, false);
  redirect("/arena-unsubscribe?done=1");
}
