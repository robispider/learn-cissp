import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Eye,
  Lightbulb,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { MemoryCard } from '../../lib/types/memory';
import { TRAP_TYPE_METADATA } from '../../lib/types/question';

interface ClozeSegment {
  type: 'text' | 'cloze';
  raw: string;
  index?: number;
  answer?: string;
  hint?: string;
}

export function parseClozeTemplate(template: string): ClozeSegment[] {
  const segments: ClozeSegment[] = [];
  const regex = /\{\{c(\d+)::([^:}]+?)(?:::([^}]+?))?\}\}/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIdx) {
      segments.push({
        type: 'text',
        raw: template.slice(lastIdx, match.index),
      });
    }
    segments.push({
      type: 'cloze',
      raw: match[0],
      index: Number(match[1]),
      answer: match[2].trim(),
      hint: match[3]?.trim(),
    });
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < template.length) {
    segments.push({
      type: 'text',
      raw: template.slice(lastIdx),
    });
  }

  return segments;
}

function deterministicShuffle<T>(items: T[], seedStr: string): T[] {
  const arr = [...items];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // Ensure shuffled order isn't identical to original when length >= 3
  if (
    arr.length >= 3 &&
    arr.every((item, idx) => item === items[idx])
  ) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  return arr;
}

const COLUMN_STYLES = [
  {
    border: 'border-emerald-500/25 bg-emerald-500/5',
    heading: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  {
    border: 'border-sky-500/25 bg-sky-500/5',
    heading: 'text-sky-600 dark:text-sky-400',
    badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  {
    border: 'border-indigo-500/25 bg-indigo-500/5',
    heading: 'text-indigo-600 dark:text-indigo-400',
    badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    dot: 'bg-indigo-500',
  },
  {
    border: 'border-amber-500/25 bg-amber-500/5',
    heading: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
];

interface Props {
  card: MemoryCard;
  revealed: boolean;
  showMnemonic: boolean;
  interactiveOrderMode?: boolean;
  onToggleMnemonic?: () => void;
}

export default function CardArchetypeRenderer({
  card,
  revealed,
  showMnemonic,
  interactiveOrderMode = true,
  onToggleMnemonic,
}: Props) {
  const [revealedClozes, setRevealedClozes] = useState<Record<number, boolean>>({});
  const [selectedOrder, setSelectedOrder] = useState<number[]>([]);

  useEffect(() => {
    setRevealedClozes({});
    setSelectedOrder([]);
  }, [card.id]);

  const shuffledSteps = useMemo(() => {
    if (!card.sequenceData) return [];
    return deterministicShuffle(card.sequenceData.steps, card.id);
  }, [card.id, card.sequenceData]);

  const clozeSegments = useMemo(() => {
    if (!card.clozeTemplate) return [];
    return parseClozeTemplate(card.clozeTemplate);
  }, [card.clozeTemplate]);

  const handleToggleStepOrder = (orderNum: number) => {
    if (revealed) return;
    setSelectedOrder((prev) =>
      prev.includes(orderNum)
        ? prev.filter((o) => o !== orderNum)
        : [...prev, orderNum]
    );
  };

  return (
    <div className="space-y-5">
      {/* ================================================================= */}
      {/* CARD TITLE & PROMPT (FRONT ANCHOR)                                */}
      {/* ================================================================= */}
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">
          {card.title}
        </h2>
        {card.cardType !== 'cloze_deletion' && (
          <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200 sm:text-base">
            {card.prompt}
          </p>
        )}
      </div>

      {/* ================================================================= */}
      {/* ARCHETYPE 1: CONCEPT CONTRAST                                     */}
      {/* ================================================================= */}
      {card.cardType === 'concept_contrast' && card.contrastData && (
        <>
          {!revealed ? (
            <div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Contrast Dimensions to Recall
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {card.contrastData.columns.map((col, idx) => {
                  const st = COLUMN_STYLES[idx % COLUMN_STYLES.length];
                  return (
                    <span
                      key={col.label}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${st.border} ${st.heading}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                      {col.label}
                      {col.badge && (
                        <span className="opacity-75">({col.badge})</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                <span className="font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Rule of Thumb:{' '}
                </span>
                {card.contrastData.ruleOfThumb}
              </div>

              <div
                className={`grid grid-cols-1 gap-3 ${
                  card.contrastData.columns.length === 3
                    ? 'md:grid-cols-3'
                    : 'sm:grid-cols-2'
                }`}
              >
                {card.contrastData.columns.map((col, idx) => {
                  const st = COLUMN_STYLES[idx % COLUMN_STYLES.length];
                  return (
                    <div
                      key={col.label}
                      className={`rounded-2xl border p-3.5 ${st.border}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-bold uppercase tracking-wider ${st.heading}`}
                        >
                          {col.label}
                        </span>
                        {col.badge && (
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${st.badge}`}
                          >
                            {col.badge}
                          </span>
                        )}
                      </div>
                      <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        {col.points.map((pt, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span
                              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`}
                            />
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* ARCHETYPE 2: SEQUENCE ORDER                                       */}
      {/* ================================================================= */}
      {card.cardType === 'sequence_order' && card.sequenceData && (
        <>
          {!revealed ? (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                  Direction: {card.sequenceData.directionLabel}
                </span>
                {interactiveOrderMode && selectedOrder.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedOrder([])}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset order ({selectedOrder.length}/
                    {shuffledSteps.length})
                  </button>
                )}
              </div>

              {interactiveOrderMode && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Tap the shuffled steps in sequence from 1 to {shuffledSteps.length}, or press{' '}
                  <kbd className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                    Space
                  </kbd>{' '}
                  to reveal immediately.
                </p>
              )}

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {shuffledSteps.map((step) => {
                  const pickIdx = selectedOrder.indexOf(step.order);
                  const isPicked = pickIdx !== -1;
                  return (
                    <button
                      key={step.order}
                      type="button"
                      onClick={() => handleToggleStepOrder(step.order)}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                        isPicked
                          ? 'border-emerald-500/60 bg-emerald-500/10 text-slate-900 dark:text-white'
                          : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      <span className="truncate font-semibold">{step.label}</span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                          isPicked
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                        }`}
                      >
                        {isPicked ? pickIdx + 1 : '?'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-sky-600 dark:text-sky-400">
                  Canonical Order: {card.sequenceData.directionLabel}
                </span>
                {selectedOrder.length > 0 && (
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Ordered{' '}
                    {
                      card.sequenceData.steps.filter(
                        (s, idx) => selectedOrder[idx] === s.order
                      ).length
                    }
                    /{card.sequenceData.steps.length} in exact position
                  </span>
                )}
              </div>

              <ol className="space-y-2">
                {card.sequenceData.steps.map((step, idx) => {
                  const userPickedStep = selectedOrder[idx];
                  const matched =
                    selectedOrder.length > 0 && userPickedStep === step.order;
                  const missed =
                    selectedOrder.length > 0 && userPickedStep !== step.order;

                  return (
                    <li
                      key={step.order}
                      className={`flex items-start gap-3 rounded-2xl border p-3 text-xs ${
                        matched
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : missed
                            ? 'border-amber-500/40 bg-amber-500/5'
                            : 'border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/50'
                      }`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500 font-mono text-xs font-bold text-slate-950">
                        {step.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {step.label}
                        </div>
                        <p className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300">
                          {step.detail}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* ARCHETYPE 3: FORMULA DRILL                                        */}
      {/* ================================================================= */}
      {card.cardType === 'formula_drill' && card.formulaData && (
        <>
          {!revealed ? (
            <div className="rounded-2xl border border-dashed border-indigo-500/30 bg-indigo-500/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Variables Involved
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {card.formulaData.variables.map((v) => (
                  <span
                    key={v.symbol}
                    className="rounded-lg bg-white px-2.5 py-1 font-mono text-xs font-bold text-slate-800 shadow-2xs dark:bg-slate-900 dark:text-slate-200"
                  >
                    {v.symbol}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Canonical CISSP Formula
                </div>
                <div className="mt-1.5 font-mono text-base font-bold text-slate-900 dark:text-white sm:text-lg">
                  {card.formulaData.formula}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {card.formulaData.variables.map((v) => (
                  <div
                    key={v.symbol}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {v.symbol}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {' '}
                      — {v.meaning}
                    </span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="font-bold text-slate-900 dark:text-white">
                    Worked Numeric Example
                  </div>
                  <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
                    {card.formulaData.workedExample}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs">
                  <div className="font-bold text-emerald-700 dark:text-emerald-400">
                    CISSP Decision Rule
                  </div>
                  <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">
                    {card.formulaData.decisionRule}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* ARCHETYPE 4: REFERENCE FACT MATRIX                                */}
      {/* ================================================================= */}
      {card.cardType === 'reference_fact' && card.matrixData && (
        <>
          {!revealed ? (
            <div className="rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Matrix Columns ({card.matrixData.rows.length} rows to recall)
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {card.matrixData.headers.map((h) => (
                  <span
                    key={h}
                    className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs dark:bg-slate-900 dark:text-slate-200"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/80 dark:border-slate-800 dark:bg-slate-900">
                    {card.matrixData.headers.map((h) => (
                      <th
                        key={h}
                        className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-white"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                  {card.matrixData.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="bg-white/60 hover:bg-slate-50/80 dark:bg-slate-950/30 dark:hover:bg-slate-900/50"
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={`px-3.5 py-2.5 leading-relaxed ${
                            cIdx === 0
                              ? 'font-semibold text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* ARCHETYPE 5: CLOZE DELETION                                       */}
      {/* ================================================================= */}
      {card.cardType === 'cloze_deletion' && card.clozeTemplate && (
        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4 sm:p-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
            {revealed
              ? 'Completed Active Recall Statement'
              : 'Tap a blank to peek or press Space to reveal all'}
          </div>
          <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-100 sm:text-base">
            {clozeSegments.map((seg, i) => {
              if (seg.type === 'text') {
                return <span key={i}>{seg.raw}</span>;
              }
              const isShown = revealed || Boolean(revealedClozes[i]);
              return isShown ? (
                <span
                  key={i}
                  className="mx-0.5 inline-flex items-center rounded-lg bg-emerald-500/20 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300 sm:text-sm"
                >
                  {seg.answer}
                </span>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setRevealedClozes((prev) => ({ ...prev, [i]: true }))
                  }
                  className="mx-0.5 inline-flex items-center gap-1 rounded-lg border border-violet-500/40 bg-white px-2.5 py-0.5 font-mono text-xs font-semibold text-violet-700 shadow-2xs transition hover:bg-violet-500/10 dark:bg-slate-900 dark:text-violet-300"
                >
                  <Eye className="h-3 w-3 opacity-70" />
                  <span>{seg.hint ? `[… ${seg.hint} …]` : '[ … ? … ]'}</span>
                </button>
              );
            })}
          </p>
        </div>
      )}

      {/* ================================================================= */}
      {/* ARCHETYPE 6: MANAGER HEURISTIC                                    */}
      {/* ================================================================= */}
      {card.cardType === 'manager_heuristic' && card.heuristicData && (
        <>
          {!revealed ? (
            <div className="rounded-2xl border border-dashed border-rose-500/30 bg-rose-500/5 p-4 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                Think Like a Manager Challenge:{' '}
              </span>
              Identify both the common hands-on technician reflex trap and the proper governance
              or risk-advisor action before revealing.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    <ShieldAlert className="h-4 w-4" />
                    Technician Reflex Trap (Wrong)
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {card.heuristicData.technicalReflexTrap}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                    CISSP Manager / Advisor Action (Right)
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {card.heuristicData.managerAction}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-900 dark:text-sky-200">
                <span className="font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  Governing CBK Principle:{' '}
                </span>
                {card.heuristicData.governingPrinciple}
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* MNEMONIC PEEK (AVAILABLE ON FRONT OR BACK)                        */}
      {/* ================================================================= */}
      {card.mnemonic && (showMnemonic || revealed) && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <span className="font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Memory Hook / Mnemonic:{' '}
            </span>
            <span>{card.mnemonic}</span>
          </div>
        </div>
      )}

      {!revealed && card.mnemonic && !showMnemonic && onToggleMnemonic && (
        <div>
          <button
            type="button"
            onClick={onToggleMnemonic}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
          >
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            Peek Mnemonic Hint (M)
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* BACK REVEAL: SUMMARY, EXAM TRAP WARNING, KEY TERMS & REFERENCES   */}
      {/* ================================================================= */}
      {revealed && (
        <div className="space-y-3.5 border-t border-slate-200/70 pt-4 dark:border-slate-800/70">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200">
            <div className="mb-1 flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Core Takeaway</span>
            </div>
            {card.answerSummary}
          </div>

          <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-900 dark:text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            <div>
              <span className="font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                CISSP Exam Trap Warning:{' '}
              </span>
              <span>{card.examTrapWarning}</span>
              {card.relatedTrapTypes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {card.relatedTrapTypes.map((trap) => (
                    <span
                      key={trap}
                      className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-300"
                    >
                      Trap: {TRAP_TYPE_METADATA[trap]?.shortLabel ?? trap}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <div className="flex flex-wrap items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              {card.keyTerms.map((term) => (
                <span
                  key={term}
                  className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  {term}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BookOpen className="h-3.5 w-3.5" />
              {card.references.map((ref, idx) => (
                <span key={idx}>
                  {ref.source} ({ref.section})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
