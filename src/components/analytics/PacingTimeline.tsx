import type { DiagnosticReport } from '../../lib/types/analytics';

interface Props {
  pacing: DiagnosticReport['pacing'];
  onSelectQuestionId?: (questionId: string) => void;
}

export default function PacingTimeline({ pacing, onSelectQuestionId }: Props) {
  const items = pacing.perQuestionPacing;
  const maxTime = Math.max(
    120,
    ...items.map((i) => Math.max(i.timeSpentSeconds, i.estimatedTimeSeconds))
  );

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-xs sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            5. Per-Question Pacing Timeline
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Time spent per question vs. benchmark time • Rushed mistakes:{' '}
            <strong>{pacing.rushedErrorQuestionIds.length}</strong> • Time sinks:{' '}
            <strong>{pacing.timeSinkQuestionIds.length}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" /> Correct
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-xs bg-rose-500" /> Incorrect
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-3 bg-amber-400" /> Benchmark
          </span>
        </div>
      </div>

      {/* Bars + labels share one horizontal scroller: they fill the card on wide screens and
          scroll sideways (instead of widening the page) on phones or for long exams. */}
      <div className="-mx-1 mt-6 overflow-x-auto overscroll-x-contain px-1 pb-1">
        <div style={{ minWidth: `${items.length * 30}px` }}>
      {/* Vertical Bar Timeline */}
      <div className="flex h-44 items-end gap-1.5 sm:gap-2 border-b border-slate-200 pb-2 pt-4 dark:border-slate-800">
        {items.map((item) => {
          const barHeightPct = Math.max(
            6,
            Math.min(100, Math.round((item.timeSpentSeconds / maxTime) * 100))
          );
          const benchHeightPct = Math.min(
            100,
            Math.round((item.estimatedTimeSeconds / maxTime) * 100)
          );

          return (
            <button
              key={item.questionId}
              type="button"
              onClick={() => onSelectQuestionId?.(item.questionId)}
              title={`Q${item.questionNumber}: ${item.timeSpentSeconds}s spent (Benchmark: ${item.estimatedTimeSeconds}s) — ${
                item.isCorrect ? 'Correct' : 'Incorrect'
              }`}
              aria-label={`Question ${item.questionNumber}: ${item.timeSpentSeconds} seconds, ${item.isCorrect ? 'correct' : 'incorrect'}`}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              {/* Benchmark tick mark */}
              <div
                style={{ bottom: `${benchHeightPct}%` }}
                className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-amber-400/90"
              />
              {/* Actual time bar */}
              <div
                style={{ height: `${barHeightPct}%` }}
                className={`w-full max-w-[28px] rounded-t-md transition-all group-hover:opacity-85 ${
                  item.isCorrect ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* X-Axis Question Labels */}
      <div className="mt-2 flex gap-1.5 text-center font-mono text-[10px] text-slate-400 sm:gap-2">
        {items.map((item) => (
          <div key={item.questionId} className="min-w-0 flex-1">
            <div>Q{item.questionNumber}</div>
            <div className="text-[9px] text-slate-500">{item.timeSpentSeconds}s</div>
          </div>
        ))}
      </div>
        </div>
      </div>
    </div>
  );
}
