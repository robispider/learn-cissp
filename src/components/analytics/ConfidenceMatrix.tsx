import type { DiagnosticReport } from '../../lib/types/analytics';
import { CheckCircle2, HelpCircle, AlertTriangle, ShieldAlert } from 'lucide-react';

interface Props {
  metacognition: DiagnosticReport['metacognition'];
  activeFilter: string;
  onSelectQuadrant: (filterKey: 'all' | 'solid' | 'lucky' | 'known_gap' | 'blind_spot') => void;
}

export default function ConfidenceMatrix({
  metacognition,
  activeFilter,
  onSelectQuadrant,
}: Props) {
  const quadrants = [
    {
      key: 'solid' as const,
      title: 'Solid Mastery',
      subtitle: 'Correct + High/Med Confidence',
      count: metacognition.solidMasteryQuestionIds.length,
      icon: CheckCircle2,
      color:
        'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      badge: 'bg-emerald-500 text-slate-950',
      desc: 'Verified strength you can rely on during exam day.',
    },
    {
      key: 'lucky' as const,
      title: 'Fragile / Lucky Guess',
      subtitle: 'Correct + Low Confidence',
      count: metacognition.luckyGuessQuestionIds.length,
      icon: HelpCircle,
      color: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
      badge: 'bg-amber-500 text-slate-950',
      desc: 'Got the point by elimination—review rationale to lock it in.',
    },
    {
      key: 'blind_spot' as const,
      title: 'Dangerous Blind Spots',
      subtitle: 'Incorrect + High Confidence',
      count: metacognition.blindSpotQuestionIds.length,
      icon: ShieldAlert,
      color: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
      badge: 'bg-rose-500 text-white',
      desc: 'High confidence in a flawed mental model—top priority to unlearn!',
    },
    {
      key: 'known_gap' as const,
      title: 'Known Knowledge Gaps',
      subtitle: 'Incorrect + Low/Med Confidence',
      count: metacognition.knownGapQuestionIds.length,
      icon: AlertTriangle,
      color: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      badge: 'bg-sky-500 text-slate-950',
      desc: 'Expected study areas where you knew you were unsure.',
    },
  ];

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            4. Metacognitive Quadrant (Confidence × Accuracy)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any quadrant to filter the Question Review list below
          </p>
        </div>
        {activeFilter !== 'all' && (
          <button
            type="button"
            onClick={() => onSelectQuadrant('all')}
            className="text-xs font-semibold text-emerald-500 hover:underline"
          >
            Reset Filter
          </button>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {quadrants.map((q) => {
          const Icon = q.icon;
          const isSelected = activeFilter === q.key;
          return (
            <button
              key={q.key}
              type="button"
              onClick={() =>
                onSelectQuadrant(isSelected ? 'all' : q.key)
              }
              className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${
                q.color
              } ${isSelected ? 'ring-2 ring-emerald-500' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <div>
                    <div className="text-sm font-bold">{q.title}</div>
                    <div className="text-[11px] opacity-75">{q.subtitle}</div>
                  </div>
                </div>
                <span
                  className={`rounded-xl px-2.5 py-1 font-mono text-sm font-bold ${q.badge}`}
                >
                  {q.count}
                </span>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed opacity-85">{q.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
