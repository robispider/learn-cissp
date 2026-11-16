/**
 * Built-in recall games — one per archetype, generated from the card's JSON payload.
 *
 * Design notes (learning science):
 * - Retrieval practice: the learner must produce or pick the answer before seeing it.
 * - Immediate corrective feedback: a wrong pick shakes and the right answer is shown,
 *   so errors are corrected while the memory trace is active.
 * - Fresh shuffle on every attempt, so the learner memorizes content, not screen positions.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { ArrowRight, Check, HelpCircle, Lightbulb, X } from 'lucide-react';
import type { MemoryCard } from '../../../../lib/types/memory';
import { shuffle, shuffleNotIdentity, type RecallGameProps, type RecallResult } from '../types';
import {
  choiceBtn,
  choiceDim,
  choiceIdle,
  choiceRight,
  choiceWrong,
  FEEDBACK_MS_RIGHT,
  FEEDBACK_MS_WRONG,
  GameHeader,
  useShake,
} from '../ui';
import { answerMatches, parseCloze } from './cloze';
import { palette } from './visuals';

function useStartTime() {
  const t = useRef(Date.now());
  return () => Date.now() - t.current;
}

/* ================================================================== */
/* Sequence: "Build the chain" — tap steps in order                    */
/* ================================================================== */
export function SequenceGame({ card, onComplete }: RecallGameProps) {
  const steps = card.sequenceData?.steps ?? [];
  const [pool] = useState(() => shuffleNotIdentity(steps));
  const [placed, setPlaced] = useState<number[]>([]);
  const [missedSlots, setMissedSlots] = useState<Set<number>>(new Set());
  const [wrongTaps, setWrongTaps] = useState(0);
  const [hints, setHints] = useState(0);
  const [misses, setMisses] = useState<string[]>([]);
  const { shake, isShaking } = useShake();
  const elapsed = useStartTime();

  const slot = placed.length;
  const expected = steps[slot];
  const showHint = wrongTaps >= 2;

  useEffect(() => {
    if (steps.length && placed.length === steps.length) {
      const t = window.setTimeout(
        () =>
          onComplete({
            correct: steps.length - missedSlots.size,
            total: steps.length,
            hintsUsed: hints,
            durationMs: elapsed(),
            misses,
          }),
        700
      );
      return () => window.clearTimeout(t);
    }
  }, [placed.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (order: number) => {
    if (!expected || placed.includes(order)) return;
    if (order === expected.order) {
      setPlaced((p) => [...p, order]);
      setWrongTaps(0);
      return;
    }
    shake(String(order));
    if (!missedSlots.has(slot)) {
      setMissedSlots((s) => new Set(s).add(slot));
      const picked = steps.find((s) => s.order === order);
      setMisses((m) => [...m, `Put "${picked?.label}" at step ${slot + 1} (should be "${expected.label}")`]);
    }
    const nextWrong = wrongTaps + 1;
    setWrongTaps(nextWrong);
    if (nextWrong === 2) setHints((h) => h + 1);
  };

  return (
    <div>
      <GameHeader
        title="Build the chain"
        instructions={
          <>
            Tap the steps in order: <strong>{card.sequenceData?.directionLabel}</strong>. Two wrong taps on the same
            step and the right one glows.
          </>
        }
      />
      <ol className="mb-4 space-y-1.5">
        {steps.map((s, i) => {
          const done = i < placed.length;
          return (
            <li
              key={s.order}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${
                done
                  ? `mem-drop ${missedSlots.has(i) ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/40 bg-emerald-500/5'}`
                  : i === slot
                    ? 'border-violet-500/50 border-dashed bg-violet-500/5'
                    : 'border-dashed border-slate-200 dark:border-slate-800'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                  done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800'
                }`}
              >
                {i + 1}
              </span>
              <span className={done ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-400'}>
                {done ? s.label : i === slot ? 'Which comes next?' : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {pool
          .filter((s) => !placed.includes(s.order))
          .map((s) => (
            <button
              key={s.order}
              type="button"
              onClick={() => tap(s.order)}
              className={`${choiceBtn} ${choiceIdle} ${isShaking(String(s.order)) ? 'mem-shake border-rose-500/60' : ''} ${
                showHint && expected?.order === s.order ? 'mem-glow border-violet-500' : ''
              }`}
            >
              {s.label}
            </button>
          ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Contrast: "Sort it" — drop each statement into the right concept    */
/* ================================================================== */
export function ContrastGame({ card, onComplete }: RecallGameProps) {
  const cols = card.contrastData?.columns ?? [];
  const items = useMemo(() => {
    // Round-robin across columns so every concept is represented, then shuffle. Max 8.
    const byCol = cols.map((c, ci) => shuffle(c.points).map((text) => ({ text, col: ci })));
    const picked: { text: string; col: number }[] = [];
    for (let i = 0; picked.length < 8; i++) {
      let added = false;
      for (const list of byCol) {
        if (list[i] && picked.length < 8) {
          picked.push(list[i]);
          added = true;
        }
      }
      if (!added) break;
    }
    return shuffle(picked);
  }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [misses, setMisses] = useState<string[]>([]);
  const elapsed = useStartTime();
  const item = items[i];

  const pick = (ci: number) => {
    if (chosen !== null || !item) return;
    setChosen(ci);
    const ok = ci === item.col;
    const nextResults = [...results, ok];
    setResults(nextResults);
    const nextMisses = ok ? misses : [...misses, `"${item.text}" belongs to ${cols[item.col].label}`];
    setMisses(nextMisses);
    window.setTimeout(
      () => {
        if (i + 1 >= items.length) {
          onComplete({
            correct: nextResults.filter(Boolean).length,
            total: items.length,
            hintsUsed: 0,
            durationMs: elapsed(),
            misses: nextMisses,
          });
        } else {
          setI(i + 1);
          setChosen(null);
        }
      },
      ok ? FEEDBACK_MS_RIGHT : FEEDBACK_MS_WRONG
    );
  };

  if (!item) return null;
  return (
    <div>
      <GameHeader
        title="Sort it"
        instructions="Which concept does this statement describe?"
        round={i}
        rounds={items.length}
        results={results}
      />
      <div
        key={i}
        className={`mem-pop mb-3 flex min-h-[92px] items-center justify-center rounded-2xl border-2 px-4 py-5 text-center text-base font-semibold leading-relaxed text-slate-900 dark:text-white ${
          chosen === null
            ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
            : chosen === item.col
              ? 'border-emerald-500/60 bg-emerald-500/10'
              : 'mem-shake border-rose-500/60 bg-rose-500/10'
        }`}
      >
        {item.text}
      </div>
      <div className={`grid gap-2 ${cols.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {cols.map((c, ci) => {
          const p = palette(ci);
          const state =
            chosen === null ? '' : ci === item.col ? choiceRight : ci === chosen ? choiceWrong : choiceDim;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => pick(ci)}
              disabled={chosen !== null}
              className={`${choiceBtn} ${state || `${p.border} ${p.soft} ${p.text} hover:brightness-110`} text-center font-bold`}
            >
              {c.label}
              {c.badge && <span className="block text-[10px] font-semibold opacity-70">{c.badge}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Matrix: "Fill the grid" — restore hidden cells                      */
/* ================================================================== */
interface MatrixTarget {
  r: number;
  c: number;
  answer: string;
  options: string[];
}

export function MatrixGame({ card, onComplete }: RecallGameProps) {
  const m = card.matrixData;
  const targets = useMemo<MatrixTarget[]>(() => {
    if (!m) return [];
    const cands: MatrixTarget[] = [];
    for (let c = 0; c < m.headers.length; c++) {
      const colVals = Array.from(new Set(m.rows.map((row) => row[c]).filter(Boolean)));
      m.rows.forEach((row, r) => {
        const answer = row[c];
        const distractors = colVals.filter((v) => v !== answer);
        if (!answer || distractors.length < 1) return;
        cands.push({ r, c, answer, options: shuffle([answer, ...shuffle(distractors).slice(0, 3)]) });
      });
    }
    // Prefer non-label columns and distinct rows; cap at 5 rounds.
    const out: MatrixTarget[] = [];
    const usedRows = new Set<number>();
    for (const t of shuffle(cands).sort((a, b) => Number(a.c === 0) - Number(b.c === 0))) {
      if (out.length >= Math.min(5, m.rows.length + 1)) break;
      if (usedRows.has(t.r) && usedRows.size < m.rows.length) continue;
      usedRows.add(t.r);
      out.push(t);
    }
    return out;
  }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [misses, setMisses] = useState<string[]>([]);
  const elapsed = useStartTime();
  const t = targets[i];

  const pick = (opt: string) => {
    if (chosen !== null || !t || !m) return;
    setChosen(opt);
    const ok = opt === t.answer;
    const nextResults = [...results, ok];
    setResults(nextResults);
    const nextMisses = ok ? misses : [...misses, `${m.rows[t.r][0]} → ${m.headers[t.c]}: "${t.answer}"`];
    setMisses(nextMisses);
    window.setTimeout(
      () => {
        if (i + 1 >= targets.length) {
          onComplete({
            correct: nextResults.filter(Boolean).length,
            total: targets.length,
            hintsUsed: 0,
            durationMs: elapsed(),
            misses: nextMisses,
          });
        } else {
          setI(i + 1);
          setChosen(null);
        }
      },
      ok ? FEEDBACK_MS_RIGHT : FEEDBACK_MS_WRONG
    );
  };

  if (!m || !t) return null;
  const row = m.rows[t.r];
  return (
    <div>
      <GameHeader
        title="Fill the grid"
        instructions="One cell of this row is hidden. Pick what belongs there."
        round={i}
        rounds={targets.length}
        results={results}
      />
      <div key={i} className="mem-pop mb-3 overflow-hidden rounded-2xl border border-amber-500/30 bg-white dark:bg-slate-900">
        {m.headers.map((h, c) => {
          const isBlank = c === t.c;
          return (
            <div
              key={h}
              className={`grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3.5 py-2.5 text-sm ${
                c > 0 ? 'border-t border-slate-200/70 dark:border-slate-800/70' : 'bg-amber-500/5'
              }`}
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</span>
              {isBlank ? (
                <span
                  className={`rounded-lg px-2 py-0.5 font-semibold ${
                    chosen === null
                      ? 'mem-glow border border-dashed border-violet-500/60 bg-violet-500/5 text-violet-600 dark:text-violet-300'
                      : chosen === t.answer
                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-500/15 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  {chosen === null ? '?' : t.answer}
                </span>
              ) : (
                <span className={c === 0 ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}>
                  {row[c]}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {t.options.map((opt) => {
          const state =
            chosen === null ? choiceIdle : opt === t.answer ? choiceRight : opt === chosen ? choiceWrong : choiceDim;
          return (
            <button key={opt} type="button" disabled={chosen !== null} onClick={() => pick(opt)} className={`${choiceBtn} ${state}`}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Formula: "Match the symbols" — pair each variable with its meaning  */
/* ================================================================== */
export function FormulaGame({ card, onComplete }: RecallGameProps) {
  const vars = useMemo(() => shuffle(card.formulaData?.variables ?? []).slice(0, 6), [card.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [meanings] = useState(() => shuffleNotIdentity(vars.map((v) => v.meaning)));
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [misses, setMisses] = useState<string[]>([]);
  const { shake, isShaking } = useShake();
  const elapsed = useStartTime();

  useEffect(() => {
    if (vars.length && matched.size === vars.length) {
      const t = window.setTimeout(
        () =>
          onComplete({
            correct: vars.length - missed.size,
            total: vars.length,
            hintsUsed: 0,
            durationMs: elapsed(),
            misses,
          }),
        600
      );
      return () => window.clearTimeout(t);
    }
  }, [matched.size]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickMeaning = (meaning: string) => {
    if (!sel) return;
    const v = vars.find((x) => x.symbol === sel);
    if (!v) return;
    if (v.meaning === meaning) {
      setMatched((s) => new Set(s).add(sel));
      setSel(null);
    } else {
      shake(meaning);
      if (!missed.has(sel)) {
        setMissed((s) => new Set(s).add(sel));
        setMisses((m) => [...m, `${v.symbol} = ${v.meaning}`]);
      }
    }
  };

  return (
    <div>
      <GameHeader
        title="Match the symbols"
        instructions={
          <>
            Formula: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">{card.formulaData?.formula}</code>
            <br />
            Tap a symbol, then tap what it means.
          </>
        }
      />
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
        <div className="flex flex-col gap-2">
          {vars.map((v, i) => {
            const done = matched.has(v.symbol);
            return (
              <button
                key={v.symbol}
                type="button"
                disabled={done}
                onClick={() => setSel(v.symbol)}
                className={`min-w-[64px] rounded-xl border px-3 py-2.5 font-mono text-sm font-bold transition ${
                  done
                    ? `mem-pop ${missed.has(v.symbol) ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`
                    : sel === v.symbol
                      ? `border-violet-500 bg-violet-500 text-white shadow-md shadow-violet-500/30`
                      : `${palette(i).border} ${palette(i).soft} ${palette(i).text}`
                }`}
              >
                {v.symbol}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {meanings.map((mn) => {
            const owner = vars.find((v) => v.meaning === mn);
            const done = owner ? matched.has(owner.symbol) : false;
            return (
              <button
                key={mn}
                type="button"
                disabled={done || !sel}
                onClick={() => pickMeaning(mn)}
                className={`${choiceBtn} py-2 text-xs ${done ? choiceDim : choiceIdle} ${isShaking(mn) ? 'mem-shake border-rose-500/60' : ''} ${
                  !sel && !done ? 'opacity-70' : ''
                }`}
              >
                {done && <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />}
                {mn}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Cloze: "Type it" — generate the missing words yourself              */
/* ================================================================== */
export function ClozeGame({ card, onComplete }: RecallGameProps) {
  const segs = useMemo(() => parseCloze(card.clozeTemplate ?? ''), [card.clozeTemplate]);
  const blanks = segs.flatMap((s, i) => (s.type === 'cloze' ? [{ i, answer: s.answer, hint: s.hint }] : []));
  const [vals, setVals] = useState<Record<number, string>>({});
  const [hinted, setHinted] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState<Record<number, boolean> | null>(null);
  const elapsed = useStartTime();
  const continueRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (checked) continueRef.current?.focus();
  }, [checked]);

  const check = () => {
    const res: Record<number, boolean> = {};
    for (const b of blanks) res[b.i] = answerMatches(vals[b.i] ?? '', b.answer);
    setChecked(res);
  };
  const finish = () => {
    if (!checked) return;
    onComplete({
      correct: blanks.filter((b) => checked[b.i]).length,
      total: blanks.length,
      hintsUsed: hinted.size,
      durationMs: elapsed(),
      misses: blanks.filter((b) => !checked[b.i]).map((b) => `Blank: "${b.answer}"${vals[b.i] ? ` (you typed "${vals[b.i]}")` : ''}`),
    });
  };
  const hintFor = (b: (typeof blanks)[number]) =>
    b.hint ? b.hint : `${b.answer.slice(0, 1)}${'_'.repeat(Math.max(0, Math.min(10, b.answer.length - 1)))}`;

  let first = true;
  return (
    <div>
      <GameHeader
        title="Type it"
        instructions="Fill each blank from memory. Typing beats recognizing: producing the answer yourself makes it stick. Small typos are fine."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (checked) finish();
          else check();
        }}
      >
        <p className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4 text-base leading-[2.4] text-slate-800 dark:text-slate-100">
          {segs.map((s, i) => {
            if (s.type === 'text') return <span key={i}>{s.text}</span>;
            const b = blanks.find((x) => x.i === i)!;
            const isFirst = first;
            first = false;
            if (checked) {
              const ok = checked[i];
              return (
                <span key={i} className={`mem-pop mx-0.5 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-sm font-semibold ${ok ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200' : 'bg-rose-500/15 text-rose-800 dark:text-rose-200'}`}>
                  {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {ok ? vals[i] : (
                    <>
                      {vals[i] ? <s className="opacity-60">{vals[i]}</s> : null}
                      <span>{b.answer}</span>
                    </>
                  )}
                </span>
              );
            }
            return (
              <span key={i} className="mx-0.5 inline-flex flex-col align-middle">
                <input
                  ref={isFirst ? firstRef : undefined}
                  value={vals[i] ?? ''}
                  onChange={(e) => setVals((v) => ({ ...v, [i]: e.target.value }))}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-label={`Blank ${b.i}`}
                  placeholder={hinted.has(i) ? hintFor(b) : '…'}
                  className="w-36 rounded-lg border border-violet-500/40 bg-white px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 dark:bg-slate-900 dark:text-white"
                  style={{ width: `${Math.max(7, Math.min(22, b.answer.length + 2))}ch` }}
                />
              </span>
            );
          })}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {!checked ? (
            <>
              <button
                type="button"
                onClick={() => setHinted(new Set(blanks.map((b) => b.i)))}
                disabled={hinted.size === blanks.length}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-40 dark:text-amber-300"
              >
                <Lightbulb className="h-3.5 w-3.5" /> Hint (costs half a point)
              </button>
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">
                Check <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button ref={continueRef} type="submit" className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">
              See the answer <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/* ================================================================== */
/* Manager heuristic: "Manager or technician?"                         */
/* ================================================================== */
export function HeuristicGame({ card, pool, onComplete }: RecallGameProps) {
  const h = card.heuristicData;
  const rounds = useMemo(() => {
    if (!h) return [];
    const r: { q: string; answer: string; options: string[] }[] = [
      {
        q: 'You are the security leader. Which response does the CISSP exam reward?',
        answer: h.managerAction,
        options: shuffle([h.managerAction, h.technicalReflexTrap]),
      },
    ];
    const others = shuffle(
      pool.filter((c) => c.id !== card.id && c.heuristicData).map((c) => c.heuristicData!.governingPrinciple)
    ).slice(0, 2);
    if (others.length) {
      r.push({
        q: 'Which principle justifies that choice?',
        answer: h.governingPrinciple,
        options: shuffle([h.governingPrinciple, ...others]),
      });
    }
    return r;
  }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [misses, setMisses] = useState<string[]>([]);
  const elapsed = useStartTime();
  const round = rounds[i];

  const pick = (opt: string) => {
    if (chosen !== null || !round) return;
    setChosen(opt);
    const ok = opt === round.answer;
    const nextResults = [...results, ok];
    setResults(nextResults);
    const nextMisses = ok ? misses : [...misses, i === 0 ? 'Chose the technician reflex over the manager action' : 'Picked the wrong governing principle'];
    setMisses(nextMisses);
    window.setTimeout(
      () => {
        if (i + 1 >= rounds.length) {
          onComplete({ correct: nextResults.filter(Boolean).length, total: rounds.length, hintsUsed: 0, durationMs: elapsed(), misses: nextMisses });
        } else {
          setI(i + 1);
          setChosen(null);
        }
      },
      ok ? FEEDBACK_MS_RIGHT + 300 : FEEDBACK_MS_WRONG + 400
    );
  };

  if (!round) return null;
  return (
    <div>
      <GameHeader title="Think like a manager" instructions={round.q} round={i} rounds={rounds.length} results={results} />
      <div key={i} className="space-y-2">
        {round.options.map((opt) => {
          const state = chosen === null ? choiceIdle : opt === round.answer ? choiceRight : opt === chosen ? `${choiceWrong} mem-shake` : choiceDim;
          return (
            <button key={opt} type="button" disabled={chosen !== null} onClick={() => pick(opt)} className={`${choiceBtn} mem-fade-up ${state} leading-relaxed`}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Self recall: plain text cards (or games switched off)               */
/* ================================================================== */
export function SelfRecall({ onReveal }: { onReveal: (r: RecallResult) => void }) {
  const elapsed = useStartTime();
  const [notes, setNotes] = useState('');
  return (
    <div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <HelpCircle className="h-4 w-4 text-violet-500" /> Answer from memory first
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        Say it out loud or jot it down, then reveal and compare honestly. Attempting before you look is what builds the memory.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Optional: type your answer"
        className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900"
      />
      <button
        type="button"
        onClick={() => onReveal({ correct: 0, total: 0, hintsUsed: 0, durationMs: elapsed(), selfRated: true })}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
      >
        Reveal answer
      </button>
    </div>
  );
}

/** Built-in recall game for a card's archetype, or null when its payload can't support one. */
export function builtinGameFor(card: MemoryCard): { Game: ComponentType<RecallGameProps>; label: string } | null {
  switch (card.cardType) {
    case 'sequence_order':
      return card.sequenceData && card.sequenceData.steps.length >= 2 ? { Game: SequenceGame, label: 'Build the chain' } : null;
    case 'concept_contrast':
      return card.contrastData ? { Game: ContrastGame, label: 'Sort it' } : null;
    case 'reference_fact':
      return card.matrixData && card.matrixData.rows.length >= 2 ? { Game: MatrixGame, label: 'Fill the grid' } : null;
    case 'formula_drill':
      return card.formulaData && card.formulaData.variables.length >= 2 ? { Game: FormulaGame, label: 'Match the symbols' } : null;
    case 'cloze_deletion':
      return card.clozeTemplate?.includes('{{c') ? { Game: ClozeGame, label: 'Type it' } : null;
    case 'manager_heuristic':
      return card.heuristicData ? { Game: HeuristicGame, label: 'Think like a manager' } : null;
    default:
      return null;
  }
}
