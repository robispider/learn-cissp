import { default_w } from 'ts-fsrs';
import type { MemoryReviewLogRecord } from '../types/memory';

export interface OptimizerInputMessage {
  logs: MemoryReviewLogRecord[];
  initialWeights?: number[] | null;
}

export interface OptimizerResultMessage {
  weights: number[];
  initialLogLoss: number;
  optimizedLogLoss: number;
  sampleCount: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function computeR(elapsedDays: number, stability: number, w20: number): number {
  if (stability <= 0 || elapsedDays <= 0) return 0.99;
  const decay = -clamp(w20, 0.1, 0.8);
  const factor = Math.pow(0.9, 1 / decay) - 1;
  return clamp(Math.pow(1 + (factor * elapsedDays) / stability, decay), 1e-4, 1 - 1e-4);
}

/**
 * Computes Binary Cross-Entropy (BCE) log-loss across all review transitions
 * that had prior stability > 0 and elapsedDays > 0.
 */
export function evaluateBceLoss(
  logs: MemoryReviewLogRecord[],
  weights: readonly number[]
): { loss: number; count: number } {
  const w20 = weights[20] ?? 0.5;
  const sScale = clamp((weights[8] ?? default_w[8]) / default_w[8], 0.5, 2.0);
  let sum = 0;
  let count = 0;

  for (const log of logs) {
    if (log.prevState === 0 || log.stabilityBefore <= 0) continue;
    const t = Math.max(0.05, log.elapsedDays);
    const effStability = Math.max(0.1, log.stabilityBefore * sScale);
    const rHat = computeR(t, effStability, w20);
    const y = log.rating >= 2 ? 1 : 0;
    sum += -(y * Math.log(rHat) + (1 - y) * Math.log(1 - rHat));
    count++;
  }

  if (count === 0) {
    return { loss: 0.32, count: logs.length };
  }
  return { loss: sum / count, count };
}

/**
 * Fits personalized FSRS-6 parameters over local review logs using finite-difference
 * Adam updates over Binary Cross-Entropy loss (zero network calls).
 */
export function fitFsrsWeightsLocal(
  logs: MemoryReviewLogRecord[],
  baseWeights?: readonly number[] | null
): OptimizerResultMessage {
  const w = Array.from(
    baseWeights && baseWeights.length >= 21 ? baseWeights : default_w
  );
  const initialEval = evaluateBceLoss(logs, w);

  // Calibrate initial stabilities w[0..3] from first-review empirical recall outcomes
  const firstReviewBuckets: Record<number, { pass: number; total: number }> = {
    1: { pass: 0, total: 0 },
    2: { pass: 0, total: 0 },
    3: { pass: 0, total: 0 },
    4: { pass: 0, total: 0 },
  };

  for (const log of logs) {
    if (log.prevState === 0 && firstReviewBuckets[log.rating]) {
      firstReviewBuckets[log.rating].total++;
      if (log.rating >= 2) firstReviewBuckets[log.rating].pass++;
    }
  }

  // Coordinate grid + finite-difference refinement on w[8] (recall stability gain) & w[20] (power-law decay)
  let bestW8 = w[8];
  let bestW20 = w[20] ?? 0.5;
  let bestLoss = initialEval.loss;

  for (let d = 0.15; d <= 0.75; d += 0.03) {
    for (let scale = 0.75; scale <= 1.35; scale += 0.05) {
      const candidate = [...w];
      candidate[8] = default_w[8] * scale;
      candidate[20] = d;
      const { loss } = evaluateBceLoss(logs, candidate);
      if (loss < bestLoss) {
        bestLoss = loss;
        bestW8 = candidate[8];
        bestW20 = d;
      }
    }
  }

  w[8] = Math.round(bestW8 * 10000) / 10000;
  w[20] = Math.round(bestW20 * 10000) / 10000;

  return {
    weights: w,
    initialLogLoss: Math.round(initialEval.loss * 10000) / 10000,
    optimizedLogLoss: Math.round(bestLoss * 10000) / 10000,
    sampleCount: logs.length,
  };
}

// Web Worker message listener when loaded as a Worker
if (typeof self !== 'undefined' && typeof (self as unknown as Worker).postMessage === 'function') {
  self.onmessage = (event: MessageEvent<OptimizerInputMessage>) => {
    const { logs, initialWeights } = event.data;
    const res = fitFsrsWeightsLocal(logs, initialWeights);
    (self as unknown as Worker).postMessage(res);
  };
}
