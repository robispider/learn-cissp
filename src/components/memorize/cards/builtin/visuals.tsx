/**
 * Built-in visual explainers, generated from the structured JSON payload of each archetype.
 * Every plain JSON card gets one of these for free — no React code needed per card.
 *
 * `animate=true`  → staged reveal for the Learn step (dual coding + segmenting).
 * `animate=false` → everything visible at once (answer view on the Feedback step).
 */
import { useMemo } from 'react';
import { ArrowDown, Scale, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { MemoryCard } from '../../../../lib/types/memory';
import { PlaybackBar, useStagger } from '../ui';
import { parseCloze } from './cloze';

const PALETTE = [
  { text: 'text-emerald-600 dark:text-emerald-400', soft: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-500', solid: 'bg-emerald-500' },
  { text: 'text-sky-600 dark:text-sky-400', soft: 'bg-sky-500/10', border: 'border-sky-500/30', dot: 'bg-sky-500', solid: 'bg-sky-500' },
  { text: 'text-violet-600 dark:text-violet-400', soft: 'bg-violet-500/10', border: 'border-violet-500/30', dot: 'bg-violet-500', solid: 'bg-violet-500' },
  { text: 'text-amber-600 dark:text-amber-400', soft: 'bg-amber-500/10', border: 'border-amber-500/30', dot: 'bg-amber-500', solid: 'bg-amber-500' },
  { text: 'text-rose-600 dark:text-rose-400', soft: 'bg-rose-500/10', border: 'border-rose-500/30', dot: 'bg-rose-500', solid: 'bg-rose-500' },
];
export const palette = (i: number) => PALETTE[i % PALETTE.length];

interface VisualProps {
  card: MemoryCard;
  animate: boolean;
}

/* ------------------------------------------------------------------ */
/* Sequence: animated vertical timeline                                */
/* ------------------------------------------------------------------ */
export function SequenceVisual({ card, animate }: VisualProps) {
  const steps = card.sequenceData?.steps ?? [];
  const ctl = useStagger(steps.length, 1500, animate);
  const progress = steps.length ? Math.min(1, ctl.shown / steps.length) : 1;

  return (
    <div className="space-y-3">
      {animate && <PlaybackBar ctl={ctl} total={steps.length} label={card.sequenceData?.directionLabel} />}
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
        <ArrowDown className="h-3.5 w-3.5" /> {card.sequenceData?.directionLabel}
      </div>
      <ol className="relative pl-1">
        {/* rail */}
        <span className="absolute bottom-4 left-[17px] top-4 w-0.5 rounded bg-slate-200 dark:bg-slate-800" aria-hidden />
        <span
          className="absolute left-[17px] top-4 w-0.5 origin-top rounded bg-gradient-to-b from-sky-500 to-emerald-500 transition-[height] duration-700"
          style={{ height: `calc(${progress * 100}% - 2rem)` }}
          aria-hidden
        />
        {steps.map((s, i) => {
          const visible = i < ctl.shown;
          const current = animate && i === ctl.shown - 1 && !ctl.done;
          return (
            <li key={s.order} className="relative flex gap-3 py-1.5">
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold transition-all duration-500 ${
                  visible
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                    : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                } ${current ? 'mem-glow scale-110' : ''}`}
              >
                {s.order}
              </span>
              <div
                className={`min-w-0 flex-1 rounded-2xl border px-3.5 py-2.5 transition-all duration-500 ${
                  visible
                    ? `${current ? 'border-sky-500/50 bg-sky-500/10' : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900'} mem-fade-up`
                    : 'border-dashed border-slate-200 bg-transparent opacity-40 dark:border-slate-800'
                }`}
              >
                <div className="text-sm font-bold text-slate-900 dark:text-white">{visible ? s.label : '· · ·'}</div>
                {visible && <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{s.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contrast: aligned "versus" rows (2 cols) or staggered columns (3-4) */
/* ------------------------------------------------------------------ */
export function ContrastVisual({ card, animate }: VisualProps) {
  const data = card.contrastData;
  const cols = data?.columns ?? [];
  const rows = Math.max(0, ...cols.map((c) => c.points.length));
  const ctl = useStagger(rows + 1, 1700, animate);
  if (!data) return null;

  const showRule = ctl.shown > rows || !animate;
  return (
    <div className="space-y-3">
      {animate && <PlaybackBar ctl={ctl} total={rows + 1} label="Compare row by row" />}

      {/* headers */}
      <div className={`grid gap-2 ${cols.length === 2 ? 'grid-cols-2' : cols.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
        {cols.map((c, ci) => {
          const p = palette(ci);
          return (
            <div key={c.label} className={`rounded-2xl border ${p.border} ${p.soft} p-3`}>
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className={`text-sm font-extrabold ${p.text}`}>{c.label}</span>
                {c.badge && (
                  <span className={`rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-bold dark:bg-slate-950/40 ${p.text}`}>
                    {c.badge}
                  </span>
                )}
              </div>
              {/* 3+ columns: points live inside each column card */}
              {cols.length > 2 && (
                <ul className="mt-2 space-y-1.5">
                  {c.points.map((pt, i) =>
                    i < ctl.shown ? (
                      <li key={i} className="mem-fade-up flex gap-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${p.dot}`} />
                        {pt}
                      </li>
                    ) : null
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* 2 columns: aligned versus rows so each difference is seen side by side */}
      {cols.length === 2 && (
        <div className="space-y-1.5">
          {Array.from({ length: rows }, (_, i) =>
            i < ctl.shown ? (
              <div key={i} className="mem-fade-up relative grid grid-cols-2 gap-2">
                {cols.map((c, ci) => {
                  const p = palette(ci);
                  return (
                    <div
                      key={ci}
                      className={`rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 ${
                        ci === 0 ? 'pr-4' : 'pl-4'
                      }`}
                    >
                      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${p.dot}`} />
                      {c.points[i] ?? <span className="text-slate-400">—</span>}
                    </div>
                  );
                })}
                <span className="absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900 text-[9px] font-black text-white dark:bg-white dark:text-slate-900">
                  vs
                </span>
              </div>
            ) : null
          )}
        </div>
      )}

      {showRule && (
        <div className="mem-pop flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-950 dark:text-emerald-100">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <span className="font-bold">Rule of thumb: </span>
            {data.ruleOfThumb}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matrix: row-by-row reveal; cards on phones, table on wider screens  */
/* ------------------------------------------------------------------ */
export function MatrixVisual({ card, animate, blanks }: VisualProps & { blanks?: Set<string> }) {
  const m = card.matrixData;
  const ctl = useStagger(m?.rows.length ?? 0, 1300, animate);
  if (!m) return null;
  const cell = (r: number, c: number, v: string) =>
    blanks?.has(`${r}:${c}`) ? <span className="text-slate-300 dark:text-slate-600">▢ ▢ ▢</span> : v;

  return (
    <div className="space-y-3">
      {animate && <PlaybackBar ctl={ctl} total={m.rows.length} label="Row by row" />}
      {/* phones */}
      <div className="space-y-2 sm:hidden">
        {m.rows.map((row, r) =>
          r < ctl.shown ? (
            <div key={r} className={`mem-fade-up rounded-2xl border ${palette(r).border} bg-white p-3 dark:bg-slate-900`}>
              <div className={`text-sm font-bold ${palette(r).text}`}>{cell(r, 0, row[0])}</div>
              <dl className="mt-1.5 space-y-1">
                {row.slice(1).map((v, c) => (
                  <div key={c} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 text-xs">
                    <dt className="font-semibold text-slate-400">{m.headers[c + 1]}</dt>
                    <dd className="text-slate-700 dark:text-slate-300">{cell(r, c + 1, v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null
        )}
      </div>
      {/* tablet / desktop */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200/80 sm:block dark:border-slate-800">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-100/80 dark:bg-slate-900">
              {m.headers.map((h) => (
                <th key={h} className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-white">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((row, r) => (
              <tr
                key={r}
                className={`border-t border-slate-200/60 transition-opacity duration-500 dark:border-slate-800/60 ${
                  r < ctl.shown ? 'opacity-100' : 'opacity-0'
                } ${animate && r === ctl.shown - 1 && !ctl.done ? 'bg-amber-500/10' : ''}`}
              >
                {row.map((v, c) => (
                  <td
                    key={c}
                    className={`px-3.5 py-2.5 align-top leading-relaxed ${
                      c === 0 ? `font-bold ${palette(r).text}` : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {cell(r, c, v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Formula: colour-coded tokens, variable legend lights up one by one  */
/* ------------------------------------------------------------------ */
export function FormulaVisual({ card, animate }: VisualProps) {
  const f = card.formulaData;
  const vars = f?.variables ?? [];
  const ctl = useStagger(vars.length + 2, 1500, animate);
  const colorOf = useMemo(() => {
    const map = new Map<string, number>();
    vars.forEach((v, i) => map.set(v.symbol, i));
    return map;
  }, [vars]);
  if (!f) return null;

  // Split the formula into symbol tokens and the glue between them (longest symbols first).
  const symbols = [...vars.map((v) => v.symbol)].sort((a, b) => b.length - a.length);
  const escaped = symbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = escaped.length ? new RegExp(`(${escaped.join('|')})`, 'g') : null;
  const parts = re ? f.formula.split(re) : [f.formula];
  const activeVar = animate && ctl.shown >= 1 && ctl.shown <= vars.length ? vars[ctl.shown - 1].symbol : null;

  return (
    <div className="space-y-3">
      {animate && <PlaybackBar ctl={ctl} total={vars.length + 2} label="Build the formula" />}
      <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-violet-500/5 px-3 py-5 text-center">
        <div className="whitespace-pre-wrap font-mono text-lg font-bold leading-loose text-slate-900 sm:text-2xl dark:text-white">
          {parts.map((p, i) => {
            const idx = colorOf.get(p);
            if (idx === undefined) return <span key={i} className="text-slate-400">{p}</span>;
            const lit = idx < ctl.shown;
            return (
              <span
                key={i}
                className={`mx-0.5 inline-block rounded-lg px-1.5 transition-all duration-500 ${
                  lit ? `${palette(idx).soft} ${palette(idx).text}` : 'text-slate-300 dark:text-slate-700'
                } ${activeVar === p ? 'mem-glow scale-110' : ''}`}
              >
                {p}
              </span>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {vars.map((v, i) =>
          i < ctl.shown ? (
            <div key={v.symbol} className={`mem-fade-up flex items-start gap-2.5 rounded-xl border ${palette(i).border} bg-white p-2.5 dark:bg-slate-900`}>
              <span className={`shrink-0 rounded-lg px-2 py-0.5 font-mono text-sm font-bold text-white ${palette(i).solid}`}>{v.symbol}</span>
              <span className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{v.meaning}</span>
            </div>
          ) : null
        )}
      </div>
      {ctl.shown > vars.length && (
        <div className="mem-fade-up rounded-2xl border border-slate-200/80 bg-white p-3.5 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <div className="mb-1 font-bold text-slate-900 dark:text-white">Worked example</div>
          {f.workedExample}
        </div>
      )}
      {ctl.shown > vars.length + 1 && (
        <div className="mem-pop rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs leading-relaxed text-emerald-950 dark:text-emerald-100">
          <div className="mb-1 font-bold">Decision rule</div>
          {f.decisionRule}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cloze: the full statement with each key fact popping in             */
/* ------------------------------------------------------------------ */
export function ClozeVisual({ card, animate }: VisualProps) {
  const segs = useMemo(() => parseCloze(card.clozeTemplate ?? ''), [card.clozeTemplate]);
  const blanks = segs.filter((s) => s.type === 'cloze').length;
  const ctl = useStagger(blanks, 1100, animate);
  let k = -1;
  return (
    <div className="space-y-3">
      {animate && blanks > 1 && <PlaybackBar ctl={ctl} total={blanks} label="Key facts" />}
      <p className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4 text-base leading-loose text-slate-800 dark:text-slate-100">
        {segs.map((s, i) => {
          if (s.type === 'text') return <span key={i}>{s.text}</span>;
          k++;
          const on = k < ctl.shown;
          return (
            <span
              key={i}
              className={`mx-0.5 inline-block rounded-lg px-2 font-semibold ${
                on ? 'mem-pop bg-emerald-500/20 text-emerald-800 dark:text-emerald-200' : 'bg-slate-200 text-transparent dark:bg-slate-800'
              }`}
            >
              {s.answer}
            </span>
          );
        })}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Manager heuristic: reflex gets stamped TRAP, manager path lights up */
/* ------------------------------------------------------------------ */
export function HeuristicVisual({ card, animate }: VisualProps) {
  const h = card.heuristicData;
  const ctl = useStagger(4, 1500, animate);
  if (!h) return null;
  return (
    <div className="space-y-3">
      {animate && <PlaybackBar ctl={ctl} total={4} label="Reflex vs. manager" />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ctl.shown >= 1 && (
          <div className="mem-fade-up relative overflow-hidden rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              <ShieldAlert className="h-4 w-4" /> Technician reflex
            </div>
            <p className={`mt-2 text-sm leading-relaxed text-slate-700 transition dark:text-slate-300 ${ctl.shown >= 2 ? 'line-through decoration-rose-500/60 opacity-60' : ''}`}>
              {h.technicalReflexTrap}
            </p>
            {ctl.shown >= 2 && (
              <span className="mem-stamp absolute right-3 top-3 rounded-md border-2 border-rose-500 px-2 py-0.5 text-xs font-black tracking-widest text-rose-500">
                TRAP
              </span>
            )}
          </div>
        )}
        {ctl.shown >= 3 && (
          <div className="mem-fade-up rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 shadow-lg shadow-emerald-500/10">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" /> Manager action
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{h.managerAction}</p>
          </div>
        )}
      </div>
      {ctl.shown >= 4 && (
        <div className="mem-pop rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-3 text-sm text-sky-950 dark:text-sky-100">
          <span className="font-bold">Principle: </span>
          {h.governingPrinciple}
        </div>
      )}
    </div>
  );
}

/** Text-only card: the answer summary, nothing else. */
export function TextVisual({ card }: { card: MemoryCard }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-sm leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
      {card.answerSummary}
    </div>
  );
}

/** Picks the built-in visual for a card's archetype. */
export function BuiltinVisual({ card, animate }: VisualProps) {
  switch (card.cardType) {
    case 'sequence_order':
      return card.sequenceData ? <SequenceVisual card={card} animate={animate} /> : <TextVisual card={card} />;
    case 'concept_contrast':
      return card.contrastData ? <ContrastVisual card={card} animate={animate} /> : <TextVisual card={card} />;
    case 'reference_fact':
      return card.matrixData ? <MatrixVisual card={card} animate={animate} /> : <TextVisual card={card} />;
    case 'formula_drill':
      return card.formulaData ? <FormulaVisual card={card} animate={animate} /> : <TextVisual card={card} />;
    case 'cloze_deletion':
      return card.clozeTemplate ? <ClozeVisual card={card} animate={animate} /> : <TextVisual card={card} />;
    case 'manager_heuristic':
      return card.heuristicData ? <HeuristicVisual card={card} animate={animate} /> : <TextVisual card={card} />;
    default:
      return <TextVisual card={card} />;
  }
}
