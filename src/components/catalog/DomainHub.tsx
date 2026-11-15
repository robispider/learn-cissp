import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { CatalogData } from '../../lib/catalog';
import { useLearnerProgress } from '../../lib/storage/use-progress';
import { domainTheme } from '../../lib/ui/domain-theme';
import ExamBuilder from './ExamBuilder';
import { PresetExamCard, SubdomainRow } from './CatalogParts';
import { ModeToggle, ProgressRing, SectionHeader, card } from '../ui/primitives';

const DOMAIN_EXAM_LENGTHS = [
  { value: 15, label: 'Short' },
  { value: 25, label: 'Standard' },
  { value: 50, label: 'Long' },
  { value: 100, label: 'Marathon' },
];

export default function DomainHub({ catalog, domainId }: { catalog: CatalogData; domainId: string }) {
  const progress = useLearnerProgress();
  const idx = catalog.domains.findIndex((d) => d.domainId === domainId);
  const domain = catalog.domains[idx];
  if (!domain) return null;
  const prev = catalog.domains[idx - 1];
  const next = catalog.domains[idx + 1];
  const theme = domainTheme(domain.color);
  const mastery = progress.masteryMap[`domain:${domainId}`];
  const sets = catalog.exams.filter((e) => e.examScope === 'domain_full' && e.domainId === domainId);
  const available = domain.subdomains.filter((s) => s.questionCount > 0).length;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <nav className="flex items-center justify-between text-sm">
        <a href="/exams?tab=domain" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> All domains
        </a>
        <div className="flex gap-1">
          {prev && (
            <a href={`/domains/${prev.domainId}`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              ← D{prev.number}
            </a>
          )}
          {next && (
            <a href={`/domains/${next.domainId}`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              D{next.number} →
            </a>
          )}
        </div>
      </nav>

      {/* Header */}
      <header className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.soft} ${theme.text}`}>
            Domain {domain.number} · {domain.weightPercent}% of the exam
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">{domain.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{domain.tagline}</p>
          <p className="mt-3 text-xs text-slate-400">
            {domain.questionCount} questions · {domain.subdomains.length} sub-domains ({available} with questions) ·{' '}
            {sets.length} fixed set{sets.length === 1 ? '' : 's'}
          </p>
        </div>
        <ProgressRing percent={mastery ? mastery.recentWeightedScore : null} label="mastery" size={96} />
      </header>

      {/* Exams */}
      <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={`${card} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Auto-generated domain exam</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Fresh draw, balanced across sub-domains.</p>
            </div>
            <ModeToggle />
          </div>
          <div className="mt-5">
            <ExamBuilder
              domains={catalog.domains}
              questionMeta={catalog.questionMeta}
              request={{ scope: 'domain', domainId }}
              lengthOptions={DOMAIN_EXAM_LENGTHS}
              defaultLength={25}
              planTitle="Questions per sub-domain"
            />
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Fixed sets</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Curated question sets — same questions every attempt.</p>
          {sets.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sets.map((e, i) => (
                <PresetExamCard key={e.examId} exam={e} index={i} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              No fixed sets for this domain yet.
            </div>
          )}
        </div>
      </section>

      {/* Sub-domains */}
      <section className="mt-12">
        <SectionHeader title="Sub-domains" subtitle="Expand to see topics, or drill a sub-domain directly." />
        <ul className={`${card} mt-4 overflow-hidden`}>
          {domain.subdomains.map((s) => (
            <SubdomainRow
              key={s.subdomainId}
              sub={s}
              mastery={progress.masteryMap[`subdomain:${s.subdomainId}`]}
              topicMastery={progress.masteryMap}
              presetSets={catalog.exams.filter((e) => e.examScope === 'subdomain' && e.subdomainId === s.subdomainId)}
            />
          ))}
        </ul>
      </section>

      {next && (
        <a
          href={`/domains/${next.domainId}`}
          className={`${card} mt-10 flex items-center justify-between p-4 transition hover:border-emerald-500/50`}
        >
          <span className="text-sm text-slate-500">
            Next: <strong className="text-slate-900 dark:text-white">Domain {next.number} · {next.name}</strong>
          </span>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </a>
      )}
    </div>
  );
}
