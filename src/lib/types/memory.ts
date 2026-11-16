import type {
  CisspPerspective,
  CognitiveLevel,
  DistractorTrapType,
} from './question';

export type MemoryCardType =
  | 'concept_contrast'
  | 'sequence_order'
  | 'formula_drill'
  | 'reference_fact'
  | 'cloze_deletion'
  | 'manager_heuristic';

export type ExamPriority = 'must_know' | 'high_yield' | 'deep_detail';

export interface ContrastColumn {
  label: string;
  badge?: string;
  points: string[];
}

export interface SequenceStep {
  order: number;
  label: string;
  detail: string;
}

export interface FormulaVariable {
  symbol: string;
  meaning: string;
}

export interface MemoryCard {
  id: string;
  version: number;

  // 1. Hierarchical Taxonomy Binding
  domainId:
    | 'dom-1'
    | 'dom-2'
    | 'dom-3'
    | 'dom-4'
    | 'dom-5'
    | 'dom-6'
    | 'dom-7'
    | 'dom-8';
  subdomainId: string;
  subdomainName: string;
  topicId: string;
  topicName: string;

  // 2. FSRS Prior & Diagnostic Coupling Metadata
  cardType: MemoryCardType;
  examPriority: ExamPriority;
  intrinsicDifficulty: number; // 1..10
  cognitiveLevel: CognitiveLevel;
  perspective: CisspPerspective;
  relatedTrapTypes: DistractorTrapType[];
  relatedQuestionIds: string[];
  keyTerms: string[];
  tags: string[];

  // 3. Core Front/Back Content
  title: string;
  prompt: string;
  answerSummary: string;
  mnemonic: string | null;
  examTrapWarning: string;

  // 4. Archetype-Specific Structured Payloads
  contrastData?: {
    ruleOfThumb: string;
    columns: ContrastColumn[];
  };
  sequenceData?: {
    directionLabel: string;
    steps: SequenceStep[];
  };
  formulaData?: {
    formula: string;
    variables: FormulaVariable[];
    workedExample: string;
    decisionRule: string;
  };
  matrixData?: {
    headers: string[];
    rows: string[][];
  };
  clozeTemplate?: string;
  heuristicData?: {
    technicalReflexTrap: string;
    managerAction: string;
    governingPrinciple: string;
  };

  // 5. Authoritative References
  references: Array<{
    source: string;
    section: string;
  }>;
}

export type FsrsCardState = 0 | 1 | 2 | 3; // 0=New, 1=Learning, 2=Review, 3=Relearning
export type FsrsGrade = 1 | 2 | 3 | 4;     // 1=Again, 2=Hard, 3=Good, 4=Easy

export interface MemoryCardStateRecord {
  cardId: string;                 // Primary Key: e.g. "cissp-mem-d1-s1.1-c001"
  domainId: string;               // Indexed
  subdomainId: string;            // Indexed
  topicId: string;                // Indexed

  // FSRS DSR State (mirrors ts-fsrs Card fields)
  state: FsrsCardState;           // 0=New, 1=Learning, 2=Review, 3=Relearning (Indexed)
  dueAt: string;                  // ISO timestamp for next scheduled review (Indexed)
  stability: number;              // S (days for R to drop from 100% -> 90%)
  difficulty: number;             // D in [1, 10]
  elapsedDays: number;
  scheduledDays: number;
  learningSteps?: number;
  reps: number;
  lapses: number;
  lastReviewAt: string | null;

  // DASH Exam-Coupling & User Control Flags
  unlockedByExamGap: boolean;     // True if triggered by missed/blind-spot exam question (Indexed)
  gapBoostReason: string | null;  // e.g. "Blind spot on cissp-d1-s1.4-q001"
  suspended: boolean;             // User manually shelved card
  pinned: boolean;                // User starred card for quick cram
  updatedAt: string;
}

export interface MemoryReviewLogRecord {
  logId: string;                  // Primary Key (UUID v4)
  cardId: string;                 // Indexed
  domainId: string;               // Indexed
  subdomainId: string;            // Indexed
  reviewedAt: string;             // ISO timestamp (Indexed)

