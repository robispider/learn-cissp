export type DistractorTrapType =
  | 'technical_fix_over_process'
  | 'wrong_lifecycle_phase'
  | 'extreme_absolutist'
  | 'confuses_similar_terms'
  | 'solves_wrong_problem'
  | 'premature_escalation'
  | 'ignores_human_safety'
  | 'cost_disproportionate'
  | 'incomplete_partial_answer';

export type CognitiveLevel =
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate';

export type CisspPerspective =
  | 'manager_governance'
  | 'risk_advisor'
  | 'technical_architect'
  | 'incident_responder'
  | 'compliance_auditor';

export type QuestionStyle =
  | 'best_answer'
  | 'first_action'
  | 'most_likely'
  | 'least_likely'
  | 'calculation'
  | 'concept_mapping';

export type OptionId = 'A' | 'B' | 'C' | 'D';

export type DomainId =
  | 'dom-1'
  | 'dom-2'
  | 'dom-3'
  | 'dom-4'
  | 'dom-5'
  | 'dom-6'
  | 'dom-7'
  | 'dom-8';

export interface QuestionOption {
  id: OptionId;
  text: string;
  isCorrect: boolean;
  explanation: string;
  trapType: DistractorTrapType | null;
}

export interface QuestionReference {
  source: string;
  section: string;
}

export interface QuestionExhibit {
  file: string;
  alt: string;
}

export interface QuestionExplanation {
  correctOptionId: OptionId;
  summary: string;
  managerMindsetTip: string;
  studyFocusDirective: string;
  keyTakeaway: string;
  references: QuestionReference[];
}

export interface Question {
  id: string;
  version: number;
  domainId: DomainId;
  subdomainId: string;
  subdomainName: string;
  topicId: string;
  topicName: string;
  cognitiveLevel: CognitiveLevel;
  perspective: CisspPerspective;
  questionStyle: QuestionStyle;
  difficulty: 1 | 2 | 3 | 4 | 5;
  difficultyLabel: 'foundational' | 'intermediate' | 'advanced' | 'exam_hard' | 'cat_stretch';
  estimatedTimeSeconds: number;
  conceptsTested: string[];
  keyTerms: string[];
  tags: string[];
  stem: string;
  scenarioContext: string | null;
  exhibit?: QuestionExhibit;
  highlightKeywords: string[];
  options: QuestionOption[];
  explanation: QuestionExplanation;
}

export interface ExamManifest {
  examId: string;
  title: string;
  description: string;
  /** 'overall' = all 8 domains (full CISSP); 'remediation' = generated weak-area exam. */
  examScope: 'subdomain' | 'domain_full' | 'overall' | 'remediation';
  /** 'all' is used by overall (multi-domain) exams. */
  domainId: DomainId | 'all';
  subdomainId: string | null;
  timeLimitMinutes: number;
  passingScorePercent: number;
  masteryScorePercent: number;
  questionIds: string[];
  blueprintWeights?: Record<string, number>;
}

export interface HydratedExamPayload extends ExamManifest {
  questions: Question[];
}

export const TRAP_TYPE_METADATA: Record<
  DistractorTrapType,
  { label: string; shortLabel: string; remediationAdvice: string }
> = {
  technical_fix_over_process: {
    label: 'Technical Fix Over Governance Process',
    shortLabel: 'Tech Fix > Process',
    remediationAdvice:
      'Step back from the keyboard. On the CISSP exam, policy, risk assessment, and management authorization come before hands-on configuration changes.',
  },
  wrong_lifecycle_phase: {
    label: 'Wrong Lifecycle Phase / Sequence',
    shortLabel: 'Wrong Phase Order',
    remediationAdvice:
      'Verify the exact lifecycle phase in the stem (e.g., BCP Initiation -> BIA -> Strategy, or IR Containment -> Eradication -> Recovery) before picking an action.',
  },
  extreme_absolutist: {
    label: 'Extreme / Absolutist Distractor',
    shortLabel: 'Extreme Language',
    remediationAdvice:
      'Watch out for options claiming to eliminate 100% of risk, permanently ban business operations, or ignore cost constraints.',
  },
  confuses_similar_terms: {
    label: 'Confused Sibling Concepts',
    shortLabel: 'Sibling Term Mix-up',
    remediationAdvice:
      'Contrast sibling pairs side-by-side (e.g., Due Diligence vs. Due Care, Data Owner vs. Custodian, RTO vs. RPO, Standard vs. Guideline).',
  },
  solves_wrong_problem: {
    label: 'Valid Control for Wrong Problem',
    shortLabel: 'Wrong Problem Solved',
    remediationAdvice:
      'Re-read the final sentence of the stem to confirm which security objective (Confidentiality, Integrity, Availability, Non-repudiation) is actually at risk.',
  },
  premature_escalation: {
    label: 'Premature External Escalation',
    shortLabel: 'Premature Escalation',
    remediationAdvice:
      'Always follow internal governance, incident validation, and executive/legal consultation before escalating to external media or regulators.',
  },
  ignores_human_safety: {
    label: 'Ignored Human Safety Priority',
    shortLabel: 'Human Safety First',
    remediationAdvice:
      'Remember ISC2 Canon I and Physical Security rules: human life and physical safety ALWAYS supersede data protection, uptime, or employer convenience.',
  },
  cost_disproportionate: {
    label: 'Disproportionate Control Cost',
    shortLabel: 'Cost > Benefit',
    remediationAdvice:
      'Ensure the Annualized Cost of the Safeguard (ACS) never exceeds the annual risk reduction (ALE_before - ALE_after) or business value.',
  },
  incomplete_partial_answer: {
    label: 'Partial / Narrow Answer',
    shortLabel: 'Too Narrow',
    remediationAdvice:
      'When multiple options look true, select the broader umbrella answer that encompasses or governs the narrower technical options.',
  },
};

export const PERSPECTIVE_LABELS: Record<CisspPerspective, string> = {
  manager_governance: 'CISO / Governance',
  risk_advisor: 'Risk Advisor',
  technical_architect: 'Security Architect',
  incident_responder: 'Incident Responder',
  compliance_auditor: 'Compliance & Legal',
};

export const COGNITIVE_LABELS: Record<CognitiveLevel, string> = {
  remember: 'Remember',
  understand: 'Understand',
  apply: 'Apply',
  analyze: 'Analyze',
  evaluate: 'Evaluate',
};
