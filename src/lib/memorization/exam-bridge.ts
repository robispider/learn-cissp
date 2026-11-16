import { db } from '../storage/db';
import { fetchMemoryCardsCatalog } from '../storage/memory-store';
import type { MemoryCard, MemoryCardStateRecord } from '../types/memory';
import type { Question } from '../types/question';
import type { ExamSessionRecord } from '../types/session';

export interface ExamGapSyncResult {
  flaggedCardCount: number;
  blindSpotCardCount: number;
  flaggedCardIds: string[];
}

/**
 * Couples completed exam outcomes (wrong answers, high-confidence blind spots,
 * and low-confidence lucky guesses) directly to IndexedDB `memory_cards_state`.
 */
export async function syncExamGapsToMemoryCards(
  session: ExamSessionRecord,
  questions: Question[],
  preloadedCards?: MemoryCard[]
): Promise<ExamGapSyncResult> {
  try {
    const cards = preloadedCards ?? (await fetchMemoryCardsCatalog());
    if (!cards.length) {
      return { flaggedCardCount: 0, blindSpotCardCount: 0, flaggedCardIds: [] };
    }

    const questionMap = new Map<string, Question>(
      questions.map((q) => [q.id, q])
    );

    const byQuestionId = new Map<string, MemoryCard[]>();
    const byTopicId = new Map<string, MemoryCard[]>();
    const bySubdomainId = new Map<string, MemoryCard[]>();

    for (const card of cards) {
      for (const qId of card.relatedQuestionIds) {
        const list = byQuestionId.get(qId) ?? [];
        list.push(card);
        byQuestionId.set(qId, list);
      }
      const topicList = byTopicId.get(card.topicId) ?? [];
      topicList.push(card);
      byTopicId.set(card.topicId, topicList);

      const subList = bySubdomainId.get(card.subdomainId) ?? [];
      subList.push(card);
      bySubdomainId.set(card.subdomainId, subList);
    }

    const nowIso = new Date().toISOString();
    const targetUpdates = new Map<
      string,
      {
        card: MemoryCard;
        reason: string;
        isBlindSpot: boolean;
      }
    >();

    for (const qId of session.questionOrder) {
      const q = questionMap.get(qId);
      if (!q) continue;
      const resp = session.responses[qId];
      const selectedOptionId = resp?.selectedOptionId ?? null;
      const isCorrect = selectedOptionId === q.explanation.correctOptionId;
      const conf = resp?.confidence ?? null;

      const isBlindSpot = !isCorrect && conf === 'high';
      const isLuckyGuess = isCorrect && conf === 'low';

      if (isCorrect && !isLuckyGuess) continue;

      // Match cards by explicit relatedQuestionIds first, then topicId, then subdomainId (top 2)
      let matchedCards = byQuestionId.get(q.id) ?? [];
      if (matchedCards.length === 0) {
        matchedCards = byTopicId.get(q.topicId) ?? [];
      }
      if (matchedCards.length === 0) {
        matchedCards = (bySubdomainId.get(q.subdomainId) ?? []).slice(0, 2);
      }

      const reason = isBlindSpot
        ? `High-confidence blind spot on ${q.subdomainId} (${q.topicName})`
        : !isCorrect
          ? `Missed exam question in ${q.subdomainId} (${q.topicName})`
          : `Low-confidence lucky guess in ${q.subdomainId} (${q.topicName})`;

      for (const card of matchedCards) {
        const prev = targetUpdates.get(card.id);
        if (!prev || (isBlindSpot && !prev.isBlindSpot)) {
          targetUpdates.set(card.id, { card, reason, isBlindSpot });
        }
      }
    }

    if (targetUpdates.size === 0) {
      return { flaggedCardCount: 0, blindSpotCardCount: 0, flaggedCardIds: [] };
    }

    const existingStates = await db.memory_cards_state.bulkGet(
      Array.from(targetUpdates.keys())
    );
    const existingById = new Map<string, MemoryCardStateRecord>();
    for (const st of existingStates) {
      if (st) existingById.set(st.cardId, st);
    }

    const recordsToPut: MemoryCardStateRecord[] = [];
    let blindSpotCardCount = 0;

    for (const { card, reason, isBlindSpot } of targetUpdates.values()) {
      if (isBlindSpot) blindSpotCardCount++;
      const existing = existingById.get(card.id);

      if (existing) {
        // Pull dueAt to now if the user just had a high-confidence blind spot on a Review card
        const nextDueAt =
          isBlindSpot && existing.state === 2
            ? nowIso
            : existing.dueAt <= nowIso
              ? existing.dueAt
              : isBlindSpot
                ? nowIso
                : existing.dueAt;

        recordsToPut.push({
          ...existing,
          dueAt: nextDueAt,
          unlockedByExamGap: true,
          gapBoostReason: reason,
          updatedAt: nowIso,
        });
      } else {
        recordsToPut.push({
          cardId: card.id,
          domainId: card.domainId,
          subdomainId: card.subdomainId,
          topicId: card.topicId,
          state: 0,
          dueAt: nowIso,
          stability: 0,
          difficulty: card.intrinsicDifficulty,
          elapsedDays: 0,
          scheduledDays: 0,
          learningSteps: 0,
          reps: 0,
          lapses: 0,
          lastReviewAt: null,
          unlockedByExamGap: true,
          gapBoostReason: reason,
          suspended: false,
          pinned: false,
          updatedAt: nowIso,
        });
      }
    }

    await db.memory_cards_state.bulkPut(recordsToPut);

    return {
      flaggedCardCount: recordsToPut.length,
      blindSpotCardCount,
      flaggedCardIds: recordsToPut.map((r) => r.cardId),
    };
  } catch {
    return { flaggedCardCount: 0, blindSpotCardCount: 0, flaggedCardIds: [] };
  }
}
