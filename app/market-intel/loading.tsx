/** Skeleton for cold entries into Market Intel: the page shape appears
 *  immediately while the feed streams in, instead of a frozen beat. */
export default function MarketIntelLoading() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="h-8 w-72 rounded-lg bg-surface" />
          <div className="mt-2 h-4 w-[480px] max-w-full rounded bg-surface" />
        </div>
        <div className="h-9 w-64 rounded-full bg-surface" />
      </div>
      <div className="mt-5 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 w-52 rounded-full bg-surface" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] rounded-xl bg-surface" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[260px] rounded-xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
