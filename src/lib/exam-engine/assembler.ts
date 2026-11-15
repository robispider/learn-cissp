/**
 * Blueprint-driven exam assembler.
 *
 * Mirrors how ISC2 builds CISSP exams from an item bank:
 *   1. Content balancing — the exam length is apportioned across content areas
 *      (domains → sub-domains → micro-topics) in proportion to the official
 *      blueprint weights, using largest-remainder apportionment.
 *   2. Capacity-aware redistribution — when a content area has fewer items than
 *      its quota, the shortfall is redistributed to the remaining areas by weight
 *      (the same way an item pool with thin coverage behaves).
 *   3. Difficulty targeting — inside each area, items are drawn to match a
 *      bell-shaped difficulty profile centred just above the passing standard,
 *      similar to the item mix a CAT converges on for a borderline candidate.
 *   4. Exposure control — items the learner has never seen are preferred, then
 *      items previously answered incorrectly, then items already answered correctly.
 *   5. Randomised interleaving — the final order is shuffled so domains are mixed,
 *      as on the live exam.
 *
 * The assembler works on lightweight question metadata so it can run both for
 * live previews (catalog pages) and for real exam generation (exam launcher).
 */
import { shuffleArray } from './shuffler';
import { withBase } from '../paths';

export interface QuestionMeta {
  id: string;
  domainId: string;
  subdomainId: string;
  topicId: string;
  difficulty: number;
  estimatedTimeSeconds: number;
}

export interface BlueprintTaxonomyDomain {
  domainId: string;
  number: number;
  name: string;
  shortName: string;
  weightPercent: number;
  subdomains: Array<{
    subdomainId: string;
    name: string;
    weight: number;
    topics: Array<{ topicId: string; name: string }>;
  }>;
}

export type ExamBlueprintScope =
  | { kind: 'overall' }
  | { kind: 'domain'; domainId: string }
  | { kind: 'subdomain'; subdomainId: string }
  | { kind: 'remediation'; subdomainWeights: Record<string, number> };

/** Per-question history used for exposure control. */
export interface ExposureRecord {
  attempts: number;
  lastCorrect: boolean;
}

export interface AssembleOptions {
  length: number;
  seed?: string;
  exposure?: Map<string, ExposureRecord>;
}

export interface BlueprintPlanRow {
  id: string;
  label: string;
  /** Normalised blueprint share (0–1) of this content area within the scope. */
  weight: number;
  /** Items available in the bank for this content area. */
  available: number;
  /** Items actually allocated to this content area. */
  allocated: number;
}

export interface AssembledExam {
  questionIds: string[];
  plan: BlueprintPlanRow[];
  requestedLength: number;
  /** Total items in the bank that fall inside this scope. */
  poolSize: number;
  /** Share of blueprint weight that has at least one item in the bank (0–1). */
  blueprintCoverage: number;
}

/** Target difficulty mix (1 = foundational … 5 = CAT stretch). */
export const DIFFICULTY_TARGET: Record<number, number> = {
  1: 0.05,
  2: 0.15,
  3: 0.4,
  4: 0.3,
  5: 0.1,
};

/** CISSP CAT: up to 150 items in 3 hours → 1.2 minutes per item. */
export const MINUTES_PER_ITEM = 1.2;

export function estimateTimeLimitMinutes(itemCount: number): number {
  return Math.max(10, Math.ceil((itemCount * MINUTES_PER_ITEM) / 5) * 5);
}

interface Stratum {
  id: string;
  label: string;
  weight: number;
  capacity: number;
}

/**
 * Largest-remainder (Hamilton) apportionment with per-stratum capacity caps.
 * Any quota that cannot be satisfied is re-apportioned across strata that still
 * have capacity, so the total always equals min(total, Σ capacity).
 */
