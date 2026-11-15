import type { OptionId } from '../types/question';

export function shuffleArray<T>(items: readonly T[], seedString?: string): T[] {
  const arr = [...items];
  let seed = seedString ? hashString(seedString) : Math.floor(Math.random() * 0xffffffff);

  const nextRand = () => {
    // Mulberry32 PRNG
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildOptionOrders(
  questionIds: string[],
  preserveOrder = false
): Record<string, OptionId[]> {
  const base: OptionId[] = ['A', 'B', 'C', 'D'];
  const map: Record<string, OptionId[]> = {};
  for (const qId of questionIds) {
    map[qId] = preserveOrder ? [...base] : shuffleArray(base);
  }
  return map;
}
