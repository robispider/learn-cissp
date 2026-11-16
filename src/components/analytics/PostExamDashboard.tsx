import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Play,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import { getAllSessions, getSessionById } from '../../lib/storage/session-store';
import { computeDiagnosticReport } from '../../lib/analytics/gap-calculator';
import { resolveSessionExam } from '../../lib/exam-engine/payload';
import { buildGeneratedExamHref, retakeExamHref } from '../../lib/exam-engine/assembler';
import {
  TRAP_TYPE_METADATA,
  type HydratedExamPayload,
  type Question,
} from '../../lib/types/question';
import type { ExamSessionRecord } from '../../lib/types/session';
import SubdomainGapChart from './SubdomainGapChart';
import DomainRadarChart from './DomainRadarChart';
import TrapBreakdownChart from './TrapBreakdownChart';
import ConfidenceMatrix from './ConfidenceMatrix';
import PacingTimeline from './PacingTimeline';
import StrengthWeaknessTable from './StrengthWeaknessTable';
import { withBase } from '../../lib/paths';
import ExamGapMemoryCallout from '../memorize/ExamGapMemoryCallout';

interface Props {
  initialSessionId?: string;
}

type ReviewFilter =
  | 'all'
  | 'incorrect'
  | 'solid'
  | 'lucky'
  | 'known_gap'
  | 'blind_spot'
  | 'flagged'
  | 'slow';

