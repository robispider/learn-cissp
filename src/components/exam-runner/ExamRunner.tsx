import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Flag,
  Grid,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Strikethrough,
  Type,
  X,
} from 'lucide-react';
import {
  completeExamSession,
  createExamSession,
  findExistingActiveSession,
  getSessionById,
  pauseExamSession,
  syncSessionTimerAndIndex,
  updateQuestionResponse,
} from '../../lib/storage/session-store';
import { getUserPreferences, saveUserPreferences } from '../../lib/storage/db';
import {
  COGNITIVE_LABELS,
  PERSPECTIVE_LABELS,
  TRAP_TYPE_METADATA,
  type HydratedExamPayload,
  type OptionId,
  type Question,
} from '../../lib/types/question';
import type {
  ConfidenceLevel,
  ExamMode,
  ExamSessionRecord,
} from '../../lib/types/session';
import ThemeToggle from '../layout/ThemeToggle';

interface Props {
  exam: HydratedExamPayload;
}

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function highlightStemText(stem: string, keywords: string[], enabled: boolean) {
  if (!enabled || !keywords.length) return stem;
  const escaped = keywords
    .filter(Boolean)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return stem;
  const regex = new RegExp(`(\\b(?:${escaped.join('|')})\\b)`, 'g');
  const parts = stem.split(regex);
  return parts.map((part, idx) =>
    keywords.includes(part) ? (
      <mark
        key={idx}
        className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

export default function ExamRunner({ exam }: Props) {
  const [session, setSession] = useState<ExamSessionRecord | null>(null);
  const [resumeCandidate, setResumeCandidate] = useState<ExamSessionRecord | null>(
    null
  );
  const [isInitializing, setIsInitializing] = useState(true);
  const [showPalette, setShowPalette] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // User comfort preferences
  const [calmTimer, setCalmTimer] = useState(false);
  const [highlightWords, setHighlightWords] = useState(true);
  const [largeFont, setLargeFont] = useState(false);

  // Live per-second timers
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentQuestionDwell, setCurrentQuestionDwell] = useState(0);
  const isPausedOverlay = false;

  const questionMap = useMemo(
    () => new Map<string, Question>(exam.questions.map((q) => [q.id, q])),
    [exam.questions]
  );

  // Initialize or check for existing session
  useEffect(() => {
    const prefs = getUserPreferences();
    setCalmTimer(prefs.calmTimerMode);
    setHighlightWords(prefs.highlightKeywords);
    setLargeFont(prefs.fontSize === 'large');

    async function init() {
      const params = new URLSearchParams(window.location.search);
      const requestedSessionId = params.get('sessionId');
      const requestedMode =
        (params.get('mode') as ExamMode) || prefs.defaultExamMode || 'study';
      const subdomainFilter = params.get('subdomain');

      if (requestedSessionId) {
        const found = await getSessionById(requestedSessionId);
        if (found && found.status !== 'completed') {
          setSession(found);
          setElapsedSeconds(found.elapsedSeconds);
          const qId = found.questionOrder[found.currentQuestionIndex];
          setCurrentQuestionDwell(found.responses[qId]?.timeSpentSeconds ?? 0);
          setIsInitializing(false);
          return;
        }
      }

      if (subdomainFilter) {
        const freshSub = await createExamSession(exam, requestedMode, {
          subdomainFilter,
          customTitle: `Domain ${subdomainFilter} Focus Drill`,
        });
        setSession(freshSub);
        setElapsedSeconds(0);
        setCurrentQuestionDwell(0);
        setIsInitializing(false);
        return;
      }

      const existing = await findExistingActiveSession(exam.examId);
      if (existing) {
        setResumeCandidate(existing);
        setIsInitializing(false);
        return;
      }

      const fresh = await createExamSession(exam, requestedMode);
      setSession(fresh);
      setElapsedSeconds(0);
      setCurrentQuestionDwell(0);
      setIsInitializing(false);
    }

    init();
  }, [exam]);

  const currentIndex = session?.currentQuestionIndex ?? 0;
  const currentQuestionId = session?.questionOrder[currentIndex] ?? '';
  const currentQuestion = questionMap.get(currentQuestionId);
  const currentResponse = session?.responses[currentQuestionId];

  // Keep refs for timer flushing
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const elapsedRef = useRef(elapsedSeconds);
  elapsedRef.current = elapsedSeconds;
  const dwellRef = useRef(currentQuestionDwell);
  dwellRef.current = currentQuestionDwell;

  // 1-second tick for visual timing + 5-second auto-flush to IndexedDB
  useEffect(() => {
    if (!session || session.status === 'completed' || isPausedOverlay) return;

    let unsavedDelta = 0;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      unsavedDelta += 1;
      setElapsedSeconds((prev) => prev + 1);
      setCurrentQuestionDwell((prev) => prev + 1);

      if (unsavedDelta >= 5 && sessionRef.current) {
        const s = sessionRef.current;
        const qId = s.questionOrder[s.currentQuestionIndex];
        syncSessionTimerAndIndex(
          s.sessionId,
          elapsedRef.current + 1,
          s.currentQuestionIndex,
          qId,
          unsavedDelta
        );
        unsavedDelta = 0;
      }
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.hidden && sessionRef.current && unsavedDelta > 0) {
        const s = sessionRef.current;
        const qId = s.questionOrder[s.currentQuestionIndex];
        syncSessionTimerAndIndex(
          s.sessionId,
          elapsedRef.current,
          s.currentQuestionIndex,
          qId,
          unsavedDelta
        );
        unsavedDelta = 0;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session?.sessionId, session?.currentQuestionIndex, isPausedOverlay]);

  const navigateToQuestion = useCallback(
    async (nextIdx: number) => {
      if (!session) return;
      const bounded = Math.max(
        0,
        Math.min(session.questionOrder.length - 1, nextIdx)
      );
      if (bounded === session.currentQuestionIndex) return;

      const curQId = session.questionOrder[session.currentQuestionIndex];
      const updated = await updateQuestionResponse(
        session.sessionId,
        curQId,
        (prev) => ({
          ...prev,
          timeSpentSeconds: Math.max(prev.timeSpentSeconds, currentQuestionDwell),
        }),
        bounded,
        elapsedSeconds
      );

      if (updated) {
        setSession(updated);
        const nextQId = updated.questionOrder[bounded];
        setCurrentQuestionDwell(updated.responses[nextQId]?.timeSpentSeconds ?? 0);
      }
    },
    [session, currentQuestionDwell, elapsedSeconds]
  );

  const handleSelectOption = useCallback(
    async (optId: OptionId) => {
      if (!session || !currentQuestion) return;
      const updated = await updateQuestionResponse(
        session.sessionId,
        currentQuestion.id,
        (prev) => ({
          ...prev,
          selectedOptionId: optId,
          confidence: prev.confidence ?? 'medium',
          eliminatedOptionIds: prev.eliminatedOptionIds.filter((id) => id !== optId),
          timeSpentSeconds: Math.max(prev.timeSpentSeconds, currentQuestionDwell),
          answeredAt: new Date().toISOString(),
          revealedInStudyMode:
            session.mode === 'study' ? true : prev.revealedInStudyMode,
        }),
        session.currentQuestionIndex,
        elapsedSeconds
      );
      if (updated) setSession(updated);
    },
    [session, currentQuestion, currentQuestionDwell, elapsedSeconds]
  );

  const handleToggleEliminate = useCallback(
    async (optId: OptionId, e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!session || !currentQuestion) return;
      const updated = await updateQuestionResponse(
        session.sessionId,
        currentQuestion.id,
        (prev) => {
          const exists = prev.eliminatedOptionIds.includes(optId);
          const nextElim = exists
            ? prev.eliminatedOptionIds.filter((id) => id !== optId)
            : [...prev.eliminatedOptionIds, optId];
          return {
            ...prev,
            eliminatedOptionIds: nextElim,
            selectedOptionId:
              !exists && prev.selectedOptionId === optId
                ? null
                : prev.selectedOptionId,
          };
        },
        session.currentQuestionIndex,
        elapsedSeconds
      );
      if (updated) setSession(updated);
    },
    [session, currentQuestion, elapsedSeconds]
  );

  const handleSetConfidence = useCallback(
    async (level: ConfidenceLevel) => {
      if (!session || !currentQuestion) return;
      const updated = await updateQuestionResponse(
        session.sessionId,
        currentQuestion.id,
        (prev) => ({
          ...prev,
          confidence: level,
          timeSpentSeconds: Math.max(prev.timeSpentSeconds, currentQuestionDwell),
        }),
        session.currentQuestionIndex,
        elapsedSeconds
      );
      if (updated) setSession(updated);
    },
    [session, currentQuestion, currentQuestionDwell, elapsedSeconds]
  );

  const handleToggleFlag = useCallback(async () => {
    if (!session || !currentQuestion) return;
    const updated = await updateQuestionResponse(
      session.sessionId,
      currentQuestion.id,
      (prev) => ({
        ...prev,
        isFlagged: !prev.isFlagged,
        timeSpentSeconds: Math.max(prev.timeSpentSeconds, currentQuestionDwell),
      }),
      session.currentQuestionIndex,
      elapsedSeconds
    );
    if (updated) setSession(updated);
  }, [session, currentQuestion, currentQuestionDwell, elapsedSeconds]);

  const handleToggleMode = async () => {
    if (!session) return;
    const nextMode: ExamMode = session.mode === 'study' ? 'simulation' : 'study';
    const nextSession: ExamSessionRecord = {
      ...session,
      mode: nextMode,
      updatedAt: new Date().toISOString(),
    };
    setSession(nextSession);
    saveUserPreferences({ defaultExamMode: nextMode });
  };

  const handlePauseAndExit = async () => {
    if (!session) return;
    await updateQuestionResponse(
      session.sessionId,
      currentQuestionId,
      (prev) => ({
        ...prev,
        timeSpentSeconds: Math.max(prev.timeSpentSeconds, currentQuestionDwell),
      }),
      session.currentQuestionIndex,
      elapsedSeconds
    );
    await pauseExamSession(session.sessionId);
    window.location.href = '/';
  };

  const handleCompleteExam = async () => {
    if (!session || isSubmitting) return;
    setIsSubmitting(true);
    await updateQuestionResponse(
      session.sessionId,
      currentQuestionId,
      (prev) => ({
        ...prev,
        timeSpentSeconds: Math.max(prev.timeSpentSeconds, currentQuestionDwell),
      }),
      session.currentQuestionIndex,
      elapsedSeconds
    );
    await completeExamSession(
      session.sessionId,
      exam.questions,
      exam.blueprintWeights
    );
    window.location.href = `/results?sessionId=${session.sessionId}`;
  };

  // Keyboard shortcuts (1-4 / A-D, Left/Right, F to flag, C to cycle confidence)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!session || !currentQuestion || resumeCandidate || isPausedOverlay) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const optionOrder = session.optionOrders[currentQuestion.id] ?? [
        'A',
        'B',
        'C',
        'D',
      ];
      const key = e.key.toUpperCase();
      if (['1', '2', '3', '4'].includes(key)) {
        const idx = Number(key) - 1;
        if (optionOrder[idx]) handleSelectOption(optionOrder[idx]);
      } else if (['A', 'B', 'C', 'D'].includes(key) && !e.metaKey && !e.ctrlKey) {
        const idx = key.charCodeAt(0) - 65;
        if (optionOrder[idx]) handleSelectOption(optionOrder[idx]);
      } else if (e.key === 'ArrowRight') {
        navigateToQuestion(session.currentQuestionIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        navigateToQuestion(session.currentQuestionIndex - 1);
      } else if (key === 'F') {
        handleToggleFlag();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    session,
    currentQuestion,
    resumeCandidate,
    isPausedOverlay,
    handleSelectOption,
    navigateToQuestion,
    handleToggleFlag,
  ]);

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span>Preparing your diagnostic workspace…</span>
        </div>
      </div>
    );
  }

  // Resume or Start Fresh Dialog
  if (resumeCandidate && !session) {
    const answered = Object.values(resumeCandidate.responses).filter(
      (r) => r.selectedOptionId !== null
    ).length;
    return (
      <div className="mx-auto flex min-h-[85vh] max-w-xl items-center px-4">
        <div className="w-full rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-500">
            <Clock className="h-3.5 w-3.5" />
            Saved Progress Found
          </div>
          <h2 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
            Resume your {resumeCandidate.examTitle}?
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            You were on{' '}
            <strong>
              Question {resumeCandidate.currentQuestionIndex + 1} of{' '}
              {resumeCandidate.questionOrder.length}
            </strong>{' '}
            with <strong>{answered}</strong> question(s) answered.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setSession(resumeCandidate);
                setElapsedSeconds(resumeCandidate.elapsedSeconds);
                const qId =
                  resumeCandidate.questionOrder[
                    resumeCandidate.currentQuestionIndex
                  ];
                setCurrentQuestionDwell(
                  resumeCandidate.responses[qId]?.timeSpentSeconds ?? 0
                );
                setResumeCandidate(null);
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              <Play className="h-4 w-4 fill-current" />
              Resume Saved Session
            </button>
            <button
              type="button"
              onClick={async () => {
                const prefs = getUserPreferences();
                const fresh = await createExamSession(
                  exam,
                  prefs.defaultExamMode || 'study'
                );
                setSession(fresh);
                setElapsedSeconds(0);
                setCurrentQuestionDwell(0);
                setResumeCandidate(null);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Start Fresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session || !currentQuestion) return null;

  const totalQuestions = session.questionOrder.length;
  const answeredCount = Object.values(session.responses).filter(
    (r) => r.selectedOptionId !== null
  ).length;
  const progressPercent = Math.round(
    ((currentIndex + 1) / Math.max(1, totalQuestions)) * 100
  );
  const completionPercent = Math.round(
    (answeredCount / Math.max(1, totalQuestions)) * 100
  );

  // Subtle time & pacing metrics
  const benchmarkSec = currentQuestion.estimatedTimeSeconds || 75;
  const questionPaceRatio = Math.min(1.5, currentQuestionDwell / benchmarkSec);
  const questionPacePercent = Math.min(100, Math.round((currentQuestionDwell / benchmarkSec) * 100));
  const isOverBenchmark = currentQuestionDwell > benchmarkSec;

  const remainingSessionSec = Math.max(
    0,
    session.timeLimitSeconds - elapsedSeconds
  );
  const sessionTimePercent = Math.min(
    100,
    Math.round((elapsedSeconds / Math.max(1, session.timeLimitSeconds)) * 100)
  );
  const avgTimePerAnswered =
    answeredCount > 0 ? Math.round(elapsedSeconds / answeredCount) : currentQuestionDwell;

  const optionPresentationOrder = session.optionOrders[currentQuestion.id] ?? [
    'A',
    'B',
    'C',
    'D',
  ];
  const orderedOptions = optionPresentationOrder
    .map((id) => currentQuestion.options.find((o) => o.id === id))
    .filter((o): o is Question['options'][number] => Boolean(o));

  const isAnswerRevealed =
    session.mode === 'study' &&
    Boolean(
      currentResponse?.selectedOptionId || currentResponse?.revealedInStudyMode
    );
  const isSelectedCorrect =
    currentResponse?.selectedOptionId ===
    currentQuestion.explanation.correctOptionId;

  // Parse scenarioContext into clean chips if pipe-separated
  const scenarioChips = currentQuestion.scenarioContext
    ? currentQuestion.scenarioContext
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-slate-100">
      {/* =================================================================== */}
      {/* 1. PERIPHERAL TOP PROGRESS LINE & AMBIENT TELEMETRY HEADER          */}
      {/*    Designed to inform at a glance without stealing focus            */}
      {/* =================================================================== */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl dark:border-slate-800/80 dark:bg-[#090d16]/85">
        {/* Hairline 2.5px Dual Progress Bar (Answered + Current Position) */}
        <div className="relative h-1 w-full bg-slate-200/70 dark:bg-slate-800/80">
          <div
            style={{ width: `${progressPercent}%` }}
            className="absolute inset-y-0 left-0 bg-emerald-500/35 transition-all duration-300"
          />
          <div
            style={{ width: `${completionPercent}%` }}
            className="absolute inset-y-0 left-0 bg-emerald-500 transition-all duration-300"
          />
        </div>

        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          {/* Left: Back / Pause + Sub-domain Pill + Question Index */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePauseAndExit}
              title="Pause & return to dashboard (progress auto-saved)"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <Pause className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Pause</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                Q {currentIndex + 1}
                <span className="font-normal text-slate-400"> / {totalQuestions}</span>
              </span>
              <span className="hidden h-3.5 w-px bg-slate-200 dark:bg-slate-800 sm:inline-block" />
              <span className="hidden rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800/80 dark:text-slate-400 sm:inline-block">
                {currentQuestion.subdomainId} • {currentQuestion.subdomainName}
              </span>
            </div>
          </div>

          {/* Center: Quiet Visual Timing & Question Pace Metrics */}
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            {/* Per-Question Visual Pacing Indicator */}
            <div
              className="flex items-center gap-2"
              title={`Current question pace: ${currentQuestionDwell}s spent vs ${benchmarkSec}s benchmark`}
            >
              <span className="hidden text-[11px] text-slate-400 md:inline">
                Q Pace
              </span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 sm:w-20">
                <div
                  style={{ width: `${questionPacePercent}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    isOverBenchmark
                      ? 'bg-amber-400/90'
                      : questionPaceRatio > 0.75
                        ? 'bg-teal-400'
                        : 'bg-emerald-500/80'
                  }`}
                />
              </div>
              {!calmTimer && (
                <span
                  className={`font-mono text-[11px] ${
                    isOverBenchmark
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {currentQuestionDwell}s
                  <span className="text-slate-400 dark:text-slate-600">
                    /{benchmarkSec}s
                  </span>
                </span>
              )}
            </div>

            <span className="hidden h-3.5 w-px bg-slate-200 dark:bg-slate-800 sm:inline-block" />

            {/* Overall Session Visual Ring + Time */}
            <div
              className="hidden items-center gap-2 sm:flex"
              title={`Session time remaining • Avg pace: ${avgTimePerAnswered}s/question`}
            >
              <svg className="h-4 w-4 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  className="text-slate-200 dark:text-slate-800"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeDasharray={88}
                  strokeDashoffset={88 - (88 * sessionTimePercent) / 100}
                  className="text-emerald-500/80 transition-all"
                />
              </svg>
              {!calmTimer ? (
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {formatSeconds(remainingSessionSec)}
                  <span className="ml-1.5 text-slate-400 dark:text-slate-500">
                    ({avgTimePerAnswered}s avg)
                  </span>
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">Calm Timer</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !calmTimer;
                setCalmTimer(next);
                saveUserPreferences({ calmTimerMode: next });
              }}
              title={
                calmTimer
                  ? 'Show numeric seconds'
                  : 'Calm mode: hide ticking seconds, keep visual bar only'
              }
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              {calmTimer ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Right: Mode Pill, Reader Comfort, Navigator Grid */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleMode}
              title="Switch between Guided Study Mode (instant feedback) and Simulation Mode"
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                session.mode === 'study'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {session.mode === 'study' ? 'Study Mode' : 'Simulation'}
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !largeFont;
                setLargeFont(next);
                saveUserPreferences({ fontSize: next ? 'large' : 'normal' });
              }}
              title="Toggle comfortable reading font size"
              className={`hidden rounded-lg p-1.5 transition sm:inline-flex ${
                largeFont
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Type className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowPalette((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <Grid className="h-3.5 w-3.5" />
              <span className="font-mono text-[11px]">
                {answeredCount}/{totalQuestions}
              </span>
            </button>

            <ThemeToggle />
          </div>
        </div>

        {/* Subtle Segmented Question Progress Strip (1 click to jump to any question) */}
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-4 pb-2 pt-0.5">
          {session.questionOrder.map((qId, idx) => {
            const r = session.responses[qId];
            const isCurrent = idx === currentIndex;
            const isAns = Boolean(r?.selectedOptionId);
            const isFlag = Boolean(r?.isFlagged);

            return (
              <button
                key={qId}
                type="button"
                onClick={() => navigateToQuestion(idx)}
                title={`Question ${idx + 1}${isFlag ? ' (Flagged)' : ''}${
                  isAns ? ' (Answered)' : ''
                }`}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  isCurrent
                    ? 'h-2 bg-emerald-500 ring-2 ring-emerald-500/30'
                    : isFlag
                      ? 'bg-amber-400'
                      : isAns
                        ? 'bg-emerald-500/50 dark:bg-emerald-500/45'
                        : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700'
                }`}
              />
            );
          })}
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. CENTER-STAGE QUESTION & ANSWER WORKSPACE                         */}
      {/*    Generous whitespace, crisp reading typography, zero visual noise */}
      {/* =================================================================== */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-between px-4 py-7 sm:px-6 sm:py-10">
        <div>
          {/* Subtle Indicating Metadata Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                {PERSPECTIVE_LABELS[currentQuestion.perspective]} Lens
              </span>
              <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                Bloom: {COGNITIVE_LABELS[currentQuestion.cognitiveLevel]}
              </span>
              <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                Difficulty {currentQuestion.difficulty}/5
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !highlightWords;
                  setHighlightWords(next);
                  saveUserPreferences({ highlightKeywords: next });
                }}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  highlightWords
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {highlightWords ? 'Keywords Highlighted' : 'Highlight Keywords'}
              </button>

              <button
                type="button"
                onClick={handleToggleFlag}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  currentResponse?.isFlagged
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <Flag
                  className={`h-3.5 w-3.5 ${
                    currentResponse?.isFlagged ? 'fill-current' : ''
                  }`}
                />
                <span>{currentResponse?.isFlagged ? 'Flagged' : 'Flag'}</span>
              </button>
            </div>
          </div>

          {/* Optional Scenario Context Strip (Scannable Chips, Not Wall of Text) */}
          {scenarioChips.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-800/80 dark:bg-slate-900/50">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Scenario Parameters:
              </span>
              {scenarioChips.map((chip, i) => (
                <span
                  key={i}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}

          {/* Question Stem — The Clear Focal Point */}
          <h1
            className={`mt-5 font-medium leading-relaxed text-slate-900 dark:text-slate-50 ${
              largeFont
                ? 'text-xl sm:text-2xl sm:leading-relaxed'
                : 'text-lg sm:text-[21px] sm:leading-[1.65]'
            }`}
          >
            {highlightStemText(
              currentQuestion.stem,
              currentQuestion.highlightKeywords,
              highlightWords
            )}
          </h1>

          {/* Answer Options (A, B, C, D) */}
          <div className="mt-7 space-y-3">
            {orderedOptions.map((option, displayIdx) => {
              const displayLetter = String.fromCharCode(65 + displayIdx);
              const isSelected = currentResponse?.selectedOptionId === option.id;
              const isEliminated =
                currentResponse?.eliminatedOptionIds.includes(option.id) ?? false;
              const isCorrectOption = option.isCorrect;

              let cardStyle =
                'border-slate-200/90 bg-white hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900/70 dark:hover:border-slate-700';

              if (isAnswerRevealed) {
                if (isCorrectOption) {
                  cardStyle =
                    'border-emerald-500/60 bg-emerald-500/10 dark:border-emerald-500/60 dark:bg-emerald-950/30';
                } else if (isSelected && !isCorrectOption) {
                  cardStyle =
                    'border-rose-500/60 bg-rose-500/10 dark:border-rose-500/60 dark:bg-rose-950/30';
                }
              } else if (isSelected) {
                cardStyle =
                  'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40 dark:border-emerald-500 dark:bg-emerald-500/10';
              }

              return (
                <div
                  key={option.id}
                  onContextMenu={(e) => handleToggleEliminate(option.id, e)}
                  className={`group relative rounded-2xl border transition-all duration-150 ${cardStyle} ${
                    isEliminated && !isSelected ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-start gap-3.5 p-4 sm:p-4.5">
                    <button
                      type="button"
                      onClick={() => handleSelectOption(option.id)}
                      className="flex flex-1 items-start gap-3.5 text-left"
                    >
                      {/* Option Badge */}
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold transition ${
                          isAnswerRevealed && isCorrectOption
                            ? 'bg-emerald-500 text-slate-950'
                            : isAnswerRevealed && isSelected && !isCorrectOption
                              ? 'bg-rose-500 text-white'
                              : isSelected
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {isAnswerRevealed && isCorrectOption ? (
                          <Check className="h-4 w-4 stroke-[2.5]" />
                        ) : isAnswerRevealed && isSelected && !isCorrectOption ? (
                          <X className="h-4 w-4 stroke-[2.5]" />
                        ) : (
                          displayLetter
                        )}
                      </span>

                      <div className="flex-1">
                        <p
                          className={`leading-relaxed ${
                            largeFont ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
                          } ${
                            isEliminated && !isSelected
                              ? 'line-through text-slate-400'
                              : 'text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {option.text}
                        </p>

                        {/* In Guided Study Mode: Inline Concise Rationale + Trap Pill */}
                        {isAnswerRevealed && (
                          <div className="mt-2.5 border-t border-slate-200/60 pt-2.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800/70 dark:text-slate-300">
                            {!option.isCorrect && option.trapType && (
                              <span className="mr-2 inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                                Trap:{' '}
                                {TRAP_TYPE_METADATA[option.trapType]?.shortLabel ??
                                  option.trapType}
                              </span>
                            )}
                            {option.isCorrect && (
                              <span className="mr-2 inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                Correct Answer
                              </span>
                            )}
                            <span>{option.explanation}</span>
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Strike-through / Eliminate Distractor Button */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleEliminate(option.id, e)}
                      title={
                        isEliminated
                          ? 'Restore option'
                          : 'Cross out / eliminate option (or right-click)'
                      }
                      className={`mt-0.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
                        isEliminated
                          ? 'text-rose-400 opacity-100'
                          : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                      }`}
                    >
                      <Strikethrough className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ================================================================= */}
          {/* 3. GUIDED STUDY MODE TAKEAWAY CARD (Visually Encouraging)         */}
          {/* ================================================================= */}
          {isAnswerRevealed && (
            <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-white to-sky-500/5 p-5 dark:from-emerald-950/30 dark:via-slate-900 dark:to-sky-950/20">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <Lightbulb className="h-4 w-4" />
                  <span>Think Like a Manager Takeaway</span>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    isSelectedCorrect
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {isSelectedCorrect ? 'Spot On!' : 'Learning Moment'}
                </span>
              </div>

              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {currentQuestion.explanation.keyTakeaway}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {currentQuestion.explanation.managerMindsetTip}
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-3 text-[11px] text-slate-500 dark:border-slate-800/70">
                <span>
                  <strong>Next Study Focus:</strong>{' '}
                  {currentQuestion.explanation.studyFocusDirective}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Ref: {currentQuestion.explanation.references[0]?.source}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* 4. BOTTOM ERGONOMIC CONTROL BAR (Confidence + Navigation)           */}
        {/* =================================================================== */}
        <div className="mt-8 flex flex-col justify-between gap-4 border-t border-slate-200/80 pt-5 sm:flex-row sm:items-center dark:border-slate-800/80">
          {/* Confidence Selector Pills */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">Confidence:</span>
            <div className="inline-flex rounded-xl border border-slate-200/80 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              {(
                [
                  { id: 'low', label: 'Guess' },
                  { id: 'medium', label: 'Leaning' },
                  { id: 'high', label: 'Certain' },
                ] as const
              ).map((c) => {
                const active = currentResponse?.confidence === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSetConfidence(c.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? c.id === 'high'
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : c.id === 'medium'
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Previous / Next / Finish Exam */}
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => navigateToQuestion(currentIndex - 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>

            {currentIndex < totalQuestions - 1 ? (
              <button
                type="button"
                onClick={() => navigateToQuestion(currentIndex + 1)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                Next Question
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : null}

            {(currentIndex === totalQuestions - 1 ||
              answeredCount === totalQuestions) && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCompleteExam}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmitting ? 'Scoring Diagnostics…' : 'Finish & View Diagnostics'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 5. QUESTION NAVIGATOR PALETTE DRAWER (Slide-over)                   */}
      {/* =================================================================== */}
      {showPalette && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-sm flex-col justify-between border-l border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Question Map
                  </h3>
                  <p className="text-xs text-slate-500">
                    {answeredCount} of {totalQuestions} answered
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPalette(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-5 gap-2.5">
                {session.questionOrder.map((qId, idx) => {
                  const r = session.responses[qId];
                  const isAns = Boolean(r?.selectedOptionId);
                  const isFlag = Boolean(r?.isFlagged);
                  const isCur = idx === currentIndex;

                  return (
                    <button
                      key={qId}
                      type="button"
                      onClick={() => {
                        navigateToQuestion(idx);
                        setShowPalette(false);
                      }}
                      className={`relative flex h-11 items-center justify-center rounded-xl border font-mono text-xs font-bold transition ${
                        isCur
                          ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                          : isAns
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400'
                      }`}
                    >
                      {idx + 1}
                      {isFlag && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white dark:ring-slate-900" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={handleCompleteExam}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4" />
                Submit & View 5-Chart Diagnostic Report
              </button>
              <button
                type="button"
                onClick={handlePauseAndExit}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Pause className="h-3.5 w-3.5" />
                Pause & Save for Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
