import {
  createEmptyCard,
  default_w,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type Grade,
} from 'ts-fsrs';
import type {
  FsrsCardState,
  FsrsGrade,
  FsrsUserPreferences,
  MemoryCard,
  MemoryCardStateRecord,
  MemoryReviewLogRecord,
  RetentionPreset,
} from '../types/memory';

export const FSRS_PREFS_STORAGE_KEY = 'cissp:fsrs_user_params';

export const RETENTION_PRESETS: Record<
  RetentionPreset,
  { label: string; retention: number; description: string }
> = {
  maintenance: {
    label: 'Maintenance (85%)',
    retention: 0.85,
    description: 'Lower daily volume for long-term upkeep',
  },
  standard: {
    label: 'Standard (90%)',
    retention: 0.9,
    description: 'Recommended balance of retention vs. daily reviews',
  },
  crunch: {
    label: 'Exam Crunch (93%)',
    retention: 0.93,
    description: 'Tighter intervals for the final weeks before exam day',
  },
};

export const DEFAULT_FSRS_PREFS: FsrsUserPreferences = {
  preset: 'standard',
  requestRetention: 0.9,
  dailyNewLimit: 20,
  enableShortTermSteps: true,
  interactiveOrderMode: true,
  customWeights: null,
  lastOptimizedAt: null,
  lastOptimizationLogLoss: null,
};

export function getFsrsPreferences(): FsrsUserPreferences {
  if (typeof window === 'undefined') return DEFAULT_FSRS_PREFS;
  try {
    const raw = window.localStorage.getItem(FSRS_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_FSRS_PREFS;
    const parsed = JSON.parse(raw) as Partial<FsrsUserPreferences>;
    return { ...DEFAULT_FSRS_PREFS, ...parsed };
  } catch {
    return DEFAULT_FSRS_PREFS;
  }
}

export function saveFsrsPreferences(
  partial: Partial<FsrsUserPreferences>
): FsrsUserPreferences {
  const current = getFsrsPreferences();
  const next: FsrsUserPreferences = { ...current, ...partial };
  if (partial.preset && partial.requestRetention === undefined) {
    next.requestRetention = RETENTION_PRESETS[partial.preset].retention;
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(FSRS_PREFS_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('cissp:fsrs-prefs-updated', { detail: next }));
    } catch {
      // Ignore quota errors
    }
  }
  return next;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}

/**
 * Extracts the FSRS-6 power-law decay parameters from weight vector w.
 * R(t, S) = (1 + FACTOR * t / S)^DECAY, guaranteed R(S, S) = 0.90.
 */
export function getForgettingCurveConstants(weights?: readonly number[] | null): {
  decay: number;
  factor: number;
} {
  const w = weights && weights.length >= 19 ? weights : default_w;
  const w20 = typeof w[20] === 'number' && w[20] > 0.05 && w[20] <= 1 ? w[20] : 0.5;
  const decay = -w20;
  const factor = Math.pow(0.9, 1 / decay) - 1;
  return { decay, factor };
}

/**
 * Computes instantaneous Retrievability R(t, S) in [0, 1] after t elapsed days.
 */
export function computePowerLawRetrievability(
  elapsedDays: number,
  stability: number,
  weights?: readonly number[] | null
): number {
  if (stability <= 0) return 0;
  if (elapsedDays <= 0) return 1;
  const { decay, factor } = getForgettingCurveConstants(weights);
  return clamp(Math.pow(1 + (factor * elapsedDays) / stability, decay), 0, 1);
}

/**
 * Computes next review interval I(S, R_req) in days for a target retention R_req.
 */
export function solveIntervalForTargetRetention(
  stability: number,
  requestRetention = 0.9,
  weights?: readonly number[] | null
): number {
  if (stability <= 0) return 1;
  const rReq = clamp(requestRetention, 0.75, 0.97);
  const { decay, factor } = getForgettingCurveConstants(weights);
  const raw = (stability / factor) * (Math.pow(rReq, 1 / decay) - 1);
  return Math.max(1, Math.round(raw));
}

