/** Shown instantly while a page's server data loads. */
export default function Loading() {
    return (
      <div role="status" aria-label="Loading" className="animate-pulse">
        <div className="border-b border-rule px-6 py-5 lg:px-10">
          <div className="h-5 w-40 rounded bg-ink/10" />
          <div className="mt-2 h-3.5 w-72 max-w-full rounded bg-ink/5" />
        </div>
        <div className="max-w-3xl space-y-3 px-6 py-6 lg:px-10">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg border border-rule bg-ink/[0.03]" />
          ))}
        </div>
      </div>
    );
  }