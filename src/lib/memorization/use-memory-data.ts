import { useCallback, useEffect, useState } from 'react';
import { getAllMasteryRecords } from '../storage/mastery-store';
import {
  fetchMemoryCardsCatalog,
  getAllMemoryReviewLogs,
  getMemoryCardStateMap,
} from '../storage/memory-store';
import { getFsrsPreferences } from './fsrs-engine';
import type {
  FsrsUserPreferences,
  MemoryCard,
  MemoryCardStateRecord,
  MemoryReviewLogRecord,
} from '../types/memory';
import type { TopicMasteryRecord } from '../types/session';

export interface MemoryData {
  loaded: boolean;
  error: string | null;
  cards: MemoryCard[];
  stateMap: Map<string, MemoryCardStateRecord>;
  logs: MemoryReviewLogRecord[];
  masteryMap: Record<string, TopicMasteryRecord>;
  prefs: FsrsUserPreferences;
}

const EMPTY: MemoryData = {
  loaded: false,
  error: null,
  cards: [],
  stateMap: new Map(),
  logs: [],
  masteryMap: {},
  prefs: getFsrsPreferences(),
};

/**
 * Loads everything the memorization islands need: the static card catalog plus the
 * learner's IndexedDB card states, review logs, topic mastery (for PGI) and FSRS prefs.
 */
export function useMemoryData(): MemoryData & { reload: () => Promise<void> } {
  const [data, setData] = useState<MemoryData>(EMPTY);

  const reload = useCallback(async () => {
    try {
      const [cards, stateMap, logs, mastery] = await Promise.all([
        fetchMemoryCardsCatalog(),
        getMemoryCardStateMap().catch(() => new Map<string, MemoryCardStateRecord>()),
        getAllMemoryReviewLogs().catch(() => [] as MemoryReviewLogRecord[]),
        getAllMasteryRecords().catch(() => [] as TopicMasteryRecord[]),
      ]);
      const masteryMap: Record<string, TopicMasteryRecord> = {};
      for (const m of mastery) masteryMap[m.key] = m;
      setData({
        loaded: true,
        error: null,
        cards,
        stateMap,
        logs,
        masteryMap,
        prefs: getFsrsPreferences(),
      });
    } catch (err) {
      setData((prev) => ({
        ...prev,
        loaded: true,
        error: err instanceof Error ? err.message : 'Failed to load memory cards',
      }));
    }
  }, []);

  useEffect(() => {
    void reload();
    const onPrefs = () => setData((prev) => ({ ...prev, prefs: getFsrsPreferences() }));
    window.addEventListener('cissp:fsrs-prefs-updated', onPrefs);
    return () => window.removeEventListener('cissp:fsrs-prefs-updated', onPrefs);
  }, [reload]);

  return { ...data, reload };
}

export interface SubdomainMemoryCount {
  total: number;
  due: number;
  gap: number;
}

/** Is this card something the learner should see today (due review/learning or exam-gap)? */
export function isCardDueNow(st: MemoryCardStateRecord | undefined, nowIso: string): boolean {
  if (!st || st.suspended) return false;
  if (st.unlockedByExamGap) return true;
  if (st.state === 0) return false;
  return st.dueAt <= nowIso;
}

/** Per-sub-domain card totals and due counts (for "Memorize (X due)" badges). */
export function countBySubdomain(
  cards: MemoryCard[],
  stateMap: Map<string, MemoryCardStateRecord>,
  now: Date = new Date()
): Record<string, SubdomainMemoryCount> {
  const nowIso = now.toISOString();
  const out: Record<string, SubdomainMemoryCount> = {};
  for (const c of cards) {
    const row = (out[c.subdomainId] ??= { total: 0, due: 0, gap: 0 });
    row.total++;
    const st = stateMap.get(c.id);
    if (isCardDueNow(st, nowIso)) row.due++;
    if (st?.unlockedByExamGap && !st.suspended) row.gap++;
  }
  return out;
}

/** Lightweight hook for catalog pages: per-sub-domain card totals + due counts. */
export function useSubdomainMemoryCounts(): Record<string, SubdomainMemoryCount> {
  const [counts, setCounts] = useState<Record<string, SubdomainMemoryCount>>({});
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchMemoryCardsCatalog(),
      getMemoryCardStateMap().catch(() => new Map<string, MemoryCardStateRecord>()),
    ])
      .then(([cards, stateMap]) => {
        if (!cancelled) setCounts(countBySubdomain(cards, stateMap));
      })
      .catch(() => {
        /* Memorize badges are optional decoration. */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return counts;
}

/** Builds a /memorize/session URL query string from filter options. */
export function buildMemorySessionQuery(opts: {
  mode?: string;
  domain?: string;
  subdomain?: string;
  type?: string;
  priority?: string;
  card?: string;
  limit?: number;
}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
