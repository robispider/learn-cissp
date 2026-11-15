import type { BreakdownNode } from '../../lib/types/analytics';

interface Props {
  nodes: BreakdownNode[];
  onSelectSubdomain?: (subdomainId: string) => void;
}

export default function SubdomainGapChart({ nodes, onSelectSubdomain }: Props) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-xs sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            1. Sub-Domain Target Gap Bullet Chart
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Achieved accuracy vs. exact gap to 70% CISSP Pass & 85% Mastery benchmarks
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" /> Achieved %
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-rose-500/35 border border-rose-500/60" />{' '}
            Gap to 85%
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-3.5">
        {nodes.map((node) => {
          const achieved = Math.min(100, Math.max(0, node.rawAccuracyPercent));
          const gapEnd = Math.max(achieved, 85);
          const gapWidth = Math.max(0, gapEnd - achieved);

          const barColor =
            achieved >= 85
              ? 'bg-emerald-500'
              : achieved >= 70
                ? 'bg-sky-500'
                : achieved >= 55
                  ? 'bg-amber-500'
                  : 'bg-rose-500';

          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelectSubdomain?.(node.id)}
              className="group block w-full text-left"
            >
              <div className="flex items-start justify-between gap-3 text-xs">
                <span className="min-w-0 font-medium text-slate-800 group-hover:text-emerald-500 dark:text-slate-200">
                  <strong className="font-mono">{node.id}</strong> • {node.name}
                </span>
                <div className="flex shrink-0 items-center gap-2 whitespace-nowrap font-mono text-xs">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {achieved}%
                  </span>
                  {node.gapToPassPercent > 0 ? (
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-500">
                      -{node.gapToPassPercent}% to Pass
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
                      PassCleared
                    </span>
                  )}
                </div>
              </div>

              {/* Bullet Bar Track with 70% and 85% Reference Markers */}
              <div className="relative mt-1.5 h-3.5 w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/90">
                {/* Achieved solid bar */}
                <div
                  style={{ width: `${achieved}%` }}
                  className={`absolute inset-y-0 left-0 rounded-l-lg transition-all duration-500 ${barColor}`}
                />
                {/* Rose Gap-to-Target segment */}
                {gapWidth > 0 && (
                  <div
                    style={{ left: `${achieved}%`, width: `${gapWidth}%` }}
                    className="absolute inset-y-0 border-y border-r border-dashed border-rose-500/50 bg-rose-500/15"
                    title={`Gap to 85% mastery: ${gapWidth}%`}
                  />
                )}
                {/* 70% Pass Reference Line */}
                <div
                  style={{ left: '70%' }}
                  className="absolute inset-y-0 w-0.5 bg-amber-500/90"
                  title="70% Passing Threshold"
                />
                {/* 85% Mastery Reference Line */}
                <div
                  style={{ left: '85%' }}
                  className="absolute inset-y-0 w-0.5 bg-emerald-400/90"
                  title="85% Mastery Target"
                />
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-200/60 pt-3 text-[11px] text-slate-400 dark:border-slate-800/70">
        <span>Amber Line = 70% Pass Benchmark</span>
        <span>Emerald Line = 85% Mastery Target</span>
      </div>
    </div>
  );
}
