import { db, setActiveSessionPointer } from './db';
import { buildOptionOrders, shuffleArray } from '../exam-engine/shuffler';
import { computeDiagnosticReport } from '../analytics/gap-calculator';
import { recordQuestionAttemptsAndMastery } from './mastery-store';
import type { HydratedExamPayload, Question } from '../types/question';
import type {
  ActiveSessionPointer,
  ExamMode,
  ExamSessionRecord,
  QuestionResponseState,
} from '../types/session';

function createUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toPointer(session: ExamSessionRecord): ActiveSessionPointer {
  const answeredCount = Object.values(session.responses).filter(
    (r) => r.selectedOptionId !== null
  ).length;
  return {
    sessionId: session.sessionId,
    examId: session.examId,
    examTitle: session.examTitle,
    domainId: session.domainId,
    subdomainId: session.subdomainId,
    mode: session.mode,
    currentQuestionIndex: session.currentQuestionIndex,
    totalQuestions: session.questionOrder.length,
    answeredCount,
    elapsedSeconds: session.elapsedSeconds,
    timeLimitSeconds: session.timeLimitSeconds,
    updatedAt: session.updatedAt,
  };
}

export async function findExistingActiveSession(
  examId: string
): Promise<ExamSessionRecord | undefined> {
  const matches = await db.exam_sessions
    .where('examId')
    .equals(examId)
    .filter((s) => s.status === 'in_progress' || s.status === 'paused')
    .toArray();

  if (matches.length === 0) return undefined;
  matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return matches[0];
}

export async function getSessionById(
  sessionId: string
): Promise<ExamSessionRecord | undefined> {
  return db.exam_sessions.get(sessionId);
}

export async function createExamSession(
  exam: HydratedExamPayload,
  mode: ExamMode,
  options?: {
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    subdomainFilter?: string | null;
    customQuestionIds?: string[];
    customTitle?: string;
  }
): Promise<ExamSessionRecord> {
  // Mark any older in_progress session for this same examId as abandoned if starting fresh
  const existing = await findExistingActiveSession(exam.examId);
  if (existing) {
    await db.exam_sessions.update(existing.sessionId, {
      status: 'abandoned',
      updatedAt: new Date().toISOString(),
    });
  }

  let poolIds = options?.customQuestionIds ?? exam.questionIds;
  if (options?.subdomainFilter) {
    const filtered = exam.questions
      .filter((q) => q.subdomainId === options.subdomainFilter)
      .map((q) => q.id);
    if (filtered.length > 0) {
      poolIds = filtered;
    }
  }

  const questionOrder =
    options?.shuffleQuestions !== false ? shuffleArray(poolIds) : [...poolIds];
  const optionOrders = buildOptionOrders(
    questionOrder,
    options?.shuffleOptions === false
  );

  const responses: Record<string, QuestionResponseState> = {};
  for (const qId of questionOrder) {
    responses[qId] = {
      questionId: qId,
      selectedOptionId: null,
      confidence: null,
      eliminatedOptionIds: [],
      isFlagged: false,
      timeSpentSeconds: 0,
      answeredAt: null,
      revealedInStudyMode: false,
    };
  }

  const now = new Date().toISOString();
  const timeLimitSeconds =
    options?.subdomainFilter || options?.customQuestionIds
      ? Math.max(300, questionOrder.length * 90)
      : exam.timeLimitMinutes * 60;

  const session: ExamSessionRecord = {
    sessionId: createUuid(),
    examId: exam.examId,
    examTitle: options?.customTitle ?? exam.title,
    examScope: options?.subdomainFilter ? 'subdomain' : exam.examScope,
    domainId: exam.domainId,
    subdomainId: options?.subdomainFilter ?? exam.subdomainId,
    mode,
    status: 'in_progress',
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    timeLimitSeconds,
    elapsedSeconds: 0,
    currentQuestionIndex: 0,
    questionOrder,
    optionOrders,
    responses,
  };

  await db.exam_sessions.put(session);
  setActiveSessionPointer(toPointer(session));
  return session;
}

export async function updateQuestionResponse(
  sessionId: string,
  questionId: string,
  updater: (prev: QuestionResponseState) => QuestionResponseState,
  currentQuestionIndex?: number,
  elapsedSeconds?: number
): Promise<ExamSessionRecord | undefined> {
  await flushSessionSaves();
  const session = await db.exam_sessions.get(sessionId);
  if (!session) return undefined;

  const updated = applyResponseUpdate(
    session,
    questionId,
    updater,
    currentQuestionIndex,
    elapsedSeconds
  );

  await db.exam_sessions.put(updated);
  if (updated.status !== 'completed') {
    setActiveSessionPointer(toPointer(updated));
  }
  return updated;
}

