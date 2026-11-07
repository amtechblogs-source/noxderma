export default function GlobalRouteLoading() {
  return (
    <div className="w-full space-y-5 animate-pulse py-1">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-4 w-28 rounded-md bg-slate-200/80 dark:bg-slate-800/80" />
          <div className="h-7 w-60 rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-xl bg-slate-200/80 dark:bg-slate-800/80" />
          <div className="h-9 w-32 rounded-xl bg-teal-500/20 dark:bg-teal-500/15" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900 p-4 space-y-2.5"
          >
            <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-6 w-28 rounded bg-slate-200/90 dark:bg-slate-800/90" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900 p-4 sm:p-6 space-y-3.5">
        <div className="h-5 w-44 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
      </div>
    </div>
  );
}