/**
 * Computes current Retrievability R(t, S) for a stored card state record at timestamp `now`.
 */
export function computeCurrentRetrievability(
  stateRecord: MemoryCardStateRecord | null | undefined,
  now: Date = new Date(),
  weights?: readonly number[] | null
): number {
  if (!stateRecord || stateRecord.state === 0 || !stateRecord.lastReviewAt) {
    return 0;
  }
  const lastMs = new Date(stateRecord.lastReviewAt).getTime();
  const elapsedDays = Math.max(0, (now.getTime() - lastMs) / 86_400_000);
  return computePowerLawRetrievability(elapsedDays, stateRecord.stability, weights);
}

function toTsFsrsCard(
  record: MemoryCardStateRecord | null | undefined,
  now: Date
): Card {
  if (!record || record.state === 0) {
    return createEmptyCard(now);
  }
  return {
    due: new Date(record.dueAt),
    stability: record.stability,
    difficulty: record.difficulty,
    scheduled_days: record.scheduledDays,
    learning_steps: record.learningSteps ?? 0,
    reps: record.reps,
    lapses: record.lapses,
    state: record.state,
    last_review: record.lastReviewAt ? new Date(record.lastReviewAt) : undefined,
  };
}

function buildScheduler(prefs: FsrsUserPreferences) {
  const weights =
    prefs.customWeights && prefs.customWeights.length >= 19
      ? prefs.customWeights
      : default_w;
  const params = generatorParameters({
    request_retention: clamp(prefs.requestRetention, 0.75, 0.97),
    maximum_interval: 3650,
    enable_fuzz: false,
    enable_short_term: prefs.enableShortTermSteps,
    w: weights,
  });
  return fsrs(params);
}

/**
 * Formats time difference between `now` and `due` into a crisp badge label
 * (e.g. "<1m", "10m", "1d", "4d", "2.3mo").
 */
