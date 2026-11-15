import { db } from './db';
import type { Question } from '../types/question';
import type {
  ExamSessionRecord,
  MasteryTier,
  QuestionAttemptRecord,
  TopicMasteryRecord,
} from '../types/session';

const EMA_ALPHA = 0.35;

const DOMAIN_NAMES: Record<string, string> = {
  'dom-1': 'Security and Risk Management',
  'dom-2': 'Asset Security',
  'dom-3': 'Security Architecture and Engineering',
  'dom-4': 'Communication and Network Security',
  'dom-5': 'Identity and Access Management (IAM)',
  'dom-6': 'Security Assessment and Testing',
  'dom-7': 'Security Operations',
  'dom-8': 'Software Development Security',
};

function determineMasteryTier(
  rawAccuracy: number,
  weightedScore: number,
  highConfErrors: number,
  totalAttempts: number
): MasteryTier {
  if (totalAttempts === 0) return 'untested';
  const blindSpotRate = highConfErrors / totalAttempts;
  if (rawAccuracy < 55 || blindSpotRate > 0.25) return 'critical_weakness';
  if (rawAccuracy >= 85 && weightedScore >= 80 && highConfErrors === 0) return 'mastered';
  if (rawAccuracy >= 70 && highConfErrors <= 1) return 'proficient';
  return 'developing';
}

export async function recordQuestionAttemptsAndMastery(
  session: ExamSessionRecord,
  questions: Question[],
  domainName = 'Security and Risk Management'
): Promise<void> {
  const questionMap = new Map<string, Question>(questions.map((q) => [q.id, q]));
  const now = new Date().toISOString();
  const attemptRecords: QuestionAttemptRecord[] = [];

  for (const qId of session.questionOrder) {
    const q = questionMap.get(qId);
    if (!q) continue;
    const resp = session.responses[qId];
    const selectedOptionId = resp?.selectedOptionId ?? null;
    const isCorrect = selectedOptionId === q.explanation.correctOptionId;
    const chosenOpt = selectedOptionId
      ? q.options.find((o) => o.id === selectedOptionId)
      : undefined;

    attemptRecords.push({
      attemptId: `${session.sessionId}:${q.id}`,
      sessionId: session.sessionId,
      examId: session.examId,
      questionId: q.id,
      domainId: q.domainId,
      subdomainId: q.subdomainId,
      topicId: q.topicId,
      timestamp: now,
      selectedOptionId,
      correctOptionId: q.explanation.correctOptionId,
      isCorrect,
      confidence: resp?.confidence ?? null,
      timeSpentSeconds: resp?.timeSpentSeconds ?? 0,
      estimatedTimeSeconds: q.estimatedTimeSeconds,
      wasFlagged: resp?.isFlagged ?? false,
      cognitiveLevel: q.cognitiveLevel,
      perspective: q.perspective,
      questionStyle: q.questionStyle,
      difficulty: q.difficulty,
      trapTypeTriggered: !isCorrect ? chosenOpt?.trapType ?? null : null,
    });
  }

  await db.question_attempts.bulkPut(attemptRecords);

  // Update rolling mastery across Domain, Subdomain, and Topic levels
  const keysToUpdate = new Map<
    string,
    {
      key: string;
      level: 'domain' | 'subdomain' | 'topic';
      domainId: string;
      subdomainId: string | null;
      topicId: string | null;
      name: string;
      attempts: QuestionAttemptRecord[];
    }
  >();

  for (const att of attemptRecords) {
    const q = questionMap.get(att.questionId);
    if (!q) continue;

    const domKey = `domain:${q.domainId}`;
    const subKey = `subdomain:${q.subdomainId}`;
    const topKey = `topic:${q.topicId}`;

    const register = (
      key: string,
      level: 'domain' | 'subdomain' | 'topic',
      subdomainId: string | null,
      topicId: string | null,
      name: string
    ) => {
      const existing = keysToUpdate.get(key) ?? {
        key,
        level,
        domainId: q.domainId,
        subdomainId,
        topicId,
        name,
        attempts: [],
      };
      existing.attempts.push(att);
      keysToUpdate.set(key, existing);
    };

    register(
      domKey,
      'domain',
      null,
      null,
      DOMAIN_NAMES[q.domainId] ?? domainName
    );
    register(subKey, 'subdomain', q.subdomainId, null, q.subdomainName);
    register(topKey, 'topic', q.subdomainId, q.topicId, q.topicName);
  }

  const updatedMasteryRecords: TopicMasteryRecord[] = [];

  for (const group of keysToUpdate.values()) {
    const prev = await db.topic_mastery.get(group.key);
    const batchTotal = group.attempts.length;
    const batchCorrect = group.attempts.filter((a) => a.isCorrect).length;
    const batchAcc = batchTotal > 0 ? (batchCorrect / batchTotal) * 100 : 0;
    const batchHighConfErr = group.attempts.filter(
      (a) => !a.isCorrect && a.confidence === 'high'
    ).length;
    const batchLowConfCorr = group.attempts.filter(
      (a) => a.isCorrect && a.confidence === 'low'
    ).length;
    const batchTimeRatio =
      batchTotal > 0
        ? group.attempts.reduce(
            (s, a) => s + a.timeSpentSeconds / Math.max(1, a.estimatedTimeSeconds),
            0
          ) / batchTotal
        : 1;

    const totalAttempts = (prev?.totalAttempts ?? 0) + batchTotal;
    const correctAttempts = (prev?.correctAttempts ?? 0) + batchCorrect;
    const rawAccuracyPercent =
      Math.round((correctAttempts / Math.max(1, totalAttempts)) * 1000) / 10;

    const recentWeightedScore =
      prev && prev.totalAttempts > 0
        ? Math.round(
            (EMA_ALPHA * batchAcc + (1 - EMA_ALPHA) * prev.recentWeightedScore) * 10
          ) / 10
        : Math.round(batchAcc * 10) / 10;

    const highConfidenceErrors = (prev?.highConfidenceErrors ?? 0) + batchHighConfErr;
    const lowConfidenceCorrects = (prev?.lowConfidenceCorrects ?? 0) + batchLowConfCorr;
    const avgTimeRatio =
      prev && prev.totalAttempts > 0
        ? Math.round((0.5 * batchTimeRatio + 0.5 * prev.avgTimeRatio) * 100) / 100
        : Math.round(batchTimeRatio * 100) / 100;

    const masteryTier = determineMasteryTier(
      rawAccuracyPercent,
      recentWeightedScore,
      highConfidenceErrors,
      totalAttempts
    );

    updatedMasteryRecords.push({
      key: group.key,
      level: group.level,
      domainId: group.domainId,
      subdomainId: group.subdomainId,
      topicId: group.topicId,
      name: group.name,
      totalAttempts,
      correctAttempts,
      rawAccuracyPercent,
      recentWeightedScore,
      highConfidenceErrors,
      lowConfidenceCorrects,
      avgTimeRatio,
      masteryTier,
      gapToTargetPercent: Math.max(0, Math.round((70 - recentWeightedScore) * 10) / 10),
      lastPracticedAt: now,
    });
  }

  await db.topic_mastery.bulkPut(updatedMasteryRecords);
}

export async function getAllMasteryRecords(): Promise<TopicMasteryRecord[]> {
  return db.topic_mastery.toArray();
}
