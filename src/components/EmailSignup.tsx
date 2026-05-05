// Temporary: routing through the ReadSowell-branded Kit form (91813c2713)
// while the SBP form (6d65bbd568) is investigated by Kit support — it's
// silently operating in double-opt-in mode despite the UI showing single
// opt-in. Both forms land subscribers in the same list and trigger the same
// welcome automation, so this is a same-destination workaround. Swap back
// once SBP form is fixed.
const KIT_FORM_ACTION = "https://app.kit.com/forms/91813c2713/subscriptions";

export function EmailSignup() {
  return (
    <form
      action={KIT_FORM_ACTION}
      method="post"
      className="flex flex-col sm:flex-row gap-0 w-full max-w-xl border border-ink"
    >
      <input
        type="email"
        name="email_address"
        required
        placeholder="your email address"
        className="flex-1 bg-paper px-4 py-4 text-ink placeholder:text-ink-faint focus:outline-none focus:bg-surface transition-colors font-serif text-base"
      />
      <button
        type="submit"
        className="bg-ink text-paper hover:bg-eye-deep px-6 py-4 font-display transition-colors whitespace-nowrap text-sm uppercase tracking-widest"
        style={{ fontWeight: 600 }}
      >
        Subscribe
      </button>
    </form>
  );
}
