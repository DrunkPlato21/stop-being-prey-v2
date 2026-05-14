// Smoke-test the Kit (formerly ConvertKit) integration. Verifies the
// API key works, lists all tags so you can confirm KIT_MEMBERS_TAG_ID
// and KIT_BOOK_NOTIFY_TAG_ID match real tags, and optionally attaches
// a test email to one of them so you can confirm end-to-end without
// going through a real Stripe purchase.
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/test-kit.mjs
//
//   # End-to-end attempt: upsert email + attach to KIT_MEMBERS_TAG_ID
//   node --env-file=.env.local scripts/test-kit.mjs --apply test@example.com
//
// What it tells you:
//
//   1. Whether KIT_API_KEY is set in this environment.
//   2. Whether the API key works (calls /v4/account).
//   3. Lists all your Kit tags by id + name. Highlights the rows that
//      match your KIT_MEMBERS_TAG_ID and KIT_BOOK_NOTIFY_TAG_ID env vars
//      so you can spot a typo or wrong id in seconds.
//   4. With --apply, performs the full two-step "upsert + attach"
//      flow against the Members tag using the email you pass in.

const KIT_API_BASE = "https://api.kit.com/v4";

const apiKey = process.env.KIT_API_KEY;
const membersTagId = process.env.KIT_MEMBERS_TAG_ID;
const bookNotifyTagId = process.env.KIT_BOOK_NOTIFY_TAG_ID;

const args = process.argv.slice(2);
const applyIndex = args.indexOf("--apply");
const applyEmail = applyIndex >= 0 ? args[applyIndex + 1] : null;

function bold(s) {
  return `\x1b[1m${s}\x1b[0m`;
}
function olive(s) {
  return `\x1b[33m${s}\x1b[0m`;
}
function red(s) {
  return `\x1b[31m${s}\x1b[0m`;
}
function green(s) {
  return `\x1b[32m${s}\x1b[0m`;
}

async function callKit(path, init = {}) {
  const headers = {
    "X-Kit-Api-Key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(`${KIT_API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { ok: res.ok, status: res.status, raw: text, json: parsed };
}

async function main() {
  console.log(bold("Kit integration smoke test"));
  console.log("");

  // 1. Env vars
  console.log(bold("Environment:"));
  console.log(
    `  KIT_API_KEY              ${apiKey ? green("set") : red("MISSING")}`
  );
  console.log(
    `  KIT_MEMBERS_TAG_ID       ${
      membersTagId ? green(membersTagId) : red("MISSING")
    }`
  );
  console.log(
    `  KIT_BOOK_NOTIFY_TAG_ID   ${
      bookNotifyTagId ? green(bookNotifyTagId) : red("MISSING")
    }`
  );
  console.log("");

  if (!apiKey) {
    console.log(
      red(
        "Cannot continue without KIT_API_KEY. Set it in .env.local for this " +
          "test, and in Vercel Production for the live site."
      )
    );
    process.exit(1);
  }

  // 2. Verify key works
  console.log(bold("Verifying API key..."));
  const account = await callKit("/account");
  if (!account.ok) {
    console.log(
      red(
        `  /v4/account returned ${account.status}. Body: ${account.raw.slice(0, 300)}`
      )
    );
    console.log(
      red(
        "  Most likely: API key is wrong, or you copied an old/revoked one. " +
          "Get a fresh one from Kit dashboard → Account → Advanced → API Key."
      )
    );
    process.exit(1);
  }
  console.log(green(`  /v4/account OK (status ${account.status})`));
  console.log("");

  // 3. List tags
  console.log(bold("Tags on this account:"));
  const tags = await callKit("/tags");
  if (!tags.ok) {
    console.log(
      red(
        `  /v4/tags returned ${tags.status}. Body: ${tags.raw.slice(0, 300)}`
      )
    );
    process.exit(1);
  }
  const list = Array.isArray(tags.json?.tags) ? tags.json.tags : [];
  if (list.length === 0) {
    console.log(
      red(
        "  No tags found on this account. Create one in Kit (Subscribers → " +
          "Tags → New tag) and use its id below."
      )
    );
    process.exit(0);
  }
  for (const tag of list) {
    const id = String(tag.id);
    let badge = "";
    if (id === String(membersTagId)) {
      badge = " " + olive("← KIT_MEMBERS_TAG_ID");
    } else if (id === String(bookNotifyTagId)) {
      badge = " " + olive("← KIT_BOOK_NOTIFY_TAG_ID");
    }
    console.log(`  ${String(id).padEnd(10)} ${tag.name}${badge}`);
  }
  console.log("");

  // 4. Sanity-check that the env-var ids exist as real tags
  if (membersTagId && !list.some((t) => String(t.id) === String(membersTagId))) {
    console.log(
      red(
        `KIT_MEMBERS_TAG_ID=${membersTagId} does not match any tag id above. ` +
          "Check for typos or use one of the ids listed."
      )
    );
  }
  if (
    bookNotifyTagId &&
    !list.some((t) => String(t.id) === String(bookNotifyTagId))
  ) {
    console.log(
      red(
        `KIT_BOOK_NOTIFY_TAG_ID=${bookNotifyTagId} does not match any tag id above. ` +
          "Check for typos or use one of the ids listed."
      )
    );
  }

  // 5. Optional end-to-end: upsert + attach
  if (applyEmail) {
    console.log("");
    console.log(bold(`Apply test: tag "${applyEmail}" with KIT_MEMBERS_TAG_ID`));
    if (!membersTagId) {
      console.log(red("  KIT_MEMBERS_TAG_ID is not set; skipping apply."));
      return;
    }

    const upsert = await callKit("/subscribers", {
      method: "POST",
      body: JSON.stringify({ email_address: applyEmail }),
    });
    if (!upsert.ok) {
      console.log(
        red(
          `  upsert /v4/subscribers returned ${upsert.status}: ${upsert.raw.slice(0, 300)}`
        )
      );
      return;
    }
    console.log(green(`  upsert OK (status ${upsert.status})`));

    const attach = await callKit(
      `/tags/${membersTagId}/subscribers`,
      {
        method: "POST",
        body: JSON.stringify({ email_address: applyEmail }),
      }
    );
    if (!attach.ok) {
      console.log(
        red(
          `  attach /v4/tags/${membersTagId}/subscribers returned ${attach.status}: ${attach.raw.slice(0, 300)}`
        )
      );
      return;
    }
    console.log(green(`  attach OK (status ${attach.status})`));
    console.log("");
    console.log(
      green(
        `Tagged ${applyEmail} with KIT_MEMBERS_TAG_ID=${membersTagId}. Check ` +
          "the Kit dashboard to confirm."
      )
    );
  }
}

main().catch((err) => {
  console.error(red("Script threw:"), err);
  process.exit(1);
});
