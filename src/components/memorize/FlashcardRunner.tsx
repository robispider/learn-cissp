import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Gamepad2,
  PauseCircle,
  Pin,
  RotateCcw,
  Trophy,
  X,
} from 'lucide-react';
import {
  computeCurrentRetrievability,
  formatIntervalDiff,
  previewCardRatings,
  saveFsrsPreferences,
} from '../../lib/memorization/fsrs-engine';
import { buildStudyQueue, type QueueFilterOptions } from '../../lib/memorization/queue-builder';
import { buildMemorySessionQuery, useMemoryData } from '../../lib/memorization/use-memory-data';
import {
  recordMemoryCardReview,
  toggleMemoryCardPinned,
  toggleMemoryCardSuspended,
} from '../../lib/storage/memory-store';
import {
  EXAM_PRIORITY_META,
  MEMORY_CARD_TYPE_META,
  type ExamPriority,
  type FsrsGrade,
  type MemoryCard,
  type MemoryCardStateRecord,
  type MemoryCardType,
  type MemoryDomainMeta,
  type QueueBucket,
} from '../../lib/types/memory';
import { domainTheme } from '../../lib/ui/domain-theme';
import { withBase } from '../../lib/paths';
import { btnPrimary, btnSecondary } from '../ui/primitives';
import CardStage, { recallModeFor, type StagePhase } from './cards/CardStage';
import { resultPercent, suggestGrade, type RecallResult } from './cards/types';

interface Props {
  domains: MemoryDomainMeta[];
}

type SessionMode = NonNullable<QueueFilterOptions['mode']>;

interface SessionParams {
  mode: SessionMode;
  domain?: string;
  subdomain?: string;
  type?: MemoryCardType;
  priority?: ExamPriority;
  card?: string;
  limit?: number;
}

interface QueueItem {
  card: MemoryCard;
  bucket: QueueBucket;
  /** Re-shown in this session after an Again/Hard on a learning step. */
  repeat: boolean;
  /** Forgotten (graded Again): re-study the visual before testing again (successive relearning). */
  relearn?: boolean;
}

/** New cards and just-forgotten cards start on the Learn step; reviews go straight to recall. */
function initialPhase(item: QueueItem, st: MemoryCardStateRecord | undefined): StagePhase {
  const isNew = !st || st.state === 0;
  return isNew || item.relearn ? 'learn' : 'recall';
}

/** Learning-step cards due within this window are shown again before the session ends. */
const REQUEUE_WINDOW_MS = 20 * 60_000;
const REQUEUE_GAP = 3;

const GRADE_STYLES: Record<FsrsGrade, string> = {
  1: 'border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300',
  2: 'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300',
  3: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300',
  4: 'border-sky-500/40 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300',
};

const BUCKET_LABEL: Record<QueueBucket, string> = {
  learning_due: 'Learning',
  exam_gap: 'Exam gap',
  review_due: 'Review',
  new_card: 'New',
  custom_cram: 'Cram',
};

const VALID_MODES: SessionMode[] = ['smart', 'gap', 'cram', 'pinned', 'due'];

function readParams(): SessionParams {
  const p = new URLSearchParams(window.location.search);
  const modeRaw = p.get('mode') as SessionMode | null;
  const limit = Number(p.get('limit'));
  return {
    mode: modeRaw && VALID_MODES.includes(modeRaw) ? modeRaw : 'smart',
    domain: p.get('domain') ?? undefined,
    subdomain: p.get('subdomain') ?? undefined,
    type: (p.get('type') as MemoryCardType | null) ?? undefined,
    priority: (p.get('priority') as ExamPriority | null) ?? undefined,
    card: p.get('card') ?? undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  };
}

