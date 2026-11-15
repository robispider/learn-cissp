import { useEffect, useState } from 'react';
import { Play, Clock, X, Layers } from 'lucide-react';
import { getActiveSessionPointer, setActiveSessionPointer, db } from '../../lib/storage/db';
import type { ActiveSessionPointer } from '../../lib/types/session';

export default function ResumeExamBanner() {
  const [pointer, setPointer] = useState<ActiveSessionPointer | null>(null);

  const refreshPointer = () => {
    const current = getActiveSessionPointer();
    if (!current) {
      setPointer(null);
      return;
    }
    // Hide banner if user is already on the exam runner for this session
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/exam/')) {
      setPointer(null);
      return;
    }
    setPointer(current);
  };

  useEffect(() => {
    refreshPointer();
    window.addEventListener('cissp:session-pointer-updated', refreshPointer);
    window.addEventListener('storage', refreshPointer);
    return () => {
      window.removeEventListener('cissp:session-pointer-updated', refreshPointer);
      window.removeEventListener('storage', refreshPointer);
    };
  }, []);

  if (!pointer) return null;

  const progressPct = Math.round(
    (pointer.answeredCount / Math.max(1, pointer.totalQuestions)) * 100
  );
  const remainingSec = Math.max(0, pointer.timeLimitSeconds - pointer.elapsedSeconds);
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;

  const handleDismiss = async () => {
    try {
      await db.exam_sessions.update(pointer.sessionId, {
        status: 'abandoned',
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
    setActiveSessionPointer(null);
    setPointer(null);
  };

  return (
    <div className="border-b border-emerald-500/20 bg-emerald-500/10 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <Layers className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Session Paused
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {pointer.examTitle}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span>
                Question <strong>{pointer.currentQuestionIndex + 1}</strong> of{' '}
                {pointer.totalQuestions} ({progressPct}% answered)
              </span>
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3" />
                {mins}:{secs.toString().padStart(2, '0')} left
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/exam/${pointer.examId}?sessionId=${pointer.sessionId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-emerald-400"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Resume Exam
          </a>
          <button
            type="button"
            onClick={handleDismiss}
            title="Discard saved session"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