export default function PostExamDashboard({ initialSessionId }: Props) {
  const [session, setSession] = useState<ExamSessionRecord | null>(null);
  const [activeExam, setActiveExam] = useState<HydratedExamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [subdomainFilter, setSubdomainFilter] = useState<string>('all');
  const reviewSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams(window.location.search);
      const qSessionId = params.get('sessionId') || initialSessionId;

      let loaded: ExamSessionRecord | undefined;
      if (qSessionId && qSessionId !== 'latest' && qSessionId !== 'view') {
        loaded = await getSessionById(qSessionId);
      }

      if (!loaded) {
        const all = await getAllSessions();
        loaded = all.find((s) => s.status === 'completed');
      }

      let resolvedExam: HydratedExamPayload | null = null;
      if (loaded) {
        try {
          resolvedExam = await resolveSessionExam(loaded);
        } catch {
          resolvedExam = null;
        }
      }

      if (loaded && resolvedExam && !loaded.diagnosticReport) {
        loaded.diagnosticReport = computeDiagnosticReport(
          loaded,
          resolvedExam.questions,
          resolvedExam.blueprintWeights
        );
      }

      setActiveExam(resolvedExam);
      setSession(loaded ?? null);
      setLoading(false);
    }
    load();
  }, [initialSessionId]);

  const questionMap = useMemo(
    () => new Map<string, Question>((activeExam?.questions ?? []).map((q) => [q.id, q])),
    [activeExam]
  );

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span>Computing multi-dimensional diagnostic report…</span>
        </div>
      </div>
    );
  }

  if (!session || !session.diagnosticReport || !activeExam) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          No completed exam yet
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Finish any exam to unlock your diagnostic charts and personalised study plan.
        </p>
        <a
          href={withBase('/exams')}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
        >
          <Play className="h-4 w-4 fill-current" />
          Browse exams
        </a>
      </div>
    );
  }


  const report = session.diagnosticReport;
  const { overall, metacognition, pacing } = report;

  const orderedQuestions = session.questionOrder
    .map((id, idx) => ({
      number: idx + 1,
      question: questionMap.get(id),
      response: session.responses[id],
    }))
    .filter(
      (item): item is {
        number: number;
        question: Question;
        response: ExamSessionRecord['responses'][string];
      } => Boolean(item.question)
    );

  const filteredQuestions = orderedQuestions.filter(({ question, response }) => {
    if (subdomainFilter !== 'all' && question.subdomainId !== subdomainFilter) {
      return false;
    }
    const isCorrect =
      response?.selectedOptionId === question.explanation.correctOptionId;

    if (reviewFilter === 'incorrect') return !isCorrect;
    if (reviewFilter === 'solid')
      return metacognition.solidMasteryQuestionIds.includes(question.id);
    if (reviewFilter === 'lucky')
      return metacognition.luckyGuessQuestionIds.includes(question.id);
    if (reviewFilter === 'known_gap')
      return metacognition.knownGapQuestionIds.includes(question.id);
    if (reviewFilter === 'blind_spot')
      return metacognition.blindSpotQuestionIds.includes(question.id);
    if (reviewFilter === 'flagged') return Boolean(response?.isFlagged);
    if (reviewFilter === 'slow')
      return pacing.timeSinkQuestionIds.includes(question.id);
    return true;
  });

  const scrollToReview = () => {
    reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      {/* =================================================================== */}
      {/* 1. EXECUTIVE READINESS HEADER & FOCUSED STUDY PLAN                  */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Readiness Score Card (7 cols) */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80 sm:p-8 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a
              href={withBase('/exams')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to exams
            </a>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                overall.achievedMastery
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : overall.passedBenchmark
                    ? 'bg-sky-500/15 text-sky-500'
                    : 'bg-amber-500/15 text-amber-500'
              }`}
            >
              {overall.achievedMastery
                ? 'Mastery Benchmark Achieved (≥85%)'
                : overall.passedBenchmark
                  ? 'Passed CISSP Benchmark (≥70%)'
                  : `Developing • ${overall.gapToPassPercent}% Gap to 70% Pass`}
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
            {session.examTitle} — Diagnostic Report
          </h1>

          {/* 4 High-Signal KPI Tiles */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="text-[11px] font-medium text-slate-500">Raw Accuracy</div>
              <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white">
                {overall.rawAccuracyPercent}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {overall.correctCount} / {overall.totalQuestions} correct
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="text-[11px] font-medium text-slate-500">
                Confidence-Adjusted
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-500">
                {overall.confidenceAdjustedPercent}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                True mastery index
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="text-[11px] font-medium text-slate-500">
                Difficulty-Weighted
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-sky-500">
                {overall.difficultyWeightedPercent}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                CAT weight adjusted
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="text-[11px] font-medium text-slate-500">Avg Question Pace</div>
              <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white">
                {Math.round(
                  overall.totalTimeSpentSeconds / Math.max(1, overall.totalQuestions)
                )}
                s
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Total: {Math.floor(overall.totalTimeSpentSeconds / 60)}m{' '}
                {overall.totalTimeSpentSeconds % 60}s
              </div>
            </div>
          </div>
        </div>

        {/* Focused Study Plan Card (5 cols) */}
        <div className="flex flex-col justify-between rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-white to-sky-500/5 p-4 sm:p-6 dark:from-emerald-950/30 dark:via-slate-900 dark:to-sky-950/20 lg:col-span-5">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <Target className="h-4 w-4" />
              <span>Prioritized Next Study Plan (Top PGI Gaps)</span>
            </div>

            {report.topWeaknesses.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Outstanding work! All tested sub-domains met or exceeded the 85% mastery
                threshold with zero high-confidence blind spots.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5 text-xs">
                {report.topWeaknesses.slice(0, 3).map((w) => (
                  <li
                    key={w.id}
                    className="rounded-xl border border-slate-200/70 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/80"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                      <span>
                        Sub-Domain {w.id}: {w.name}
                      </span>
                      <span className="font-mono text-rose-500">
                        {w.rawAccuracyPercent}%
                      </span>
                    </div>
                    {w.studyDirectives[0] && (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {w.studyDirectives[0]}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <ExamGapMemoryCallout
              subdomainIds={Array.from(new Set(orderedQuestions.map(({ question }) => question.subdomainId)))}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-200/60 dark:border-slate-800">
            {report.topWeaknesses[0] && (
              <a
                href={buildGeneratedExamHref({ scope: 'subdomain', subdomainId: report.topWeaknesses[0].id, length: 10, mode: 'study' })}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Practice #1 Weak Sub-Domain ({report.topWeaknesses[0].id})
              </a>
            )}
            <a
              href={retakeExamHref(session.examId, session.questionOrder.length, session.mode)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retake Exam
            </a>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. THE 5 REQUIRED GRAPHICAL SUMMARY CHARTS                          */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SubdomainGapChart
            nodes={report.subdomainBreakdown}
            onSelectSubdomain={(subId) => {
              setSubdomainFilter(subId);
              scrollToReview();
            }}
          />
        </div>
        <div className="lg:col-span-5">
          <DomainRadarChart nodes={report.subdomainBreakdown} />
        </div>
      </div>

      <TrapBreakdownChart report={report} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <ConfidenceMatrix
            metacognition={metacognition}
            activeFilter={reviewFilter}
            onSelectQuadrant={(key) => {
              setReviewFilter(key);
              scrollToReview();
            }}
          />
        </div>
        <div className="lg:col-span-6">
          <PacingTimeline
            pacing={pacing}
            onSelectQuestionId={() => {
              scrollToReview();
            }}
          />
        </div>
      </div>

      {/* =================================================================== */}
      {/* 3. GRANULAR STRENGTH & WEAKNESS TABLE                               */}
      {/* =================================================================== */}
      <StrengthWeaknessTable
        nodes={report.subdomainBreakdown}
        onFilterBySubdomain={(subId) => {
          setSubdomainFilter(subId);
          scrollToReview();
        }}
      />

      {/* =================================================================== */}
      {/* 4. DEEP QUESTION-BY-QUESTION REVIEW EXPLORER                        */}
      {/* =================================================================== */}
      <div ref={reviewSectionRef} className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 dark:border-slate-800/80 dark:bg-slate-900/70">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Question & Rationale Deep Review ({filteredQuestions.length} shown)
            </h3>
            <p className="text-xs text-slate-500">
              Every option includes its specific rationale and distractor trap classification
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'incorrect', label: 'Incorrect Only' },
                { id: 'blind_spot', label: 'Blind Spots' },
                { id: 'lucky', label: 'Lucky Guesses' },
                { id: 'flagged', label: 'Flagged' },
                { id: 'slow', label: 'Slow Pace' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setReviewFilter(f.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  reviewFilter === f.id
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}

            {subdomainFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSubdomainFilter('all')}
                className="rounded-lg bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-500"
              >
                Sub-Domain {subdomainFilter} ✕
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {filteredQuestions.map(({ number, question, response }) => {
            const selectedId = response?.selectedOptionId ?? null;
            const isCorrect = selectedId === question.explanation.correctOptionId;

            return (
              <div
                key={question.id}
                className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-xs sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/75"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        isCorrect
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isCorrect ? 'Correct' : 'Incorrect'} • Q{number}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {question.subdomainId} • {question.subdomainName}
                    </span>
                    <span className="text-xs text-slate-400">
                      Confidence: <strong className="capitalize">{response?.confidence ?? 'unset'}</strong> • Time:{' '}
                      <strong>{response?.timeSpentSeconds ?? 0}s</strong> / {question.estimatedTimeSeconds}s
                    </span>
                  </div>
                </div>

                <p className="mt-4 text-base font-medium leading-relaxed text-slate-900 dark:text-white">
                  {question.stem}
                </p>

                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {question.options.map((opt) => {
                    const userPicked = selectedId === opt.id;
                    return (
                      <div
                        key={opt.id}
                        className={`rounded-2xl border p-3.5 text-xs ${
                          opt.isCorrect
                            ? 'border-emerald-500/50 bg-emerald-500/10'
                            : userPicked
                              ? 'border-rose-500/50 bg-rose-500/10'
                              : 'border-slate-200/70 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-slate-900 dark:text-white">
                            Option {opt.id} {opt.isCorrect ? '(Correct)' : userPicked ? '(Your Choice)' : ''}
                          </span>
                          {!opt.isCorrect && opt.trapType && (
                            <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-500">
                              {TRAP_TYPE_METADATA[opt.trapType]?.shortLabel}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                          {opt.text}
                        </p>
                        <p className="mt-2 border-t border-slate-200/50 pt-1.5 text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">
                          {opt.explanation}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-2xl bg-emerald-500/10 p-3.5 text-xs text-slate-700 dark:text-slate-200">
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    Manager Mindset Tip:
                  </strong>{' '}
                  {question.explanation.managerMindsetTip}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
