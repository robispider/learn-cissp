import type { HydratedExamPayload, Question } from '../types/question';
import type { ExamSessionRecord } from '../types/session';
import { isGeneratedExamId } from './assembler';

let bankPromise: Promise<Question[]> | null = null;

/** Full question bank, emitted at build time by /api/bank.json. */
export function fetchQuestionBank(): Promise<Question[]> {
  bankPromise ??= fetch('/api/bank.json').then((res) => {
    if (!res.ok) throw new Error(`Question bank unavailable (${res.status})`);
    return res.json() as Promise<Question[]>;
  });
  return bankPromise;
}

/**
 * Rebuilds the exam payload for any stored session — manifest-based or generated —
 * so results and resume screens work for every exam type.
 */
export async function resolveSessionExam(session: ExamSessionRecord): Promise<HydratedExamPayload> {
  if (!isGeneratedExamId(session.examId)) {
    try {
      const res = await fetch(`/api/exams/${encodeURIComponent(session.examId)}.json`);
      if (res.ok) return (await res.json()) as HydratedExamPayload;
    } catch {
      // fall through to the bank
    }
  }
  const bank = await fetchQuestionBank();
  return {
    examId: session.examId,
    title: session.examTitle,
    description: '',
    examScope: session.examScope,
    domainId: (session.domainId as HydratedExamPayload['domainId']) ?? 'all',
    subdomainId: session.subdomainId,
    timeLimitMinutes: Math.max(1, Math.round(session.timeLimitSeconds / 60)),
    passingScorePercent: 70,
    masteryScorePercent: 85,
    questionIds: session.questionOrder,
    questions: bank,
  };
}
