#!/usr/bin/env node
/**
 * Cross-reference validator for memory card packs (src/content/memory-cards/**).
 *
 * Zod schema validation runs during `astro sync` / `astro build`. This script adds
 * checks Zod cannot express on its own:
 *   - ids unique across every pack, and id prefix matches domain/sub-domain
 *   - domainId / subdomainId / topicId exist in the CBK taxonomy, and the
 *     declared subdomainName / topicName match the taxonomy names exactly
 *   - pack lives in the folder for its domain (domain-N)
 *   - relatedQuestionIds reference real questions in the bank
 *   - sequenceData orders are exactly 1..N; matrix rows match header width
 *   - cloze templates are well-formed ({{cN::answer}} or {{cN::answer::hint}})
 *   - presentation.plugin.id names a plugin registered in cards/registry.ts
 *
 * Usage: node scripts/validate-memory-cards.mjs [--domain dom-3]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const cardsDir = join(root, 'src', 'content', 'memory-cards');
const questionsDir = join(root, 'src', 'content', 'questions');
const taxonomy = JSON.parse(
  readFileSync(join(root, 'src', 'content', 'taxonomy', 'cissp-cbk-2026.json'), 'utf8')
);

const domainArgIdx = process.argv.indexOf('--domain');
const onlyDomain = domainArgIdx > -1 ? process.argv[domainArgIdx + 1] : null;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });
}

const subdomains = new Map();
const topics = new Map();
for (const d of taxonomy.domains) {
  for (const s of d.subdomains) {
    subdomains.set(s.subdomainId, { domainId: d.domainId, name: s.name });
    for (const t of s.topics) topics.set(t.topicId, { subdomainId: s.subdomainId, name: t.name });
  }
}

const questionIds = new Set();
for (const f of walk(questionsDir)) {
  try {
    for (const q of JSON.parse(readFileSync(f, 'utf8'))) if (q?.id) questionIds.add(q.id);
  } catch {
    /* question bank errors are reported by astro check */
  }
}

const CARD_TYPES = {
  concept_contrast: 'contrastData',
  sequence_order: 'sequenceData',
  formula_drill: 'formulaData',
  reference_fact: 'matrixData',
  cloze_deletion: 'clozeTemplate',
  manager_heuristic: 'heuristicData',
};

// Plugin ids registered in the card plugin registry (presentation.plugin.id must match one).
const registrySrc = readFileSync(
  join(root, 'src', 'components', 'memorize', 'cards', 'registry.ts'),
  'utf8'
);
const pluginIds = new Set([...registrySrc.matchAll(/^\s{4}id: '([a-z0-9-]+)',$/gm)].map((m) => m[1]));

const errors = [];
const warnings = [];
const seen = new Map();
const stats = new Map();
let total = 0;