export function formatIntervalDiff(now: Date, due: Date): string {
  const diffMs = Math.max(0, due.getTime() - now.getTime());
  const minutes = Math.round(diffMs / 60_000);
  if (minutes <= 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(diffMs / 86_400_000);
  if (days < 31) return `${days}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export interface GradePreviewOutcome {
  grade: FsrsGrade;
  label: 'Again' | 'Hard' | 'Good' | 'Easy';
  intervalLabel: string;
  nextStateRecord: MemoryCardStateRecord;
  reviewLogRecord: Omit<MemoryReviewLogRecord, 'logId' | 'responseTimeMs'>;
}

const GRADE_LABELS: Record<FsrsGrade, 'Again' | 'Hard' | 'Good' | 'Easy'> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

/**
 * Computes all 4 FSRS rating transitions (Again=1, Hard=2, Good=3, Easy=4) for a card,
 * blending 25% of the card's authored `intrinsicDifficulty` prior on first review (§2.2).
 */
export function previewCardRatings(
  card: MemoryCard,
  existingState: MemoryCardStateRecord | null | undefined,
  prefs: FsrsUserPreferences = getFsrsPreferences(),
  now: Date = new Date()
): Record<FsrsGrade, GradePreviewOutcome> {
  const scheduler = buildScheduler(prefs);
  const fsrsCard = toTsFsrsCard(existingState, now);
  const preview = scheduler.repeat(fsrsCard, now);

  const isFirstReview = !existingState || existingState.reps === 0 || existingState.state === 0;
  const prevElapsedDays =
    existingState?.lastReviewAt
      ? Math.max(
          0,
          Math.round(
            ((now.getTime() - new Date(existingState.lastReviewAt).getTime()) / 86_400_000) * 100
          ) / 100
        )
      : 0;
  const retrievabilityBefore = isFirstReview
    ? 1
    : round4(computeCurrentRetrievability(existingState, now, prefs.customWeights));

  const grades: FsrsGrade[] = [1, 2, 3, 4];
  const result = {} as Record<FsrsGrade, GradePreviewOutcome>;

  for (const grade of grades) {
    const ratingEnum = grade as Grade;
    const item = preview[ratingEnum];
    const nextCard = item.card;

    // Blend 25% of authored intrinsicDifficulty prior on first review of a new card (§2.2 eq. 1)
    const blendedDifficulty = isFirstReview
      ? round4(clamp(0.75 * nextCard.difficulty + 0.25 * card.intrinsicDifficulty, 1, 10))
      : round4(clamp(nextCard.difficulty, 1, 10));

    const nextStability = round4(Math.max(0.05, nextCard.stability));
    const nowIso = now.toISOString();
    const dueIso = nextCard.due.toISOString();

    // Clear unlockedByExamGap once the user recalls the card with Good (3) or Easy (4)
    const keepGapFlag =
      grade >= 3 ? false : Boolean(existingState?.unlockedByExamGap);

    const nextStateRecord: MemoryCardStateRecord = {
      cardId: card.id,
      domainId: card.domainId,
      subdomainId: card.subdomainId,
      topicId: card.topicId,
      state: nextCard.state as FsrsCardState,
      dueAt: dueIso,
      stability: nextStability,
      difficulty: blendedDifficulty,
      elapsedDays: prevElapsedDays,
      scheduledDays: nextCard.scheduled_days,
      learningSteps: nextCard.learning_steps,
      reps: nextCard.reps,
      lapses: nextCard.lapses,
      lastReviewAt: nowIso,
      unlockedByExamGap: keepGapFlag,
      gapBoostReason: keepGapFlag ? (existingState?.gapBoostReason ?? null) : null,
      suspended: existingState?.suspended ?? false,
      pinned: existingState?.pinned ?? false,
      updatedAt: nowIso,
    };

    const reviewLogRecord: Omit<MemoryReviewLogRecord, 'logId' | 'responseTimeMs'> = {
      cardId: card.id,
      domainId: card.domainId,
      subdomainId: card.subdomainId,
      reviewedAt: nowIso,
      rating: grade,
      prevState: (existingState?.state ?? 0) as FsrsCardState,
      nextState: nextCard.state as FsrsCardState,
      elapsedDays: prevElapsedDays,
      scheduledDays: nextCard.scheduled_days,
      stabilityBefore: round4(existingState?.stability ?? 0),
      stabilityAfter: nextStability,
      difficultyBefore: round4(existingState?.difficulty ?? card.intrinsicDifficulty),
      difficultyAfter: blendedDifficulty,
      retrievabilityAtReview: retrievabilityBefore,
    };

    result[grade] = {
      grade,
      label: GRADE_LABELS[grade],
      intervalLabel: formatIntervalDiff(now, nextCard.due),
      nextStateRecord,
      reviewLogRecord,
    };
  }

  return result;
}

/**
 * Simulates a card answered "Good" on every scheduled due date and returns the stability
 * (days) after each graduated review — used to illustrate how each successful review
 * flattens the forgetting curve (§8.2 ForgettingCurveChart).
 */
export function simulateGoodReviewStabilities(
  prefs: FsrsUserPreferences = getFsrsPreferences(),
  reviews = 4,
  start: Date = new Date()
): number[] {
  const scheduler = buildScheduler(prefs);
  let card = createEmptyCard(start);
  let now = start;
  const out: number[] = [];
  for (let i = 0; i < reviews * 4 && out.length < reviews; i++) {
    const res = scheduler.next(card, now, Rating.Good);
    card = res.card;
    now = card.due;
    // Only record once the card has graduated out of intraday learning steps.
    if (card.state === 2 && card.scheduled_days >= 1) {
      const s = round4(card.stability);
      if (!out.length || s > out[out.length - 1]) out.push(s);
    }
  }
  return out;
}

export { Rating };