  rating: FsrsGrade;              // 1=Again, 2=Hard, 3=Good, 4=Easy
  prevState: FsrsCardState;
  nextState: FsrsCardState;
  elapsedDays: number;
  scheduledDays: number;
  stabilityBefore: number;
  stabilityAfter: number;
  difficultyBefore: number;
  difficultyAfter: number;
  retrievabilityAtReview: number; // Predicted R(t, S) just before grading
  responseTimeMs: number;         // Time from card display to reveal/grade
}

export type RetentionPreset = 'maintenance' | 'standard' | 'crunch';

export interface FsrsUserPreferences {
  preset: RetentionPreset;
  requestRetention: number;       // 0.85 (Maintenance), 0.90 (Standard), 0.93 (Exam Crunch)
  dailyNewLimit: number;          // Default 20
  enableShortTermSteps: boolean;  // Intraday 1m / 10m learning steps
  interactiveOrderMode: boolean;  // Allow interactive sequence ordering on sequence_order cards
  customWeights: number[] | null; // Optional personalized weights trained via optimizer.worker.ts
  lastOptimizedAt: string | null;
  lastOptimizationLogLoss: number | null;
}

export type QueueBucket =
  | 'learning_due'
  | 'exam_gap'
  | 'review_due'
  | 'new_card'
  | 'custom_cram';

export interface QueuedMemoryCard {
  card: MemoryCard;
  stateRecord: MemoryCardStateRecord | null;
  bucket: QueueBucket;
  urgencyScore: number;
  retrievability: number; // Current R(t, S) in [0, 1]
  subdomainPgi: number;
}

export interface DailyQueueSummary {
  queue: QueuedMemoryCard[];
  learningDueCount: number;
  examGapCount: number;
  reviewDueCount: number;
  newAvailableCount: number;
  newQueuedCount: number;
  totalDueToday: number;
  estimatedMinutes: number;
  overallRetrievabilityPercent: number | null;
}

export interface DomainMemorySummary {
  domainId: string;
  totalCards: number;
  newCount: number;
  learningCount: number;
  matureReviewCount: number;
  youngReviewCount: number;
  dueNowCount: number;
  examGapCount: number;
  averageStabilityDays: number;
  averageRetrievabilityPercent: number | null;
}

export interface RetentionForecastDay {
  dateIso: string; // YYYY-MM-DD
  dayOffset: number;
  label: string;
  dueReviewCount: number;
  learningCount: number;
  examGapCount: number;
}

export const MEMORY_CARD_TYPE_META: Record<
  MemoryCardType,
  { label: string; shortLabel: string; description: string; badgeClass: string }
> = {
  concept_contrast: {
    label: 'Concept Contrast',
    shortLabel: 'Contrast',
    description: 'Side-by-side comparison of sibling CISSP concepts & models',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  sequence_order: {
    label: 'Strict Sequence / Order',
    shortLabel: 'Sequence',
    description: 'Ordered lifecycle, priority hierarchy, or protocol exchange',
    badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  },
  formula_drill: {
    label: 'Formula & Threshold',
    shortLabel: 'Formula',
    description: 'Quantitative equation, variable legend, and worked decision rule',
    badgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  },
  reference_fact: {
    label: 'Reference Matrix',
    shortLabel: 'Matrix',
    description: 'Structured specification table, standard mapping, or tier matrix',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  cloze_deletion: {
    label: 'Active Cloze Recall',
    shortLabel: 'Cloze',
    description: 'High-precision rule or threshold with active fill-in-the-blank recall',
    badgeClass: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  },
  manager_heuristic: {
    label: 'Manager Mindset',
    shortLabel: 'Mindset',
    description: '"Think Like a Manager" governance heuristic vs. technical reflex trap',
    badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  },
};

export const EXAM_PRIORITY_META: Record<
  ExamPriority,
  { label: string; weight: number; badgeClass: string }
> = {
  must_know: {
    label: 'Must Know',
    weight: 1.3,
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  high_yield: {
    label: 'High Yield',
    weight: 1.1,
    badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  deep_detail: {
    label: 'Deep Detail',
    weight: 1.0,
    badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
  },
};

/** Lightweight taxonomy slice passed from Astro pages into memorization islands. */
export interface MemoryDomainMeta {
  domainId: string;
  number: number;
  name: string;
  shortName: string;
  color: string;
  weightPercent: number;
  subdomains: Array<{ subdomainId: string; name: string }>;
}
