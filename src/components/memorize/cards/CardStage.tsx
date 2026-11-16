/**
 * CardStage — renders one memory card through the three learning steps:
 *
 *   1. LEARN    (new cards, and cards you just forgot) — visual / animated explainer,
 *               shown before any testing so there is something to retrieve (encoding).
 *   2. RECALL   — an interactive game or a self-recall prompt (retrieval practice).
 *   3. FEEDBACK — score, what you missed, the full visual answer, the exam trap and a
 *               "why?" prompt (corrective feedback + elaboration). The parent then rates it.
 *
 * The stage is controlled: the parent owns `phase` and `result` so keyboard shortcuts and
 * the FSRS grade bar can live in the runner (or the authoring lab).
 */
import { Component, Suspense, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  Gamepad2,
  HelpCircle,
  Lightbulb,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import type { MemoryCard } from '../../../lib/types/memory';
import { TRAP_TYPE_METADATA } from '../../../lib/types/question';
import { builtinGameFor, SelfRecall } from './builtin/games';
import { BuiltinVisual } from './builtin/visuals';
import { getCardPlugin, MODALITY_META, resolveModality } from './registry';
import { resultPercent, type RecallResult } from './types';

export type StagePhase = 'learn' | 'recall' | 'feedback';

/** How the RECALL step will run for this card. */
export function recallModeFor(card: MemoryCard, gamesEnabled: boolean): { kind: 'game' | 'self'; label: string } {
  if (!gamesEnabled || card.presentation?.modality === 'text') return { kind: 'self', label: 'Self recall' };
  const plugin = getCardPlugin(card);
  if (plugin?.Recall) return { kind: 'game', label: plugin.recallLabel ?? 'Challenge' };
  const builtin = builtinGameFor(card);
  return builtin ? { kind: 'game', label: builtin.label } : { kind: 'self', label: 'Self recall' };
}

interface Props {
  card: MemoryCard;
  pool: MemoryCard[];
  phase: StagePhase;
  result: RecallResult | null;
  gamesEnabled: boolean;
  /** The learn step ran for this card in this sitting. */
  learnedNow: boolean;
  showMnemonic: boolean;
  onToggleMnemonic: () => void;
  onRecallComplete: (r: RecallResult) => void;
  /** Changes whenever the same card is shown again, to reset games. */
  attemptKey?: string | number;
}

class PluginBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[memory card plugin]', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const Loading = () => (
  <div className="flex h-40 animate-pulse items-center justify-center rounded-2xl bg-slate-100 text-xs text-slate-400 dark:bg-slate-900">
    Loading card…
  </div>
);

export function CardVisual({ card, mode }: { card: MemoryCard; mode: 'learn' | 'review' }) {
  const plugin = getCardPlugin(card);
  const builtin = <BuiltinVisual card={card} animate={mode === 'learn' && resolveModality(card) !== 'text'} />;
  if (!plugin) return builtin;
  const View = plugin.View;
  return (
    <PluginBoundary fallback={builtin}>
      <Suspense fallback={<Loading />}>
        <View card={card} props={card.presentation?.plugin?.props ?? {}} mode={mode} />
      </Suspense>
    </PluginBoundary>
  );
}

