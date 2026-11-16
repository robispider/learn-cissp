import {
  computeCurrentRetrievability,
  getFsrsPreferences,
} from './fsrs-engine';
import {
  EXAM_PRIORITY_META,
  type DailyQueueSummary,
  type DomainMemorySummary,
  type ExamPriority,
  type FsrsUserPreferences,
  type MemoryCard,
  type MemoryCardStateRecord,
  type MemoryCardType,
  type QueuedMemoryCard,
  type RetentionForecastDay,
} from '../types/memory';
import type { TopicMasteryRecord } from '../types/session';

const DOMAIN_EXAM_WEIGHTS: Record<string, number> = {
  'dom-1': 16,
  'dom-2': 10,
  'dom-3': 13,
  'dom-4': 13,
  'dom-5': 13,
  'dom-6': 12,
  'dom-7': 13,
  'dom-8': 10,
};

/**
 * Computes Sub-Domain Priority Gap Index (PGI) from TopicMasteryRecord.
 * PGI_k = max(0, 85 - recentWeightedScore) * (1 + 0.25 * blindSpotRate)
 */
export function computeSubdomainPgi(
  mastery: TopicMasteryRecord | undefined
): number {
  if (!mastery || mastery.totalAttempts === 0) return 0;
  const blindSpotRate =
    mastery.highConfidenceErrors / Math.max(1, mastery.totalAttempts);
  const gap = Math.max(0, 85 - mastery.recentWeightedScore);
  return Math.round(gap * (1 + 0.25 * blindSpotRate) * 10) / 10;
}

export interface QueueFilterOptions {
  domainId?: string;
  subdomainId?: string;
  cardType?: MemoryCardType;
  examPriority?: ExamPriority;
  mode?: 'smart' | 'gap' | 'cram' | 'pinned' | 'due';
  cardId?: string;
  limit?: number;
}

/**
 * Builds the 4-bucket Smart Daily Queue (or a filtered custom deck session) at timestamp `now`.
 */