export function apportion(total: number, strata: Stratum[]): Map<string, number> {
  const result = new Map<string, number>(strata.map((s) => [s.id, 0]));
  let remaining = Math.min(
    total,
    strata.reduce((sum, s) => sum + s.capacity, 0)
  );

  while (remaining > 0) {
    const open = strata.filter((s) => (result.get(s.id) ?? 0) < s.capacity);
    if (open.length === 0) break;

    const weightSum = open.reduce((sum, s) => sum + Math.max(s.weight, 0), 0);
    const normalised = open.map((s) => ({
      s,
      share: weightSum > 0 ? Math.max(s.weight, 0) / weightSum : 1 / open.length,
    }));

    const quotas = normalised.map(({ s, share }) => {
      const exact = remaining * share;
      return { s, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
    });

    let handed = 0;
    for (const q of quotas) {
      const room = q.s.capacity - (result.get(q.s.id) ?? 0);
      const give = Math.min(room, q.floor);
      result.set(q.s.id, (result.get(q.s.id) ?? 0) + give);
      handed += give;
    }

    let leftover = remaining - handed;
    // Hand out remainders by largest fractional part (ties → larger weight).
    const byRemainder = [...quotas].sort(
      (a, b) => b.frac - a.frac || b.s.weight - a.s.weight
    );
    for (const q of byRemainder) {
      if (leftover <= 0) break;
      if ((result.get(q.s.id) ?? 0) < q.s.capacity) {
        result.set(q.s.id, (result.get(q.s.id) ?? 0) + 1);
        leftover -= 1;
        handed += 1;
      }
    }

    if (handed === 0) break;
    remaining -= handed;
  }

  return result;
}

function exposureRank(id: string, exposure?: Map<string, ExposureRecord>): number {
  const rec = exposure?.get(id);
  if (!rec || rec.attempts === 0) return 0; // never seen
  if (!rec.lastCorrect) return 1; // seen & missed → worth re-testing
  return 2; // seen & answered correctly
}

/**
 * Picks `count` items from a leaf pool, preferring low exposure and steering the
 * running difficulty mix toward DIFFICULTY_TARGET.
 */
function pickFromLeaf(
  pool: QuestionMeta[],
  count: number,
  difficultyTally: Record<number, number>,
  pickedSoFar: { n: number },
  seed: string,
  exposure?: Map<string, ExposureRecord>
): QuestionMeta[] {
  const candidates = shuffleArray(pool, seed);
  const chosen: QuestionMeta[] = [];

  while (chosen.length < count && candidates.length > 0) {
    const bestRank = Math.min(...candidates.map((c) => exposureRank(c.id, exposure)));
    const tier = candidates.filter((c) => exposureRank(c.id, exposure) === bestRank);

    const nextN = pickedSoFar.n + 1;
    let best = tier[0];
    let bestDeficit = -Infinity;
    for (const c of tier) {
      const target = DIFFICULTY_TARGET[c.difficulty] ?? 0.1;
      const deficit = target * nextN - (difficultyTally[c.difficulty] ?? 0);
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = c;
      }
    }

    chosen.push(best);
    candidates.splice(candidates.indexOf(best), 1);
    difficultyTally[best.difficulty] = (difficultyTally[best.difficulty] ?? 0) + 1;
    pickedSoFar.n = nextN;
  }

  return chosen;
}

function topicStrata(
  sub: BlueprintTaxonomyDomain['subdomains'][number] | undefined,
  pool: QuestionMeta[]
): Stratum[] {
  const ids = new Set<string>(sub?.topics.map((t) => t.topicId) ?? []);
  for (const q of pool) ids.add(q.topicId);
  return [...ids].map((topicId) => ({
    id: topicId,
    label: sub?.topics.find((t) => t.topicId === topicId)?.name ?? topicId,
    weight: 1,
    capacity: pool.filter((q) => q.topicId === topicId).length,
  }));
}

/**
 * Assembles an exam for the requested scope.
 */
