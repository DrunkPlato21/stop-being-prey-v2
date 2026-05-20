import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import type { Metadata } from "next";
import { SESSION_COOKIE } from "@/lib/auth";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { EditDisplayNameForm } from "@/components/EditDisplayNameForm";
import { NotifyOnReplyToggle } from "@/components/NotifyOnReplyToggle";
import { FounderMedallion } from "@/components/FounderMedallion";
import { CharterMedallion } from "@/components/CharterMedallion";
import { AuthorPlate } from "@/components/AuthorPlate";
import {
  getProfile,
  isAdmin,
  isCommentsConfigured,
  notifyOnReply,
  selfEditCooldownInfo,
} from "@/lib/comments";
import {
  getCharterSlot,
  getFounderSlot,
  getMember,
  getTierBadge,
} from "@/lib/members";
import { MemberBadge } from "@/components/MemberBadge";

export const metadata: Metadata = {
  title: "Account",
  description: "Your Stop Being Prey membership.",
};

export const dynamic = "force-dynamic";

function authSecret(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export default async function AccountPage() {
  const secret = authSecret();
  if (!secret) {
    redirect("/notes/sign-in?next=%2Fnotes%2Faccount");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    redirect("/notes/sign-in?next=%2Fnotes%2Faccount");
  }

  let email = "";
  let customerId = "";
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.email === "string") email = payload.email;
    if (typeof payload.customerId === "string") customerId = payload.customerId;
  } catch {
    redirect("/notes/sign-in?next=%2Fnotes%2Faccount");
  }

  if (!email) {
    redirect("/notes/sign-in?next=%2Fnotes%2Faccount");
  }

  // DEV_AUTO_GRANT mints synthetic customer IDs of the form `dev_<email>`.
  // Real Stripe customer IDs always start with `cus_`. Stripe's Customer
  // Portal will reject any other shape, so detect and show a placeholder
  // instead of letting the user click into a guaranteed error.
  const stripeReady = customerId.startsWith("cus_");

  const profile =
    isCommentsConfigured() ? await getProfile(email) : null;
  const member = await getMember(email);
  const viewerIsAdmin = isAdmin(email);
  const isFounder =
    !viewerIsAdmin &&
    member?.tier === "founder" &&
    typeof member.founderSlot === "number";
  const isCharter =
    !viewerIsAdmin &&
    member?.tier === "charter" &&
    typeof member.charterSlot === "number";
  const founderSlot = viewerIsAdmin ? null : getFounderSlot(member);
  const charterSlot = viewerIsAdmin ? null : getCharterSlot(member);
  const tierBadge = viewerIsAdmin ? null : getTierBadge(member);

  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Members area</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              fontWeight: 700,
              letterSpacing: "-0.022em",
            }}
          >
            Account.
          </h1>
        </div>
      </section>

      <section className="max-w-xl mx-auto px-6 py-14 md:py-20">
        {/* Tier plate — four states, mutually exclusive:
            - Admin (the author): AuthorPlate, no slot, no amount.
            - Founder: FounderMedallion with slot # + locked rate.
            - Charter: CharterMedallion with slot # + badge-locked copy.
            - Regular member or pre-webhook: no plate. */}
        {viewerIsAdmin ? (
          <div className="mb-14 md:mb-16">
            <AuthorPlate />
          </div>
        ) : isFounder && member?.founderSlot ? (
          <div className="mb-14 md:mb-16">
            <FounderMedallion
              slot={member.founderSlot}
              amountCents={member.amountCents}
              interval={member.interval}
            />
          </div>
        ) : isCharter && member?.charterSlot ? (
          <div className="mb-14 md:mb-16">
            <CharterMedallion
              slot={member.charterSlot}
              amountCents={member.amountCents}
              interval={member.interval}
            />
          </div>
        ) : null}

        {/* Your badge — shows the exact chip rendered everywhere
            else (comments, lounge, identity dropdown). Compound for
            founders/charters who also qualify for a tier badge. */}
        {(founderSlot !== null ||
          charterSlot !== null ||
          tierBadge !== null) && (
          <div className="mb-12 text-center">
            <p className="eyebrow mb-3">Your badge</p>
            {/* Inline-flex wrapper so Fragment-returned chips share
                the same gap as they would inside any other flex
                parent (the parent of this div is text-align: center,
                not flex). */}
            <div className="inline-flex items-baseline gap-2 flex-wrap">
              <MemberBadge
                founderSlot={founderSlot}
                charterSlot={charterSlot}
                tierBadge={tierBadge}
              />
            </div>
            <p
              className="font-serif italic text-ink-muted mt-3"
              style={{ fontSize: "0.86rem" }}
            >
              displayed beside your name in comments and the lounge.
            </p>
          </div>
        )}

        {/* Email */}
        <div className="mb-12">
          <p className="eyebrow mb-3">Signed in as</p>
          <p
            className="font-display text-ink leading-tight tracking-tight"
            style={{
              fontSize: "clamp(1.25rem, 2.5vw, 1.5rem)",
              fontWeight: 500,
              letterSpacing: "-0.01em",
              wordBreak: "break-all",
            }}
          >
            {email}
          </p>
        </div>

        {/* Display name */}
        {isCommentsConfigured() && (() => {
          const cooldown = selfEditCooldownInfo(profile);
          return (
            <div className="mb-12 pt-10 border-t border-rule">
              <EditDisplayNameForm
                initialDisplayName={profile?.displayName || null}
                onCooldown={cooldown.onCooldown}
                nextAllowedAt={cooldown.nextAllowedAt}
              />
            </div>
          );
        })()}

        {/* Email notifications */}
        {isCommentsConfigured() && (
          <div className="mb-12 pt-10 border-t border-rule">
            <NotifyOnReplyToggle initialValue={notifyOnReply(profile)} />
          </div>
        )}

        {/* Subscription block */}
        <div className="mb-12 pt-10 border-t border-rule">
          <p className="eyebrow mb-3">Subscription</p>
          {stripeReady ? (
            <>
              <p
                className="font-serif text-ink-muted leading-relaxed mb-6"
                style={{ fontSize: "1.02rem" }}
              >
                Update card, switch plans, view invoices, or cancel from
                the Stripe portal.
              </p>
              <ManageSubscriptionButton />
            </>
          ) : (
            <p
              className="font-serif italic text-ink-muted leading-relaxed"
              style={{ fontSize: "1.02rem" }}
            >
              Subscription management will be available once Stripe is
              wired in.
            </p>
          )}
        </div>

        {/* Sign out */}
        <div className="pt-10 border-t border-rule">
          <p className="eyebrow mb-3">Session</p>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="btn-secondary"
            >
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
