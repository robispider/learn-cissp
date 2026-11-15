import type {
  CognitiveLevel,
  DistractorTrapType,
  Question,
} from '../types/question';
import { TRAP_TYPE_METADATA } from '../types/question';
import type { ExamSessionRecord, QuestionResponseState } from '../types/session';
import type { BreakdownNode, DiagnosticReport } from '../types/analytics';

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function scoreSingleConfidenceContribution(
  isCorrect: boolean,
  confidence: 'low' | 'medium' | 'high' | null
): number {
  if (isCorrect) {
    if (confidence === 'high') return 1.0;
    if (confidence === 'low') return 0.65;
    return 0.9; // medium or unset
  } else {
    if (confidence === 'high') return -0.25; // Blind spot penalty
    if (confidence === 'low') return 0.0;   // Known gap
    return -0.1;                            // medium or unset
  }
}

export function classifyMasteryTier(
  rawAccuracyPercent: number,
  confidenceAdjustedPercent: number,
  blindSpotCount: number,
  luckyGuessCount: number,
  totalQuestions: number
): 'mastered' | 'proficient' | 'developing' | 'critical_weakness' {
  const blindSpotRate = totalQuestions > 0 ? blindSpotCount / totalQuestions : 0;

  if (rawAccuracyPercent < 55 || blindSpotRate > 0.25) {
    return 'critical_weakness';
  }
  if (
    rawAccuracyPercent >= 85 &&
    confidenceAdjustedPercent >= 80 &&
    blindSpotCount === 0
  ) {
    return 'mastered';
  }
  if (rawAccuracyPercent >= 70 && blindSpotCount <= 1 && luckyGuessCount < 2) {
    return 'proficient';
  }
  return 'developing';
}

interface NodeAcc {
  id: string;
  name: string;
  level: 'subdomain' | 'topic';
  parentId: string;
  weight: number;
  questions: Question[];
  responses: Array<{ q: Question; r: QuestionResponseState | undefined; isCorrect: boolean }>;
}

