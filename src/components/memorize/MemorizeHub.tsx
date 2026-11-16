import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  Clock,
  Cpu,
  Filter,
  FlaskConical,
  Flame,
  Layers,
  PauseCircle,
  Pin,
  PlayCircle,
  RotateCcw,
  Star,
  Target,
  Zap,
} from 'lucide-react';
import {
  RETENTION_PRESETS,
  computeCurrentRetrievability,
  saveFsrsPreferences,
  simulateGoodReviewStabilities,
  formatIntervalDiff,
} from '../../lib/memorization/fsrs-engine';
import {
  buildRetentionForecast,
  buildStudyQueue,
  computeDomainMemorySummaries,
} from '../../lib/memorization/queue-builder';
import {
  buildMemorySessionQuery,
  useMemoryData,
} from '../../lib/memorization/use-memory-data';
import {
  computeMemoryStreakAndStats,
  toggleMemoryCardPinned,
  toggleMemoryCardSuspended,
} from '../../lib/storage/memory-store';
import {
  EXAM_PRIORITY_META,
  MEMORY_CARD_TYPE_META,
  type ExamPriority,
  type MemoryCard,
  type MemoryCardStateRecord,
  type MemoryCardType,
  type MemoryDomainMeta,
  type RetentionPreset,
} from '../../lib/types/memory';
import { domainTheme } from '../../lib/ui/domain-theme';
import { withBase } from '../../lib/paths';
import { btnPrimary, btnSecondary, card as cardCls } from '../ui/primitives';
import ForgettingCurveChart, { type CurveSeries } from './ForgettingCurveChart';
import RetentionForecastChart from './RetentionForecastChart';
import type { OptimizerResultMessage } from '../../lib/memorization/optimizer.worker';

interface Props {
  domains: MemoryDomainMeta[];
}

const OPTIMIZER_MIN_LOGS = 400;
const NEW_LIMIT_OPTIONS = [5, 10, 15, 20, 30, 50];
const ORDINALS = ['After 1st review', 'After 2nd', 'After 3rd', 'After 4th', 'After 5th'];

