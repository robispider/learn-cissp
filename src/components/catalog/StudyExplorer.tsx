import { useMemo, useState } from 'react';
import { ChevronDown, Lightbulb, Search, Zap } from 'lucide-react';
import type { CatalogData } from '../../lib/catalog';
import { buildGeneratedExamHref } from '../../lib/exam-engine/assembler';
import { useLearnerProgress } from '../../lib/storage/use-progress';
import { domainTheme } from '../../lib/ui/domain-theme';
import { MasteryPill, card, useExamMode } from '../ui/primitives';

export interface StudyTakeaway {
  subdomainId: string;
  topicId: string;
  text: string;
}

export default function StudyExplorer({
  catalog,
  takeaways,
}: {
  catalog: CatalogData;
  takeaways: StudyTakeaway[];
}) {
  const progress = useLearnerProgress();
  const [mode] = useExamMode();
  const [query, setQuery] = useState('');
  const [openSub, setOpenSub] = useState<string | null>(null);

  const takeawaysBySub = useMemo(() => {
    const m: Record<string, StudyTakeaway[]> = {};
    for (const t of takeaways) (m[t.subdomainId] ??= []).push(t);
    return m;
  }, [takeaways]);

  const q = query.trim().toLowerCase();
  const domains = catalog.domains
    .map((d) => ({
      ...d,
      subdomains: d.subdomains.filter(
        (s) =>
          !q ||
          s.subdomainId.startsWith(q) ||
          s.name.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.topics.some((t) => t.name.toLowerCase().includes(q)) ||
          (takeawaysBySub[s.subdomainId] ?? []).some((t) => t.text.toLowerCase().includes(q))
      ),
    }))
    .filter((d) => d.subdomains.length > 0);

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      {/* Domain index */}
      <nav aria-label="Domains" className="hidden lg:block">
        <ul className="sticky top-24 space-y-0.5">
          {catalog.domains.map((d) => {
            const theme = domainTheme(d.color);
            return (
              <li key={d.domainId}>
                <a
                  href={`#${d.domainId}`}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${theme.dot}`} />
                  <span className="truncate">
                    {d.number}. {d.shortName}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the CBK — topics, concepts, sub-domain numbers…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </label>

        {domains.length === 0 && <p className="py-16 text-center text-sm text-slate-500">Nothing matches “{query}”.</p>}

        <div className="mt-6 space-y-10">
          {domains.map((d) => {
            const theme = domainTheme(d.color);
            return (
              <section key={d.domainId} id={d.domainId} className="scroll-mt-24">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a href={`/domains/${d.domainId}`} className="group flex items-center gap-2.5">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-bold ${theme.soft} ${theme.text}`}>
                      {d.number}
                    </span>
                    <h2 className="text-base font-semibold text-slate-900 group-hover:underline dark:text-white">{d.name}</h2>
                  </a>
                  <span className="text-xs text-slate-400">
                    {d.weightPercent}% · {d.questionCount} questions
                  </span>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {d.subdomains.map((s) => {
                    const isOpen = openSub === s.subdomainId || Boolean(q);
                    const tk = takeawaysBySub[s.subdomainId] ?? [];
                    const drillLen = Math.min(10, s.questionCount);
                    return (
                      <article key={s.subdomainId} className={`${card} flex flex-col p-4`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-semibold text-slate-400">{s.subdomainId}</div>
                            <h3 className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">{s.name}</h3>
                          </div>
                          <MasteryPill record={progress.masteryMap[`subdomain:${s.subdomainId}`]} />
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{s.summary}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {s.topics.map((t) => (
                            <span
                              key={t.topicId}
                              title={t.name}
                              className="max-w-full truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {t.name.split('(')[0].trim()}
                            </span>
                          ))}
                        </div>

                        {tk.length > 0 && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => setOpenSub(isOpen && !q ? null : s.subdomainId)}
                              aria-expanded={isOpen}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
                            >
                              <Lightbulb className="h-3.5 w-3.5" />
                              {tk.length} key takeaway{tk.length > 1 ? 's' : ''}
                              <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? '' : '-rotate-90'}`} />
                            </button>
                            {isOpen && (
                              <ul className="mt-2 space-y-1.5">
                                {tk.map((t, i) => (
                                  <li
                                    key={i}
                                    className="rounded-lg border-l-2 border-amber-400 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300"
                                  >
                                    {t.text}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between pt-4 text-[11px] text-slate-400">
                          <span>{s.questionCount > 0 ? `${s.questionCount} questions` : 'No questions yet'}</span>
                          {s.questionCount > 0 && (
                            <a
                              href={buildGeneratedExamHref({ scope: 'subdomain', subdomainId: s.subdomainId, length: drillLen, mode })}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500 hover:text-slate-950 dark:text-emerald-400"
                            >
                              <Zap className="h-3.5 w-3.5" /> Drill {drillLen}
                            </a>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
