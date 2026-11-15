import { useEffect, useMemo, useState } from 'react';
import { Globe2, Layers, Search, Shield, Sparkles } from 'lucide-react';
import type { CatalogData } from '../../lib/catalog';
import { useLearnerProgress } from '../../lib/storage/use-progress';
import { domainTheme } from '../../lib/ui/domain-theme';
import ExamBuilder from './ExamBuilder';
import { DomainCard, PresetExamCard, SubdomainRow } from './CatalogParts';
import { ModeToggle, card } from '../ui/primitives';
import { withBase } from '../../lib/paths';

type Tab = 'full' | 'domain' | 'subdomain';

const TABS: Array<{ id: Tab; label: string; Icon: typeof Globe2 }> = [
  { id: 'full', label: 'Full exam', Icon: Globe2 },
  { id: 'domain', label: 'Domains', Icon: Shield },
  { id: 'subdomain', label: 'Sub-domains', Icon: Layers },
];

export const FULL_EXAM_LENGTHS = [
  { value: 25, label: 'Quick check' },
  { value: 50, label: 'Half length' },
  { value: 100, label: 'CAT minimum' },
  { value: 150, label: 'CAT maximum' },
];

export default function ExamCenter({ catalog }: { catalog: CatalogData }) {
  const [tab, setTab] = useState<Tab>('full');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const progress = useLearnerProgress();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab') as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
    const d = params.get('domain');
    if (d) setDomainFilter(d);
  }, []);

  const selectTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url);
  };

  const overallSets = catalog.exams.filter((e) => e.examScope === 'overall');
  const setsByDomain = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of catalog.exams) {
      if (e.examScope === 'domain_full') m[e.domainId] = (m[e.domainId] ?? 0) + 1;
    }
    return m;
  }, [catalog.exams]);

  const q = query.trim().toLowerCase();
  const filteredDomains = catalog.domains
    .filter((d) => domainFilter === 'all' || d.domainId === domainFilter)
    .map((d) => ({
      ...d,
      subdomains: d.subdomains.filter((s) => {
        if (onlyAvailable && s.questionCount === 0) return false;
        if (!q) return true;
        return (
          s.subdomainId.startsWith(q) ||
          s.name.toLowerCase().includes(q) ||
          s.topics.some((t) => t.name.toLowerCase().includes(q))
        );
      }),
    }))
    .filter((d) => d.subdomains.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Exams</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Pick a scope, choose a length, and go. Every exam is drawn from the bank using the CISSP blueprint.
          </p>
        </div>
        <ModeToggle />
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Exam scope"
        className="mt-6 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_0] shadow-slate-200 [scrollbar-width:none] dark:shadow-slate-800"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => selectTab(id)}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 sm:px-4 text-sm font-medium transition ${
              tab === id
                ? 'border-emerald-500 text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* FULL CISSP ----------------------------------------------------------- */}
      {tab === 'full' && (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className={`${card} p-5 sm:p-6`}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Full CISSP practice exam</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              All 8 domains, weighted like the real exam. Choose how many questions you want.
            </p>
            <div className="mt-5">
              <ExamBuilder
                domains={catalog.domains}
                questionMeta={catalog.questionMeta}
                request={{ scope: 'overall' }}
                lengthOptions={FULL_EXAM_LENGTHS}
                defaultLength={100}
                planTitle="Questions per domain"
              />
            </div>
          </section>

          <aside className="space-y-4">
            <div className={`${card} p-5`}>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                How questions are chosen
              </h3>
              <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">Blueprint balance.</strong> Questions are split
                  across domains → sub-domains → topics by the official weights.
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">Difficulty mix.</strong> Items centre on
                  exam-level difficulty, like a CAT exam near the pass line.
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">Fresh items first.</strong> Unseen questions,
                  then ones you missed, then ones you already got right.
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">Mixed order.</strong> Domains are interleaved,
                  just like the live exam.
                </li>
              </ol>
            </div>
            {overallSets.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Fixed full-length sets</h3>
                {overallSets.map((e, i) => (
                  <PresetExamCard key={e.examId} exam={e} index={i} />
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* BY DOMAIN ------------------------------------------------------------ */}
      {tab === 'domain' && (
        <div className="mt-8">
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Start a quick auto-generated exam, or open a domain for fixed sets and custom lengths.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {catalog.domains.map((d) => (
              <DomainCard
                key={d.domainId}
                domain={d}
                mastery={progress.masteryMap[`domain:${d.domainId}`]}
                setCount={setsByDomain[d.domainId] ?? 0}
                variant="exam"
              />
            ))}
          </div>
        </div>
      )}

      {/* BY SUB-DOMAIN -------------------------------------------------------- */}
      {tab === 'subdomain' && (
        <div className="mt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sub-domains or topics (e.g. 7.6, Kerberos, BIA)"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-emerald-500"
              />
              Only with questions
            </label>
          </div>

          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setDomainFilter('all')}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                domainFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              All domains
            </button>
            {catalog.domains.map((d) => {
              const theme = domainTheme(d.color);
              const active = domainFilter === d.domainId;
              return (
                <button
                  key={d.domainId}
                  type="button"
                  onClick={() => setDomainFilter(d.domainId)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />D{d.number}
                  <span className="hidden md:inline">· {d.shortName}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-5">
            {filteredDomains.length === 0 && (
              <p className="py-12 text-center text-sm text-slate-500">No sub-domains match your search.</p>
            )}
            {filteredDomains.map((d) => {
              const theme = domainTheme(d.color);
              return (
                <section key={d.domainId} className={`${card} overflow-hidden`}>
                  <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800/70">
                    <a href={withBase(`/domains/${d.domainId}`)} className="flex min-w-0 items-center gap-2.5 hover:underline">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${theme.dot}`} />
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        Domain {d.number} · {d.name}
                      </span>
                    </a>
                    <span className="shrink-0 font-mono text-[11px] text-slate-400">{d.weightPercent}%</span>
                  </header>
                  <ul>
                    {d.subdomains.map((s) => (
                      <SubdomainRow
                        key={s.subdomainId}
                        sub={s}
                        mastery={progress.masteryMap[`subdomain:${s.subdomainId}`]}
                        topicMastery={progress.masteryMap}
                        presetSets={catalog.exams.filter(
                          (e) => e.examScope === 'subdomain' && e.subdomainId === s.subdomainId
                        )}
                        defaultOpen={Boolean(q)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
