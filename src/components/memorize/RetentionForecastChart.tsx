import type { RetentionForecastDay } from '../../lib/types/memory';

interface Props {
  days: RetentionForecastDay[];
  dailyNewLimit: number;
}

/** 30-day stacked bar forecast of scheduled due cards (reviews, learning, exam-gap). */
export default function RetentionForecastChart({ days, dailyNewLimit }: Props) {
  const totals = days.map((d) => d.dueReviewCount + d.learningCount + d.examGapCount);
  const max = Math.max(5, ...totals);
  const sum7 = totals.slice(0, 7).reduce((a, b) => a + b, 0);
  const sum30 = totals.reduce((a, b) => a + b, 0);
  const peak = Math.max(0, ...totals);
  const peakIdx = totals.indexOf(peak);
  const pct = (n: number) => `${(n / max) * 100}%`;

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-xs sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">30-day review forecast</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Already scheduled: <strong>{sum7}</strong> this week, <strong>{sum30}</strong> over 30 days
            {peak > 0 && (
              <>
                , busiest day {days[peakIdx]?.label} ({peak})
              </>
            )}
            . New cards (up to {dailyNewLimit} a day) come on top.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-sky-500" /> Review
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" /> Learning
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-rose-500" /> Exam gap
          </span>
        </div>
      </div>

      <div className="-mx-1 mt-5 overflow-x-auto overscroll-x-contain px-1 pb-1">
        <div style={{ minWidth: `${days.length * 16}px` }}>
          <div className="flex h-36 items-end gap-1 border-b border-slate-200 pb-1 dark:border-slate-800">
            {days.map((d, i) => {
              const total = totals[i];
              return (
                <div
                  key={d.dateIso}
                  title={`${d.label}: ${total} card${total === 1 ? '' : 's'} (${d.dueReviewCount} review, ${d.learningCount} learning, ${d.examGapCount} exam gap)`}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  {total > 0 && (
                    <div className="mb-0.5 text-center font-mono text-[9px] text-slate-400">{total}</div>
                  )}
                  {total > 0 ? (
                    <div className="flex w-full flex-col overflow-hidden rounded-t-md" style={{ height: pct(total) }}>
                      {d.examGapCount > 0 && <div className="bg-rose-500" style={{ flexGrow: d.examGapCount }} />}
                      {d.learningCount > 0 && <div className="bg-amber-500" style={{ flexGrow: d.learningCount }} />}
                      {d.dueReviewCount > 0 && <div className="bg-sky-500" style={{ flexGrow: d.dueReviewCount }} />}
                    </div>
                  ) : (
                    <div className="h-0.5 w-full rounded bg-slate-200 dark:bg-slate-800" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-1 text-center font-mono text-[9px] text-slate-400">
            {days.map((d, i) => (
              <div key={d.dateIso} className="min-w-0 flex-1 whitespace-nowrap">
                {i === 0 ? 'Now' : i % 5 === 0 ? `+${i}d` : ''}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
