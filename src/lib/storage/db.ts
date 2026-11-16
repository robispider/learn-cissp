import Dexie, { type Table } from 'dexie';
import type {
  ActiveSessionPointer,
  ExamSessionRecord,
  QuestionAttemptRecord,
  TopicMasteryRecord,
  UserPreferences,
} from '../types/session';
import type {
  MemoryCardStateRecord,
  MemoryReviewLogRecord,
} from '../types/memory';

export class CisspLearningDB extends Dexie {
  exam_sessions!: Table<ExamSessionRecord, string>;
  question_attempts!: Table<QuestionAttemptRecord, string>;
  topic_mastery!: Table<TopicMasteryRecord, string>;
  memory_cards_state!: Table<MemoryCardStateRecord, string>;
  memory_review_logs!: Table<MemoryReviewLogRecord, string>;

  constructor() {
    super('cissp_learning_db');
    this.version(1).stores({
      exam_sessions:
        'sessionId, examId, domainId, subdomainId, status, startedAt, updatedAt',
      question_attempts:
        'attemptId, sessionId, examId, questionId, domainId, subdomainId, topicId, timestamp, isCorrect',
      topic_mastery: 'key, level, domainId, subdomainId, masteryTier',
    });
    this.version(2).stores({
      exam_sessions:
        'sessionId, examId, domainId, subdomainId, status, startedAt, updatedAt',
      question_attempts:
        'attemptId, sessionId, examId, questionId, domainId, subdomainId, topicId, timestamp, isCorrect',
      topic_mastery: 'key, level, domainId, subdomainId, masteryTier',
      memory_cards_state:
        'cardId, domainId, subdomainId, topicId, state, dueAt, unlockedByExamGap, [domainId+state]',
      memory_review_logs:
        'logId, cardId, domainId, subdomainId, reviewedAt',
    });
  }
}

export const db = new CisspLearningDB();

export const ACTIVE_SESSION_STORAGE_KEY = 'cissp:active_session_pointer';
export const USER_PREFS_STORAGE_KEY = 'cissp:user_preferences';

const DEFAULT_PREFS: UserPreferences = {
  theme: 'dark',
  defaultExamMode: 'study',
  calmTimerMode: false,
  highlightKeywords: true,
  fontSize: 'normal',
};

export function getActiveSessionPointer(): ActiveSessionPointer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSessionPointer;
  } catch {
    return null;
  }
}

export function setActiveSessionPointer(pointer: ActiveSessionPointer | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!pointer) {
      window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(pointer));
    }
    window.dispatchEvent(new CustomEvent('cissp:session-pointer-updated'));
  } catch {
    // Ignore storage quota errors
  }
}

export function getUserPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(USER_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveUserPreferences(partial: Partial<UserPreferences>): UserPreferences {
  const next = { ...getUserPreferences(), ...partial };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(USER_PREFS_STORAGE_KEY, JSON.stringify(next));
      if (partial.theme) {
        document.documentElement.classList.toggle('dark', next.theme === 'dark');
        document.documentElement.dataset.theme = next.theme;
      }
      window.dispatchEvent(new CustomEvent('cissp:prefs-updated', { detail: next }));
    } catch {
      // Ignore
    }
  }
  return next;
}
