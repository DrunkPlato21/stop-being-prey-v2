import { Resend } from "resend";
import type { WallDonation } from "@/lib/wallDonations";
import { displayName } from "@/lib/wallDonations";

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  if (cachedClient) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cachedClient = new Resend(key);
  return cachedClient;
}

function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

export async function notifyNewWallDonation(
  donation: WallDonation,
  wallTitle: string
): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — skipping notification");
    return;
  }
  const to = process.env.ADMIN_EMAIL;
  const from = process.env.EMAIL_FROM;
  if (!to || !from) {
    console.warn(
      "[email] ADMIN_EMAIL or EMAIL_FROM not set — skipping notification"
    );
    return;
  }

  const baseUrl = getBaseUrl();
  const adminUrl = `${baseUrl}/admin/walls`;
  const amount = formatMoney(donation.amountCents);
  const who = displayName(donation);

  const subject = `Wall donation pending — ${amount} from ${who}`;
  const text = [
    `New donation pending review on the "${wallTitle}" wall.`,
    ``,
    `Amount:    ${amount}`,
    `From:      ${who}${donation.anonymous ? " (anonymous)" : ""}`,
    `Show amt:  ${donation.showAmount ? "yes" : "no"}`,
    ``,
    `Note:`,
    donation.note,
    ``,
    `Review queue: ${adminUrl}`,
  ].join("\n");

  try {
    await client.emails.send({
      from,
      to,
      subject,
      text,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.error(`[email] failed to send notification: ${reason}`);
  }
}
