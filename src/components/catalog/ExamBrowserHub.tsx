import { useEffect, useState } from 'react';
import {
  ChevronRight,
  Compass,
  Layers,
  Play,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { getAllMasteryRecords } from '../../lib/storage/mastery-store';
import { getAllSessions } from '../../lib/storage/session-store';
import { getUserPreferences, saveUserPreferences } from '../../lib/storage/db';
import type { ExamManifest, Question } from '../../lib/types/question';
import type {
  ExamMode,
  ExamSessionRecord,
  MasteryTier,
  TopicMasteryRecord,
} from '../../lib/types/session';
import InteractiveConceptDeck from './InteractiveConceptDeck';

interface TaxonomyTopic {
  topicId: string;
  name: string;
}

interface TaxonomySubdomain {
  subdomainId: string;
  name: string;
  weight: number;
  summary: string;
  topics: TaxonomyTopic[];
}

interface TaxonomyDomain {
  domainId: string;
  number: number;
  name: string;
  shortName: string;
  weightPercent: number;
  color: string;
  tagline: string;
  subdomains: TaxonomySubdomain[];
}

interface Props {
  domains: TaxonomyDomain[];
  domain1Exam: ExamManifest;
  domain1Questions: Question[];
  allExams?: ExamManifest[];
  allQuestions?: Question[];
  initialTab?: 'overall' | 'domain' | 'subdomain';
  initialDomainFilter?: string;
}

const TIER_STYLES: Record<
  MasteryTier,
  { label: string; bg: string; text: string; dot: string }
> = {
  mastered: {
    label: 'Mastered',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    text: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  proficient: {
    label: 'Proficient',
    bg: 'bg-sky-500/10 border-sky-500/30',
    text: 'text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
  },
  developing: {
    label: 'Developing',
    bg: 'bg-amber-500/10 border-amber-500/30',
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  critical_weakness: {
    label: 'Priority Gap',
    bg: 'bg-rose-500/10 border-rose-500/30',
    text: 'text-rose-600 dark:text-rose-400',
    dot: 'bg-rose-500',
  },
  untested: {
    label: 'Ready to Explore',
    bg: 'bg-slate-500/10 border-slate-500/20',
    text: 'text-slate-600 dark:text-slate-400',
    dot: 'bg-slate-400',
  },
};

export default function ExamBrowserHub({
  domains,
  domain1Exam,
  domain1Questions,
  allExams,
  allQuestions,
  initialTab = 'overall',
  initialDomainFilter = 'dom-1',
}: Props) {
  const [viewScope, setViewScope] = useState<'overall' | 'domain' | 'subdomain'>(
    initialTab
  );
  const [selectedDomainFilter, setSelectedDomainFilter] =
    useState<string>(initialDomainFilter);
  const [subdomainStatusFilter, setSubdomainStatusFilter] = useState<
    'all' | 'weak' | 'mastered' | 'untested'
  >('all');
  const [examMode, setExamMode] = useState<ExamMode>('study');

  const [masteryMap, setMasteryMap] = useState<Record<string, TopicMasteryRecord>>({});
  const [completedSessions, setCompletedSessions] = useState<ExamSessionRecord[]>([]);

  useEffect(() => {
    const prefs = getUserPreferences();
    setExamMode(prefs.defaultExamMode);

    async function loadBrowserData() {
      try {
        const [masteryList, sessions] = await Promise.all([
          getAllMasteryRecords(),
          getAllSessions(),
        ]);
        const map: Record<string, TopicMasteryRecord> = {};
        for (const m of masteryList) {
          map[m.key] = m;
        }
        setMasteryMap(map);
        setCompletedSessions(sessions.filter((s) => s.status === 'completed'));
      } catch {
        // IndexedDB not available in SSR
      }
    }
    loadBrowserData();
  }, []);

  const handleModeChange = (mode: ExamMode) => {
    setExamMode(mode);
    saveUserPreferences({ defaultExamMode: mode });
  };

  const examsList = allExams ?? [domain1Exam];
  const questionsList = allQuestions ?? domain1Questions;

  const examsByDomain: Record<string, ExamManifest[]> = {};
  for (const ex of examsList) {
    if (!examsByDomain[ex.domainId]) examsByDomain[ex.domainId] = [];
    examsByDomain[ex.domainId].push(ex);
  }

  const domain7Exams = examsByDomain['dom-7'] ?? [];
  const domain7Questions = questionsList.filter((q) => q.domainId === 'dom-7');

  const dom1Mastery = masteryMap['domain:dom-1'];
  const overallAccuracy = dom1Mastery ? Math.round(dom1Mastery.recentWeightedScore) : 0;
  const totalPracticed = dom1Mastery?.totalAttempts ?? 0;

  // Count questions per subdomain across all loaded questions
  const subdomainQuestionCounts: Record<string, number> = {};
  for (const q of questionsList) {
    subdomainQuestionCounts[q.subdomainId] =
      (subdomainQuestionCounts[q.subdomainId] ?? 0) + 1;
  }

  // Weak subdomains in Domain 1 for quick remediation
  const weakSubdomains = Object.values(masteryMap).filter(
    (m) =>
      m.level === 'subdomain' &&
      m.domainId === 'dom-1' &&
      (m.masteryTier === 'critical_weakness' || m.masteryTier === 'developing')
  );

  const visibleSubdomains = domains
    .filter((d) =>
      selectedDomainFilter === 'all' ? true : d.domainId === selectedDomainFilter
    )
    .flatMap((d) =>
      d.subdomains.map((sub) => ({
        ...sub,
        domainId: d.domainId,
        domainNumber: d.number,
        domainShortName: d.shortName,
        mastery: masteryMap[`subdomain:${sub.subdomainId}`],
        questionCount: subdomainQuestionCounts[sub.subdomainId] ?? 0,
      }))
    )
    .filter((sub) => {
      const tier = sub.mastery?.masteryTier ?? 'untested';
      if (subdomainStatusFilter === 'weak') {
        return tier === 'critical_weakness' || tier === 'developing';
      }
      if (subdomainStatusFilter === 'mastered') {
        return tier === 'mastered' || tier === 'proficient';
      }
      if (subdomainStatusFilter === 'untested') {
        return tier === 'untested';
      }
      return true;
    });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* TOP HERO & SCOPE SWITCHER */}
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Human-Centered CISSP Diagnostic Studio</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Master the Mindset, Not Just Memorization.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Explore by overall readiness, domain, or sub-domain. Every question diagnoses
            cognitive depth, manager mindset traps, and pacing without visual clutter.
          </p>
        </div>

        {/* EASY TO BROWSE: OVERALL / DOMAIN / SUB-DOMAIN SEGMENTED SWITCHER */}
        <div
          role="tablist"
          aria-label="Browse exams by level"
          className="inline-flex self-start rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90 lg:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewScope === 'overall'}
            onClick={() => setViewScope('overall')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              viewScope === 'overall'
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Overall</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewScope === 'domain'}
            onClick={() => setViewScope('domain')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              viewScope === 'domain'
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>Domains (8)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewScope === 'subdomain'}
            onClick={() => setViewScope('subdomain')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              viewScope === 'subdomain'
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Sub-Domains</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VIEW 1: OVERALL STUDIO VIEW                                           */}
      {/* ===================================================================== */}
      {viewScope === 'overall' && (
        <div className="mt-8 space-y-8">
          {/* Primary Featured Domain 1 Exam + Readiness Snapshot */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Featured Exam Launch Card (8 cols) */}
            <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-white via-white to-emerald-500/5 p-6 shadow-sm dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/30 sm:p-8 lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  DOMAIN 1 • 16% OF CISSP EXAM
                </div>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {domain1Exam.questionIds.length} Questions • {domain1Exam.timeLimitMinutes}m
                  Benchmark
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                {domain1Exam.title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {domain1Exam.description}
              </p>

              {/* Visual Sub-domain Coverage Pills */}
              <div className="mt-5 flex flex-wrap gap-1.5">
                {domains[0].subdomains.slice(0, 6).map((s) => (
                  <span
                    key={s.subdomainId}
                    className="rounded-lg border border-slate-200/80 bg-slate-100/70 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300"
                  >
                    {s.subdomainId} {s.name.split('&')[0].trim()}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDomainFilter('dom-1');
                    setViewScope('subdomain');
                  }}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
                >
                  +6 more sub-domains →
                </button>
              </div>

              {/* Mode Selector + Launch Action */}
              <div className="mt-7 flex flex-col justify-between gap-4 border-t border-slate-200/70 pt-5 sm:flex-row sm:items-center dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Experience:
                  </span>
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
                    <button
                      type="button"
                      onClick={() => handleModeChange('study')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        examMode === 'study'
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                      }`}
                    >
                      Guided Study
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('simulation')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        examMode === 'simulation'
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                      }`}
                    >
                      Exam Simulation
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={`/domains/dom-1`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700"
                  >
                    Domain Details
                  </a>
                  <a
                    href={`/exam/${domain1Exam.examId}?mode=${examMode}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Start Domain 1 Exam
                  </a>
                </div>
              </div>
            </div>

            {/* Right Column: Live Readiness & Quick Stats (4 cols) */}
            <div className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/70 lg:col-span-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Domain 1 Readiness
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Target: 70% Pass / 85% Mastery
                  </span>
                </div>

                {/* Circular Gauge + Metric */}
                <div className="mt-5 flex items-center gap-5">
                  <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                    <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-slate-200 dark:text-slate-800"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={264}
                        strokeDashoffset={264 - (264 * overallAccuracy) / 100}
                        className={
                          overallAccuracy >= 85
                            ? 'text-emerald-500'
                            : overallAccuracy >= 70
                              ? 'text-sky-500'
                              : overallAccuracy > 0
                                ? 'text-amber-500'
                                : 'text-slate-400'
                        }
                      />
                    </svg>
                    <div className="absolute text-center">
                      <span className="font-mono text-xl font-bold text-slate-900 dark:text-white">
                        {overallAccuracy}%
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-base font-bold text-slate-900 dark:text-white">
                      {totalPracticed === 0
                        ? 'Ready for Diagnostic'
                        : overallAccuracy >= 85
                          ? 'Exam Mastery Reached'
                          : overallAccuracy >= 70
                            ? 'Above Passing Line'
                            : 'Building Foundation'}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {totalPracticed === 0
                        ? 'Take the Domain 1 exam to unlock your sub-domain radar & gap profile.'
                        : `Based on ${totalPracticed} answered questions across ${completedSessions.length} completed session(s).`}
                    </p>
                  </div>
                </div>

                {/* 3 Compact Stat Pills */}
                <div className="mt-6 grid grid-cols-3 gap-2.5 text-center">
                  <div className="rounded-2xl bg-slate-100/80 p-3 dark:bg-slate-800/50">
                    <div className="font-mono text-base font-bold text-slate-900 dark:text-white">
                      12
                    </div>
                    <div className="text-[11px] text-slate-500">Sub-Domains</div>
                  </div>
                  <div className="rounded-2xl bg-slate-100/80 p-3 dark:bg-slate-800/50">
                    <div className="font-mono text-base font-bold text-slate-900 dark:text-white">
                      {completedSessions.length}
                    </div>
                    <div className="text-[11px] text-slate-500">Completed</div>
                  </div>
                  <div className="rounded-2xl bg-slate-100/80 p-3 dark:bg-slate-800/50">
                    <div className="font-mono text-base font-bold text-emerald-500">
                      {weakSubdomains.length}
                    </div>
                    <div className="text-[11px] text-slate-500">Focus Gaps</div>
                  </div>
                </div>
              </div>

              {/* Latest Result or Weak Area Action */}
              <div className="mt-5 pt-4 border-t border-slate-200/70 dark:border-slate-800">
                {completedSessions.length > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Latest diagnostic report:</span>
                    <a
                      href={`/results?sessionId=${completedSessions[0].sessionId}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 hover:text-emerald-400"
                    >
                      View 5-Chart Summary
                      <ChevronRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Zero clutter • Instant auto-save</span>
                    <button
                      type="button"
                      onClick={() => setViewScope('subdomain')}
                      className="font-semibold text-emerald-500 hover:underline"
                    >
                      Browse Sub-Domains →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Domain 7: Security Operations — 4 Sets x 25 Questions */}
          {domain7Exams.length > 0 && (
            <div className="rounded-3xl border border-rose-500/25 bg-gradient-to-br from-white via-white to-rose-500/5 p-6 shadow-xs dark:from-slate-900 dark:via-slate-900 dark:to-rose-950/20 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-600 dark:text-rose-400">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    DOMAIN 7 • 13% OF CISSP EXAM • {domain7Questions.length} QUESTIONS
                  </div>
                  <h3 className="mt-2.5 text-xl font-bold text-slate-900 dark:text-white">
                    Security Operations — 4 Practice Sets (25 Questions Each)
                  </h3>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Every set spans all 15 Domain 7 sub-domains (7.1 Forensics through 7.15 Personnel Safety)
                    with full distractor-trap diagnostics and 5-chart post-exam gap analysis.
                  </p>
                </div>
                <a
                  href="/domains/dom-7"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-400"
                >
                  Explore Domain 7 (15 Sub-Domains)
                  <ChevronRight className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {domain7Exams.map((ex, idx) => (
                  <div
                    key={ex.examId}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-xs transition hover:border-rose-500/40 dark:border-slate-800/80 dark:bg-slate-900/70"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="rounded-md bg-rose-500/10 px-2 py-0.5 font-mono font-bold text-rose-600 dark:text-rose-400">
                          Set {idx + 1} of {domain7Exams.length}
                        </span>
                        <span className="font-mono text-slate-500">
                          {ex.questionIds.length} Qs • {ex.timeLimitMinutes}m
                        </span>
                      </div>
                      <h4 className="mt-2.5 text-sm font-bold text-slate-900 dark:text-white">
                        {ex.title}
                      </h4>
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {ex.description}
                      </p>
                    </div>

                    <a
                      href={`/exam/${ex.examId}?mode=${examMode}`}
                      className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-400"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Start Set {idx + 1}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Concept & Formula Studio */}
          <InteractiveConceptDeck />

          {/* Quick Sub-Domain Strip for Domain 1 */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Explore Domain 1 by Sub-Domain (1.1 – 1.12)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Click any sub-domain to practice its focused questions or inspect its topics
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewScope('domain')}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
              >
                View All 8 CISSP Domains →
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {domains[0].subdomains.map((sub) => {
                const m = masteryMap[`subdomain:${sub.subdomainId}`];
                const tier = m?.masteryTier ?? 'untested';
                const style = TIER_STYLES[tier];
                return (
                  <a
                    key={sub.subdomainId}
                    href={`/exam/${domain1Exam.examId}?subdomain=${sub.subdomainId}&mode=study`}
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/60"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {sub.subdomainId}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.bg} ${style.text}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                          {m ? `${Math.round(m.recentWeightedScore)}%` : style.label}
                        </span>
                      </div>
                      <h4 className="mt-2.5 text-sm font-semibold text-slate-900 group-hover:text-emerald-500 dark:text-white">
                        {sub.name}
                      </h4>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 dark:border-slate-800/60">
                      <span>Weight: {Math.round(sub.weight * 100)}%</span>
                      <span className="inline-flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                        Focus Drill <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 2: BY DOMAIN VIEW (ALL 8 CISSP DOMAINS)                          */}
      {/* ===================================================================== */}
      {viewScope === 'domain' && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                8 ISC2 CISSP CBK Domains
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Domain 1 and Domain 7 (4 sets × 25 questions = 100 Qs) include interactive exams; all 8 domains provide complete CBK sub-domain & micro-topic blueprints.
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {domains.map((dom) => {
              const domExams = examsByDomain[dom.domainId] ?? [];
              const hasExams = domExams.length > 0;
              const domQuestionCount = questionsList.filter(
                (q) => q.domainId === dom.domainId
              ).length;
              const m = masteryMap[`domain:${dom.domainId}`];
              const score = m ? Math.round(m.recentWeightedScore) : null;

              return (
                <div
                  key={dom.domainId}
                  className={`flex flex-col justify-between rounded-3xl border p-5 transition ${
                    hasExams
                      ? 'border-emerald-500/40 bg-gradient-to-b from-white to-emerald-500/5 shadow-sm dark:from-slate-900 dark:to-emerald-950/20'
                      : 'border-slate-200/80 bg-white/70 hover:border-slate-300 dark:border-slate-800/80 dark:bg-slate-900/50 dark:hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
                        Domain {dom.number} • {dom.weightPercent}%
                      </span>
                      {hasExams ? (
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          {domExams.length > 1
                            ? `${domExams.length} Sets • ${domQuestionCount} Qs`
                            : `Exam Active • ${domQuestionCount} Qs`}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          CBK Blueprint
                        </span>
                      )}
                    </div>

                    <h3 className="mt-2.5 text-lg font-bold text-slate-900 dark:text-white">
                      {dom.name}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {dom.tagline}
                    </p>

                    {/* Weight & Sub-Domain Bar */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{dom.subdomains.length} Sub-Domains</span>
                        <span>{score !== null ? `${score}% Mastery` : 'Untested'}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          style={{ width: `${score !== null ? score : hasExams ? 12 : 0}%` }}
                          className={`h-full rounded-full ${
                            hasExams ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-2 border-t border-slate-200/60 pt-4 dark:border-slate-800/60">
                    {hasExams ? (
                      <>
                        <a
                          href={
                            domExams.length > 1
                              ? `/domains/${dom.domainId}`
                              : `/exam/${domExams[0].examId}?mode=${examMode}`
                          }
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          {domExams.length > 1 ? `Browse ${domExams.length} Sets` : 'Start Exam'}
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDomainFilter(dom.domainId);
                            setViewScope('subdomain');
                          }}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {dom.subdomains.length} Sub-Domains
                        </button>
                      </>
                    ) : (
                      <>
                        <a
                          href={`/domains/${dom.domainId}`}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Inspect Blueprint
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDomainFilter(dom.domainId);
                            setViewScope('subdomain');
                          }}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:border-slate-800 dark:text-slate-400"
                        >
                          Sub-Domains
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 3: BY SUB-DOMAIN VIEW                                            */}
      {/* ===================================================================== */}
      {viewScope === 'subdomain' && (
        <div className="mt-8 space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800/80 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Domain:</span>
              <button
                type="button"
                onClick={() => setSelectedDomainFilter('dom-1')}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  selectedDomainFilter === 'dom-1'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Domain 1: Risk & Governance
              </button>
              <button
                type="button"
                onClick={() => setSelectedDomainFilter('dom-7')}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  selectedDomainFilter === 'dom-7'
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Domain 7: Security Operations (4 Sets • 100 Qs)
              </button>
              <select
                aria-label="Filter by domain"
                value={selectedDomainFilter}
                onChange={(e) => setSelectedDomainFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="dom-1">Domain 1 (1.1 – 1.12)</option>
                <option value="all">All 8 Domains (1.1 – 8.5)</option>
                {domains.slice(1).map((d) => (
                  <option key={d.domainId} value={d.domainId}>
                    Domain {d.number}: {d.shortName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              {(['all', 'weak', 'mastered', 'untested'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSubdomainStatusFilter(status)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition ${
                    subdomainStatusFilter === status
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  {status === 'weak' ? 'Priority Gaps' : status}
                </button>
              ))}
            </div>
          </div>

          {/* Domain 7 Exam Sets Strip when viewing Domain 7 */}
          {selectedDomainFilter === 'dom-7' && domain7Exams.length > 0 && (
            <div className="rounded-3xl border border-rose-500/25 bg-gradient-to-br from-white via-white to-rose-500/5 p-5 shadow-xs dark:from-slate-900 dark:via-slate-900 dark:to-rose-950/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Domain 7 Question Bank • 4 Sets × 25 Questions (100 Total)
                  </span>
                  <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                    Choose a Domain 7 Practice Set
                  </h3>
                </div>
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={() => handleModeChange('study')}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                      examMode === 'study'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    Guided Study
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('simulation')}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                      examMode === 'simulation'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    Exam Simulation
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {domain7Exams.map((ex, idx) => (
                  <div
                    key={ex.examId}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/95 p-4 dark:border-slate-800 dark:bg-slate-900/80"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                          Set {idx + 1}
                        </span>
                        <span className="font-mono text-slate-500">
                          {ex.questionIds.length} Qs • {ex.timeLimitMinutes}m
                        </span>
                      </div>
                      <h4 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                        {ex.title}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        {ex.description}
                      </p>
                    </div>
                    <a
                      href={`/exam/${ex.examId}?mode=${examMode}`}
                      className="mt-3.5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-400"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Launch Set {idx + 1} ({ex.questionIds.length} Qs)
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subdomain Cards Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleSubdomains.map((sub) => {
              const tier = sub.mastery?.masteryTier ?? 'untested';
              const style = TIER_STYLES[tier];
              const domExams = examsByDomain[sub.domainId] ?? [];
              const hasExam = domExams.length > 0 && sub.questionCount > 0;
              const defaultExamId = domExams[0]?.examId ?? domain1Exam.examId;

              return (
                <div
                  key={sub.subdomainId}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/90 p-5 transition hover:border-emerald-500/40 dark:border-slate-800/80 dark:bg-slate-900/60"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                        Sub-Domain {sub.subdomainId}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${style.bg} ${style.text}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        {sub.mastery
                          ? `${Math.round(sub.mastery.recentWeightedScore)}% • ${style.label}`
                          : style.label}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
                      {sub.name}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {sub.summary}
                    </p>

                    {/* Micro-topics chips */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {sub.topics.map((t) => (
                        <span
                          key={t.topicId}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
                        >
                          {t.topicId} {t.name.split('(')[0].trim()}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3.5 dark:border-slate-800/70">
                    <span className="font-mono text-[11px] text-slate-400">
                      {hasExam
                        ? `${sub.questionCount} question(s) in Domain ${sub.domainNumber} pool`
                        : `Domain ${sub.domainNumber} CBK`}
                    </span>

                    {hasExam ? (
                      <div className="flex items-center gap-2">
                        <a
                          href={`/exam/${defaultExamId}?subdomain=${sub.subdomainId}&mode=study`}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500 hover:text-slate-950 dark:text-emerald-400"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Focus Drill
                        </a>
                      </div>
                    ) : (
                      <a
                        href={`/domains/${sub.domainId}`}
                        className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        View Domain →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
