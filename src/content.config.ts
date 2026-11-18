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
  exhibit: z.object({
    file: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/),
    alt: z.string().trim().min(1),
  }).optional(),
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

// ---------------------------------------------------------------------------
// Memorization & Spaced Repetition (docs/MEMORIZATION_AND_SRS_SPEC.md §5)
// ---------------------------------------------------------------------------

export const MemoryCardTypeEnum = z.enum([
  'concept_contrast',
  'sequence_order',
  'formula_drill',
  'reference_fact',
  'cloze_deletion',
  'manager_heuristic',
]);

export const ExamPriorityEnum = z.enum([
  'must_know',   // Core exam pillars tested across multiple questions
  'high_yield',  // Frequently tested distinctions, numbers, and models
  'deep_detail', // Edge facts, rare protocols, or granular sub-clauses
]);

export const ContrastColumnSchema = z.object({
  label: z.string().min(2),
  badge: z.string().optional(),
  points: z.array(z.string().min(3)).min(2),
});

export const MemoryCardSchema = z
  .object({
    id: z.string().regex(/^cissp-mem-d[1-8]-s\d+\.\d+-c\d{3,4}$/),
    version: z.number().int().positive().default(1),

    // 1. Hierarchical Taxonomy Binding (matches cissp-cbk-2026.json)
    domainId: z.enum(['dom-1', 'dom-2', 'dom-3', 'dom-4', 'dom-5', 'dom-6', 'dom-7', 'dom-8']),
    subdomainId: z.string().regex(/^[1-8]\.\d{1,2}$/),
    subdomainName: z.string().min(3),
    topicId: z.string().regex(/^[1-8]\.\d{1,2}\.\d{1,2}$/),
    topicName: z.string().min(3),

    // 2. FSRS Prior & Diagnostic Coupling Metadata
    cardType: MemoryCardTypeEnum,
    examPriority: ExamPriorityEnum.default('high_yield'),
    intrinsicDifficulty: z.number().int().min(1).max(10).default(5), // Seeds initial FSRS D0 prior
    cognitiveLevel: CognitiveLevelEnum,
    perspective: CisspPerspectiveEnum,
    relatedTrapTypes: z.array(DistractorTrapTypeEnum).default([]),
    relatedQuestionIds: z.array(z.string()).default([]),
    keyTerms: z.array(z.string()).min(1),
    tags: z.array(z.string()).default([]),

    // 3. Core Front/Back Content
    title: z.string().min(5),
    prompt: z.string().min(15),
    answerSummary: z.string().min(15),
    mnemonic: z.string().nullable().default(null),
    examTrapWarning: z.string().min(15),

    // 4. Archetype-Specific Structured Payloads
    contrastData: z
      .object({
        ruleOfThumb: z.string().min(10),
        columns: z.array(ContrastColumnSchema).min(2).max(4),
      })
      .optional(),

    sequenceData: z
      .object({
        directionLabel: z.string().min(3),
        steps: z
          .array(
            z.object({
              order: z.number().int().positive(),
              label: z.string().min(2),
              detail: z.string().min(5),
            })
          )
          .min(3),
      })
      .optional(),

    formulaData: z
      .object({
        formula: z.string().min(3),
        variables: z.array(z.object({ symbol: z.string(), meaning: z.string() })).min(2),
        workedExample: z.string().min(15),
        decisionRule: z.string().min(10),
      })
      .optional(),

    matrixData: z
      .object({
        headers: z.array(z.string()).min(2),
        rows: z.array(z.array(z.string())).min(2),
      })
      .optional(),

    clozeTemplate: z.string().min(15).optional(), // Uses {{c1::answer::optional hint}} syntax

    heuristicData: z
      .object({
        technicalReflexTrap: z.string().min(15),
        managerAction: z.string().min(15),
        governingPrinciple: z.string().min(10),
      })
      .optional(),

    // 5. Authoritative References
    references: z
      .array(
        z.object({
          source: z.string().min(3),
          section: z.string().min(2),
        })
      )
      .min(1),

    // 6. Optional presentation layer (see MEMORIZATION_AND_SRS_SPEC.md §4.7)
    presentation: z
      .object({
        modality: z.enum(['text', 'visual', 'animated']).optional(),
        plugin: z
          .object({
            id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Plugin ids are kebab-case'),
            props: z.record(z.string(), z.unknown()).optional(),
          })
          .optional(),
        hook: z.string().min(10).optional(),
        elaborate: z.string().min(10).optional(),
      })
      .optional(),
  })
  .superRefine((card, ctx) => {
    if (card.cardType === 'concept_contrast' && !card.contrastData) {
      ctx.addIssue({ code: 'custom', message: 'concept_contrast cards require contrastData' });
    }
    if (card.cardType === 'sequence_order' && !card.sequenceData) {
      ctx.addIssue({ code: 'custom', message: 'sequence_order cards require sequenceData' });
    }
    if (card.cardType === 'formula_drill' && !card.formulaData) {
      ctx.addIssue({ code: 'custom', message: 'formula_drill cards require formulaData' });
    }
    if (card.cardType === 'reference_fact' && !card.matrixData) {
      ctx.addIssue({ code: 'custom', message: 'reference_fact cards require matrixData' });
    }
    if (card.cardType === 'cloze_deletion' && !card.clozeTemplate?.includes('{{c')) {
      ctx.addIssue({
        code: 'custom',
        message: 'cloze_deletion cards require clozeTemplate containing {{c1::...}} markup',
      });
    }
    if (card.cardType === 'manager_heuristic' && !card.heuristicData) {
      ctx.addIssue({ code: 'custom', message: 'manager_heuristic cards require heuristicData' });
    }
    // Card id must encode the same domain and sub-domain it declares.
    const expectedPrefix = `cissp-mem-d${card.domainId.slice(4)}-s${card.subdomainId}-`;
    if (!card.id.startsWith(expectedPrefix)) {
      ctx.addIssue({
        code: 'custom',
        message: `Card id "${card.id}" must start with "${expectedPrefix}" to match domainId/subdomainId`,
      });
    }
    if (!card.topicId.startsWith(`${card.subdomainId}.`)) {
      ctx.addIssue({
        code: 'custom',
        message: `topicId ${card.topicId} does not belong to subdomainId ${card.subdomainId}`,
      });
    }
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

const memoryCardModules = import.meta.glob<{ default: Record<string, unknown>[] }>(
  './content/memory-cards/**/*.json',
  { eager: true }
);

const memoryCards = defineCollection({
  loader: {
    name: 'memory-cards-directory-loader',
    load: async ({ logger, parseData, store }) => {
      store.clear();
      const seenIds = new Set<string>();

      for (const [modulePath, mod] of Object.entries(memoryCardModules).sort(([a], [b]) =>
        a.localeCompare(b)
      )) {
        const items = mod.default;
        const relPath = modulePath.replace(/^\.\//, 'src/');
        if (!Array.isArray(items)) {
          logger.error(`Memory card file ${relPath} must export a JSON array.`);
          continue;
        }
        for (const rawItem of items) {
          const id = typeof rawItem?.id === 'string' ? rawItem.id : undefined;
          if (!id) {
            logger.error(`Memory card entry in ${relPath} is missing an id field.`);
            continue;
          }
          if (seenIds.has(id)) {
            throw new Error(`Duplicate memory card id "${id}" found in ${relPath}`);
          }
          seenIds.add(id);
          const data = await parseData({ id, data: rawItem });
          store.set({ id, data, filePath: relPath });
        }
      }
    },
  },
  schema: MemoryCardSchema,
});

export const collections = {
  questions,
  exams,
  memoryCards,
};