export function computeDiagnosticReport(
  session: ExamSessionRecord,
  questions: Question[],
  blueprintWeights?: Record<string, number>
): DiagnosticReport {
  const questionMap = new Map<string, Question>(questions.map((q) => [q.id, q]));
  const orderedQuestions = session.questionOrder
    .map((id) => questionMap.get(id))
    .filter((q): q is Question => Boolean(q));

  const totalQuestions = orderedQuestions.length || 1;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  let weightedCorrectSum = 0;
  let weightedTotalSum = 0;
  let confidenceScoreSum = 0;
  let totalTimeSpentSeconds = 0;

  const solidMasteryQuestionIds: string[] = [];
  const luckyGuessQuestionIds: string[] = [];
  const knownGapQuestionIds: string[] = [];
  const blindSpotQuestionIds: string[] = [];

  const rushedErrorQuestionIds: string[] = [];
  const timeSinkQuestionIds: string[] = [];
  const perQuestionPacing: DiagnosticReport['pacing']['perQuestionPacing'] = [];

  const trapMap = new Map<
    DistractorTrapType,
    { count: number; questionIds: string[] }
  >();

  const cognitiveOrder: CognitiveLevel[] = [
    'remember',
    'understand',
    'apply',
    'analyze',
    'evaluate',
  ];
  const cognitiveMap = new Map<CognitiveLevel, { total: number; correct: number }>(
    cognitiveOrder.map((c) => [c, { total: 0, correct: 0 }])
  );
  const perspectiveMap = new Map<string, { total: number; correct: number }>();

  const subdomainMap = new Map<string, NodeAcc>();
  const topicMap = new Map<string, NodeAcc>();

  orderedQuestions.forEach((q, idx) => {
    const resp = session.responses[q.id];
    const selectedId = resp?.selectedOptionId ?? null;
    const confidence = resp?.confidence ?? null;
    const timeSpent = resp?.timeSpentSeconds ?? 0;
    totalTimeSpentSeconds += timeSpent;

    const isAnswered = selectedId !== null;
    const isCorrect =
      isAnswered && selectedId === q.explanation.correctOptionId;

    if (!isAnswered) {
      unansweredCount++;
      incorrectCount++;
    } else if (isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
    }

    weightedTotalSum += q.difficulty;
    if (isCorrect) {
      weightedCorrectSum += q.difficulty;
    }

    confidenceScoreSum += scoreSingleConfidenceContribution(isCorrect, confidence);

    // Metacognitive classification
    if (isCorrect) {
      if (confidence === 'low') {
        luckyGuessQuestionIds.push(q.id);
      } else {
        solidMasteryQuestionIds.push(q.id);
      }
    } else {
      if (confidence === 'high') {
        blindSpotQuestionIds.push(q.id);
      } else {
        knownGapQuestionIds.push(q.id);
      }
    }

    // Trap tracking on wrong options
    if (!isCorrect && selectedId) {
      const chosenOpt = q.options.find((o) => o.id === selectedId);
      if (chosenOpt?.trapType) {
        const current = trapMap.get(chosenOpt.trapType) ?? {
          count: 0,
          questionIds: [],
        };
        current.count += 1;
        current.questionIds.push(q.id);
        trapMap.set(chosenOpt.trapType, current);
      }
    }

    // Cognitive level
    const cog = cognitiveMap.get(q.cognitiveLevel) ?? { total: 0, correct: 0 };
    cog.total += 1;
    if (isCorrect) cog.correct += 1;
    cognitiveMap.set(q.cognitiveLevel, cog);

    // Perspective
    const persp = perspectiveMap.get(q.perspective) ?? { total: 0, correct: 0 };
    persp.total += 1;
    if (isCorrect) persp.correct += 1;
    perspectiveMap.set(q.perspective, persp);

    // Pacing
    if (!isCorrect && timeSpent > 0 && timeSpent < 0.4 * q.estimatedTimeSeconds) {
      rushedErrorQuestionIds.push(q.id);
    }
    if (timeSpent > 1.5 * q.estimatedTimeSeconds) {
      timeSinkQuestionIds.push(q.id);
    }
    perQuestionPacing.push({
      questionNumber: idx + 1,
      questionId: q.id,
      timeSpentSeconds: timeSpent,
      estimatedTimeSeconds: q.estimatedTimeSeconds,
      isCorrect,
    });

    // Subdomain accumulator
    const subWeight = blueprintWeights?.[q.subdomainId] ?? 1.0;
    const subAcc = subdomainMap.get(q.subdomainId) ?? {
      id: q.subdomainId,
      name: q.subdomainName,
      level: 'subdomain' as const,
      parentId: q.domainId,
      weight: subWeight,
      questions: [],
      responses: [],
    };
    subAcc.questions.push(q);
    subAcc.responses.push({ q, r: resp, isCorrect });
    subdomainMap.set(q.subdomainId, subAcc);

    // Topic accumulator
    const topAcc = topicMap.get(q.topicId) ?? {
      id: q.topicId,
      name: q.topicName,
      level: 'topic' as const,
      parentId: q.subdomainId,
      weight: subWeight,
      questions: [],
      responses: [],
    };
    topAcc.questions.push(q);
    topAcc.responses.push({ q, r: resp, isCorrect });
    topicMap.set(q.topicId, topAcc);
  });

  const buildBreakdownNode = (acc: NodeAcc): BreakdownNode => {
    const n = acc.responses.length || 1;
    let cCount = 0;
    let dCorrect = 0;
    let dTotal = 0;
    let confSum = 0;
    let blindSpots = 0;
    let luckyGuesses = 0;
    let timeSum = 0;
    let estSum = 0;
    const directives = new Set<string>();

    for (const item of acc.responses) {
      const conf = item.r?.confidence ?? null;
      const tSpent = item.r?.timeSpentSeconds ?? 0;
      timeSum += tSpent;
      estSum += item.q.estimatedTimeSeconds;
      dTotal += item.q.difficulty;

      if (item.isCorrect) {
        cCount++;
        dCorrect += item.q.difficulty;
        if (conf === 'low') {
          luckyGuesses++;
          directives.add(item.q.explanation.studyFocusDirective);
        }
      } else {
        if (conf === 'high') {
          blindSpots++;
        }
        directives.add(item.q.explanation.studyFocusDirective);
      }

      confSum += scoreSingleConfidenceContribution(item.isCorrect, conf);
    }

    const rawAcc = round1((cCount / n) * 100);
    const diffWeighted = round1(dTotal > 0 ? (dCorrect / dTotal) * 100 : 0);
    const confAdjusted = round1(clamp(0, 100, (confSum / n) * 100));
    const gapPass = round1(Math.max(0, 70 - rawAcc));
    const gapMastery = round1(Math.max(0, 85 - confAdjusted));
    const blindSpotRate = blindSpots / n;

    // PGI_k = (85 - M_k) * (1 + 0.25 * BlindSpotRate_k) * w_k
    const normalizedWeight = acc.weight > 0 ? Math.max(0.5, acc.weight * 10) : 1;
    const pgi = round1(
      Math.max(0, 85 - confAdjusted) * (1 + 0.25 * blindSpotRate) * normalizedWeight
    );

    const tier = classifyMasteryTier(rawAcc, confAdjusted, blindSpots, luckyGuesses, n);

    return {
      id: acc.id,
      name: acc.name,
      level: acc.level,
      parentId: acc.parentId,
      totalQuestions: acc.responses.length,
      correctCount: cCount,
      incorrectCount: acc.responses.length - cCount,
      rawAccuracyPercent: rawAcc,
      difficultyWeightedPercent: diffWeighted,
      confidenceAdjustedPercent: confAdjusted,
      gapToPassPercent: gapPass,
      gapToMasteryPercent: gapMastery,
      priorityGapIndex: pgi,
      masteryTier: tier,
      blindSpotCount: blindSpots,
      luckyGuessCount: luckyGuesses,
      avgTimeSpentSeconds: Math.round(timeSum / n),
      avgEstimatedTimeSeconds: Math.round(estSum / n),
      studyDirectives: Array.from(directives),
    };
  };

  const subdomainBreakdown = Array.from(subdomainMap.values())
    .map(buildBreakdownNode)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const topicBreakdown = Array.from(topicMap.values())
    .map(buildBreakdownNode)
    .sort((a, b) => b.priorityGapIndex - a.priorityGapIndex);

  const topWeaknesses = [...subdomainBreakdown]
    .filter((n) => n.masteryTier === 'critical_weakness' || n.masteryTier === 'developing' || n.rawAccuracyPercent < 85)
    .sort((a, b) => b.priorityGapIndex - a.priorityGapIndex);

  const topStrengths = [...subdomainBreakdown]
    .filter((n) => n.masteryTier === 'mastered' || n.masteryTier === 'proficient')
    .sort((a, b) => b.confidenceAdjustedPercent - a.confidenceAdjustedPercent);

  const totalTrapErrors = Array.from(trapMap.values()).reduce((s, v) => s + v.count, 0) || 1;
  const trapTallies: DiagnosticReport['trapTallies'] = Array.from(trapMap.entries())
    .map(([trapType, data]) => ({
      trapType,
      label: TRAP_TYPE_METADATA[trapType]?.label ?? trapType,
      count: data.count,
      shareOfErrorsPercent: round1((data.count / totalTrapErrors) * 100),
      questionIds: data.questionIds,
      remediationAdvice: TRAP_TYPE_METADATA[trapType]?.remediationAdvice ?? '',
    }))
    .sort((a, b) => b.count - a.count);

  const cognitiveBreakdown: DiagnosticReport['cognitiveBreakdown'] = cognitiveOrder
    .map((level) => {
      const entry = cognitiveMap.get(level) ?? { total: 0, correct: 0 };
      return {
        cognitiveLevel: level,
        total: entry.total,
        correct: entry.correct,
        accuracyPercent: entry.total > 0 ? round1((entry.correct / entry.total) * 100) : 0,
      };
    })
    .filter((c) => c.total > 0);

  const perspectiveBreakdown: DiagnosticReport['perspectiveBreakdown'] = Array.from(
    perspectiveMap.entries()
  ).map(([perspective, entry]) => ({
    perspective,
    total: entry.total,
    correct: entry.correct,
    accuracyPercent: entry.total > 0 ? round1((entry.correct / entry.total) * 100) : 0,
  }));

  const rawAccuracyPercent = round1((correctCount / totalQuestions) * 100);
  const difficultyWeightedPercent = round1(
    weightedTotalSum > 0 ? (weightedCorrectSum / weightedTotalSum) * 100 : 0
  );
  const confidenceAdjustedPercent = round1(
    clamp(0, 100, (confidenceScoreSum / totalQuestions) * 100)
  );

  return {
    sessionId: session.sessionId,
    examId: session.examId,
    computedAt: new Date().toISOString(),
    overall: {
      totalQuestions: orderedQuestions.length,
      correctCount,
      incorrectCount,
      unansweredCount,
      rawAccuracyPercent,
      difficultyWeightedPercent,
      confidenceAdjustedPercent,
      passedBenchmark: rawAccuracyPercent >= 70,
      achievedMastery: confidenceAdjustedPercent >= 85,
      gapToPassPercent: round1(Math.max(0, 70 - rawAccuracyPercent)),
      gapToMasteryPercent: round1(Math.max(0, 85 - confidenceAdjustedPercent)),
      totalTimeSpentSeconds: Math.max(totalTimeSpentSeconds, session.elapsedSeconds),
      timeLimitSeconds: session.timeLimitSeconds,
    },
    subdomainBreakdown,
    topicBreakdown,
    topWeaknesses,
    topStrengths,
    metacognition: {
      solidMasteryQuestionIds,
      luckyGuessQuestionIds,
      knownGapQuestionIds,
      blindSpotQuestionIds,
    },
    trapTallies,
    cognitiveBreakdown,
    perspectiveBreakdown,
    pacing: {
      rushedErrorQuestionIds,
      timeSinkQuestionIds,
      perQuestionPacing,
    },
  };
}
