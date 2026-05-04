"use server";

import { Resend } from "resend";

export type SubmitResult = { success: true } | { success: false; error: string };

const ATTRIBUTION_OPTIONS = [
  "Full name and city",
  "First name and last initial",
  "First name only",
  "Anonymous",
] as const;

type Attribution = (typeof ATTRIBUTION_OPTIONS)[number];

function isValidAttribution(value: unknown): value is Attribution {
  return (
    typeof value === "string" &&
    (ATTRIBUTION_OPTIONS as readonly string[]).includes(value)
  );
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function submitLetter(formData: FormData): Promise<SubmitResult> {
  // Honeypot — silent success on bot submissions
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { success: true };
  }

  const letter = String(formData.get("letter") ?? "").trim();
  const respondingTo = String(formData.get("responding_to") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const attribution = formData.get("attribution");

  if (letter.length < 100) {
    return { success: false, error: "Your letter must be at least 100 characters." };
  }
  if (letter.length > 4000) {
    return { success: false, error: "Your letter must be 4000 characters or fewer." };
  }
  if (!name) {
    return { success: false, error: "Your name is required." };
  }
  if (!email || !isEmail(email)) {
    return { success: false, error: "A valid email is required." };
  }
  if (!isValidAttribution(attribution)) {
    return { success: false, error: "Please select an attribution preference." };
  }

  const editorialEmail = process.env.EDITORIAL_EMAIL ?? "clay@stopbeingprey.com";
  const senderAddress =
    process.env.LETTERS_FROM_ADDRESS ??
    "Stop Being Prey <noreply@stopbeingprey.com>";

  const subject = `Letter to the Preditor — from ${name}`;
  const body = [
    "NEW LETTER SUBMISSION",
    "",
    `From: ${name}`,
    `City: ${city || "—"}`,
    `Email: ${email}`,
    `Attribution preference: ${attribution}`,
    `Responding to: ${respondingTo || "general / multiple essays"}`,
    "",
    "---",
    "",
    letter,
    "",
    "---",
    "",
    `Submitted: ${new Date().toISOString()}`,
  ].join("\n");

  if (!process.env.RESEND_API_KEY) {
    // TODO: wire RESEND_API_KEY in production env. Without it, log the
    // submission so the form can still be exercised in dev.
    console.log("[letters] no RESEND_API_KEY — skipping send");
    console.log("[letters] subject:", subject);
    console.log("[letters] to:", editorialEmail);
    console.log("[letters] body:\n" + body);
    return { success: true };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: senderAddress,
      to: editorialEmail,
      replyTo: email,
      subject,
      text: body,
    });
    if (error) {
      console.error("[letters] resend error:", error);
      return {
        success: false,
        error: "Couldn't send your letter just now. Try again in a moment.",
      };
    }
    return { success: true };
  } catch (err) {
    console.error("[letters] send threw:", err);
    return {
      success: false,
      error: "Couldn't send your letter just now. Try again in a moment.",
    };
  }
}