export function buildStudyQueue(
  allCards: MemoryCard[],
  stateMap: Map<string, MemoryCardStateRecord>,
  masteryMap: Record<string, TopicMasteryRecord>,
  prefs: FsrsUserPreferences = getFsrsPreferences(),
  filters?: QueueFilterOptions,
  now: Date = new Date()
): DailyQueueSummary {
  const nowIso = now.toISOString();
  const mode = filters?.mode ?? 'smart';

  // Filter candidate cards first if domain / subdomain / archetype / priority filters are set
  const candidates = allCards.filter((card) => {
    if (filters?.cardId && card.id !== filters.cardId) return false;
    if (filters?.domainId && filters.domainId !== 'all' && card.domainId !== filters.domainId)
      return false;
    if (
      filters?.subdomainId &&
      filters.subdomainId !== 'all' &&
      card.subdomainId !== filters.subdomainId
    )
      return false;
    if (filters?.cardType && card.cardType !== filters.cardType) return false;
    if (filters?.examPriority && card.examPriority !== filters.examPriority)
      return false;

    const st = stateMap.get(card.id);
    if (st?.suspended && mode !== 'cram' && !filters?.cardId) return false;
    if (mode === 'pinned' && !st?.pinned) return false;
    if (mode === 'gap' && !st?.unlockedByExamGap) return false;
    return true;
  });

  const bucket1LearningDue: QueuedMemoryCard[] = [];
  const bucket2ExamGap: QueuedMemoryCard[] = [];
  const bucket3ReviewDue: QueuedMemoryCard[] = [];
  const bucket4NewCards: QueuedMemoryCard[] = [];
  const cramList: QueuedMemoryCard[] = [];

  let activeReviewRetrievabilitySum = 0;
  let activeReviewCount = 0;

  for (const card of candidates) {
    const st = stateMap.get(card.id) ?? null;
    const subMastery = masteryMap[`subdomain:${card.subdomainId}`];
    const pgi = computeSubdomainPgi(subMastery);
    const priorityWeight = EXAM_PRIORITY_META[card.examPriority]?.weight ?? 1.0;
    const retrievability =
      st && st.state !== 0
        ? computeCurrentRetrievability(st, now, prefs.customWeights)
        : 0;

    if (st && st.state !== 0) {
      activeReviewRetrievabilitySum += retrievability;
      activeReviewCount++;
    }

    const urgencyScore =
      (1 - retrievability) * (1 + pgi / 100) * priorityWeight;

    // Cram or pinned or single-card mode includes all matching cards ordered by urgency
    if (mode === 'cram' || mode === 'pinned' || filters?.cardId) {
      cramList.push({
        card,
        stateRecord: st,
        bucket: st?.unlockedByExamGap ? 'exam_gap' : 'custom_cram',
        urgencyScore: st?.unlockedByExamGap ? urgencyScore + 10 : urgencyScore,
        retrievability,
        subdomainPgi: pgi,
      });
      continue;
    }

    const isDueByTimestamp = st ? st.dueAt <= nowIso : false;
    const isIntradayLearning = st !== null && (st.state === 1 || st.state === 3);
    const isReviewState = st !== null && st.state === 2;
    const isNewState = st === null || st.state === 0;

    // Bucket 1: Intraday Learning / Relearning Due
    if (isIntradayLearning && isDueByTimestamp) {
      bucket1LearningDue.push({
        card,
        stateRecord: st,
        bucket: 'learning_due',
        urgencyScore: urgencyScore + 100,
        retrievability,
        subdomainPgi: pgi,
      });
      continue;
    }

    // Bucket 2: Exam-Gap Urgent Cards (due or new cards unlocked by exam errors/blind spots)
    if (st?.unlockedByExamGap && (isNewState || isDueByTimestamp || mode === 'gap')) {
      bucket2ExamGap.push({
        card,
        stateRecord: st,
        bucket: 'exam_gap',
        urgencyScore: urgencyScore + 50,
        retrievability,
        subdomainPgi: pgi,
      });
      continue;
    }

    // Bucket 3: Due Review Cards (dueAt <= now OR instantaneous R <= requestRetention)
    if (
      isReviewState &&
      (isDueByTimestamp || retrievability <= prefs.requestRetention)
    ) {
      bucket3ReviewDue.push({
        card,
        stateRecord: st,
        bucket: 'review_due',
        urgencyScore,
        retrievability,
        subdomainPgi: pgi,
      });
      continue;
    }

    // Also include Learning cards whose due time is within the next 15 minutes if no other cards are due
    if (isIntradayLearning) {
      const dueMs = new Date(st.dueAt).getTime();
      if (dueMs - now.getTime() <= 15 * 60_000) {
        bucket1LearningDue.push({
          card,
          stateRecord: st,
          bucket: 'learning_due',
          urgencyScore: urgencyScore + 80,
          retrievability,
          subdomainPgi: pgi,
        });
      }
      continue;
    }

    // Bucket 4: Unseen / New Cards
    if (isNewState && mode !== 'due' && mode !== 'gap') {
      const tier = subMastery?.masteryTier ?? 'untested';
      const tierBoost =
        tier === 'critical_weakness'
          ? 30
          : tier === 'developing'
            ? 15
            : 0;
      const domainWeight = DOMAIN_EXAM_WEIGHTS[card.domainId] ?? 10;
      const newCardScore =
        tierBoost + pgi * 0.5 + priorityWeight * 20 + domainWeight * 0.5;

      bucket4NewCards.push({
        card,
        stateRecord: st,
        bucket: 'new_card',
        urgencyScore: newCardScore,
        retrievability: 0,
        subdomainPgi: pgi,
      });
    }
  }

  // Sort Bucket 1 chronologically by dueAt
  bucket1LearningDue.sort((a, b) =>
    (a.stateRecord?.dueAt ?? '').localeCompare(b.stateRecord?.dueAt ?? '')
  );

  // Sort Bucket 2 by urgencyScore descending
  bucket2ExamGap.sort((a, b) => b.urgencyScore - a.urgencyScore);

  // Sort Bucket 3 by urgencyScore descending (§6.2 formula)
  bucket3ReviewDue.sort((a, b) => b.urgencyScore - a.urgencyScore);

  // Sort Bucket 4 by newCardScore descending
  bucket4NewCards.sort((a, b) => b.urgencyScore - a.urgencyScore);

  if (mode === 'cram' || mode === 'pinned' || filters?.cardId) {
    cramList.sort((a, b) => b.urgencyScore - a.urgencyScore);
    const limited = filters?.limit ? cramList.slice(0, filters.limit) : cramList;
    return {
      queue: limited,
      learningDueCount: 0,
      examGapCount: limited.filter((c) => c.stateRecord?.unlockedByExamGap).length,
      reviewDueCount: limited.length,
      newAvailableCount: 0,
      newQueuedCount: 0,
      totalDueToday: limited.length,
      estimatedMinutes: Math.max(1, Math.ceil((limited.length * 18) / 60)),
      overallRetrievabilityPercent:
        activeReviewCount > 0
          ? Math.round((activeReviewRetrievabilitySum / activeReviewCount) * 1000) / 10
          : null,
    };
  }

  const cappedNew = bucket4NewCards.slice(0, Math.max(0, prefs.dailyNewLimit));
  const combined = [
    ...bucket1LearningDue,
    ...bucket2ExamGap,
    ...bucket3ReviewDue,
    ...cappedNew,
  ];
  const queue = filters?.limit ? combined.slice(0, filters.limit) : combined;

  return {
    queue,
    learningDueCount: bucket1LearningDue.length,
    examGapCount: bucket2ExamGap.length,
    reviewDueCount: bucket3ReviewDue.length,
    newAvailableCount: bucket4NewCards.length,
    newQueuedCount: cappedNew.length,
    totalDueToday: queue.length,
    estimatedMinutes: queue.length === 0 ? 0 : Math.max(1, Math.ceil((queue.length * 18) / 60)),
    overallRetrievabilityPercent:
      activeReviewCount > 0
        ? Math.round((activeReviewRetrievabilitySum / activeReviewCount) * 1000) / 10
        : null,
  };
}

