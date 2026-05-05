export function EmailSignup() {
  return (
    <form
      action="https://app.kit.com/forms/6d65bbd568/subscriptions"
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
