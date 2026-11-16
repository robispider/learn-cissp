export type ClozeSeg =
  | { type: 'text'; text: string }
  | { type: 'cloze'; index: number; answer: string; hint?: string };

/** Parses `{{c1::answer}}` / `{{c1::answer::hint}}` markup. */
export function parseCloze(template: string): ClozeSeg[] {
  const out: ClozeSeg[] = [];
  const re = /\{\{c(\d+)::([^:}]+?)(?:::([^}]+?))?\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) out.push({ type: 'text', text: template.slice(last, m.index) });
    out.push({ type: 'cloze', index: Number(m[1]), answer: m[2].trim(), hint: m[3]?.trim() });
    last = re.lastIndex;
  }
  if (last < template.length) out.push({ type: 'text', text: template.slice(last) });
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(the|a|an)\b/g, '')
    .replace(/[^a-z0-9%]+/g, '');

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Lenient answer check for typed recall: ignores case, punctuation, articles and
 * small typos (≈20% edit distance). Accepts any "/"-separated alternative.
 */
export function answerMatches(typed: string, answer: string): boolean {
  const t = norm(typed);
  if (!t) return false;
  return answer.split('/').some((alt) => {
    const a = norm(alt);
    if (!a) return false;
    if (t === a) return true;
    const tolerance = a.length <= 3 ? 0 : Math.max(1, Math.floor(a.length * 0.2));
    return levenshtein(t, a) <= tolerance;
  });
}