export function assembleExam(
  bank: QuestionMeta[],
  taxonomy: BlueprintTaxonomyDomain[],
  scope: ExamBlueprintScope,
  options: AssembleOptions
): AssembledExam {
  const seed = options.seed ?? `${Date.now()}-${Math.random()}`;
  const exposure = options.exposure;
  const subIndex = new Map(
    taxonomy.flatMap((d) => d.subdomains.map((s) => [s.subdomainId, { d, s }] as const))
  );

  // 1. Resolve the first-level strata for this scope.
  let pool: QuestionMeta[];
  let firstLevel: Stratum[];
  let firstLevelKey: (q: QuestionMeta) => string;

  if (scope.kind === 'overall') {
    pool = bank;
    firstLevelKey = (q) => q.domainId;
    firstLevel = taxonomy.map((d) => ({
      id: d.domainId,
      label: `D${d.number} · ${d.shortName}`,
      weight: d.weightPercent,
      capacity: bank.filter((q) => q.domainId === d.domainId).length,
    }));
  } else if (scope.kind === 'domain') {
    const dom = taxonomy.find((d) => d.domainId === scope.domainId);
    pool = bank.filter((q) => q.domainId === scope.domainId);
    firstLevelKey = (q) => q.subdomainId;
    firstLevel = (dom?.subdomains ?? []).map((s) => ({
      id: s.subdomainId,
      label: `${s.subdomainId} ${s.name}`,
      weight: s.weight,
      capacity: pool.filter((q) => q.subdomainId === s.subdomainId).length,
    }));
  } else if (scope.kind === 'subdomain') {
    pool = bank.filter((q) => q.subdomainId === scope.subdomainId);
    firstLevelKey = (q) => q.topicId;
    firstLevel = topicStrata(subIndex.get(scope.subdomainId)?.s, pool);
  } else {
    const weights = scope.subdomainWeights;
    pool = bank.filter((q) => weights[q.subdomainId] !== undefined);
    firstLevelKey = (q) => q.subdomainId;
    firstLevel = Object.entries(weights).map(([subdomainId, weight]) => ({
      id: subdomainId,
      label: `${subdomainId} ${subIndex.get(subdomainId)?.s.name ?? ''}`.trim(),
      weight,
      capacity: pool.filter((q) => q.subdomainId === subdomainId).length,
    }));
  }

  const totalWeight = firstLevel.reduce((sum, s) => sum + s.weight, 0) || 1;
  const coveredWeight = firstLevel
    .filter((s) => s.capacity > 0)
    .reduce((sum, s) => sum + s.weight, 0);

  const allocation = apportion(options.length, firstLevel);

  // 2. Drill each first-level allocation down to leaf (topic) level and pick items.
  const difficultyTally: Record<number, number> = {};
  const picked = { n: 0 };
  const selected: QuestionMeta[] = [];

  // Visit larger allocations first so the difficulty balancer has the most freedom.
  const order = [...firstLevel].sort(
    (a, b) => (allocation.get(b.id) ?? 0) - (allocation.get(a.id) ?? 0)
  );

  for (const stratum of order) {
    const count = allocation.get(stratum.id) ?? 0;
    if (count === 0) continue;
    const stratumPool = pool.filter((q) => firstLevelKey(q) === stratum.id);

    if (scope.kind === 'subdomain') {
      selected.push(
        ...pickFromLeaf(stratumPool, count, difficultyTally, picked, `${seed}:${stratum.id}`, exposure)
      );
      continue;
    }

    // Second level: sub-domains (overall scope) or topics (domain/remediation scope).
    let secondLevel: Stratum[];
    let secondKey: (q: QuestionMeta) => string;
    if (scope.kind === 'overall') {
      const dom = taxonomy.find((d) => d.domainId === stratum.id);
      secondKey = (q) => q.subdomainId;
      secondLevel = (dom?.subdomains ?? []).map((s) => ({
        id: s.subdomainId,
        label: s.name,
        weight: s.weight,
        capacity: stratumPool.filter((q) => q.subdomainId === s.subdomainId).length,
      }));
      // Include any sub-domain present in the bank but missing from the taxonomy.
      for (const q of stratumPool) {
        if (!secondLevel.some((s) => s.id === q.subdomainId)) {
          secondLevel.push({
            id: q.subdomainId,
            label: q.subdomainId,
            weight: 0.01,
            capacity: stratumPool.filter((x) => x.subdomainId === q.subdomainId).length,
          });
        }
      }
    } else {
      secondKey = (q) => q.topicId;
      secondLevel = topicStrata(subIndex.get(stratum.id)?.s, stratumPool);
    }

    const secondAlloc = apportion(count, secondLevel);
    for (const s2 of secondLevel) {
      const c2 = secondAlloc.get(s2.id) ?? 0;
      if (c2 === 0) continue;
      const leafPool = stratumPool.filter((q) => secondKey(q) === s2.id);

      if (scope.kind === 'overall') {
        // Third level: topics inside the sub-domain.
        const third = topicStrata(subIndex.get(s2.id)?.s, leafPool);
        const thirdAlloc = apportion(c2, third);
        for (const t of third) {
          const c3 = thirdAlloc.get(t.id) ?? 0;
          if (c3 === 0) continue;
          selected.push(
            ...pickFromLeaf(
              leafPool.filter((q) => q.topicId === t.id),
              c3,
              difficultyTally,
              picked,
              `${seed}:${t.id}`,
              exposure
            )
          );
        }
      } else {
        selected.push(
          ...pickFromLeaf(leafPool, c2, difficultyTally, picked, `${seed}:${s2.id}`, exposure)
        );
      }
    }
  }

  const plan: BlueprintPlanRow[] = firstLevel.map((s) => ({
    id: s.id,
    label: s.label,
    weight: s.weight / totalWeight,
    available: s.capacity,
    allocated: allocation.get(s.id) ?? 0,
  }));

  return {
    questionIds: shuffleArray(
      selected.map((q) => q.id),
      `${seed}:order`
    ),
    plan,
    requestedLength: options.length,
    poolSize: pool.length,
    blueprintCoverage: coveredWeight / totalWeight,
  };
}

