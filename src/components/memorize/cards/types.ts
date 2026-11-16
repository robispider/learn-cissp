import type { ComponentType } from 'react';
import type { CardModality, FsrsGrade, MemoryCard } from '../../../lib/types/memory';

/**
 * Outcome of one recall attempt (a game round or a self-recall reveal).
 * The runner turns it into a *suggested* FSRS grade; the learner can always override.
 */
export interface RecallResult {
  /** Items answered right on the first try. */
  correct: number;
  /** Items in the challenge. 0 means "no measurable challenge". */
  total: number;
  /** Hints or auto-reveals the learner used. Each costs half an item. */
  hintsUsed: number;
  durationMs: number;
  /** True when the learner only revealed the answer (no game). No grade is suggested. */
  selfRated?: boolean;
  /** Short notes on what went wrong, shown on the feedback step. */
  misses?: string[];
}

/** Props every plugin view receives. */
export interface PluginViewProps<P = Record<string, unknown>> {
  card: MemoryCard;
  props: P;
  /**
   * `learn`  – first exposure: play the staged animation / guided walkthrough.
   * `review` – answer view after recall: show everything at once, no autoplay.
   */
  mode: 'learn' | 'review';
}

/** Props every recall game (built-in or plugin) receives. */
export interface RecallGameProps<P = Record<string, unknown>> {
  card: MemoryCard;
  props: P;
  /** Other cards in the catalog, for building plausible distractors. */
  pool: MemoryCard[];
  onComplete: (result: RecallResult) => void;
}

/**
 * A hand-built ("pluggable") card. Register it in `registry.ts`, then point a JSON card at it:
 *   "presentation": { "plugin": { "id": "osi-stack", "props": { ... } } }
 */
export interface MemoryCardPlugin {
  id: string;
  name: string;
  description: string;
  modality: Exclude<CardModality, 'text'>;
  /** Visual explainer used on the Learn step and as the answer on the Feedback step. */
  View: ComponentType<PluginViewProps>;
  /** Optional custom recall game. When absent the archetype's built-in game is used. */
  Recall?: ComponentType<RecallGameProps>;
  /** Short name for the recall game, shown in the UI ("Build the stack"). */
  recallLabel?: string;
}

/**
 * Research-informed grade suggestion.
 * - Accuracy below 60% → Again (the memory was not retrievable).
 * - Below 90% or hints used → Hard (effortful, partial retrieval).
 * - Perfect and fluent on a *review* → Easy.
 * - Right after the Learn step we never suggest Easy: immediate recall is short-term
 *   memory, and over-rating it inflates the first interval (FSRS would schedule too far out).
 */
export function suggestGrade(r: RecallResult | null, justLearned: boolean): FsrsGrade | null {
  if (!r || r.selfRated || r.total <= 0) return null;
  const effective = Math.max(0, r.correct - r.hintsUsed * 0.5) / r.total;
  if (effective < 0.6) return 1;
  if (effective < 0.9 || r.hintsUsed > 0) return 2;
  const perItemMs = r.durationMs / r.total;
  if (!justLearned && effective >= 1 && perItemMs < 4000) return 4;
  return 3;
}

export function resultPercent(r: RecallResult): number {
  if (r.total <= 0) return 0;
  return Math.round((Math.max(0, r.correct - r.hintsUsed * 0.5) / r.total) * 100);
}

/** Small deterministic PRNG so a card's game layout is stable within one render. */
export function seededRandom(seedStr: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    seed ^= seedStr.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Shuffle, but never return the original order when it can be avoided (ordering games). */
export function shuffleNotIdentity<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  let arr = shuffle(items, rand);
  for (let tries = 0; tries < 5 && items.length > 2 && arr.every((x, i) => x === items[i]); tries++) {
    arr = shuffle(items, rand);
  }
  return arr;
}