/**
 * Computes per-domain stability & coverage heatmap summaries across all 8 CISSP domains.
 */
export function computeDomainMemorySummaries(
  allCards: MemoryCard[],
  stateMap: Map<string, MemoryCardStateRecord>,
  prefs: FsrsUserPreferences = getFsrsPreferences(),
  now: Date = new Date()
): Record<string, DomainMemorySummary> {
  const nowIso = now.toISOString();
  const summaries: Record<string, DomainMemorySummary> = {};

  for (let d = 1; d <= 8; d++) {
    const domainId = `dom-${d}`;
    summaries[domainId] = {
      domainId,
      totalCards: 0,
      newCount: 0,
      learningCount: 0,
      matureReviewCount: 0,
      youngReviewCount: 0,
      dueNowCount: 0,
      examGapCount: 0,
      averageStabilityDays: 0,
      averageRetrievabilityPercent: null,
    };
  }

  const stabilitySums: Record<string, { sum: number; count: number; rSum: number }> = {};

  for (const card of allCards) {
    const summary = summaries[card.domainId];
    if (!summary) continue;
    summary.totalCards++;

    const st = stateMap.get(card.id);
    if (!st || st.state === 0) {
      summary.newCount++;
      if (st?.unlockedByExamGap && !st.suspended) {
        summary.examGapCount++;
        summary.dueNowCount++;
      }
      continue;
    }

    if (st.suspended) continue;

    if (st.unlockedByExamGap) {
      summary.examGapCount++;
    }

    const r = computeCurrentRetrievability(st, now, prefs.customWeights);
    const acc = (stabilitySums[card.domainId] ??= { sum: 0, count: 0, rSum: 0 });
    acc.sum += st.stability;
    acc.rSum += r;
    acc.count++;

    if (st.state === 1 || st.state === 3) {
      summary.learningCount++;
      if (st.dueAt <= nowIso) summary.dueNowCount++;
    } else if (st.state === 2) {
      if (st.stability >= 21) {
        summary.matureReviewCount++;
      } else {
        summary.youngReviewCount++;
      }
      if (st.dueAt <= nowIso || r <= prefs.requestRetention || st.unlockedByExamGap) {
        summary.dueNowCount++;
      }
    }
  }

  for (const [domainId, acc] of Object.entries(stabilitySums)) {
    if (acc.count > 0 && summaries[domainId]) {
      summaries[domainId].averageStabilityDays =
        Math.round((acc.sum / acc.count) * 10) / 10;
      summaries[domainId].averageRetrievabilityPercent =
        Math.round((acc.rSum / acc.count) * 1000) / 10;
    }
  }

  return summaries;
}

/**
 * Computes a 30-day review workload forecast from stored card dueAt dates.
 */
export function buildRetentionForecast(
  allCards: MemoryCard[],
  stateMap: Map<string, MemoryCardStateRecord>,
  days = 30,
  now: Date = new Date()
): RetentionForecastDay[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const buckets: RetentionForecastDay[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(startOfToday.getTime() + i * 86_400_000);
    const dateIso = d.toISOString().slice(0, 10);
    const label =
      i === 0
        ? 'Today'
        : i === 1
          ? 'Tomorrow'
          : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    buckets.push({
      dateIso,
      dayOffset: i,
      label,
      dueReviewCount: 0,
      learningCount: 0,
      examGapCount: 0,
    });
  }

  for (const card of allCards) {
    const st = stateMap.get(card.id);
    if (!st || st.suspended) continue;

    if (st.state === 0) {
      if (st.unlockedByExamGap) {
        buckets[0].examGapCount++;
      }
      continue;
    }

    const dueDate = new Date(st.dueAt);
    const diffDays = Math.floor(
      (dueDate.getTime() - startOfToday.getTime()) / 86_400_000
    );
    const targetIdx = Math.max(0, diffDays);
    if (targetIdx >= days) continue;

    if (st.unlockedByExamGap && targetIdx === 0) {
      buckets[0].examGapCount++;
    } else if (st.state === 1 || st.state === 3) {
      buckets[targetIdx].learningCount++;
    } else {
      buckets[targetIdx].dueReviewCount++;
    }
  }

  return buckets;
}