/* ------------------------------------------------------------------------- */
/* Generated-exam identifiers & URLs                                          */
/* ------------------------------------------------------------------------- */

export const GENERATED_EXAM_PREFIX = 'auto-';

export function isGeneratedExamId(examId: string): boolean {
  return examId.startsWith(GENERATED_EXAM_PREFIX);
}

export function generatedExamId(scope: ExamBlueprintScope): string {
  switch (scope.kind) {
    case 'overall':
      return `${GENERATED_EXAM_PREFIX}overall`;
    case 'domain':
      return `${GENERATED_EXAM_PREFIX}${scope.domainId}`;
    case 'subdomain':
      return `${GENERATED_EXAM_PREFIX}sub-${scope.subdomainId}`;
    case 'remediation':
      return `${GENERATED_EXAM_PREFIX}weak`;
  }
}

export interface GeneratedExamRequest {
  scope: 'overall' | 'domain' | 'subdomain' | 'weak';
  domainId?: string;
  subdomainId?: string;
  length: number;
  mode?: 'study' | 'simulation';
}

export function buildGeneratedExamHref(req: GeneratedExamRequest): string {
  const p = new URLSearchParams();
  p.set('scope', req.scope);
  if (req.domainId) p.set('d', req.domainId);
  if (req.subdomainId) p.set('s', req.subdomainId);
  p.set('n', String(req.length));
  if (req.mode) p.set('mode', req.mode);
  return withBase(`/exam/custom?${p.toString()}`);
}

/** Link that resumes a session, whether it came from a manifest or the generator. */
export function resumeExamHref(examId: string, sessionId: string): string {
  return isGeneratedExamId(examId)
    ? withBase(`/exam/custom?sessionId=${encodeURIComponent(sessionId)}`)
    : withBase(`/exam/${examId}?sessionId=${encodeURIComponent(sessionId)}`);
}

/** Link that starts a brand-new attempt of the same exam. */
export function retakeExamHref(examId: string, length: number, mode?: 'study' | 'simulation'): string {
  if (!isGeneratedExamId(examId)) {
    return mode ? withBase(`/exam/${examId}?mode=${mode}`) : withBase(`/exam/${examId}`);
  }
  const key = examId.slice(GENERATED_EXAM_PREFIX.length);
  if (key === 'overall') return buildGeneratedExamHref({ scope: 'overall', length, mode });
  if (key === 'weak') return buildGeneratedExamHref({ scope: 'weak', length, mode });
  if (key.startsWith('sub-')) {
    return buildGeneratedExamHref({ scope: 'subdomain', subdomainId: key.slice(4), length, mode });
  }
  return buildGeneratedExamHref({ scope: 'domain', domainId: key, length, mode });
}
