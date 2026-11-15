import type { BreakdownNode } from '../../lib/types/analytics';

interface Props {
  nodes: BreakdownNode[];
}

export default function DomainRadarChart({ nodes }: Props) {
  const displayNodes = nodes.length >= 3 ? nodes : [
    ...nodes,
    ...Array.from({ length: Math.max(0, 5 - nodes.length) }, (_, i) => ({
      id: `1.${i + 2}`,
      name: `Subdomain 1.${i + 2}`,
      rawAccuracyPercent: 75,
      confidenceAdjustedPercent: 75,
    })),
  ];

  const count = displayNodes.length;
  const size = 300;
  const center = size / 2;
  const radius = 102;

  const getCoordinates = (index: number, pct: number) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const r = (Math.max(5, Math.min(100, pct)) / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const toPolygonPoints = (pctGetter: (n: (typeof displayNodes)[number]) => number) =>
    displayNodes
      .map((n, i) => {
        const pt = getCoordinates(i, pctGetter(n));
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      })
      .join(' ');

  const passPolygon = toPolygonPoints(() => 70);
  const masteryPolygon = toPolygonPoints(() => 85);
  const achievedPolygon = toPolygonPoints((n) => n.rawAccuracyPercent);
  const confidencePolygon = toPolygonPoints((n) => n.confidenceAdjustedPercent);

  return (
    <div className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-xs sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            2. Multi-Axis Sub-Domain Radar
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Balance across sub-domains vs. 70% Pass & Confidence-Adjusted Mastery
          </p>
        </div>
      </div>

      <div className="my-2 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-64 w-64 sm:h-72 sm:w-72"
          role="img"
          aria-label="Sub-domain performance radar chart"
        >
          {/* Background concentric rings */}
          {[25, 50, 70, 85, 100].map((ring) => (
            <circle
              key={ring}
              cx={center}
              cy={center}
              r={(ring / 100) * radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={ring === 70 ? 1.2 : 0.75}
              strokeDasharray={ring === 70 ? '3 3' : undefined}
              className={
                ring === 70
                  ? 'text-amber-500/60'
                  : 'text-slate-200 dark:text-slate-800'
              }
            />
          ))}

          {/* Axis spokes & labels */}
          {displayNodes.map((n, i) => {
            const outer = getCoordinates(i, 100);
            const labelPt = getCoordinates(i, 122);
            return (
              <g key={n.id}>
                <line
                  x1={center}
                  y1={center}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="currentColor"
                  strokeWidth="0.75"
                  className="text-slate-200 dark:text-slate-800"
                />
                <text
                  x={labelPt.x}
                  y={labelPt.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-600 font-mono text-[10px] font-bold dark:fill-slate-300"
                >
                  {n.id}
                </text>
              </g>
            );
          })}

          {/* 85% Mastery Polygon */}
          <polygon
            points={masteryPolygon}
            fill="none"
            stroke="#10b981"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity={0.45}
          />

          {/* 70% Pass Boundary Polygon */}
          <polygon
            points={passPolygon}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.25"
            strokeDasharray="4 3"
            opacity={0.75}
          />

          {/* Confidence-Adjusted Polygon */}
          <polygon
            points={confidencePolygon}
            fill="rgba(56, 189, 248, 0.12)"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />

          {/* Current Exam Accuracy Polygon */}
          <polygon
            points={achievedPolygon}
            fill="rgba(16, 185, 129, 0.25)"
            stroke="#10b981"
            strokeWidth="2.2"
          />

          {/* Vertex dots */}
          {displayNodes.map((n, i) => {
            const pt = getCoordinates(i, n.rawAccuracyPercent);
            return (
              <circle
                key={n.id}
                cx={pt.x}
                cy={pt.y}
                r="3.5"
                className="fill-emerald-500 stroke-white stroke-1 dark:stroke-slate-900"
              >
                <title>{`${n.id}: ${n.rawAccuracyPercent}%`}</title>
              </circle>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 border-t border-slate-200/60 pt-3 text-[11px] text-slate-500 dark:border-slate-800/70">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Raw Accuracy %
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Confidence-Adjusted %
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-amber-500" /> 70% Pass Ring
        </span>
      </div>
    </div>
  );
}
