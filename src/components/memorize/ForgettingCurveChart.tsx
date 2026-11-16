import { useMemo } from 'react';
import {
  computePowerLawRetrievability,
  solveIntervalForTargetRetention,
} from '../../lib/memorization/fsrs-engine';

export interface CurveSeries {
  label: string;
  stability: number;
  emphasis?: boolean;
}

interface Props {
  series: CurveSeries[];
  requestRetention: number;
  weights?: readonly number[] | null;
  title?: string;
  subtitle?: string;
}

const W = 480;
const H = 230;
const PAD = { top: 16, right: 12, bottom: 28, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const SERIES_COLORS = [
  { stroke: 'stroke-slate-400 dark:stroke-slate-500', fill: 'fill-slate-400 dark:fill-slate-500', bg: 'bg-slate-400' },
  { stroke: 'stroke-sky-500', fill: 'fill-sky-500', bg: 'bg-sky-500' },
  { stroke: 'stroke-indigo-500', fill: 'fill-indigo-500', bg: 'bg-indigo-500' },
  { stroke: 'stroke-violet-500', fill: 'fill-violet-500', bg: 'bg-violet-500' },
  { stroke: 'stroke-fuchsia-500', fill: 'fill-fuchsia-500', bg: 'bg-fuchsia-500' },
];
const EMPHASIS = { stroke: 'stroke-emerald-500', fill: 'fill-emerald-500', bg: 'bg-emerald-500' };

/** R axis spans 50%..100% — below that the curves carry no useful signal. */
const R_MIN = 0.5;

function niceMax(days: number): number {
  const steps = [7, 14, 30, 60, 90, 120, 180, 270, 365, 540, 730];
  return steps.find((s) => s >= days) ?? 730;
}

function yFor(r: number): number {
  return PAD.top + (1 - (Math.max(R_MIN, r) - R_MIN) / (1 - R_MIN)) * PLOT_H;
}

/**
 * Plots R(t, S) = (1 + FACTOR·t/S)^DECAY for one or more stabilities, marks the
 * target-retention threshold, and pins the interval I where each curve crosses it.
 */
export default function ForgettingCurveChart({
  series,
  requestRetention,
  weights,
  title = 'Forgetting curve',
  subtitle,
}: Props) {
  const valid = useMemo(() => series.filter((s) => s.stability > 0), [series]);

  const { maxDays, paths, markers } = useMemo(() => {
    const intervals = valid.map((s) =>
      solveIntervalForTargetRetention(s.stability, requestRetention, weights)
    );
    const maxInterval = Math.max(3, ...intervals);
    const maxDays = niceMax(Math.min(730, maxInterval * 2));
    const x = (t: number) => PAD.left + (t / maxDays) * PLOT_W;

    const paths = valid.map((s) => {
      const pts: string[] = [];
      const samples = 90;
      for (let i = 0; i <= samples; i++) {
        const t = (i / samples) * maxDays;
        const r = computePowerLawRetrievability(t, s.stability, weights);
        pts.push(`${x(t).toFixed(1)},${yFor(r).toFixed(1)}`);
        if (r < R_MIN) break;
      }
      return pts.join(' ');
    });

    const markers = valid.map((_, i) => {
      const t = intervals[i];
      return t <= maxDays ? { cx: x(t), cy: yFor(requestRetention), days: t } : null;
    });

    return { maxDays, paths, markers };
  }, [valid, requestRetention, weights]);

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxDays));
  const yTicks = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
  const colorFor = (i: number) =>
    valid[i]?.emphasis ? EMPHASIS : SERIES_COLORS[i % SERIES_COLORS.length];

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-xs sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/70">
      <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {subtitle ??
          `Chance you still recall a card t days after reviewing it. Dots mark where it drops to your ${Math.round(
            requestRetention * 100
          )}% target, which is when it comes back for review.`}
      </p>

      {valid.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Review a few cards to see your curves.</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-4 h-auto w-full"
            role="img"
            aria-label={`Forgetting curves: ${valid.map((s) => s.label).join(', ')}`}
          >
            {yTicks.map((r) => (
              <g key={r}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={yFor(r)}
                  y2={yFor(r)}
                  className="stroke-slate-200 dark:stroke-slate-800"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 6}
                  y={yFor(r) + 3}
                  textAnchor="end"
                  className="fill-slate-400 font-mono text-[12px]"
                >
                  {Math.round(r * 100)}%
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text
                key={t}
                x={PAD.left + (t / maxDays) * PLOT_W}
                y={H - 8}
                textAnchor={t === maxDays ? 'end' : 'middle'}
                className="fill-slate-400 font-mono text-[12px]"
              >
                {t}d
              </text>
            ))}

            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yFor(requestRetention)}
              y2={yFor(requestRetention)}
              className="stroke-amber-500"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text
              x={W - PAD.right}
              y={yFor(requestRetention) - 5}
              textAnchor="end"
              className="fill-amber-600 text-[12px] font-semibold dark:fill-amber-400"
            >
              Target {Math.round(requestRetention * 100)}%
            </text>

            {paths.map((pts, i) => (
              <polyline
                key={valid[i].label}
                points={pts}
                fill="none"
                strokeWidth={valid[i].emphasis ? 3 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                className={colorFor(i).stroke}
              />
            ))}
            {markers.map((m, i) =>
              m ? (
                <circle key={valid[i].label} cx={m.cx} cy={m.cy} r={4} className={colorFor(i).fill}>
                  <title>
                    {valid[i].label}: next review in {m.days} day{m.days === 1 ? '' : 's'}
                  </title>
                </circle>
              ) : null
            )}
          </svg>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {valid.map((s, i) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span className={`h-0.5 w-4 rounded ${colorFor(i).bg}`} />
                {s.label}
                <span className="font-mono text-slate-400">
                  S={s.stability < 10 ? s.stability.toFixed(1) : Math.round(s.stability)}d
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
