import type { BreakdownNode } from '../../lib/types/analytics';

interface Props {
  nodes: BreakdownNode[];
  onFilterBySubdomain: (subdomainId: string) => void;
}

const TIER_BADGES: Record<
  BreakdownNode['masteryTier'],
  { label: string; className: string }
> = {
  mastered: {
    label: 'Mastered (Strength)',
    className:
      'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
  },
  proficient: {
    label: 'Proficient',
    className: 'bg-sky-500/15 text-sky-600 border-sky-500/30 dark:text-sky-400',
  },
  developing: {
    label: 'Developing (Borderline Gap)',
    className:
      'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400',
  },
  critical_weakness: {
    label: 'Critical Weakness (Priority Gap)',
    className: 'bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400',
  },
};

export default function StrengthWeaknessTable({
  nodes,
  onFilterBySubdomain,
}: Props) {
  const sorted = [...nodes].sort(
    (a, b) => b.priorityGapIndex - a.priorityGapIndex
  );

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/70">
      <div className="border-b border-slate-200/70 p-4 sm:p-6 dark:border-slate-800/70">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Granular Strength, Weakness & Priority Gap Table
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ranked by Priority Gap Index (PGI) combining mastery deficit, blind-spot penalty,
          and CBK weight
        </p>
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-slate-200/70 bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-800/70 dark:bg-slate-950/40 dark:text-slate-400">
            <tr>
              <th className="w-64 px-5 py-3.5">Sub-Domain</th>
              <th className="px-4 py-3.5">Diagnostic Tier</th>
              <th className="px-4 py-3.5 font-mono">Raw %</th>
              <th className="px-4 py-3.5 font-mono">Conf-Adj %</th>
              <th className="px-4 py-3.5 font-mono">Blind Spots</th>
              <th className="px-4 py-3.5 font-mono">Avg Pace</th>
              <th className="px-4 py-3.5 font-mono">PGI Score</th>
              <th className="px-5 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
            {sorted.map((node) => {
              const badge = TIER_BADGES[node.masteryTier];
              return (
                <tr
                  key={node.id}
                  className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      <span className="font-mono text-emerald-500">{node.id}</span> •{' '}
                      {node.name}
                    </div>
                    {node.studyDirectives[0] && (
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Directive: {node.studyDirectives[0]}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-mono font-bold text-slate-900 dark:text-white">
                    {node.rawAccuracyPercent}% ({node.correctCount}/{node.totalQuestions})
                  </td>
                  <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">
                    {node.confidenceAdjustedPercent}%
                  </td>
                  <td className="px-4 py-3.5 font-mono">
                    {node.blindSpotCount > 0 ? (
                      <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-bold text-rose-500">
                        {node.blindSpotCount}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-slate-500">
                    {node.avgTimeSpentSeconds}s / {node.avgEstimatedTimeSeconds}s
                  </td>
                  <td className="px-4 py-3.5 font-mono font-bold text-amber-500">
                    {node.priorityGapIndex}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => onFilterBySubdomain(node.id)}
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-emerald-500 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Review Qs
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
