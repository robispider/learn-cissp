import { db } from './db';
import {
  getFsrsPreferences,
  previewCardRatings,
} from '../memorization/fsrs-engine';
import { withBase } from '../paths';
import type {
  FsrsGrade,
  MemoryCard,
  MemoryCardStateRecord,
  MemoryReviewLogRecord,
} from '../types/memory';

function createUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `rev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

let cachedCatalogPromise: Promise<MemoryCard[]> | null = null;

/**
 * Fetches the full memory card catalog from the static endpoint `/api/memory/cards.json`.
 */
export function fetchMemoryCardsCatalog(): Promise<MemoryCard[]> {
  if (!cachedCatalogPromise) {
    cachedCatalogPromise = fetch(withBase('/api/memory/cards.json'))
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load memory card catalog');
        return res.json() as Promise<MemoryCard[]>;
      })
      .catch((err) => {
        cachedCatalogPromise = null;
        throw err;
      });
  }
  return cachedCatalogPromise;
}

export async function getAllMemoryCardStates(): Promise<MemoryCardStateRecord[]> {
  return db.memory_cards_state.toArray();
}

export async function getMemoryCardStateMap(): Promise<
  Map<string, MemoryCardStateRecord>
> {
  const all = await db.memory_cards_state.toArray();
  return new Map(all.map((r) => [r.cardId, r]));
}

export async function getAllMemoryReviewLogs(): Promise<MemoryReviewLogRecord[]> {
  const all = await db.memory_review_logs.toArray();
  return all.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
}

/**
 * Records a user review grade (1=Again, 2=Hard, 3=Good, 4=Easy) atomically in IndexedDB.
 */
export async function recordMemoryCardReview(
  card: MemoryCard,
  grade: FsrsGrade,
  responseTimeMs: number,
  now: Date = new Date()
): Promise<{
  stateRecord: MemoryCardStateRecord;
  logRecord: MemoryReviewLogRecord;
}> {
  const existing = await db.memory_cards_state.get(card.id);
  const prefs = getFsrsPreferences();
  const previews = previewCardRatings(card, existing, prefs, now);
  const chosen = previews[grade];

  const logRecord: MemoryReviewLogRecord = {
    logId: createUuid(),
    ...chosen.reviewLogRecord,
    responseTimeMs: Math.max(100, Math.round(responseTimeMs)),
  };

  await db.transaction(
    'rw',
    db.memory_cards_state,
    db.memory_review_logs,
    async () => {
      await db.memory_cards_state.put(chosen.nextStateRecord);
      await db.memory_review_logs.put(logRecord);
    }
  );

  return {
    stateRecord: chosen.nextStateRecord,
    logRecord,
  };
}

function createInitialRecord(card: MemoryCard): MemoryCardStateRecord {
  const now = new Date().toISOString();
  return {
    cardId: card.id,
    domainId: card.domainId,
    subdomainId: card.subdomainId,
    topicId: card.topicId,
    state: 0,
    dueAt: now,
    stability: 0,
    difficulty: card.intrinsicDifficulty,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReviewAt: null,
    unlockedByExamGap: false,
    gapBoostReason: null,
    suspended: false,
    pinned: false,
    updatedAt: now,
  };
}

export async function toggleMemoryCardPinned(
  card: MemoryCard
): Promise<MemoryCardStateRecord> {
  const existing = (await db.memory_cards_state.get(card.id)) ?? createInitialRecord(card);
  const updated: MemoryCardStateRecord = {
    ...existing,
    pinned: !existing.pinned,
    updatedAt: new Date().toISOString(),
  };
  await db.memory_cards_state.put(updated);
  return updated;
}

export async function toggleMemoryCardSuspended(
  card: MemoryCard
): Promise<MemoryCardStateRecord> {
  const existing = (await db.memory_cards_state.get(card.id)) ?? createInitialRecord(card);
  const updated: MemoryCardStateRecord = {
    ...existing,
    suspended: !existing.suspended,
    updatedAt: new Date().toISOString(),
  };
  await db.memory_cards_state.put(updated);
  return updated;
}

export interface MemoryStreakAndStats {
  streakDays: number;
  reviewedTodayCount: number;
  totalReviewsCount: number;
  retentionSuccessRatePercent: number | null;
}

/**
 * Computes consecutive daily review streak, today's completed review count,
 * and historical recall pass rate (ratings 2, 3, 4 vs. 1).
 */
export function computeMemoryStreakAndStats(
  logs: MemoryReviewLogRecord[],
  now: Date = new Date()
): MemoryStreakAndStats {
  if (logs.length === 0) {
    return {
      streakDays: 0,
      reviewedTodayCount: 0,
      totalReviewsCount: 0,
      retentionSuccessRatePercent: null,
    };
  }

  const toLocalDayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

  const todayKey = toLocalDayKey(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = toLocalDayKey(yesterday);

  const daySet = new Set<string>();
  let reviewedTodayCount = 0;
  let successfulRecalls = 0;

  for (const log of logs) {
    const dt = new Date(log.reviewedAt);
    const key = toLocalDayKey(dt);
    daySet.add(key);
    if (key === todayKey) reviewedTodayCount++;
    if (log.rating >= 2) successfulRecalls++;
  }

  let streakDays = 0;
  let cursor = daySet.has(todayKey)
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : daySet.has(yesterdayKey)
      ? yesterday
      : null;

  while (cursor && daySet.has(toLocalDayKey(cursor))) {
    streakDays++;
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() - 1
    );
  }

  return {
    streakDays,
    reviewedTodayCount,
    totalReviewsCount: logs.length,
    retentionSuccessRatePercent:
      Math.round((successfulRecalls / logs.length) * 1000) / 10,
  };
}
