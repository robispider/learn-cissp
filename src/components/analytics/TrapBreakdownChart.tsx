import { COGNITIVE_LABELS, PERSPECTIVE_LABELS, type CisspPerspective } from '../../lib/types/question';
import type { DiagnosticReport } from '../../lib/types/analytics';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';

interface Props {
  report: DiagnosticReport;
}

export default function TrapBreakdownChart({ report }: Props) {
  const { trapTallies, cognitiveBreakdown, perspectiveBreakdown } = report;
  const topTrap = trapTallies[0];

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/70">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          3. Distractor Trap & Cognitive Level Diagnostics
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Why mistakes happened (mindset traps triggered) & accuracy by Bloom&apos;s taxonomy
        </p>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {/* Left: Distractor Traps Triggered */}
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Mindset Traps Triggered
          </div>

          {trapTallies.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
              <div>
                <div className="font-bold">Zero Distractor Traps Triggered!</div>
                <div className="mt-0.5 opacity-90">
                  You avoided every technical-over-process and sibling-term distractor in this
                  session.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {trapTallies.map((t) => (
                  <div key={t.trapType} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {t.label}
                      </span>
                      <span className="font-mono text-xs font-bold text-rose-500">
                        {t.count}x ({t.shareOfErrorsPercent}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        style={{ width: `${Math.max(12, t.shareOfErrorsPercent)}%` }}
                        className="h-full rounded-full bg-rose-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {topTrap && (
                <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                    <span>#1 Mindset Habit to Adjust: {topTrap.label}</span>
                  </div>
                  <p className="mt-1 leading-relaxed opacity-90">
                    {topTrap.remediationAdvice}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Bloom's Cognitive Levels & CISSP Perspectives */}
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Bloom&apos;s Cognitive Level Accuracy
            </div>
            <div className="mt-2.5 space-y-2">
              {cognitiveBreakdown.map((c) => (
                <div key={c.cognitiveLevel} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 font-medium text-slate-600 dark:text-slate-300">
                    {COGNITIVE_LABELS[c.cognitiveLevel]}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      style={{ width: `${c.accuracyPercent}%` }}
                      className={`h-full rounded-full ${
                        c.accuracyPercent >= 70 ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                    />
                  </div>
                  <span className="w-16 text-right font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                    {c.correct}/{c.total} ({Math.round(c.accuracyPercent)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200/60 pt-3 dark:border-slate-800/70">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              CISSP Role Perspective Accuracy
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {perspectiveBreakdown.map((p) => (
                <div
                  key={p.perspective}
                  className="flex items-center justify-between rounded-xl bg-slate-100/80 px-3 py-2 text-xs dark:bg-slate-800/60"
                >
                  <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                    {PERSPECTIVE_LABELS[p.perspective as CisspPerspective] ?? p.perspective}
                  </span>
                  <span className="ml-2 font-mono font-bold text-slate-900 dark:text-white">
                    {Math.round(p.accuracyPercent)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