/**
 * Pure (synchronous) response update. The exam runner applies this to its in-memory
 * session so the UI reacts instantly, then persists the result in the background.
 */
export function applyResponseUpdate(
  session: ExamSessionRecord,
  questionId: string,
  updater: (prev: QuestionResponseState) => QuestionResponseState,
  currentQuestionIndex?: number,
  elapsedSeconds?: number
): ExamSessionRecord {
  const prevResp = session.responses[questionId] ?? {
    questionId,
    selectedOptionId: null,
    confidence: null,
    eliminatedOptionIds: [],
    isFlagged: false,
    timeSpentSeconds: 0,
    answeredAt: null,
    revealedInStudyMode: false,
  };

  return {
    ...session,
    status: session.status === 'completed' ? 'completed' : 'in_progress',
    updatedAt: new Date().toISOString(),
    currentQuestionIndex:
      currentQuestionIndex !== undefined
        ? currentQuestionIndex
        : session.currentQuestionIndex,
    elapsedSeconds:
      elapsedSeconds !== undefined ? elapsedSeconds : session.elapsedSeconds,
    responses: {
      ...session.responses,
      [questionId]: updater(prevResp),
    },
  };
}

// ---------------------------------------------------------------------------
// Background save queue: full-snapshot writes, serialized and coalesced so rapid
// interactions never pile up IndexedDB transactions or overwrite each other
// out of order. Only the most recent snapshot per session is ever written.
// ---------------------------------------------------------------------------
const pendingSaves = new Map<string, ExamSessionRecord>();
let activeFlush: Promise<void> | null = null;

async function runFlush(): Promise<void> {
  try {
    while (pendingSaves.size > 0) {
      const [id, snapshot] = pendingSaves.entries().next().value as [
        string,
        ExamSessionRecord,
      ];
      pendingSaves.delete(id);
      try {
        await db.exam_sessions.put(snapshot);
        if (snapshot.status !== 'completed') {
          setActiveSessionPointer(toPointer(snapshot));
        }
      } catch (err) {
        console.error('Failed to save exam session', err);
      }
    }
  } finally {
    activeFlush = null;
  }
}

/** Queue a session snapshot for persistence without blocking the caller. */
export function scheduleSessionSave(session: ExamSessionRecord): Promise<void> {
  pendingSaves.set(session.sessionId, session);
  activeFlush ??= runFlush();
  return activeFlush;
}

/** Resolves once every queued snapshot has been written to IndexedDB. */
export async function flushSessionSaves(): Promise<void> {
  while (activeFlush) await activeFlush;
}

export async function syncSessionTimerAndIndex(
  sessionId: string,
  elapsedSeconds: number,
  currentQuestionIndex: number,
  activeQuestionId?: string,
  questionDeltaSeconds = 0
): Promise<void> {
  const session = await db.exam_sessions.get(sessionId);
  if (!session || session.status === 'completed') return;

  const responses = { ...session.responses };
  if (activeQuestionId && responses[activeQuestionId] && questionDeltaSeconds > 0) {
    responses[activeQuestionId] = {
      ...responses[activeQuestionId],
      timeSpentSeconds:
        responses[activeQuestionId].timeSpentSeconds + questionDeltaSeconds,
    };
  }

  const updated: ExamSessionRecord = {
    ...session,
    elapsedSeconds,
    currentQuestionIndex,
    updatedAt: new Date().toISOString(),
    responses,
  };

  await db.exam_sessions.put(updated);
  setActiveSessionPointer(toPointer(updated));
}

export async function pauseExamSession(sessionId: string): Promise<void> {
  await flushSessionSaves();
  const session = await db.exam_sessions.get(sessionId);
  if (!session || session.status === 'completed') return;

  const updated: ExamSessionRecord = {
    ...session,
    status: 'paused',
    updatedAt: new Date().toISOString(),
  };
  await db.exam_sessions.put(updated);
  setActiveSessionPointer(toPointer(updated));
}

export async function completeExamSession(
  sessionId: string,
  questions: Question[],
  blueprintWeights?: Record<string, number>
): Promise<ExamSessionRecord | undefined> {
  await flushSessionSaves();
  const session = await db.exam_sessions.get(sessionId);
  if (!session) return undefined;

  if (session.status === 'completed' && session.diagnosticReport) {
    return session;
  }

  const report = computeDiagnosticReport(session, questions, blueprintWeights);
  const now = new Date().toISOString();

  const completed: ExamSessionRecord = {
    ...session,
    status: 'completed',
    updatedAt: now,
    completedAt: now,
    diagnosticReport: report,
  };

  await db.exam_sessions.put(completed);
  await recordQuestionAttemptsAndMastery(completed, questions);
  setActiveSessionPointer(null);

  return completed;
}

export async function getAllSessions(): Promise<ExamSessionRecord[]> {
  const all = await db.exam_sessions.toArray();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
