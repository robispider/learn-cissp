import { ArrowRight, BookOpenText, Globe2, Layers, Play, Shield, Target } from 'lucide-react';
import type { CatalogData } from '../../lib/catalog';
import { buildGeneratedExamHref, resumeExamHref } from '../../lib/exam-engine/assembler';
import { useLearnerProgress, weakSubdomainWeights } from '../../lib/storage/use-progress';
import { DomainCard } from './CatalogParts';
import { ProgressRing, SectionHeader, btnPrimary, btnSecondary, card, useExamMode } from '../ui/primitives';

export default function HomeDashboard({ catalog }: { catalog: CatalogData }) {
  const progress = useLearnerProgress();
  const [mode] = useExamMode();

  const subdomainCount = catalog.domains.reduce((n, d) => n + d.subdomains.length, 0);
  const presetCount = catalog.exams.length;
  const setsByDomain: Record<string, number> = {};
  for (const e of catalog.exams) {
    if (e.examScope === 'domain_full') setsByDomain[e.domainId] = (setsByDomain[e.domainId] ?? 0) + 1;
  }

  // Blueprint-weighted readiness across tested domains.
  let wSum = 0;
  let scoreSum = 0;
  for (const d of catalog.domains) {
    const m = progress.masteryMap[`domain:${d.domainId}`];
    if (m && m.totalAttempts > 0) {
      wSum += d.weightPercent;
      scoreSum += d.weightPercent * m.recentWeightedScore;
    }
  }
  const readiness = wSum > 0 ? scoreSum / wSum : null;
  const weakWeights = weakSubdomainWeights(progress.masteryMap);
  const weakIds = Object.entries(weakWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const recent = progress.completed.slice(0, 3);
  const inProgress = progress.sessions.find((s) => s.status === 'in_progress' || s.status === 'paused');

  const entries = [
    {
      href: '/exams?tab=full',
      Icon: Globe2,
      title: 'Full CISSP exam',
      body: 'All 8 domains, weighted like the real exam. 25 to 150 questions.',
      meta: 'Blueprint-balanced',
    },
    {
      href: '/exams?tab=domain',
      Icon: Shield,
      title: 'Domain exams',
      body: 'Focus on one domain with fixed sets or a fresh random draw.',
      meta: `8 domains · ${presetCount} fixed sets`,
    },
    {
      href: '/exams?tab=subdomain',
      Icon: Layers,
      title: 'Sub-domain drills',
      body: 'Short, targeted drills on a single sub-domain and its topics.',
      meta: `${subdomainCount} sub-domains`,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      {/* Hero */}
      <section className="grid items-center gap-8 pb-10 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">CISSP practice, without the noise</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            Study smarter.
            <br />
            <span className="text-slate-400 dark:text-slate-500">Know exactly what to fix.</span>
          </h1>
          <p className="mt-4 max-w-lg text-base text-slate-600 dark:text-slate-400">
            Realistic, blueprint-weighted exams with explanations for every option and a clear picture of your gaps.
            Everything stays in your browser.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href={buildGeneratedExamHref({ scope: 'overall', length: 25, mode })} className={btnPrimary}>
              <Play className="h-4 w-4 fill-current" />
              Quick 25-question exam
            </a>
            <a href="/exams" className={btnSecondary}>
              All exams <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className={`${card} p-5`}>
          <div className="flex items-center gap-5">
            <ProgressRing percent={readiness} label="readiness" size={96} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {readiness === null
                  ? 'No results yet'
                  : readiness >= 85
                    ? 'Exam-ready range'
                    : readiness >= 70
                      ? 'Above the pass line'
                      : 'Building up'}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {readiness === null
                  ? 'Finish any exam to see your readiness and gaps.'
                  : `${progress.answeredCount} answers · ${Math.round(wSum)}% of the blueprint tested`}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            {inProgress ? (
              <a
                href={resumeExamHref(inProgress.examId, inProgress.sessionId)}
                className="flex items-center justify-between gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-400"
              >
                <span className="truncate">Resume: {inProgress.examTitle}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </a>
            ) : weakIds.length > 0 ? (
              <a
                href={buildGeneratedExamHref({ scope: 'weak', length: 15, mode })}
                className="flex items-center justify-between gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-500/20 dark:text-rose-400"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  Practice weak areas ({weakIds.slice(0, 3).join(', ')}
                  {weakIds.length > 3 ? '…' : ''})
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </a>
            ) : (
              <a
                href="/study"
                className="flex items-center justify-between gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <span className="inline-flex items-center gap-1.5">
                  <BookOpenText className="h-3.5 w-3.5" />
                  Explore the CBK study map
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Exam entry points */}
      <section>
        <div className="grid gap-4 md:grid-cols-3">
          {entries.map(({ href, Icon, title, body, meta }) => (
            <a
              key={href}
              href={href}
              className={`${card} group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-slate-900/5`}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{body}</p>
              <div className="mt-auto flex items-center justify-between pt-5 text-xs">
                <span className="text-slate-400">{meta}</span>
                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Domains */}
      <section className="mt-14">
        <SectionHeader
          title="The 8 domains"
          subtitle={`${catalog.totalQuestions} questions in the bank so far`}
          action={
            <a href="/study" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
              Study map →
            </a>
          }
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.domains.map((d) => (
            <DomainCard
              key={d.domainId}
              domain={d}
              mastery={progress.masteryMap[`domain:${d.domainId}`]}
              setCount={setsByDomain[d.domainId] ?? 0}
            />
          ))}
        </div>
      </section>

      {/* Recent results */}
      {recent.length > 0 && (
        <section className="mt-14">
          <SectionHeader
            title="Recent results"
            action={
              <a href="/history" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                All history →
              </a>
            }
          />
          <ul className={`${card} mt-5 divide-y divide-slate-100 dark:divide-slate-800/70`}>
            {recent.map((s) => {
              const pct = s.diagnosticReport?.overall.rawAccuracyPercent ?? 0;
              return (
                <li key={s.sessionId}>
                  <a
                    href={`/results?sessionId=${s.sessionId}`}
                    className="flex items-center gap-4 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <span
                      className={`w-12 shrink-0 text-right font-mono text-sm font-bold ${
                        pct >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {Math.round(pct)}%
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                        {s.examTitle}
                      </span>
                      <span className="text-xs text-slate-500">
                        {s.questionOrder.length} questions ·{' '}
                        {new Date(s.completedAt ?? s.updatedAt).toLocaleDateString()}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
