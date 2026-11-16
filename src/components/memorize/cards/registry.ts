/**
 * Card plugin registry — hand-built visual / animated cards.
 *
 * To add your own card:
 *   1. Create `plugins/my-thing.tsx` exporting a View (and optionally a Recall game).
 *      Both receive the JSON card plus `props` from `presentation.plugin.props`.
 *   2. Register it below with a kebab-case id.
 *   3. Point any JSON card at it:
 *        "presentation": { "plugin": { "id": "my-thing", "props": { … } } }
 *   4. Preview it at /memorize/lab before it reaches your review queue.
 *
 * Plugins are lazy-loaded, so a heavy animation only downloads when a card needs it.
 */
import { lazy } from 'react';
import type { MemoryCard, CardModality } from '../../../lib/types/memory';
import type { MemoryCardPlugin } from './types';

export const CARD_PLUGINS: Record<string, MemoryCardPlugin> = {
  'osi-stack': {
    id: 'osi-stack',
    name: 'OSI stack & encapsulation',
    description: 'Animated 7-layer stack: data travels down and gains headers (segment → packet → frame → bits). Game: build the stack, then place protocols and devices on their layer.',
    modality: 'animated',
    recallLabel: 'Build the stack',
    View: lazy(() => import('./plugins/osi-stack').then((m) => ({ default: m.OsiStackView }))),
    Recall: lazy(() => import('./plugins/osi-stack').then((m) => ({ default: m.OsiStackRecall }))),
  },
  'risk-calculator': {
    id: 'risk-calculator',
    name: 'Quantitative risk calculator',
    description: 'AV × EF = SLE × ARO = ALE as a live pipeline with sliders; optional safeguard value panel. Game: solve generated scenarios where the wrong options are the classic exam mistakes.',
    modality: 'visual',
    recallLabel: 'Run the numbers',
    View: lazy(() => import('./plugins/risk-calculator').then((m) => ({ default: m.RiskCalculatorView }))),
    Recall: lazy(() => import('./plugins/risk-calculator').then((m) => ({ default: m.RiskCalculatorRecall }))),
  },
  'kerberos-flow': {
    id: 'kerberos-flow',
    name: 'Kerberos ticket flow',
    description: 'Animated sequence diagram between Client, AS, TGS and the service; tickets travel along each arrow. Game: predict the next message.',
    modality: 'animated',
    recallLabel: 'What happens next?',
    View: lazy(() => import('./plugins/kerberos-flow').then((m) => ({ default: m.KerberosFlowView }))),
    Recall: lazy(() => import('./plugins/kerberos-flow').then((m) => ({ default: m.KerberosFlowRecall }))),
  },
  'blp-biba-lab': {
    id: 'blp-biba-lab',
    name: 'Bell-LaPadula vs. Biba lab',
    description: 'Security-level ladder with read/write arrows that flip between the two models. Game: rapid-fire "allowed or blocked?" access decisions.',
    modality: 'animated',
    recallLabel: 'Allowed or blocked?',
    View: lazy(() => import('./plugins/blp-biba-lab').then((m) => ({ default: m.BlpBibaView }))),
    Recall: lazy(() => import('./plugins/blp-biba-lab').then((m) => ({ default: m.BlpBibaRecall }))),
  },
};

export function getCardPlugin(card: MemoryCard): MemoryCardPlugin | null {
  const id = card.presentation?.plugin?.id;
  return id ? (CARD_PLUGINS[id] ?? null) : null;
}

const BUILTIN_MODALITY: Record<MemoryCard['cardType'], CardModality> = {
  sequence_order: 'animated',
  concept_contrast: 'visual',
  reference_fact: 'visual',
  formula_drill: 'visual',
  cloze_deletion: 'text',
  manager_heuristic: 'text',
};

/** Explicit override → plugin's modality → archetype default. */
export function resolveModality(card: MemoryCard): CardModality {
  if (card.presentation?.modality) return card.presentation.modality;
  const plugin = getCardPlugin(card);
  if (plugin) return plugin.modality;
  return BUILTIN_MODALITY[card.cardType] ?? 'text';
}

export const MODALITY_META: Record<CardModality, { label: string; badgeClass: string; hint: string }> = {
  text: {
    label: 'Text',
    badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
    hint: 'Plain text card',
  },
  visual: {
    label: 'Visual',
    badgeClass: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    hint: 'Text plus a diagram',
  },
  animated: {
    label: 'Animated',
    badgeClass: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
    hint: 'Text, diagram and a step-by-step animation',
  },
};
