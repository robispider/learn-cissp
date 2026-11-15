import type { OptionId } from './question';
import type { DiagnosticReport } from './analytics';

export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type ExamMode = 'study' | 'simulation';
export type SessionStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned';

export interface QuestionResponseState {
  questionId: string;
  selectedOptionId: OptionId | null;
  confidence: ConfidenceLevel | null;
  eliminatedOptionIds: OptionId[];
  isFlagged: boolean;
  timeSpentSeconds: number;
  answeredAt: string | null;
  revealedInStudyMode: boolean;
}

export interface ExamSessionRecord {
  sessionId: string;
  examId: string;
  examTitle: string;
  examScope: 'subdomain' | 'domain_full' | 'overall' | 'remediation';
  domainId: string;
  subdomainId: string | null;
  mode: ExamMode;
  status: SessionStatus;

  startedAt: string;
  updatedAt: string;
  completedAt: string | null;

  timeLimitSeconds: number;
  elapsedSeconds: number;
  currentQuestionIndex: number;

  questionOrder: string[];
  optionOrders: Record<string, OptionId[]>;
  responses: Record<string, QuestionResponseState>;

  diagnosticReport?: DiagnosticReport;
}

export interface QuestionAttemptRecord {
  attemptId: string;
  sessionId: string;
  examId: string;
  questionId: string;
  domainId: string;
  subdomainId: string;
  topicId: string;
  timestamp: string;

  selectedOptionId: OptionId | null;
  correctOptionId: OptionId;
  isCorrect: boolean;
  confidence: ConfidenceLevel | null;
  timeSpentSeconds: number;
  estimatedTimeSeconds: number;
  wasFlagged: boolean;

  cognitiveLevel: string;
  perspective: string;
  questionStyle: string;
  difficulty: number;
  trapTypeTriggered: string | null;
}

export type MasteryTier =
  | 'untested'
  | 'critical_weakness'
  | 'developing'
  | 'proficient'
  | 'mastered';

export interface TopicMasteryRecord {
  key: string; // "domain:dom-1" | "subdomain:1.4" | "topic:1.4.2"
  level: 'domain' | 'subdomain' | 'topic';
  domainId: string;
  subdomainId: string | null;
  topicId: string | null;
  name: string;

  totalAttempts: number;
  correctAttempts: number;
  rawAccuracyPercent: number;
  recentWeightedScore: number;
  highConfidenceErrors: number;
  lowConfidenceCorrects: number;
  avgTimeRatio: number;
  masteryTier: MasteryTier;
  gapToTargetPercent: number;
  lastPracticedAt: string;
}

export interface ActiveSessionPointer {
  sessionId: string;
  examId: string;
  examTitle: string;
  domainId: string;
  subdomainId: string | null;
  mode: ExamMode;
  currentQuestionIndex: number;
  totalQuestions: number;
  answeredCount: number;
  elapsedSeconds: number;
  timeLimitSeconds: number;
  updatedAt: string;
}

export interface UserPreferences {
  theme: 'dark' | 'light';
  defaultExamMode: ExamMode;
  calmTimerMode: boolean; // Hides ticking seconds while keeping ambient progress bar
  highlightKeywords: boolean;
  fontSize: 'normal' | 'large';
}
