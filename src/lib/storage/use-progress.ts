import { useEffect, useState } from 'react';
import { db } from './db';
import { getAllMasteryRecords } from './mastery-store';
import { getAllSessions } from './session-store';
import type { ExposureRecord } from '../exam-engine/assembler';
import type { ExamSessionRecord, TopicMasteryRecord } from '../types/session';

export interface LearnerProgress {
  loaded: boolean;
  masteryMap: Record<string, TopicMasteryRecord>;
  sessions: ExamSessionRecord[];
  completed: ExamSessionRecord[];
  answeredCount: number;
}

const EMPTY: LearnerProgress = {
  loaded: false,
  masteryMap: {},
  sessions: [],
  completed: [],
  answeredCount: 0,
};

/** Loads the learner's local (IndexedDB) progress for catalog pages. */
export function useLearnerProgress(): LearnerProgress {
  const [state, setState] = useState<LearnerProgress>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mastery, sessions] = await Promise.all([
          getAllMasteryRecords(),
          getAllSessions(),
        ]);
        if (cancelled) return;
        const masteryMap: Record<string, TopicMasteryRecord> = {};
        for (const m of mastery) masteryMap[m.key] = m;
        const completed = sessions.filter((s) => s.status === 'completed');
        const answeredCount = mastery
          .filter((m) => m.level === 'domain')
          .reduce((sum, m) => sum + m.totalAttempts, 0);
        setState({ loaded: true, masteryMap, sessions, completed, answeredCount });
      } catch {
        if (!cancelled) setState({ ...EMPTY, loaded: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Latest outcome per question, used for exposure control when assembling exams. */
export async function loadExposureMap(): Promise<Map<string, ExposureRecord>> {
  const map = new Map<string, ExposureRecord>();
  try {
    const attempts = await db.question_attempts.toArray();
    attempts.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (const a of attempts) {
      const prev = map.get(a.questionId);
      map.set(a.questionId, {
        attempts: (prev?.attempts ?? 0) + 1,
        lastCorrect: a.isCorrect,
      });
    }
  } catch {
    // IndexedDB unavailable – assemble without exposure control.
  }
  return map;
}

/**
 * Remediation weights: sub-domains in a developing / critical tier, weighted by
 * how far they sit below the 85% mastery target.
 */
export function weakSubdomainWeights(
  masteryMap: Record<string, TopicMasteryRecord>
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const m of Object.values(masteryMap)) {
    if (m.level !== 'subdomain' || !m.subdomainId) continue;
    if (m.masteryTier === 'critical_weakness' || m.masteryTier === 'developing') {
      weights[m.subdomainId] = Math.max(5, 85 - m.recentWeightedScore);
    }
  }
  return weights;
}
