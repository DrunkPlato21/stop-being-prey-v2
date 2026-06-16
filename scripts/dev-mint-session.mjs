import { SignJWT } from "jose";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Dev-only: mint a session JWT (the same shape as src/lib/auth.ts
// signSession) so local verification can hold a member session without
// running the magic-link email flow. Usage:
//   node scripts/dev-mint-session.mjs you@example.com

if (process.env.NODE_ENV === "production") {
  console.error("REFUSING: NODE_ENV=production.");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
let env = {};
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const secret = env.AUTH_SECRET || process.env.AUTH_SECRET;
if (!secret) {
  console.error("Missing AUTH_SECRET in .env.local");
  process.exit(1);
}

const email = (process.argv[2] || "").toLowerCase().trim();
if (!email) {
  console.error("Usage: node scripts/dev-mint-session.mjs <email>");
  process.exit(1);
}

const token = await new SignJWT({ email, customerId: "dev" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("30d")
  .sign(new TextEncoder().encode(secret));

console.log(token);
// Also surface the configured admin email for convenience.
if (env.ADMIN_EMAIL) console.error(`ADMIN_EMAIL=${env.ADMIN_EMAIL}`);