function Stepper({ phase, learnedNow }: { phase: StagePhase; learnedNow: boolean }) {
  const steps: { id: StagePhase; label: string; Icon: typeof Brain }[] = [
    ...(learnedNow ? [{ id: 'learn' as const, label: 'Learn', Icon: BookOpen }] : []),
    { id: 'recall', label: 'Recall', Icon: Gamepad2 },
    { id: 'feedback', label: 'Check & rate', Icon: Target },
  ];
  const at = steps.findIndex((s) => s.id === phase);
  return (
    <ol className="flex items-center gap-1 text-[11px] font-semibold">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1">
          {i > 0 && <span className={`h-px w-4 ${i <= at ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-700'}`} />}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
              i === at
                ? 'bg-violet-600 text-white'
                : i < at
                  ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
            }`}
          >
            <s.Icon className="h-3 w-3" /> {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ResultBanner({ result }: { result: RecallResult }) {
  if (result.selfRated) {
    return (
      <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200/80 bg-slate-50 p-3.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
        Compare your answer with the card below, then rate how well you recalled it.
      </div>
    );
  }
  const pct = resultPercent(result);
  const good = pct >= 90;
  const ok = pct >= 60;
  const tone = good
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
    : ok
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-100';
  const ring = good ? '#10b981' : ok ? '#f59e0b' : '#f43f5e';
  return (
    <div className={`mem-pop rounded-2xl border p-3.5 ${tone}`}>
      <div className="flex items-center gap-3">
        <div
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${ring} ${pct * 3.6}deg, rgb(148 163 184 / 0.25) 0deg)` }}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white font-mono text-sm font-black text-slate-900 dark:bg-slate-950 dark:text-white">
            {pct}%
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-bold">
            {good ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {good ? 'Nailed it' : ok ? 'Partly there' : 'Not yet — that is how learning starts'}
          </div>
          <div className="text-xs opacity-80">
            {result.correct}/{result.total} right first time
            {result.hintsUsed > 0 ? ` · ${result.hintsUsed} hint${result.hintsUsed === 1 ? '' : 's'}` : ''} ·{' '}
            {Math.max(1, Math.round(result.durationMs / 1000))}s
          </div>
        </div>
      </div>
      {result.misses && result.misses.length > 0 && (
        <ul className="mt-2.5 space-y-1 border-t border-current/10 pt-2 text-xs">
          {result.misses.slice(0, 5).map((m, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current" />
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CardStage({
  card,
  pool,
  phase,
  result,
  gamesEnabled,
  learnedNow,
  showMnemonic,
  onToggleMnemonic,
  onRecallComplete,
  attemptKey,
}: Props) {
  const modality = resolveModality(card);
  const mm = MODALITY_META[modality];
  const plugin = getCardPlugin(card);
  const recallMode = recallModeFor(card, gamesEnabled);
  const props = card.presentation?.plugin?.props ?? {};

  let game: ReactNode = null;
  if (phase === 'recall') {
    if (recallMode.kind === 'self') {
      game = <SelfRecall key={attemptKey} onReveal={onRecallComplete} />;
    } else if (plugin?.Recall) {
      const R = plugin.Recall;
      const fallbackGame = builtinGameFor(card);
      game = (
        <PluginBoundary
          key={attemptKey}
          fallback={fallbackGame ? <fallbackGame.Game card={card} props={props} pool={pool} onComplete={onRecallComplete} /> : <SelfRecall onReveal={onRecallComplete} />}
        >
          <Suspense fallback={<Loading />}>
            <R card={card} props={props} pool={pool} onComplete={onRecallComplete} />
          </Suspense>
        </PluginBoundary>
      );
    } else {
      const b = builtinGameFor(card)!;
      game = <b.Game key={attemptKey} card={card} props={props} pool={pool} onComplete={onRecallComplete} />;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Stepper phase={phase} learnedNow={learnedNow} />
        <span title={mm.hint} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${mm.badgeClass}`}>
          {mm.label}
          {plugin ? ' · custom' : ''}
        </span>
      </div>

      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl dark:text-white">{card.title}</h2>
        {card.cardType !== 'cloze_deletion' && (
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">{card.prompt}</p>
        )}
      </div>

      {/* ---------------- LEARN ---------------- */}
      {phase === 'learn' && (
        <div className="space-y-3">
          {card.presentation?.hook && (
            <div className="mem-fade-up flex items-start gap-2.5 rounded-2xl border border-violet-500/25 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/5 p-3.5 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
              {card.presentation.hook}
            </div>
          )}
          <CardVisual card={card} mode="learn" />
          {card.mnemonic && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-950 dark:text-amber-100">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                <span className="font-bold">Memory hook: </span>
                {card.mnemonic}
              </span>
            </div>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Take it in, then test yourself right away: <strong>{recallMode.label}</strong>. You will see this card again
            just before you are likely to forget it.
          </p>
        </div>
      )}

      {/* ---------------- RECALL ---------------- */}
      {phase === 'recall' && (
        <div className="space-y-3">
          {game}
          {card.mnemonic && !showMnemonic && (
            <button
              type="button"
              onClick={onToggleMnemonic}
              className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
            >
              <Lightbulb className="h-3.5 w-3.5" /> Stuck? Peek the memory hook (counts as a hint)
            </button>
          )}
          {card.mnemonic && showMnemonic && (
            <div className="mem-fade-up flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {card.mnemonic}
            </div>
          )}
        </div>
      )}

      {/* ---------------- FEEDBACK ---------------- */}
      {phase === 'feedback' && (
        <div className="space-y-3.5">
          {result && <ResultBanner result={result} />}
          <CardVisual card={card} mode="review" />

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Core takeaway
            </div>
            {card.answerSummary}
          </div>

          {card.presentation?.elaborate && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-violet-500/25 bg-violet-500/5 p-3.5 text-sm text-slate-800 dark:text-slate-100">
              <Brain className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
              <span>
                <span className="font-bold">Explain it to yourself: </span>
                {card.presentation.elaborate}
              </span>
            </div>
          )}

          {card.mnemonic && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-950 dark:text-amber-100">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                <span className="font-bold">Memory hook: </span>
                {card.mnemonic}
              </span>
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-950 dark:text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            <div>
              <span className="font-bold">Exam trap: </span>
              {card.examTrapWarning}
              {card.relatedTrapTypes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {card.relatedTrapTypes.map((t) => (
                    <span key={t} className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                      {TRAP_TYPE_METADATA[t]?.shortLabel ?? t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-2 text-[11px] text-slate-400">
            <div className="flex flex-wrap items-center gap-1.5">
              {card.keyTerms.map((t) => (
                <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {t}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BookOpen className="h-3.5 w-3.5" />
              {card.references.map((r, i) => (
                <span key={i}>
                  {r.source} ({r.section})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
