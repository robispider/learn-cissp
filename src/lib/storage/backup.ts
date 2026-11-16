import {
  db,
  getActiveSessionPointer,
  getUserPreferences,
  saveUserPreferences,
  setActiveSessionPointer,
} from './db';
import {
  getFsrsPreferences,
  saveFsrsPreferences,
} from '../memorization/fsrs-engine';
import type {
  ActiveSessionPointer,
  ExamSessionRecord,
  QuestionAttemptRecord,
  TopicMasteryRecord,
  UserPreferences,
} from '../types/session';
import type {
  FsrsUserPreferences,
  MemoryCardStateRecord,
  MemoryReviewLogRecord,
} from '../types/memory';

export interface CisspBackupPayload {
  schemaVersion: 1 | 2;
  exportedAt: string;
  app: 'learn-cissp';
  preferences: UserPreferences;
  fsrsPreferences?: FsrsUserPreferences;
  activeSessionPointer: ActiveSessionPointer | null;
  examSessions: ExamSessionRecord[];
  questionAttempts: QuestionAttemptRecord[];
  topicMastery: TopicMasteryRecord[];
  memoryCardStates?: MemoryCardStateRecord[];
  memoryReviewLogs?: MemoryReviewLogRecord[];
}

export async function exportProgressBackup(): Promise<CisspBackupPayload> {
  const [
    examSessions,
    questionAttempts,
    topicMastery,
    memoryCardStates,
    memoryReviewLogs,
  ] = await Promise.all([
    db.exam_sessions.toArray(),
    db.question_attempts.toArray(),
    db.topic_mastery.toArray(),
    db.memory_cards_state.toArray(),
    db.memory_review_logs.toArray(),
  ]);

  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    app: 'learn-cissp',
    preferences: getUserPreferences(),
    fsrsPreferences: getFsrsPreferences(),
    activeSessionPointer: getActiveSessionPointer(),
    examSessions,
    questionAttempts,
    topicMastery,
    memoryCardStates,
    memoryReviewLogs,
  };
}

export async function downloadProgressBackupJson(): Promise<void> {
  const payload = await exportProgressBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const datePart = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cissp-progress-${datePart}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importProgressBackup(
  rawJson: string
): Promise<{
  sessionsImported: number;
  masteryImported: number;
  memoryCardsImported: number;
}> {
  const parsed = JSON.parse(rawJson) as Partial<CisspBackupPayload>;
  if (
    parsed.app !== 'learn-cissp' ||
    !Array.isArray(parsed.examSessions) ||
    !Array.isArray(parsed.topicMastery)
  ) {
    throw new Error('Invalid learn-cissp backup file format.');
  }

  await db.transaction(
    'rw',
    [
      db.exam_sessions,
      db.question_attempts,
      db.topic_mastery,
      db.memory_cards_state,
      db.memory_review_logs,
    ],
    async () => {
      if (parsed.examSessions?.length) {
        await db.exam_sessions.bulkPut(parsed.examSessions);
      }
      if (parsed.questionAttempts?.length) {
        await db.question_attempts.bulkPut(parsed.questionAttempts);
      }
      if (parsed.topicMastery?.length) {
        await db.topic_mastery.bulkPut(parsed.topicMastery);
      }
      if (parsed.memoryCardStates?.length) {
        await db.memory_cards_state.bulkPut(parsed.memoryCardStates);
      }
      if (parsed.memoryReviewLogs?.length) {
        await db.memory_review_logs.bulkPut(parsed.memoryReviewLogs);
      }
    }
  );

  if (parsed.preferences) {
    saveUserPreferences(parsed.preferences);
  }
  if (parsed.fsrsPreferences) {
    saveFsrsPreferences(parsed.fsrsPreferences);
  }
  if (parsed.activeSessionPointer !== undefined) {
    setActiveSessionPointer(parsed.activeSessionPointer);
  }

  return {
    sessionsImported: parsed.examSessions.length,
    masteryImported: parsed.topicMastery.length,
    memoryCardsImported: parsed.memoryCardStates?.length ?? 0,
  };
}

export async function clearAllBrowserProgress(): Promise<void> {
  await Promise.all([
    db.exam_sessions.clear(),
    db.question_attempts.clear(),
    db.topic_mastery.clear(),
    db.memory_cards_state.clear(),
    db.memory_review_logs.clear(),
  ]);
  setActiveSessionPointer(null);
}
