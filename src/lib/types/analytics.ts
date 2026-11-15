export interface BreakdownNode {
  id: string;                        // e.g. "1.4" (subdomain) or "1.4.2" (topic)
  name: string;
  level: 'subdomain' | 'topic';
  parentId: string;                  // "dom-1" or "1.4"
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  rawAccuracyPercent: number;        // 0 - 100
  difficultyWeightedPercent: number; // 0 - 100
  confidenceAdjustedPercent: number; // 0 - 100
  gapToPassPercent: number;          // max(0, 70 - rawAccuracyPercent)
  gapToMasteryPercent: number;       // max(0, 85 - confidenceAdjustedPercent)
  priorityGapIndex: number;          // Higher = more urgent to study
  masteryTier: 'mastered' | 'proficient' | 'developing' | 'critical_weakness';
  blindSpotCount: number;            // High confidence + Wrong
  luckyGuessCount: number;           // Low confidence + Right
  avgTimeSpentSeconds: number;
  avgEstimatedTimeSeconds: number;
  studyDirectives: string[];         // Aggregated from missed/weak questions in this node
}

export interface DiagnosticReport {
  sessionId: string;
  examId: string;
  computedAt: string;

  // 1. Executive Summary KPIs
  overall: {
    totalQuestions: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    rawAccuracyPercent: number;
    difficultyWeightedPercent: number;
    confidenceAdjustedPercent: number;
    passedBenchmark: boolean;        // rawAccuracyPercent >= 70
    achievedMastery: boolean;        // confidenceAdjustedPercent >= 85
    gapToPassPercent: number;
    gapToMasteryPercent: number;
    totalTimeSpentSeconds: number;
    timeLimitSeconds: number;
  };

  // 2. Hierarchical Breakdown (Powers Radar Chart, Gap Bullet Chart, and Strength/Weakness Table)
  subdomainBreakdown: BreakdownNode[];
  topicBreakdown: BreakdownNode[];

  // 3. Sorted Action Lists
  topWeaknesses: BreakdownNode[];    // Sorted descending by priorityGapIndex
  topStrengths: BreakdownNode[];     // Filtered by masteryTier === 'mastered' | 'proficient', sorted by confidenceAdjustedPercent

  // 4. Metacognitive Matrix (Powers 2x2 Quadrant Chart)
  metacognition: {
    solidMasteryQuestionIds: string[];    // Correct + High/Med Confidence
    luckyGuessQuestionIds: string[];      // Correct + Low Confidence
    knownGapQuestionIds: string[];        // Incorrect + Low/Med Confidence
    blindSpotQuestionIds: string[];       // Incorrect + High Confidence
  };

  // 5. Behavioral & Cognitive Diagnostics (Powers Trap & Cognitive Charts)
  trapTallies: Array<{
    trapType: string;
    label: string;
    count: number;
    shareOfErrorsPercent: number;
    questionIds: string[];
    remediationAdvice: string;
  }>;

  cognitiveBreakdown: Array<{
    cognitiveLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate';
    total: number;
    correct: number;
    accuracyPercent: number;
  }>;

  perspectiveBreakdown: Array<{
    perspective: string;
    total: number;
    correct: number;
    accuracyPercent: number;
  }>;

  // 6. Pacing Diagnostics (Powers Pacing Timeline)
  pacing: {
    rushedErrorQuestionIds: string[];     // Incorrect & timeSpent < 0.4 * estimatedTime
    timeSinkQuestionIds: string[];        // timeSpent > 1.5 * estimatedTime
    perQuestionPacing: Array<{
      questionNumber: number;
      questionId: string;
      timeSpentSeconds: number;
      estimatedTimeSeconds: number;
      isCorrect: boolean;
    }>;
  };
}