function sessionTitle(params: SessionParams, domains: MemoryDomainMeta[]): string {
  if (params.card) return 'Single card';
  const scope = params.subdomain
    ? `Sub-domain ${params.subdomain}`
    : params.domain
      ? (() => {
          const d = domains.find((x) => x.domainId === params.domain);
          return d ? `Domain ${d.number}: ${d.shortName}` : params.domain;
        })()
      : null;
  const base =
    params.mode === 'gap'
      ? 'Exam-gap drill'
      : params.mode === 'cram'
        ? 'Cram session'
        : params.mode === 'pinned'
          ? 'Pinned cards'
          : params.mode === 'due'
            ? 'Due reviews'
            : 'Daily review';
  return scope ? `${base} · ${scope}` : base;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export default function FlashcardRunner({ domains }: Props) {
  const data = useMemoryData();
  const { loaded, error, cards, stateMap, masteryMap, prefs } = data;

  const [params, setParams] = useState<SessionParams | null>(null);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phaseState, setPhaseState] = useState<{ idx: number; phase: StagePhase; learned: boolean } | null>(null);
  const [result, setResult] = useState<RecallResult | null>(null);
  const [gameScores, setGameScores] = useState<number[]>([]);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [liveStates, setLiveStates] = useState<Map<string, MemoryCardStateRecord>>(new Map());
  const [gradeCounts, setGradeCounts] = useState<Record<FsrsGrade, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sessionStart] = useState(() => Date.now());
  const [sessionEnd, setSessionEnd] = useState<number | null>(null);
  const shownAtRef = useRef(Date.now());

  const domainMeta = useMemo(() => new Map(domains.map((d) => [d.domainId, d])), [domains]);

  // Build the queue once, when catalog + IndexedDB state are available.
  useEffect(() => {
    if (!loaded || error || queue) return;
    const sp = readParams();
    setParams(sp);
    const summary = buildStudyQueue(cards, stateMap, masteryMap, prefs, {
      mode: sp.mode,
      domainId: sp.domain,
      subdomainId: sp.subdomain,
      cardType: sp.type,
      examPriority: sp.priority,
      cardId: sp.card,
      limit: sp.limit,
    });
    setQueue(summary.queue.map((q) => ({ card: q.card, bucket: q.bucket, repeat: false })));
    setLiveStates(new Map(stateMap));
    shownAtRef.current = Date.now();
  }, [loaded, error, queue, cards, stateMap, masteryMap, prefs]);

  const current = queue && idx < queue.length ? queue[idx] : null;
  const currentState = current ? liveStates.get(current.card.id) : undefined;
  const gamesEnabled = prefs.interactiveOrderMode;

  // Phase is derived for a freshly shown card, then owned by state once the learner acts.
  const defaultPhase: StagePhase = current ? initialPhase(current, currentState) : 'recall';
  const phase: StagePhase = phaseState && phaseState.idx === idx ? phaseState.phase : defaultPhase;
  const learnedNow = phaseState && phaseState.idx === idx ? phaseState.learned : defaultPhase === 'learn';
  const revealed = phase === 'feedback';
  const recallMode = current ? recallModeFor(current.card, gamesEnabled) : null;
  const suggested = revealed ? suggestGrade(result, learnedNow) : null;
  const finished = Boolean(queue && queue.length > 0 && idx >= queue.length);

  useEffect(() => {
    if (finished && sessionEnd === null) setSessionEnd(Date.now());
  }, [finished, sessionEnd]);

  const previews = useMemo(() => {
    if (!current || !revealed) return null;
    return previewCardRatings(current.card, currentState ?? null, prefs, new Date());
  }, [current, currentState, revealed, prefs]);

  const advance = useCallback(() => {
    setIdx((i) => i + 1);
    setResult(null);
    setShowMnemonic(false);
    setSaveError(null);
    shownAtRef.current = Date.now();
    window.scrollTo({ top: 0 });
  }, []);

  const beginRecall = useCallback(() => {
    if (!current || phase !== 'learn') return;
    setPhaseState({ idx, phase: 'recall', learned: true });
    setShowMnemonic(false);
  }, [current, phase, idx]);

  const completeRecall = useCallback(
    (r: RecallResult) => {
      if (!current || phase !== 'recall') return;
      // Peeking at the memory hook during recall counts as a hint.
      const final = showMnemonic && !r.selfRated ? { ...r, hintsUsed: r.hintsUsed + 1 } : r;
      setResult(final);
      if (!final.selfRated && final.total > 0) setGameScores((g) => [...g, resultPercent(final)]);
      setPhaseState({ idx, phase: 'feedback', learned: learnedNow });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [current, phase, idx, learnedNow, showMnemonic]
  );

  const reveal = useCallback(() => {
    completeRecall({ correct: 0, total: 0, hintsUsed: 0, durationMs: Date.now() - shownAtRef.current, selfRated: true });
  }, [completeRecall]);

  const grade = useCallback(
    async (g: FsrsGrade) => {
      if (!current || !revealed || saving) return;
      setSaving(true);
      try {
        const { stateRecord } = await recordMemoryCardReview(
          current.card,
          g,
          Date.now() - shownAtRef.current
        );
        setLiveStates((prev) => new Map(prev).set(current.card.id, stateRecord));
        setGradeCounts((prev) => ({ ...prev, [g]: prev[g] + 1 }));

        const learning = stateRecord.state === 1 || stateRecord.state === 3;
        const dueSoon = new Date(stateRecord.dueAt).getTime() - Date.now() <= REQUEUE_WINDOW_MS;
        if (learning && dueSoon && !params?.card) {
          setQueue((prev) => {
            if (!prev) return prev;
            const next = [...prev];
            const at = Math.min(next.length, idx + 1 + REQUEUE_GAP);
            next.splice(at, 0, { card: current.card, bucket: 'learning_due', repeat: true, relearn: g === 1 });
            return next;
          });
        }
        advance();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save this review');
      } finally {
        setSaving(false);
      }
    },
    [current, revealed, saving, advance, idx, params]
  );

  const togglePin = useCallback(async () => {
    if (!current) return;
    const rec = await toggleMemoryCardPinned(current.card);
    setLiveStates((prev) => new Map(prev).set(current.card.id, rec));
  }, [current]);

  const suspend = useCallback(async () => {
    if (!current) return;
    const rec = await toggleMemoryCardSuspended(current.card);
    setLiveStates((prev) => new Map(prev).set(current.card.id, rec));
    if (rec.suspended) {
      // Drop every remaining copy of this card from the session.
      setQueue((prev) =>
        prev ? prev.filter((q, i) => i <= idx || q.card.id !== current.card.id) : prev
      );
      advance();
    }
  }, [current, idx, advance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!current) return;
      if (e.key === ' ' || e.key === 'Enter') {
        // Let focused buttons (game choices, playback controls) handle their own activation.
        if (t?.tagName === 'BUTTON' || t?.tagName === 'A') return;
        if (phase === 'learn') {
          e.preventDefault();
          beginRecall();
        } else if (phase === 'recall' && recallMode?.kind === 'self') {
          e.preventDefault();
          reveal();
        } else if (phase === 'feedback' && suggested) {
          e.preventDefault();
          void grade(suggested);
        }
        return;
      }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        void grade(Number(e.key) as FsrsGrade);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'm' && phase === 'recall') setShowMnemonic(true);
      else if (k === 'p') void togglePin();
      else if (k === 's') void suspend();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, phase, revealed, recallMode, suggested, beginRecall, reveal, grade, togglePin, suspend]);

  /* ---------------------------------------------------------------- */
  /* Loading / empty / finished states                                */
  /* ---------------------------------------------------------------- */

  const hubHref = withBase('/memorize');

  if (!loaded || (!queue && !error)) {
    return <Centered>Building your review queue…</Centered>;
  }
  if (error) {
    return (
      <Centered>
        <p className="text-rose-500">{error}</p>
        <a href={hubHref} className={`${btnSecondary} mt-4`}>
          Back to Memorize
        </a>
      </Centered>
    );
  }

  if (queue && queue.length === 0) {
    return (
      <Centered>
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Nothing due here</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {params ? sessionTitle(params, domains) : 'This deck'} has no cards waiting right now.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a href={hubHref} className={btnSecondary}>
            <ArrowLeft className="h-4 w-4" /> Back to Memorize
          </a>
          {params && params.mode !== 'cram' && (
            <a
              href={withBase(
                `/memorize/session${buildMemorySessionQuery({
                  mode: 'cram',
                  domain: params.domain,
                  subdomain: params.subdomain,
                  type: params.type,
                  priority: params.priority,
                  limit: 20,
                })}`
              )}
              className={btnPrimary}
            >
              Practice anyway
            </a>
          )}
        </div>
      </Centered>
    );
  }

  if (finished && queue) {
    const total = gradeCounts[1] + gradeCounts[2] + gradeCounts[3] + gradeCounts[4];
    const passed = total - gradeCounts[1];
    const elapsed = (sessionEnd ?? Date.now()) - sessionStart;
    const nowIso = new Date().toISOString();
    const nextDue = Array.from(new Set(queue.map((q) => q.card.id)))
      .map((id) => liveStates.get(id))
      .filter((s): s is MemoryCardStateRecord => Boolean(s && !s.suspended && s.dueAt > nowIso))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
    return (
      <Centered wide>
        <Trophy className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">Session complete</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {params ? sessionTitle(params, domains) : ''}
        </p>
        <div className="mx-auto mt-6 grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Reviews" value={String(total)} />
          <Stat label="Recalled" value={total ? `${Math.round((passed / total) * 100)}%` : '—'} />
          <Stat
            label="Game score"
            value={gameScores.length ? `${Math.round(gameScores.reduce((a, b) => a + b, 0) / gameScores.length)}%` : '—'}
          />
          <Stat label="Time" value={formatDuration(elapsed)} />
        </div>
        <div className="mx-auto mt-4 flex max-w-lg overflow-hidden rounded-full text-[10px] font-semibold">
          {([1, 2, 3, 4] as FsrsGrade[]).map((g) =>
            gradeCounts[g] > 0 ? (
              <div
                key={g}
                className={`${['', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500'][g]} py-1 text-white`}
                style={{ flexGrow: gradeCounts[g] }}
                title={`${['', 'Again', 'Hard', 'Good', 'Easy'][g]}: ${gradeCounts[g]}`}
              >
                {gradeCounts[g]}
              </div>
            ) : null
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Again · Hard · Good · Easy</p>
        {nextDue && (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            Next card from this session comes back in{' '}
            <strong>{formatIntervalDiff(new Date(), new Date(nextDue.dueAt))}</strong>.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a href={hubHref} className={btnPrimary}>
            <ArrowLeft className="h-4 w-4" /> Back to Memorize
          </a>
          <button type="button" onClick={() => window.location.reload()} className={btnSecondary}>
            <RotateCcw className="h-4 w-4" /> Check for more due
          </button>
        </div>
      </Centered>
    );
  }

  if (!current || !queue || !params) return null;

  /* ---------------------------------------------------------------- */
  /* Active card                                                      */
  /* ---------------------------------------------------------------- */

  const card = current.card;
  const dm = domainMeta.get(card.domainId);
  const theme = domainTheme(dm?.color ?? 'emerald');
  const subName = dm?.subdomains.find((s) => s.subdomainId === card.subdomainId)?.name ?? card.subdomainName;
  const typeMeta = MEMORY_CARD_TYPE_META[card.cardType];
  const prioMeta = EXAM_PRIORITY_META[card.examPriority];
  const progressPct = Math.round((idx / queue.length) * 100);
  const remaining = queue.slice(idx);
  const remainingBy = (b: QueueBucket) => remaining.filter((q) => q.bucket === b).length;
  const r = currentState && currentState.state !== 0
    ? Math.round(computeCurrentRetrievability(currentState, new Date(), prefs.customWeights) * 100)
    : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-40 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pb-12">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <a
          href={hubHref}
          aria-label="Exit session"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X className="h-5 w-5" />
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="truncate font-semibold">{sessionTitle(params, domains)}</span>
            <span className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => saveFsrsPreferences({ interactiveOrderMode: !gamesEnabled })}
                title="Interactive recall games on/off"
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold ${
                  gamesEnabled
                    ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
                    : 'bg-slate-200/70 text-slate-500 dark:bg-slate-800'
                }`}
              >
                <Gamepad2 className="h-3 w-3" /> {gamesEnabled ? 'Games on' : 'Games off'}
              </button>
              <span className="font-mono">
                {idx + 1} / {queue.length}
              </span>
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-10 text-[11px] text-slate-400">
        {(['learning_due', 'exam_gap', 'review_due', 'new_card', 'custom_cram'] as QueueBucket[]).map((b) => {
          const n = remainingBy(b);
          return n > 0 ? (
            <span key={b}>
              {BUCKET_LABEL[b]} <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{n}</span>
            </span>
          ) : null;
        })}
      </div>

      {/* Card */}
      <article className="mt-5 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-7 dark:border-slate-800/80 dark:bg-slate-900/70">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`inline-flex min-w-0 items-center gap-1.5 font-semibold ${theme.text}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${theme.dot}`} />
            <span className="truncate">
              D{dm?.number ?? card.domainId.slice(4)} · {card.subdomainId} {subName}
            </span>
          </span>
          <span className={`rounded-md px-2 py-0.5 font-semibold ${typeMeta.badgeClass}`}>{typeMeta.shortLabel}</span>
          <span className={`rounded-md px-2 py-0.5 font-semibold ${prioMeta.badgeClass}`}>{prioMeta.label}</span>
          {currentState?.unlockedByExamGap && (
            <span
              title={currentState.gapBoostReason ?? undefined}
              className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-600 dark:text-rose-300"
            >
              <AlertTriangle className="h-3 w-3" /> Exam gap
            </span>
          )}
          {current.repeat && (
            <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">
              Again
            </span>
          )}
          {currentState?.pinned && <Pin className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label="Pinned" />}
        </div>
        {currentState?.unlockedByExamGap && currentState.gapBoostReason && (
          <p className="-mt-2 mb-4 text-[11px] text-rose-600/80 dark:text-rose-300/80">{currentState.gapBoostReason}</p>
        )}

        <CardStage
          key={idx}
          attemptKey={idx}
          card={card}
          pool={cards}
          phase={phase}
          result={result}
          gamesEnabled={gamesEnabled}
          learnedNow={learnedNow}
          showMnemonic={showMnemonic}
          onToggleMnemonic={() => setShowMnemonic(true)}
          onRecallComplete={completeRecall}
        />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3 text-[11px] text-slate-400 dark:border-slate-800/70">
          <span>
            {currentState && currentState.state !== 0
              ? `Reviewed ${currentState.reps}× · ${currentState.lapses} lapse${currentState.lapses === 1 ? '' : 's'} · stability ${
                  currentState.stability < 10 ? currentState.stability.toFixed(1) : Math.round(currentState.stability)
                }d · recall chance now ${r}%`
              : 'First time seeing this card'}
          </span>
          <span className="flex gap-1">
            <button
              type="button"
              onClick={() => void togglePin()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Pin className="h-3 w-3" /> {currentState?.pinned ? 'Unpin' : 'Pin'} <Kbd>P</Kbd>
            </button>
            <button
              type="button"
              onClick={() => void suspend()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <PauseCircle className="h-3 w-3" /> Suspend <Kbd>S</Kbd>
            </button>
          </span>
        </div>
      </article>

      {/* Action bar: fixed on phones (thumb reach), inline on larger screens */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-[var(--bg-canvas)]/95 px-4 pt-3 backdrop-blur-xl sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:backdrop-blur-none dark:border-slate-800/70">
        <div className="mx-auto max-w-3xl pb-3 sm:pb-0">
          {saveError && <p className="mb-2 text-center text-xs text-rose-500">{saveError}</p>}
          {phase === 'learn' && (
            <button
              type="button"
              onClick={beginRecall}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500"
            >
              <Gamepad2 className="h-4 w-4" /> Got it — test me <Kbd dark>Space</Kbd>
            </button>
          )}
          {phase === 'recall' && recallMode?.kind === 'self' && (
            <button type="button" onClick={reveal} className={`${btnPrimary} w-full py-3`}>
              Show answer <Kbd dark>Space</Kbd>
            </button>
          )}
          {phase === 'recall' && recallMode?.kind === 'game' && (
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Gamepad2 className="h-3.5 w-3.5 text-violet-500" /> {recallMode.label}
              </span>
              <button
                type="button"
                onClick={reveal}
                className="rounded-lg px-2 py-1.5 font-semibold hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                Skip game · show answer
              </button>
            </div>
          )}
          {phase === 'feedback' && (
            <>
              <div className="grid grid-cols-4 gap-2 pt-1.5">
                {([1, 2, 3, 4] as FsrsGrade[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    disabled={saving}
                    onClick={() => void grade(g)}
                    className={`relative flex flex-col items-center rounded-xl border px-1 py-2 text-sm font-semibold transition disabled:opacity-50 ${GRADE_STYLES[g]} ${
                      suggested === g
                        ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-[var(--bg-canvas)]'
                        : suggested
                          ? 'opacity-70'
                          : ''
                    }`}
                  >
                    {suggested === g && (
                      <span className="absolute -top-2.5 rounded-full bg-violet-600 px-1.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        Suggested
                      </span>
                    )}
                    <span>{previews?.[g].label}</span>
                    <span className="font-mono text-[11px] font-medium opacity-80">{previews?.[g].intervalLabel}</span>
                    <span className="mt-0.5 hidden font-mono text-[10px] opacity-50 sm:block">{g}</span>
                  </button>
                ))}
              </div>
              {!suggested && (
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  How well did you recall it? Be honest — the schedule depends on it.
                </p>
              )}
            </>
          )}
          <p className="mt-2 hidden text-center text-[11px] text-slate-400 sm:block">
            <Clock className="mr-1 inline h-3 w-3" />
            Space continue{suggested ? ' / accept suggestion' : ''} · 1–4 rate · M hint · P pin · S suspend
          </p>
        </div>
      </div>
    </div>
  );
}

function Centered({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto flex min-h-screen ${wide ? 'max-w-2xl' : 'max-w-md'} flex-col justify-center px-4 py-16 text-center text-sm text-slate-500`}>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-bold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}

function Kbd({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <kbd
      className={`hidden rounded px-1.5 py-0.5 font-mono text-[10px] sm:inline ${
        dark ? 'bg-slate-950/15 text-slate-900' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {children}
    </kbd>
  );
}
