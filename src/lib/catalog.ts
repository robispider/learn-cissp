/**
 * Build-time catalog: joins the CBK taxonomy, exam manifests and the question
 * bank into a compact structure that client islands can render and that the
 * blueprint assembler can use for live exam previews.
 */
import type { ExamManifest, Question } from './types/question';
import type { BlueprintTaxonomyDomain, QuestionMeta } from './exam-engine/assembler';

export interface TaxonomyJson {
  domains: Array<{
    domainId: string;
    number: number;
    name: string;
    shortName: string;
    weightPercent: number;
    color: string;
    tagline: string;
    subdomains: Array<{
      subdomainId: string;
      name: string;
      weight: number;
      summary: string;
      topics: Array<{ topicId: string; name: string }>;
    }>;
  }>;
}

export interface CatalogTopic {
  topicId: string;
  name: string;
  questionCount: number;
}

export interface CatalogSubdomain {
  subdomainId: string;
  name: string;
  weight: number;
  summary: string;
  questionCount: number;
  topics: CatalogTopic[];
}

export interface CatalogDomain {
  domainId: string;
  number: number;
  name: string;
  shortName: string;
  weightPercent: number;
  color: string;
  tagline: string;
  questionCount: number;
  subdomains: CatalogSubdomain[];
}

export interface CatalogExam {
  examId: string;
  title: string;
  description: string;
  examScope: ExamManifest['examScope'];
  domainId: string;
  subdomainId: string | null;
  questionCount: number;
  timeLimitMinutes: number;
}

export interface CatalogData {
  domains: CatalogDomain[];
  exams: CatalogExam[];
  questionMeta: QuestionMeta[];
  totalQuestions: number;
}

export function toQuestionMeta(q: Question): QuestionMeta {
  return {
    id: q.id,
    domainId: q.domainId,
    subdomainId: q.subdomainId,
    topicId: q.topicId,
    difficulty: q.difficulty,
    estimatedTimeSeconds: q.estimatedTimeSeconds,
  };
}

export function buildCatalog(
  taxonomy: TaxonomyJson,
  exams: ExamManifest[],
  questions: Question[]
): CatalogData {
  const countBy = (key: (q: Question) => string) => {
    const m = new Map<string, number>();
    for (const q of questions) m.set(key(q), (m.get(key(q)) ?? 0) + 1);
    return m;
  };
  const byDomain = countBy((q) => q.domainId);
  const bySub = countBy((q) => q.subdomainId);
  const byTopic = countBy((q) => q.topicId);

  const domains: CatalogDomain[] = taxonomy.domains.map((d) => ({
    domainId: d.domainId,
    number: d.number,
    name: d.name,
    shortName: d.shortName,
    weightPercent: d.weightPercent,
    color: d.color,
    tagline: d.tagline,
    questionCount: byDomain.get(d.domainId) ?? 0,
    subdomains: d.subdomains.map((s) => ({
      subdomainId: s.subdomainId,
      name: s.name,
      weight: s.weight,
      summary: s.summary,
      questionCount: bySub.get(s.subdomainId) ?? 0,
      topics: s.topics.map((t) => ({
        topicId: t.topicId,
        name: t.name,
        questionCount: byTopic.get(t.topicId) ?? 0,
      })),
    })),
  }));

  const catalogExams: CatalogExam[] = exams
    .map((e) => ({
      examId: e.examId,
      title: e.title,
      description: e.description,
      examScope: e.examScope,
      domainId: e.domainId,
      subdomainId: e.subdomainId,
      questionCount: e.questionIds.length,
      timeLimitMinutes: e.timeLimitMinutes,
    }))
    .sort((a, b) => a.examId.localeCompare(b.examId, undefined, { numeric: true }));

  return {
    domains,
    exams: catalogExams,
    questionMeta: questions.map(toQuestionMeta),
    totalQuestions: questions.length,
  };
}

/** Taxonomy shape expected by the blueprint assembler. */
export function toBlueprintTaxonomy(domains: CatalogDomain[]): BlueprintTaxonomyDomain[] {
  return domains.map((d) => ({
    domainId: d.domainId,
    number: d.number,
    name: d.name,
    shortName: d.shortName,
    weightPercent: d.weightPercent,
    subdomains: d.subdomains.map((s) => ({
      subdomainId: s.subdomainId,
      name: s.name,
      weight: s.weight,
      topics: s.topics.map((t) => ({ topicId: t.topicId, name: t.name })),
    })),
  }));
}
