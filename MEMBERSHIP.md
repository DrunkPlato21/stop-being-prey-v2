# Membership infrastructure

v1 of the paid recurring membership for Stop Being Prey. Lives on the
`feature/membership` branch. Do not merge to `main` until the live test
walkthrough below passes end to end.

## Surfaces

- `/membership`: landing + pricing toggle (monthly $10 / yearly $99)
- `/membership/success`: post-Checkout welcome, dispatches the first
  magic link automatically
- `/membership/account`: server-side redirect into the Stripe Customer
  Portal (cancel / update card / billing history)
- `/notes/sign-in`: magic-link request form (public)
- `/notes`: Field Notes feed (members only)
- `/notes/[slug]`: individual Field Note (members only)
- `/api/auth/request-link`: POST, mints + emails a single-use link
- `/api/auth/callback`: GET, consumes link, sets session cookie
- `/api/auth/logout`: POST, clears the cookie
- `/api/membership/checkout`: POST, returns Stripe Checkout URL
- `/api/membership/portal`: POST, returns Customer Portal URL

The gate lives in `src/middleware.ts`. It catches `/notes` and every
nested path, lets `/notes/sign-in` through, and verifies the
`sbp_session` JWT cookie. Bad / missing / expired sessions get 302'd to
`/notes/sign-in?next=<original-path>`.

## Auth model

- Magic link tokens are random UUIDs stored in Upstash Redis under
  `magic:<id>` with a 15 minute TTL. Single use: the callback deletes
  on read.
- Sessions are 30 day JWTs (HS256, signed by `AUTH_SECRET`) carried in
  an httpOnly + sameSite=lax cookie. No DB lookup on every request,
  the gate just verifies the signature.
- Subscription status is checked against Stripe at link-issuance time
  only. A canceled member keeps access until their session cookie
  expires (up to 30 days). Acceptable for v1; rotate `AUTH_SECRET` if
  you ever need to invalidate every session at once.

## Required env vars

Add these to `.env.local` (gitignored). The site renders without them
but membership flows fall through to error states.

```
# Auth
AUTH_SECRET=                       # openssl rand -base64 32

# Stripe (test mode for now)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_MEMBERSHIP_MONTHLY_PRICE_ID=price_...
STRIPE_MEMBERSHIP_YEARLY_PRICE_ID=price_...

# Email
RESEND_API_KEY=re_...

# Already configured (existing)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_BASE_URL=http://localhost:3000   # in dev
```

## Stripe setup (test mode)

1. Switch the Stripe dashboard to **Test mode**.
2. Create a Product called **Stop Being Prey Membership**.
3. Add two recurring Prices on that Product:
   - $10.00 / month, USD
   - $99.00 / year, USD
4. Copy each Price ID (starts with `price_`) into `.env.local` under
   the matching `STRIPE_MEMBERSHIP_*_PRICE_ID` key.
5. Confirm Stripe Customer Portal is enabled (Settings -> Billing ->
   Customer portal -> turn on, allow cancellation, allow card updates,
   show invoice history). The `/membership/account` redirect needs it.

## Resend setup

1. Make sure your `readsowell.com` domain is verified in Resend.
2. Generate an API key, drop into `.env.local` as `RESEND_API_KEY`.
3. The sender address is hardcoded to `clay@readsowell.com` in
   `src/lib/email.ts`. Adjust there if you'd rather send from a
   different address on the verified domain.

## Local test walkthrough

After all env vars are set:

1. `npm run dev`
2. Open `http://localhost:3000/membership`. Confirm the landing page
   renders (mobile + desktop).
3. Click **Become a member**. You should be redirected to the Stripe
   hosted Checkout page.
4. Pay with a test card: `4242 4242 4242 4242`, any future expiry, any
   CVC, any postal code. Use a real email you can read.
5. Stripe redirects to `/membership/success?session_id=...`. Confirm
   the page renders, says "a sign-in link is on its way to <email>",
   and that the email actually arrives.
6. Click the magic link. You should land at `/notes` with a session
   cookie set. Verify the Field Notes feed renders and the sample
   Field Note **Three moves in one sentence** is listed.
7. Click into the Field Note. Verify the screenshot, live-post link,
   annotation body, and doctrine tags all render.
8. Click **manage membership**. You should land in the Stripe Customer
   Portal for that customer. Cancel the subscription (use the portal
   action), then come back to `/notes`. You'll still have access until
   the JWT expires (intended).
9. Click **sign out**. Cookie clears, redirected to `/notes/sign-in`.
10. Try to access `/notes` directly with no cookie. Confirm the
    middleware redirects you to `/notes/sign-in?next=/notes`.
11. Request a sign-in link from `/notes/sign-in` using the canceled
    email. Because the subscription is no longer active, no email is
    sent (the API silently returns 200 to avoid leaking enumeration).

## What is NOT in v1

- No Stripe webhook handler. Subscription state is read directly from
  the API at link issuance. Add a webhook later if you want immediate
  cancel-revoke behavior or to drive an in-DB membership status mirror.
- No founding-member lockup rate. Plan to add a third Stripe Price and
  a separate signup path when ready.
- No glossary tooltips, no commenting, no voting, no category filter,
  no search, no Discord link. All deferred per the v1 brief.

## File map

```
src/
  middleware.ts                              # /notes gate
  lib/
    auth.ts                                  # JWT + magic link helpers
    email.ts                                 # Resend wrapper + template
    membership.ts                            # Stripe helpers
    field-notes.ts                           # markdown pipeline
  components/
    MembershipPlans.tsx                      # client toggle + checkout
    SignInForm.tsx                           # magic link request form
  app/
    membership/
      page.tsx                               # landing
      success/page.tsx                       # post-Checkout
      account/page.tsx                       # portal redirect
    notes/
      page.tsx                               # gated feed
      [slug]/page.tsx                        # gated note
      sign-in/page.tsx                       # public form
    api/
      auth/
        request-link/route.ts
        callback/route.ts
        logout/route.ts
      membership/
        checkout/route.ts
        portal/route.ts
content/
  field-notes/
    001-three-moves-in-one-sentence.md       # sample
public/
  images/
    field-notes/
      001.svg                                # placeholder screenshot
```
