// Read-only investigation: inventory every record tied to either of
// Janet Holman's emails across Redis (member records, indexes) and
// Stripe (customers, subscriptions, charges).
//
// NO writes. NO destructive operations. Output only.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/investigate-janet.mjs

import { Redis } from "@upstash/redis";
import Stripe from "stripe";

const EMAILS = ["janatherhome@aol.com", "jancanmanage@aol.com"];

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}
if (!stripeKey) {
  console.error("Missing STRIPE_SECRET_KEY.");
  process.exit(1);
}

const redis = new Redis({ url, token });
const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });

function fmt(ts) {
  if (!ts) return "(null)";
  return new Date(ts).toISOString();
}

function dollars(cents) {
  if (cents == null) return "(null)";
  return `$${(cents / 100).toFixed(2)}`;
}

async function section(title) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

async function main() {
  // === Redis: founder + charter counters
  await section("Founder / Charter counters");
  const founderClaimed = await redis.get("founder:claimed");
  const charterClaimed = await redis.get("charter:claimed");
  console.log(`  founder:claimed = ${founderClaimed} / 100`);
  console.log(`  charter:claimed = ${charterClaimed ?? "(unset)"} / 200`);

  // === Redis: member records for each email
  for (const email of EMAILS) {
    await section(`Redis member record: ${email}`);
    const norm = email.toLowerCase().trim();

    const memberRaw = await redis.get(`member:${norm}`);
    if (!memberRaw) {
      console.log(`  member:${norm} = (not found)`);
    } else {
      const m = typeof memberRaw === "string" ? JSON.parse(memberRaw) : memberRaw;
      console.log(`  member:${norm} =`);
      console.log(`    email:                  ${m.email}`);
      console.log(`    tier:                   ${m.tier}`);
      console.log(`    founderSlot:            ${m.founderSlot}`);
      console.log(`    charterSlot:            ${m.charterSlot ?? "(null)"}`);
      console.log(`    status:                 ${m.status}`);
      console.log(`    interval:               ${m.interval}`);
      console.log(`    amountCents:            ${m.amountCents} (${dollars(m.amountCents)})`);
      console.log(`    createdAt:              ${m.createdAt} (${fmt(m.createdAt)})`);
      console.log(`    updatedAt:              ${m.updatedAt} (${fmt(m.updatedAt)})`);
      console.log(`    stripeCustomerId:       ${m.stripeCustomerId}`);
      console.log(`    stripeSubscriptionId:   ${m.stripeSubscriptionId}`);

      // Reverse-index check: does the customer-id index point back to this email?
      const byCust = await redis.get(`member:by-customer:${m.stripeCustomerId}`);
      console.log(`    by-customer index → ${byCust ?? "(missing)"}`);
    }

    // Scan for any session-id reverse-index entries pointing to this email.
    let cursor = "0";
    const sessionMatches = [];
    do {
      const res = await redis.scan(cursor, {
        match: "member:by-session:*",
        count: 100,
      });
      cursor = res[0];
      for (const key of res[1]) {
        const v = await redis.get(key);
        if (v && String(v).toLowerCase() === norm) {
          sessionMatches.push(key);
        }
      }
    } while (cursor !== "0" && cursor !== 0);
    if (sessionMatches.length > 0) {
      console.log(`  member:by-session:* pointing to ${norm}:`);
      for (const k of sessionMatches) console.log(`    ${k}`);
    } else {
      console.log(`  (no member:by-session:* index entries for this email)`);
    }
  }

  // === Redis: members:all index — does it contain either email?
  await section("members:all ZSET — Janet's emails specifically");
  const allEmails = await redis.zrange("members:all", 0, -1, { withScores: true });
  // Upstash returns [member, score, member, score, ...] when withScores is true.
  // Normalize to pairs.
  const pairs = [];
  if (Array.isArray(allEmails)) {
    for (let i = 0; i < allEmails.length; i += 2) {
      pairs.push({ email: allEmails[i], score: Number(allEmails[i + 1]) });
    }
  }
  for (const email of EMAILS) {
    const norm = email.toLowerCase().trim();
    const hit = pairs.find((p) => p.email === norm);
    if (hit) {
      console.log(`  ✓ ${norm} in index, createdAt score = ${fmt(hit.score)}`);
    } else {
      console.log(`  ✗ ${norm} NOT in members:all index`);
    }
  }
  console.log(`  (total members in index: ${pairs.length})`);

  // === Find founder #92 and founder #93 specifically by scanning all members
  await section("Founder slots #92 and #93 — who holds them?");
  const memberEmails = pairs.map((p) => p.email);
  const memberKeys = memberEmails.map((e) => `member:${e}`);
  // chunk MGET so we don't blow Redis arg limit on very large lists
  const chunkSize = 50;
  const records = [];
  for (let i = 0; i < memberKeys.length; i += chunkSize) {
    const slice = memberKeys.slice(i, i + chunkSize);
    const raws = await redis.mget(...slice);
    for (let j = 0; j < slice.length; j++) {
      const raw = raws[j];
      if (!raw) continue;
      const r = typeof raw === "string" ? JSON.parse(raw) : raw;
      records.push(r);
    }
  }
  console.log(`  (scanned ${records.length} member records)`);
  for (const slot of [92, 93]) {
    const hits = records.filter((r) => r.founderSlot === slot);
    if (hits.length === 0) {
      console.log(`  Founder #${slot}: (not found in any record)`);
    } else {
      for (const r of hits) {
        console.log(
          `  Founder #${slot}: ${r.email}  tier=${r.tier}  status=${r.status}  amount=${dollars(r.amountCents)}/${r.interval}  createdAt=${fmt(r.createdAt)}`
        );
        console.log(
          `             customer=${r.stripeCustomerId}  sub=${r.stripeSubscriptionId}`
        );
      }
    }
  }

  // === Stripe: lookup customers + subs + charges per email
  for (const email of EMAILS) {
    await section(`Stripe: customers/subscriptions/charges for ${email}`);
    const norm = email.toLowerCase().trim();
    const customers = await stripe.customers.list({ email: norm, limit: 10 });
    if (customers.data.length === 0) {
      console.log(`  (no Stripe customer found)`);
      continue;
    }
    for (const cust of customers.data) {
      console.log(`\n  Customer ${cust.id}`);
      console.log(`    name:           ${cust.name ?? "(none)"}`);
      console.log(`    email:          ${cust.email}`);
      console.log(`    created:        ${fmt(cust.created * 1000)}`);
      console.log(`    delinquent:     ${cust.delinquent}`);

      const subs = await stripe.subscriptions.list({
        customer: cust.id,
        status: "all",
        limit: 10,
      });
      console.log(`    subscriptions:  ${subs.data.length}`);
      for (const s of subs.data) {
        const item = s.items.data[0];
        const amount = item?.price?.unit_amount ?? null;
        const interval = item?.price?.recurring?.interval ?? "(none)";
        console.log(`      - ${s.id}  status=${s.status}  ${dollars(amount)}/${interval}  cancel_at_period_end=${s.cancel_at_period_end}  created=${fmt(s.created * 1000)}`);
      }

      const charges = await stripe.charges.list({
        customer: cust.id,
        limit: 20,
      });
      console.log(`    charges:        ${charges.data.length}`);
      for (const c of charges.data) {
        console.log(
          `      - ${c.id}  ${dollars(c.amount)}  status=${c.status}  refunded=${c.refunded}  amount_refunded=${dollars(c.amount_refunded)}  paid=${c.paid}  created=${fmt(c.created * 1000)}`
        );
      }

      // Also list checkout sessions for this customer
      const sessions = await stripe.checkout.sessions.list({
        customer: cust.id,
        limit: 20,
      });
      console.log(`    checkout sessions: ${sessions.data.length}`);
      for (const cs of sessions.data) {
        console.log(
          `      - ${cs.id}  status=${cs.status}  payment_status=${cs.payment_status}  amount_total=${dollars(cs.amount_total)}  created=${fmt(cs.created * 1000)}  tier=${cs.metadata?.tier_at_checkout ?? "(none)"}`
        );
      }
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("Investigation complete. No writes performed.");
  console.log("=".repeat(72));
}

main().catch((err) => {
  console.error("Investigation failed:", err);
  process.exit(1);
});
