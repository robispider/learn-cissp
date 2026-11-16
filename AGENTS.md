# Agent Instructions — `learn-cissp`

Welcome, Agent. Before writing code, creating exams, or authoring CISSP question or memory card JSON files in this repository, **you must read and follow the canonical specification documents**:

1. **[Vision & Agent Playbook (`docs/VISION_AND_AGENT_PLAYBOOK.md`)](file:///D:/git/learn-cissp/docs/VISION_AND_AGENT_PLAYBOOK.md)**
   - Defines the Astro 5 static architecture, React 19 interactive islands, IndexedDB + `localStorage` browser persistence engine (resume/pause/review), diagnostic scoring formulas, and the 5 required post-exam graphical summary charts.
2. **[Question & Exam Data Specification (`docs/QUESTION_DATA_SPEC.md`)](file:///D:/git/learn-cissp/docs/QUESTION_DATA_SPEC.md)**
   - Defines the official 8 ISC2 CISSP Domains (`dom-1`..`dom-8`), Sub-domains (`1.1`..`8.5`), Micro-Topics, the self-indicating JSON question schema, distractor `trapType` tags, per-option answer explanations, and `DiagnosticReport` output contract.
3. **[Memorization & Spaced Repetition Specification (`docs/MEMORIZATION_AND_SRS_SPEC.md`)](file:///D:/git/learn-cissp/docs/MEMORIZATION_AND_SRS_SPEC.md)**
   - Defines the hybrid FSRS-6 (`ts-fsrs`) + DASH exam-coupling spaced repetition architecture, IndexedDB v2 schema (`memory_cards_state` & `memory_review_logs`), the 6 CISSP memory card archetypes + `MemoryCardSchema`, and the complete 8-domain / 58-subdomain memorization content blueprint.

---

## Non-Negotiable Rules for All Agents

1. **Astro Static-First + Zero Online Database**:
   - This is an **Astro** (`output: 'static'`) application. Do not add server databases, cloud authentication, or external backend dependencies.
   - All user state (active exam sessions, pause/resume checkpoints, per-question telemetry, confidence ratings, option strike-throughs, bookmarks, and historical topic mastery) MUST persist in the browser via **IndexedDB** (`cissp_learning_db`) and **`localStorage`**, with JSON Export/Import support.
2. **Domain & Sub-Domain Exam Structure**:
   - Every CISSP domain (`dom-1` through `dom-8`) supports both **Sub-Domain Exams** (`examScope: "subdomain"`, focused on a single sub-domain like `1.4` or `3.6`) and **Full Domain Exams** (`examScope: "domain_full"`, weighted across all sub-domains in that domain).
3. **Self-Indicating Question JSON**:
   - Every question JSON must conform to `QuestionSchema` in `src/content.config.ts`.
   - Every question must include hierarchical IDs (`domainId`, `subdomainId`, `topicId`), diagnostic indicators (`cognitiveLevel`, `perspective`, `questionStyle`, `difficulty`, `estimatedTimeSeconds`, `conceptsTested`), and a `studyFocusDirective`.
   - Every option (`A`, `B`, `C`, `D`) must have its own detailed `explanation`, and every incorrect option (`isCorrect: false`) must specify a non-null `trapType`.
4. **Post-Exam Strength, Weakness & Graphical Gap Summary**:
   - Completing any exam must compute a `DiagnosticReport` and present both a **granular strength/weakness table** (ranked by Priority Gap Index) and **5 graphical charts** (Sub-Domain Gap Bullet Chart, Multi-Axis Radar Chart, Distractor Trap & Cognitive Breakdown, Confidence vs. Accuracy Quadrant, and Per-Question Pacing Timeline).
