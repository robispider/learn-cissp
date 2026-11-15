import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const DistractorTrapTypeEnum = z.enum([
  'technical_fix_over_process', // Chose hands-on technical action when a governance/policy/management step was required
  'wrong_lifecycle_phase',      // Chose a valid action, but for the wrong phase (e.g., containment action during recovery)
  'extreme_absolutist',         // Fell for an "always / never / eliminate all risk" distractor
  'confuses_similar_terms',     // Confused sibling concepts (e.g., Due Care vs. Due Diligence, BCP vs. DRP, Biba vs. Bell-LaPadula)
  'solves_wrong_problem',       // Valid security control, but does not address the root requirement in the stem
  'premature_escalation',       // Escalated to law enforcement/regulators before internal validation/management review
  'ignores_human_safety',       // Prioritized data/systems over human life and physical safety
  'cost_disproportionate',      // Selected a control whose cost exceeds asset value / ALE
  'incomplete_partial_answer',  // True statement, but another option encompasses it more broadly
]);

export const CognitiveLevelEnum = z.enum([
  'remember',   // Recall definitions, port numbers, key lengths, standard names
  'understand', // Explain concepts, compare two models
  'apply',      // Execute a formula (SLE/ARO/ALE) or map a control to a scenario
  'analyze',    // Differentiate root cause in a multi-factor scenario
  'evaluate',   // Judge the BEST / MOST / FIRST action among multiple plausible choices
]);

export const CisspPerspectiveEnum = z.enum([
  'manager_governance', // CISO / Management policy & oversight lens
  'risk_advisor',       // Business risk alignment & cost-benefit lens
  'technical_architect',// Security engineering & cryptographic design lens
  'incident_responder', // Forensics, containment & operations lens
  'compliance_auditor', // Legal, regulatory, & third-party audit lens
]);

export const QuestionStyleEnum = z.enum([
  'best_answer',        // "Which of the following is the BEST..."
  'first_action',       // "What should the security manager do FIRST / NEXT..."
  'most_likely',        // "Which is MOST likely to..."
  'least_likely',       // "Which of the following is LEAST appropriate / NOT..."
  'calculation',        // Quantitative calculation (ALE, MTBF, availability %)
  'concept_mapping',    // Direct concept / architecture identification
]);

export const QuestionOptionSchema = z.object({
  id: z.enum(['A', 'B', 'C', 'D']),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  explanation: z.string().min(20, 'Each option requires a detailed explanation of why it is right or wrong.'),
  trapType: DistractorTrapTypeEnum.nullable().default(null), // Required for incorrect options (isCorrect: false)
});

export const QuestionSchema = z.object({
  id: z.string().regex(/^cissp-d[1-8]-s\d+\.\d+-q\d{3,4}$/),
  version: z.number().int().positive().default(1),

  // 1. Hierarchical Taxonomy Indicators
  domainId: z.enum(['dom-1', 'dom-2', 'dom-3', 'dom-4', 'dom-5', 'dom-6', 'dom-7', 'dom-8']),
  subdomainId: z.string().regex(/^[1-8]\.\d{1,2}$/),
  subdomainName: z.string(),
  topicId: z.string().regex(/^[1-8]\.\d{1,2}\.\d{1,2}$/),
  topicName: z.string(),

  // 2. Diagnostic & Cognitive Indicators ("Indicating Data")
  cognitiveLevel: CognitiveLevelEnum,
  perspective: CisspPerspectiveEnum,
  questionStyle: QuestionStyleEnum,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  difficultyLabel: z.enum(['foundational', 'intermediate', 'advanced', 'exam_hard', 'cat_stretch']),
  estimatedTimeSeconds: z.number().int().min(20).max(240).default(75),
  conceptsTested: z.array(z.string()).min(1),
  keyTerms: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),

  // 3. Question Content
  stem: z.string().min(30),
  scenarioContext: z.string().nullable().default(null), // Optional background exhibit / table / scenario block
  highlightKeywords: z.array(z.string()).default([]),   // Words like "BEST", "FIRST", "NOT", "PRIMARY" for Review Mode

  // 4. Options (Exactly 4 options, 1 correct)
  options: z.array(QuestionOptionSchema)
    .length(4)
    .refine((opts) => opts.filter((o) => o.isCorrect).length === 1, {
      message: 'Exactly one option must have isCorrect: true',
    })
    .refine((opts) => opts.filter((o) => !o.isCorrect).every((o) => o.trapType !== null), {
      message: 'Every incorrect option (distractor) must specify a non-null trapType for diagnostic analysis',
    }),

  // 5. Comprehensive Explanations & Study Guidance
  explanation: z.object({
    correctOptionId: z.enum(['A', 'B', 'C', 'D']),
    summary: z.string().min(40),
    managerMindsetTip: z.string().min(20),
    studyFocusDirective: z.string().min(20), // Specific actionable instruction if the user misses this question
    keyTakeaway: z.string().min(20),
    references: z.array(
      z.object({
        source: z.string(), // e.g., "ISC2 CISSP Official Study Guide (10th Ed.)" or "NIST SP 800-61r2"
        section: z.string(),
      })
    ).min(1),
  }),
});

export const ExamManifestSchema = z.object({
  examId: z.string(),
  title: z.string(),
  description: z.string(),
  examScope: z.enum(['subdomain', 'domain_full', 'overall']), // 'overall' = predefined full-CISSP set spanning all 8 domains
  domainId: z.enum(['dom-1', 'dom-2', 'dom-3', 'dom-4', 'dom-5', 'dom-6', 'dom-7', 'dom-8', 'all']), // 'all' only for overall exams
  subdomainId: z.string().nullable(), // Non-null for "subdomain" exams, null for "domain_full" / "overall" exams
  timeLimitMinutes: z.number().int().positive(),
  passingScorePercent: z.number().min(50).max(100).default(70),
  masteryScorePercent: z.number().min(70).max(100).default(85),
  questionIds: z.array(z.string()).min(10),
  blueprintWeights: z.record(z.string(), z.number()).optional(), // Subdomain ID -> target percentage for full domain exams
}).refine((e) => (e.examScope === 'overall') === (e.domainId === 'all'), {
  message: 'Overall exams must use domainId "all", and only overall exams may use it',
});

const questionModules = import.meta.glob<{ default: Record<string, unknown>[] }>(
  './content/questions/**/*.json',
  { eager: true }
);

const questions = defineCollection({
  loader: {
    name: 'questions-directory-loader',
    load: async ({ logger, parseData, store }) => {
      store.clear();
      const seenIds = new Set<string>();

      for (const [modulePath, mod] of Object.entries(questionModules).sort(([a], [b]) =>
        a.localeCompare(b)
      )) {
        const items = mod.default;
        if (!Array.isArray(items)) {
          logger.error(`Question file ${modulePath} must export a JSON array.`);
          continue;
        }
        const relPath = modulePath.replace(/^\.\//, 'src/');
        for (const rawItem of items) {
          const id = typeof rawItem?.id === 'string' ? rawItem.id : undefined;
          if (!id) {
            logger.error(`Question entry in ${relPath} is missing an id field.`);
            continue;
          }
          if (seenIds.has(id)) {
            throw new Error(`Duplicate question id "${id}" found in ${relPath}`);
          }
          seenIds.add(id);
          const data = await parseData({ id, data: rawItem });
          store.set({ id, data, filePath: relPath });
        }
      }
    },
  },
  schema: QuestionSchema,
});

const exams = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/exams' }),
  schema: ExamManifestSchema,
});

export const collections = {
  questions,
  exams,
};