function sessionHref(opts: Parameters<typeof buildMemorySessionQuery>[0]): string {
  return withBase(`/memorize/session${buildMemorySessionQuery(opts)}`);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function CardStateChip({
  st,
  now,
  weights,
}: {
  st: MemoryCardStateRecord | undefined;
  now: Date;
  weights?: readonly number[] | null;
}) {
  if (st?.suspended) {
    return (
      <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
        Suspended
      </span>
    );
  }
  if (!st || st.state === 0) {
    return st?.unlockedByExamGap ? (
      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
        New · exam gap
      </span>
    ) : (
      <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
        New
      </span>
    );
  }
  const due = new Date(st.dueAt);
  const r = Math.round(computeCurrentRetrievability(st, now, weights) * 100);
  const isDue = due <= now;
  const learning = st.state === 1 || st.state === 3;
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isDue
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
          : learning
            ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400'
            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      }`}
    >
      {isDue ? 'Due now' : `${learning ? 'Learning' : 'Next'} in ${formatIntervalDiff(now, due)}`} · R {r}%
    </span>
  );
}

export default function MemorizeHub({ domains }: Props) {
  const data = useMemoryData();
  const { cards, stateMap, logs, masteryMap, prefs, loaded, error, reload } = data;
  const now = useMemo(() => new Date(), [stateMap, logs]);

  const [domainFilter, setDomainFilter] = useState('all');
  const [subdomainFilter, setSubdomainFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | MemoryCardType>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | ExamPriority>('all');
  const [listLimit, setListLimit] = useState(25);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizerMsg, setOptimizerMsg] = useState<string | null>(null);

  const summary = useMemo(
    () => buildStudyQueue(cards, stateMap, masteryMap, prefs, { mode: 'smart' }, now),
    [cards, stateMap, masteryMap, prefs, now]
  );
  const domainSummaries = useMemo(
    () => computeDomainMemorySummaries(cards, stateMap, prefs, now),
    [cards, stateMap, prefs, now]
  );
  const forecast = useMemo(() => buildRetentionForecast(cards, stateMap, 30, now), [cards, stateMap, now]);
  const stats = useMemo(() => computeMemoryStreakAndStats(logs, now), [logs, now]);

  const pinnedCount = useMemo(
    () => Array.from(stateMap.values()).filter((s) => s.pinned && !s.suspended).length,
    [stateMap]
  );

  const curveSeries = useMemo<CurveSeries[]>(() => {
    const sims = simulateGoodReviewStabilities(prefs, 4);
    const series: CurveSeries[] = sims.map((s, i) => ({ label: ORDINALS[i], stability: s }));
    const reviewed = Array.from(stateMap.values()).filter((s) => s.state === 2 && !s.suspended);
    if (reviewed.length > 0) {
      series.push({
        label: `Your median card (${reviewed.length} in review)`,
        stability: median(reviewed.map((s) => s.stability)),
        emphasis: true,
      });
    }
    return series;
  }, [prefs, stateMap]);

  const domainMeta = useMemo(() => new Map(domains.map((d) => [d.domainId, d])), [domains]);
  const subdomainOptions = useMemo(
    () => (domainFilter === 'all' ? [] : domainMeta.get(domainFilter)?.subdomains ?? []),
    [domainFilter, domainMeta]
  );

  const filteredCards = useMemo(
    () =>
      cards.filter(
        (c) =>
          (domainFilter === 'all' || c.domainId === domainFilter) &&
          (subdomainFilter === 'all' || c.subdomainId === subdomainFilter) &&
          (typeFilter === 'all' || c.cardType === typeFilter) &&
          (priorityFilter === 'all' || c.examPriority === priorityFilter)
      ),
    [cards, domainFilter, subdomainFilter, typeFilter, priorityFilter]
  );
  const filteredDue = useMemo(
    () =>
      buildStudyQueue(
        cards,
        stateMap,
        masteryMap,
        prefs,
        {
          mode: 'smart',
          domainId: domainFilter,
          subdomainId: subdomainFilter,
          cardType: typeFilter === 'all' ? undefined : typeFilter,
          examPriority: priorityFilter === 'all' ? undefined : priorityFilter,
        },
        now
      ).totalDueToday,
    [cards, stateMap, masteryMap, prefs, domainFilter, subdomainFilter, typeFilter, priorityFilter, now]
  );

  const deckQuery = {
    domain: domainFilter,
    subdomain: subdomainFilter,
    type: typeFilter,
    priority: priorityFilter,
  };

  const handleToggle = async (c: MemoryCard, kind: 'pin' | 'suspend') => {
    if (kind === 'pin') await toggleMemoryCardPinned(c);
    else await toggleMemoryCardSuspended(c);
    await reload();
  };

  const runOptimizer = async () => {
    setOptimizing(true);
    setOptimizerMsg(null);
    try {
      const worker = new Worker(
        new URL('../../lib/memorization/optimizer.worker.ts', import.meta.url),
        { type: 'module' }
      );
      const res = await new Promise<OptimizerResultMessage>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<OptimizerResultMessage>) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message || 'Optimizer failed'));
        worker.postMessage({ logs, initialWeights: prefs.customWeights });
      });
      worker.terminate();
      if (res.optimizedLogLoss < res.initialLogLoss) {
        saveFsrsPreferences({
          customWeights: res.weights,
          lastOptimizedAt: new Date().toISOString(),
          lastOptimizationLogLoss: res.optimizedLogLoss,
        });
        setOptimizerMsg(
          `Fitted on ${res.sampleCount} reviews. Log loss improved from ${res.initialLogLoss} to ${res.optimizedLogLoss}.`
        );
      } else {
        setOptimizerMsg(
          `No improvement over the current model (log loss ${res.initialLogLoss}). Kept existing weights.`
        );
      }
      await reload();
    } catch (err) {
      setOptimizerMsg(err instanceof Error ? err.message : 'Optimizer failed');
    } finally {
      setOptimizing(false);
    }
  };

  if (!loaded) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-slate-500 sm:px-6">
        Loading your memory deck…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <p className="text-sm text-rose-500">{error}</p>
        <button type="button" onClick={() => void reload()} className={`${btnSecondary} mt-4`}>
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  const totalDue = summary.totalDueToday;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      {/* ================================================================ */}
      {/* HEADER + READINESS STRIP                                          */}
      {/* ================================================================ */}
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          <BrainCircuit className="h-4 w-4" /> Spaced repetition
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          Memorize
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          {cards.length} cards of contrasts, sequences, formulas and manager rules. Each card comes back just
          before you would forget it, and topics you miss on exams jump the queue.
        </p>
      </div>

      <section className={`${cardCls} p-4 sm:p-6`}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Due today"
            value={String(totalDue)}
            hint={`${summary.learningDueCount} learning · ${summary.examGapCount} gap · ${summary.reviewDueCount} review · ${summary.newQueuedCount} new`}
          />
          <Kpi
            label="Estimated time"
            value={totalDue ? `${summary.estimatedMinutes}m` : '—'}
            hint="About 18 seconds a card"
            Icon={Clock}
          />
          <Kpi
            label="Streak"
            value={`${stats.streakDays}d`}
            hint={`${stats.reviewedTodayCount} reviewed today`}
            Icon={Flame}
          />
          <Kpi
            label="Recall rate"
            value={stats.retentionSuccessRatePercent === null ? '—' : `${stats.retentionSuccessRatePercent}%`}
            hint={
              summary.overallRetrievabilityPercent === null
                ? `${stats.totalReviewsCount} reviews logged`
                : `Average memory strength now ${summary.overallRetrievabilityPercent}%`
            }
            Icon={Target}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href={sessionHref({ mode: 'smart' })}
            aria-disabled={totalDue === 0}
            className={`${btnPrimary} ${totalDue === 0 ? 'pointer-events-none opacity-40' : ''}`}
          >
            <PlayCircle className="h-4 w-4" />
            {totalDue ? `Start daily review (${totalDue} cards)` : 'All caught up for today'}
          </a>
          {pinnedCount > 0 && (
            <a href={sessionHref({ mode: 'pinned' })} className={btnSecondary}>
              <Star className="h-4 w-4 text-amber-500" /> Pinned cram ({pinnedCount})
            </a>
          )}
          {totalDue === 0 && cards.length > 0 && (
            <a href={sessionHref({ mode: 'cram', limit: 20 })} className={btnSecondary}>
              <Zap className="h-4 w-4" /> Extra practice (20 weakest)
            </a>
          )}
          <a href={withBase('/memorize/lab')} className={btnSecondary} title="Preview visual, animated and custom cards">
            <FlaskConical className="h-4 w-4 text-violet-500" /> Card Lab
          </a>
        </div>
      </section>

      {summary.examGapCount > 0 && (
        <a
          href={sessionHref({ mode: 'gap' })}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 transition hover:bg-rose-500/10"
        >
          <span className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <span>
              <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                {summary.examGapCount} card{summary.examGapCount === 1 ? '' : 's'} queued from your exam mistakes
              </span>
              <span className="block text-xs text-slate-600 dark:text-slate-400">
                Wrong answers, confident misses and lucky guesses unlocked these. They stay flagged until you
                recall them as Good or Easy.
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-rose-600 dark:text-rose-400">
            Practice now →
          </span>
        </a>
      )}

      {/* ================================================================ */}
      {/* SETTINGS                                                          */}
      {/* ================================================================ */}
      <section className={`${cardCls} grid grid-cols-1 gap-5 p-4 sm:p-6 md:grid-cols-3`}>
        <div className="md:col-span-2">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Target retention</div>
          <div
            role="radiogroup"
            aria-label="Target retention"
            className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            {(Object.keys(RETENTION_PRESETS) as RetentionPreset[]).map((key) => {
              const p = RETENTION_PRESETS[key];
              const active = prefs.preset === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => saveFsrsPreferences({ preset: key })}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? 'border-emerald-500/60 bg-emerald-500/10'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{p.label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    {p.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">New cards per day</span>
            <select
              value={prefs.dailyNewLimit}
              onChange={(e) => saveFsrsPreferences({ dailyNewLimit: Number(e.target.value) })}
              className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {NEW_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={prefs.interactiveOrderMode}
              onChange={(e) => saveFsrsPreferences({ interactiveOrderMode: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-emerald-500"
            />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold">Interactive recall games</span> (sort, order, fill-in, match) instead of plain flip cards
            </span>
          </label>
        </div>
      </section>

      {/* ================================================================ */}
      {/* DOMAIN HEATMAP                                                    */}
      {/* ================================================================ */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">By domain</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          How much of each domain you have started, and how well it is holding.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {domains.map((d) => {
            const s = domainSummaries[d.domainId];
            const th = domainTheme(d.color);
            const total = s?.totalCards ?? 0;
            const seg = (n: number) => `${total ? (n / total) * 100 : 0}%`;
            return (
              <div key={d.domainId} className={`${cardCls} flex flex-col p-4`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${th.dot}`} />
                  <span className="font-mono text-[11px] font-semibold text-slate-400">D{d.number}</span>
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {d.shortName}
                  </span>
                </div>
                {total === 0 ? (
                  <p className="mt-3 text-xs text-slate-400">No cards yet</p>
                ) : (
                  <>
                    <div
                      className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800"
                      title={`${s.newCount} new · ${s.learningCount} learning · ${s.youngReviewCount} young · ${s.matureReviewCount} mature`}
                    >
                      <div className="bg-emerald-500" style={{ width: seg(s.matureReviewCount) }} />
                      <div className="bg-sky-500" style={{ width: seg(s.youngReviewCount) }} />
                      <div className="bg-amber-500" style={{ width: seg(s.learningCount) }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        {total - s.newCount}/{total} started
                      </span>
                      <span className="font-mono">
                        {s.averageRetrievabilityPercent === null ? 'R —' : `R ${Math.round(s.averageRetrievabilityPercent)}%`}
                      </span>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <span
                        className={`text-[11px] font-semibold ${
                          s.dueNowCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                        }`}
                      >
                        {s.dueNowCount} due · {s.newCount} new{s.examGapCount > 0 ? ` · ${s.examGapCount} gap` : ''}
                      </span>
                      <a
                        href={sessionHref({ mode: 'smart', domain: d.domainId })}
                        className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500 hover:text-slate-950 dark:text-emerald-400"
                      >
                        Study
                      </a>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Mature (stable 21+ days)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-500" /> Young review
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Learning
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-700" /> New
          </span>
        </div>
      </section>

      {/* ================================================================ */}
      {/* CHARTS                                                            */}
      {/* ================================================================ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RetentionForecastChart days={forecast} dailyNewLimit={prefs.dailyNewLimit} />
        <ForgettingCurveChart
          series={curveSeries}
          requestRetention={prefs.requestRetention}
          weights={prefs.customWeights}
        />
      </section>

      {/* ================================================================ */}
      {/* DECK BROWSER                                                      */}
      {/* ================================================================ */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Deck browser</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Filter the deck and study just that slice. Pin cards for a quick cram, or suspend ones you have nailed.
        </p>

        <div className={`${cardCls} mt-4 p-4 sm:p-5`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Domain"
              value={domainFilter}
              onChange={(v) => {
                setDomainFilter(v);
                setSubdomainFilter('all');
                setListLimit(25);
              }}
              options={[
                { value: 'all', label: 'All domains' },
                ...domains.map((d) => ({ value: d.domainId, label: `D${d.number} · ${d.shortName}` })),
              ]}
            />
            <FilterSelect
              label="Sub-domain"
              value={subdomainFilter}
              disabled={domainFilter === 'all'}
              onChange={(v) => {
                setSubdomainFilter(v);
                setListLimit(25);
              }}
              options={[
                { value: 'all', label: domainFilter === 'all' ? 'Pick a domain first' : 'All sub-domains' },
                ...subdomainOptions.map((s) => ({ value: s.subdomainId, label: `${s.subdomainId} ${s.name}` })),
              ]}
            />
            <FilterSelect
              label="Card type"
              value={typeFilter}
              onChange={(v) => {
                setTypeFilter(v as 'all' | MemoryCardType);
                setListLimit(25);
              }}
              options={[
                { value: 'all', label: 'All types' },
                ...(Object.keys(MEMORY_CARD_TYPE_META) as MemoryCardType[]).map((t) => ({
                  value: t,
                  label: MEMORY_CARD_TYPE_META[t].label,
                })),
              ]}
            />
            <FilterSelect
              label="Priority"
              value={priorityFilter}
              onChange={(v) => {
                setPriorityFilter(v as 'all' | ExamPriority);
                setListLimit(25);
              }}
              options={[
                { value: 'all', label: 'All priorities' },
                ...(Object.keys(EXAM_PRIORITY_META) as ExamPriority[]).map((p) => ({
                  value: p,
                  label: EXAM_PRIORITY_META[p].label,
                })),
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-4 dark:border-slate-800/70">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Filter className="h-3.5 w-3.5" />
              {filteredCards.length} card{filteredCards.length === 1 ? '' : 's'} · {filteredDue} due or new today
            </span>
            <div className="flex flex-wrap gap-2">
              <a
                href={sessionHref({ mode: 'smart', ...deckQuery })}
                aria-disabled={filteredDue === 0}
                className={`${btnPrimary} ${filteredDue === 0 ? 'pointer-events-none opacity-40' : ''}`}
              >
                <PlayCircle className="h-4 w-4" /> Study due ({filteredDue})
              </a>
              <a
                href={sessionHref({ mode: 'cram', ...deckQuery })}
                aria-disabled={filteredCards.length === 0}
                className={`${btnSecondary} ${filteredCards.length === 0 ? 'pointer-events-none opacity-40' : ''}`}
              >
                <Layers className="h-4 w-4" /> Cram all ({filteredCards.length})
              </a>
            </div>
          </div>

          <ul className="mt-4 divide-y divide-slate-200/70 dark:divide-slate-800/70">
            {filteredCards.slice(0, listLimit).map((c) => {
              const st = stateMap.get(c.id);
              const meta = MEMORY_CARD_TYPE_META[c.cardType];
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}>
                    {meta.shortLabel}
                  </span>
                  <a
                    href={sessionHref({ card: c.id })}
                    className="min-w-0 flex-1 basis-48 truncate text-sm text-slate-800 hover:text-emerald-600 dark:text-slate-200 dark:hover:text-emerald-400"
                    title={c.title}
                  >
                    <span className="mr-1.5 font-mono text-[11px] text-slate-400">{c.subdomainId}</span>
                    {c.title}
                  </a>
                  <CardStateChip st={st} now={now} weights={prefs.customWeights} />
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => void handleToggle(c, 'pin')}
                      title={st?.pinned ? 'Unpin' : 'Pin for cram'}
                      aria-pressed={Boolean(st?.pinned)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800"
                    >
                      <Pin className={`h-3.5 w-3.5 ${st?.pinned ? 'fill-amber-400 text-amber-500' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggle(c, 'suspend')}
                      title={st?.suspended ? 'Unsuspend' : 'Suspend (hide from reviews)'}
                      aria-pressed={Boolean(st?.suspended)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <PauseCircle className={`h-3.5 w-3.5 ${st?.suspended ? 'text-slate-700 dark:text-slate-200' : ''}`} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {filteredCards.length > listLimit && (
            <button
              type="button"
              onClick={() => setListLimit((n) => n + 50)}
              className="mt-3 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Show more ({filteredCards.length - listLimit} hidden)
            </button>
          )}
          {filteredCards.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">No cards match these filters.</p>
          )}
        </div>
      </section>

      {/* ================================================================ */}
      {/* OPTIMIZER                                                         */}
      {/* ================================================================ */}
      <section className={`${cardCls} flex flex-wrap items-start justify-between gap-4 p-4 sm:p-6`}>
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Cpu className="h-4 w-4 text-indigo-500" /> Personalize the memory model
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            After {OPTIMIZER_MIN_LOGS} reviews, LearnCISSP can tune the forgetting curve to your own recall history.
            It runs in a background thread on this device and nothing is uploaded.{' '}
            {prefs.customWeights
              ? `Personalized weights active${
                  prefs.lastOptimizedAt ? ` since ${new Date(prefs.lastOptimizedAt).toLocaleDateString()}` : ''
                }.`
              : 'Currently using the default FSRS-6 weights.'}
          </p>
          <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${Math.min(100, (logs.length / OPTIMIZER_MIN_LOGS) * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {logs.length} / {OPTIMIZER_MIN_LOGS} reviews logged
          </div>
          {optimizerMsg && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{optimizerMsg}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={logs.length < OPTIMIZER_MIN_LOGS || optimizing}
            onClick={() => void runOptimizer()}
            className={btnSecondary + ' disabled:cursor-not-allowed disabled:opacity-40'}
          >
            <Cpu className="h-4 w-4" /> {optimizing ? 'Optimizing…' : 'Optimize my model'}
          </button>
          {prefs.customWeights && (
            <button
              type="button"
              onClick={() => {
                saveFsrsPreferences({ customWeights: null, lastOptimizedAt: null, lastOptimizationLogLoss: null });
                setOptimizerMsg('Reset to default FSRS-6 weights.');
              }}
              className={btnSecondary}
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  Icon,
}: {
  label: string;
  value: string;
  hint: string;
  Icon?: typeof Clock;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{hint}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 block w-full truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
