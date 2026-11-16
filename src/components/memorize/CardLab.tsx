/**
 * Card Lab — preview any memory card through Learn → Recall → Feedback without touching
 * your schedule. Use it to try the built-in visuals, the custom plugins, and to check a
 * new JSON card or plugin before it shows up in a real review.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Braces, Gamepad2, Puzzle, RotateCcw, Search } from 'lucide-react';
import { fetchMemoryCardsCatalog } from '../../lib/storage/memory-store';
import { MEMORY_CARD_TYPE_META, type CardModality, type MemoryCard } from '../../lib/types/memory';
import { withBase } from '../../lib/paths';
import CardStage, { recallModeFor, type StagePhase } from './cards/CardStage';
import { CARD_PLUGINS, MODALITY_META, resolveModality } from './cards/registry';
import { suggestGrade, type RecallResult } from './cards/types';

const GRADE_LABEL = ['', 'Again', 'Hard', 'Good', 'Easy'];

export default function CardLab() {
  const [cards, setCards] = useState<MemoryCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modality, setModality] = useState<CardModality | 'all' | 'custom'>('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<StagePhase>('learn');
  const [result, setResult] = useState<RecallResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [games, setGames] = useState(true);
  const [mnemonic, setMnemonic] = useState(false);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    fetchMemoryCardsCatalog()
      .then((c) => {
        setCards(c);
        const fromUrl = new URLSearchParams(window.location.search).get('card');
        const firstPlugin = c.find((x) => x.presentation?.plugin);
        setSelectedId(fromUrl && c.some((x) => x.id === fromUrl) ? fromUrl : (firstPlugin ?? c[0])?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load cards'));
  }, []);

  const filtered = useMemo(() => {
    if (!cards) return [];
    const needle = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (modality === 'custom' && !c.presentation?.plugin) return false;
      if (modality !== 'all' && modality !== 'custom' && resolveModality(c) !== modality) return false;
      if (!needle) return true;
      return `${c.title} ${c.id} ${c.keyTerms.join(' ')}`.toLowerCase().includes(needle);
    });
  }, [cards, modality, q]);

  const card = cards?.find((c) => c.id === selectedId) ?? null;

  const restart = (p: StagePhase = 'learn') => {
    setPhase(p);
    setResult(null);
    setMnemonic(false);
    setAttempt((a) => a + 1);
  };

  const select = (id: string) => {
    setSelectedId(id);
    setShowJson(false);
    restart('learn');
    const url = new URL(window.location.href);
    url.searchParams.set('card', id);
    window.history.replaceState(null, '', url);
  };

  const counts = useMemo(() => {
    const out = { all: 0, text: 0, visual: 0, animated: 0, custom: 0 };
    for (const c of cards ?? []) {
      out.all++;
      out[resolveModality(c)]++;
      if (c.presentation?.plugin) out.custom++;
    }
    return out;
  }, [cards]);

  if (error) return <p className="p-8 text-center text-sm text-rose-500">{error}</p>;
  if (!cards) return <p className="p-8 text-center text-sm text-slate-500">Loading cards…</p>;

  const suggestion = phase === 'feedback' ? suggestGrade(result, true) : null;
  const pluginUsage = (id: string) => cards.filter((c) => c.presentation?.plugin?.id === id);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <a href={withBase('/memorize')} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <ArrowLeft className="h-3.5 w-3.5" /> Memorize
          </a>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Card Lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Try any card through Learn → Recall → Check. Nothing here touches your review schedule.
          </p>
        </div>
      </header>

      {/* Plugin gallery */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Puzzle className="h-3.5 w-3.5" /> Custom card plugins
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.values(CARD_PLUGINS).map((p) => {
            const used = pluginUsage(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={!used.length}
                onClick={() => used[0] && select(used[0].id)}
                className={`rounded-2xl border bg-white p-3.5 text-left transition hover:border-violet-400/60 disabled:opacity-50 dark:bg-slate-900 ${
                  card?.presentation?.plugin?.id === p.id ? 'border-violet-500 ring-2 ring-violet-500/20' : 'border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${MODALITY_META[p.modality].badgeClass}`}>
                    {MODALITY_META[p.modality].label}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{p.description}</p>
                <div className="mt-2 font-mono text-[10px] text-slate-400">
                  "{p.id}" · used by {used.length} card{used.length === 1 ? '' : 's'}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Card picker */}
        <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search cards"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(['all', 'custom', 'animated', 'visual', 'text'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModality(m)}
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold capitalize ${
                  modality === m ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {m} <span className="opacity-60">{counts[m]}</span>
              </button>
            ))}
          </div>
          <ul className="max-h-[38vh] space-y-1 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 lg:max-h-[70vh] dark:border-slate-800 dark:bg-slate-900">
            {filtered.map((c) => {
              const m = resolveModality(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => select(c.id)}
                    className={`w-full rounded-xl px-2.5 py-2 text-left transition ${
                      c.id === selectedId ? 'bg-violet-500/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{c.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px]">
                      <span className="text-slate-400">D{c.domainId.slice(4)} · {c.subdomainId}</span>
                      <span className={`rounded px-1 font-semibold ${MEMORY_CARD_TYPE_META[c.cardType].badgeClass}`}>
                        {MEMORY_CARD_TYPE_META[c.cardType].shortLabel}
                      </span>
                      <span className={`rounded px-1 font-semibold ${MODALITY_META[m].badgeClass}`}>{MODALITY_META[m].label}</span>
                      {c.presentation?.plugin && <Puzzle className="h-3 w-3 text-violet-500" />}
                    </div>
                  </button>
                </li>
              );
            })}
            {!filtered.length && <li className="p-3 text-center text-xs text-slate-400">No cards match.</li>}
          </ul>
        </aside>

        {/* Preview */}
        {card && (
          <section className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['learn', 'recall', 'feedback'] as StagePhase[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={p === 'feedback' && !result}
                  onClick={() => (p === 'feedback' ? setPhase(p) : restart(p))}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize disabled:opacity-40 ${
                    phase === p ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {p === 'feedback' ? 'Check' : p}
                </button>
              ))}
              <button type="button" onClick={() => restart()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <RotateCcw className="h-3.5 w-3.5" /> Restart
              </button>
              <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={games} onChange={(e) => { setGames(e.target.checked); restart(phase === 'learn' ? 'learn' : 'recall'); }} className="accent-violet-500" />
                <Gamepad2 className="h-3.5 w-3.5" /> Games
              </label>
              <button
                type="button"
                onClick={() => setShowJson((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${showJson ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <Braces className="h-3.5 w-3.5" /> JSON
              </button>
            </div>

            {showJson && (
              <pre className="max-h-80 overflow-auto rounded-2xl border border-slate-200/80 bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200 dark:border-slate-800">
                {JSON.stringify(card, null, 2)}
              </pre>
            )}

            <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-7 dark:border-slate-800/80 dark:bg-slate-900/70">
              <CardStage
                key={`${card.id}-${attempt}`}
                attemptKey={attempt}
                card={card}
                pool={cards}
                phase={phase}
                result={result}
                gamesEnabled={games}
                learnedNow
                showMnemonic={mnemonic}
                onToggleMnemonic={() => setMnemonic(true)}
                onRecallComplete={(r) => {
                  setResult(r);
                  setPhase('feedback');
                }}
              />
            </article>

            <div className="rounded-2xl border border-dashed border-slate-300/80 p-3 text-xs text-slate-500 dark:border-slate-700">
              {phase === 'learn' && (
                <button type="button" onClick={() => setPhase('recall')} className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-500">
                  Got it — test me
                </button>
              )}
              {phase === 'recall' && <>Recall mode: <strong>{recallModeFor(card, games).label}</strong></>}
              {phase === 'feedback' && (
                <>
                  In a real session this would suggest{' '}
                  <strong className="text-violet-600 dark:text-violet-300">{suggestion ? GRADE_LABEL[suggestion] : 'no grade (self-rated)'}</strong>. The Lab never
                  saves a review.
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