for (const file of walk(cardsDir)) {
  const rel = relative(root, file);
  let items;
  try {
    items = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${rel}: invalid JSON — ${e.message}`);
    continue;
  }
  if (!Array.isArray(items)) {
    errors.push(`${rel}: file must contain a JSON array`);
    continue;
  }
  const folder = relative(cardsDir, file).split(sep)[0];

  for (const c of items) {
    const where = `${rel} [${c?.id ?? '<no id>'}]`;
    if (onlyDomain && c?.domainId !== onlyDomain) continue;
    total++;
    if (!c?.id) {
      errors.push(`${where}: missing id`);
      continue;
    }
    if (seen.has(c.id)) errors.push(`${where}: duplicate id (also in ${seen.get(c.id)})`);
    seen.set(c.id, rel);

    if (!/^cissp-mem-d[1-8]-s\d+\.\d+-c\d{3,4}$/.test(c.id)) errors.push(`${where}: id format invalid`);
    const prefix = `cissp-mem-d${String(c.domainId).slice(4)}-s${c.subdomainId}-`;
    if (!c.id.startsWith(prefix)) errors.push(`${where}: id must start with ${prefix}`);
    if (folder !== `domain-${String(c.domainId).slice(4)}`)
      errors.push(`${where}: card for ${c.domainId} must live in memory-cards/domain-${String(c.domainId).slice(4)}/`);

    const sub = subdomains.get(c.subdomainId);
    if (!sub) errors.push(`${where}: unknown subdomainId ${c.subdomainId}`);
    else {
      if (sub.domainId !== c.domainId) errors.push(`${where}: subdomain ${c.subdomainId} is not in ${c.domainId}`);
      if (sub.name !== c.subdomainName)
        errors.push(`${where}: subdomainName must equal taxonomy name "${sub.name}"`);
    }
    const top = topics.get(c.topicId);
    if (!top) errors.push(`${where}: unknown topicId ${c.topicId}`);
    else {
      if (top.subdomainId !== c.subdomainId) errors.push(`${where}: topic ${c.topicId} is not in ${c.subdomainId}`);
      if (top.name !== c.topicName) errors.push(`${where}: topicName must equal taxonomy name "${top.name}"`);
    }

    const payloadKey = CARD_TYPES[c.cardType];
    if (!payloadKey) errors.push(`${where}: unknown cardType ${c.cardType}`);
    else if (!c[payloadKey]) errors.push(`${where}: ${c.cardType} requires ${payloadKey}`);
    for (const [type, key] of Object.entries(CARD_TYPES)) {
      if (type !== c.cardType && c[key] !== undefined)
        warnings.push(`${where}: has ${key} but cardType is ${c.cardType} (ignored by renderer)`);
    }

    if (c.presentation?.plugin) {
      const pid = c.presentation.plugin.id;
      if (!pluginIds.has(pid))
        errors.push(`${where}: presentation.plugin.id "${pid}" is not registered (known: ${[...pluginIds].join(', ')})`);
    }
    if (c.presentation?.modality && !['text', 'visual', 'animated'].includes(c.presentation.modality))
      errors.push(`${where}: presentation.modality must be text | visual | animated`);

    if (c.sequenceData?.steps) {
      const orders = c.sequenceData.steps.map((s) => s.order);
      const ok = orders.every((o, i) => o === i + 1);
      if (!ok) errors.push(`${where}: sequenceData.steps orders must be 1..N in array order`);
    }
    if (c.matrixData) {
      const w = c.matrixData.headers?.length ?? 0;
      (c.matrixData.rows ?? []).forEach((r, i) => {
        if (!Array.isArray(r) || r.length !== w)
          errors.push(`${where}: matrixData.rows[${i}] has ${r?.length} cells, expected ${w}`);
      });
    }
    if (c.contrastData?.columns) {
      for (const col of c.contrastData.columns)
        if (!Array.isArray(col.points) || col.points.length < 2)
          errors.push(`${where}: contrast column "${col.label}" needs >= 2 points`);
    }
    if (c.cardType === 'cloze_deletion' && typeof c.clozeTemplate === 'string') {
      const opens = (c.clozeTemplate.match(/\{\{/g) ?? []).length;
      const closes = (c.clozeTemplate.match(/\}\}/g) ?? []).length;
      const valid = [...c.clozeTemplate.matchAll(/\{\{c(\d+)::([^:}]+?)(?:::([^}]+?))?\}\}/g)];
      if (opens !== closes || valid.length !== opens || valid.length === 0)
        errors.push(`${where}: clozeTemplate must use well-formed {{cN::answer}} / {{cN::answer::hint}} markup`);
    }
    for (const qid of c.relatedQuestionIds ?? []) {
      if (!questionIds.has(qid)) errors.push(`${where}: relatedQuestionIds references unknown question ${qid}`);
    }
    for (const key of ['title', 'prompt', 'answerSummary', 'examTrapWarning']) {
      if (typeof c[key] !== 'string' || c[key].trim().length < (key === 'title' ? 5 : 15))
        errors.push(`${where}: ${key} missing or too short`);
    }
    if (!Array.isArray(c.references) || c.references.length === 0)
      errors.push(`${where}: at least one reference required`);

    // Mirror of the Zod minimums in src/content.config.ts (so authors get fast feedback).
    const minStr = (v, n, label) => {
      if (typeof v !== 'string' || v.length < n) errors.push(`${where}: ${label} must be a string of >= ${n} chars`);
    };
    const ENUMS = {
      examPriority: ['must_know', 'high_yield', 'deep_detail'],
      cognitiveLevel: ['remember', 'understand', 'apply', 'analyze', 'evaluate'],
      perspective: ['manager_governance', 'risk_advisor', 'technical_architect', 'incident_responder', 'compliance_auditor'],
    };
    const TRAPS = [
      'technical_fix_over_process', 'wrong_lifecycle_phase', 'extreme_absolutist', 'confuses_similar_terms',
      'solves_wrong_problem', 'premature_escalation', 'ignores_human_safety', 'cost_disproportionate',
      'incomplete_partial_answer',
    ];
    for (const [k, vals] of Object.entries(ENUMS)) {
      if (c[k] !== undefined && !vals.includes(c[k])) errors.push(`${where}: ${k} "${c[k]}" not in ${vals.join('|')}`);
    }
    if (!ENUMS.cognitiveLevel.includes(c.cognitiveLevel)) errors.push(`${where}: cognitiveLevel required`);
    if (!ENUMS.perspective.includes(c.perspective)) errors.push(`${where}: perspective required`);
    for (const t of c.relatedTrapTypes ?? []) if (!TRAPS.includes(t)) errors.push(`${where}: unknown trapType ${t}`);
    if (!Number.isInteger(c.intrinsicDifficulty ?? 5) || (c.intrinsicDifficulty ?? 5) < 1 || (c.intrinsicDifficulty ?? 5) > 10)
      errors.push(`${where}: intrinsicDifficulty must be an integer 1..10`);
    if (!Array.isArray(c.keyTerms) || c.keyTerms.length < 1) errors.push(`${where}: keyTerms needs >= 1 entry`);
    minStr(c.subdomainName, 3, 'subdomainName');
    minStr(c.topicName, 3, 'topicName');
    if (c.mnemonic !== undefined && c.mnemonic !== null && typeof c.mnemonic !== 'string')
      errors.push(`${where}: mnemonic must be string or null`);
    for (const r of c.references ?? []) {
      minStr(r?.source, 3, 'references[].source');
      minStr(r?.section, 2, 'references[].section');
    }
    if (c.contrastData) {
      minStr(c.contrastData.ruleOfThumb, 10, 'contrastData.ruleOfThumb');
      const cols = c.contrastData.columns ?? [];
      if (cols.length < 2 || cols.length > 4) errors.push(`${where}: contrastData.columns must have 2..4 columns`);
      for (const col of cols) {
        minStr(col.label, 2, 'contrast column label');
        for (const p of col.points ?? []) minStr(p, 3, 'contrast point');
      }
    }
    if (c.sequenceData) {
      minStr(c.sequenceData.directionLabel, 3, 'sequenceData.directionLabel');
      const steps = c.sequenceData.steps ?? [];
      if (steps.length < 3) errors.push(`${where}: sequenceData.steps needs >= 3 steps`);
      for (const st of steps) {
        minStr(st.label, 2, 'sequence step label');
        minStr(st.detail, 5, 'sequence step detail');
      }
    }
    if (c.formulaData) {
      minStr(c.formulaData.formula, 3, 'formulaData.formula');
      minStr(c.formulaData.workedExample, 15, 'formulaData.workedExample');
      minStr(c.formulaData.decisionRule, 10, 'formulaData.decisionRule');
      if ((c.formulaData.variables ?? []).length < 2) errors.push(`${where}: formulaData.variables needs >= 2`);
    }
    if (c.matrixData) {
      if ((c.matrixData.headers ?? []).length < 2) errors.push(`${where}: matrixData.headers needs >= 2`);
      if ((c.matrixData.rows ?? []).length < 2) errors.push(`${where}: matrixData.rows needs >= 2`);
    }
    if (c.clozeTemplate !== undefined) minStr(c.clozeTemplate, 15, 'clozeTemplate');
    if (c.heuristicData) {
      minStr(c.heuristicData.technicalReflexTrap, 15, 'heuristicData.technicalReflexTrap');
      minStr(c.heuristicData.managerAction, 15, 'heuristicData.managerAction');
      minStr(c.heuristicData.governingPrinciple, 10, 'heuristicData.governingPrinciple');
    }

    const s = stats.get(c.domainId) ?? { cards: 0, subs: new Set(), types: {} };
    s.cards++;
    s.subs.add(c.subdomainId);
    s.types[c.cardType] = (s.types[c.cardType] ?? 0) + 1;
    stats.set(c.domainId, s);
  }
}

for (const [dom, s] of [...stats.entries()].sort()) {
  console.log(
    `${dom}: ${s.cards} cards · ${s.subs.size} sub-domains · ${Object.entries(s.types)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`
  );
}
for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`\n${total} card(s) checked · ${errors.length} error(s) · ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
