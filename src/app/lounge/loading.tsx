// Instant skeleton for the Lounge. The page is force-dynamic and does a
// chain of Redis reads server-side before it can paint; this lets Next
// stream the chrome + a placeholder immediately so clicking in feels
// snappy instead of staring at a blank screen (and it masks a cold
// serverless start too). Purely decorative — aria-hidden, no data.

export default function LoungeLoading() {
  return (
    <div
      className="max-w-2xl mx-auto px-4 sm:px-6 py-8"
      aria-hidden="true"
    >
      <div className="animate-pulse">
        {/* Title */}
        <div className="h-7 w-40 bg-surface border border-rule mb-6" />

        {/* Composer */}
        <div className="border border-rule bg-paper p-4 mb-8">
          <div className="h-16 bg-surface mb-3" />
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 bg-surface" />
            <div className="h-8 w-20 bg-surface" />
          </div>
        </div>

        {/* A few post placeholders */}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border border-rule bg-paper p-4 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-surface" />
              <div className="h-3 w-28 bg-surface" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-surface" />
              <div className="h-3 w-11/12 bg-surface" />
              <div className="h-3 w-2/3 bg-surface" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading the lounge…</span>
    </div>
  );
}
