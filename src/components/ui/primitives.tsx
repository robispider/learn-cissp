import { useEffect, useState } from 'react';
import { BookOpen, Timer } from 'lucide-react';
import { getUserPreferences, saveUserPreferences } from '../../lib/storage/db';
import type { ExamMode, MasteryTier, TopicMasteryRecord } from '../../lib/types/session';

/* ------------------------------------------------------------------------- */
/* Exam mode (study vs. simulation) – shared preference                       */
/* ------------------------------------------------------------------------- */

export function useExamMode(): [ExamMode, (m: ExamMode) => void] {
  const [mode, setMode] = useState<ExamMode>('study');
  useEffect(() => {
    setMode(getUserPreferences().defaultExamMode);
    const onPrefs = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.defaultExamMode) setMode(detail.defaultExamMode);
    };
    window.addEventListener('cissp:prefs-updated', onPrefs);
    return () => window.removeEventListener('cissp:prefs-updated', onPrefs);
  }, []);
  const update = (m: ExamMode) => {
    setMode(m);
    saveUserPreferences({ defaultExamMode: m });
  };
  return [mode, update];
}

export function ModeToggle({ className = '' }: { className?: string }) {
  const [mode, setMode] = useExamMode();
  const opts: Array<{ id: ExamMode; label: string; hint: string; Icon: typeof BookOpen }> = [
    { id: 'study', label: 'Study', hint: 'See explanations after each answer', Icon: BookOpen },
    { id: 'simulation', label: 'Exam', hint: 'No feedback until you submit', Icon: Timer },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Exam mode"
      className={`inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {opts.map(({ id, label, hint, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          title={hint}
          onClick={() => setMode(id)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:py-1.5 ${
            mode === id
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Mastery                                                                    */
/* ------------------------------------------------------------------------- */

export const TIER_META: Record<MasteryTier, { label: string; pill: string; bar: string }> = {
  mastered: {
    label: 'Mastered',
    pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-500',
  },
  proficient: {
    label: 'Proficient',
    pill: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
    bar: 'bg-sky-500',
  },
  developing: {
    label: 'Developing',
    pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-500',
  },
  critical_weakness: {
    label: 'Weak',
    pill: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
    bar: 'bg-rose-500',
  },
  untested: {
    label: 'Not started',
    pill: 'bg-slate-500/10 text-slate-500 dark:text-slate-400',
    bar: 'bg-slate-400',
  },
};

export function MasteryPill({ record }: { record?: TopicMasteryRecord }) {
  const tier = record?.masteryTier ?? 'untested';
  const meta = TIER_META[tier];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.pill}`}
    >
      {record ? `${Math.round(record.recentWeightedScore)}%` : meta.label}
    </span>
  );
}

export function MasteryBar({ record, className = '' }: { record?: TopicMasteryRecord; className?: string }) {
  const tier = record?.masteryTier ?? 'untested';
  const pct = record ? Math.round(record.recentWeightedScore) : 0;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800 ${className}`}>
      <div className={`h-full rounded-full ${TIER_META[tier].bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({
  percent,
  size = 88,
  stroke = 8,
  label,
}: {
  percent: number | null;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = percent ?? 0;
  const color =
    percent === null
      ? 'text-slate-300 dark:text-slate-700'
      : pct >= 85
        ? 'text-emerald-500'
        : pct >= 70
          ? 'text-sky-500'
          : pct >= 55
            ? 'text-amber-500'
            : 'text-rose-500';
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          className={`${color} transition-[stroke-dashoffset] duration-700`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-mono text-lg font-bold leading-none text-slate-900 dark:text-white">
          {percent === null ? '—' : `${Math.round(pct)}%`}
        </div>
        {label && <div className="mt-0.5 text-[10px] text-slate-500">{label}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Layout helpers                                                             */
/* ------------------------------------------------------------------------- */

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export const card =
  'rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800/80 dark:bg-slate-900/60';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm shadow-emerald-500/20 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-40';

export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white';
