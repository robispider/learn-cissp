import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Play,
  Trash2,
  Upload,
  ChevronRight,
} from 'lucide-react';
import { getAllSessions } from '../../lib/storage/session-store';
import { getAllMasteryRecords } from '../../lib/storage/mastery-store';
import {
  clearAllBrowserProgress,
  downloadProgressBackupJson,
  importProgressBackup,
} from '../../lib/storage/backup';
import type { ExamSessionRecord, TopicMasteryRecord } from '../../lib/types/session';
import { resumeExamHref } from '../../lib/exam-engine/assembler';
import { withBase } from '../../lib/paths';

export default function HistoryAndBackupHub() {
  const [sessions, setSessions] = useState<ExamSessionRecord[]>([]);
  const [mastery, setMastery] = useState<TopicMasteryRecord[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      const [s, m] = await Promise.all([
        getAllSessions(),
        getAllMasteryRecords(),
      ]);
      setSessions(s);
      setMastery(
        m
          .filter((r) => r.level === 'subdomain')
          .sort((a, b) =>
            (a.subdomainId ?? '').localeCompare(b.subdomainId ?? '', undefined, {
              numeric: true,
            })
          )
      );
    } catch {
      // ignore in SSR
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const res = await importProgressBackup(raw);
      setStatusMsg(
        `Restored ${res.sessionsImported} session(s) and ${res.masteryImported} mastery record(s).`
      );
      await loadData();
    } catch (err) {
      setStatusMsg(
        err instanceof Error ? err.message : 'Failed to import JSON backup.'
      );
    }
  };

  const handleClear = async () => {
    if (
      !window.confirm(
        'Clear all local exam sessions and mastery records from this browser?'
      )
    ) {
      return;
    }
    await clearAllBrowserProgress();
    setStatusMsg('Local browser storage cleared.');
    await loadData();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      {/* Header + Export / Import Toolbar */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-xs sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/70 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Analytics History & Local Data Backup
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            All sessions and mastery metrics live 100% locally in your browser (IndexedDB).
            Export or restore anytime.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => downloadProgressBackupJson()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            <Download className="h-3.5 w-3.5" />
            Export Progress (.json)
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <Upload className="h-3.5 w-3.5" />
            Restore JSON
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/20 dark:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Past Exam Sessions List */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-xs sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/70">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Exam Sessions ({sessions.length})
        </h2>

        {sessions.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            No exam sessions recorded yet. <a href={withBase('/exams')} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Start any exam</a> to track your progress.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-200/60 dark:divide-slate-800/60">
            {sessions.map((s) => {
              const isCompleted = s.status === 'completed';
              const acc = s.diagnosticReport?.overall.rawAccuracyPercent;
              const confAdj = s.diagnosticReport?.overall.confidenceAdjustedPercent;

              return (
                <div
                  key={s.sessionId}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          isCompleted
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : 'bg-amber-500/15 text-amber-500'
                        }`}
                      >
                        {s.status.replace('_', ' ')}
                      </span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {s.examTitle}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Started {new Date(s.startedAt).toLocaleString()} • Mode:{' '}
                      <span className="capitalize">{s.mode}</span> •{' '}
                      {s.questionOrder.length} Questions
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {isCompleted && acc !== undefined && (
                      <div className="text-right font-mono">
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {acc}% Raw
                        </div>
                        <div className="text-[11px] text-emerald-500">
                          {confAdj}% Conf-Adj
                        </div>
                      </div>
                    )}

                    {isCompleted ? (
                      <a
                        href={withBase(`/results?sessionId=${s.sessionId}`)}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-emerald-500 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-200"
                      >
                        Diagnostic Report
                        <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    ) : s.status !== 'abandoned' ? (
                      <a
                        href={resumeExamHref(s.examId, s.sessionId)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Resume
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rolling Sub-Domain Mastery Table */}
      {mastery.length > 0 && (
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-xs sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/70">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Rolling Sub-Domain Mastery Memory
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mastery.map((m) => (
              <div
                key={m.key}
                className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-emerald-500">
                    Sub-Domain {m.subdomainId}
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {m.recentWeightedScore}% EMA
                  </span>
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {m.name}
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    style={{ width: `${m.recentWeightedScore}%` }}
                    className="h-full rounded-full bg-emerald-500"
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-slate-400">
                  <span>
                    {m.correctAttempts}/{m.totalAttempts} correct
                  </span>
                  <span>Blind spots: {m.highConfidenceErrors}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
