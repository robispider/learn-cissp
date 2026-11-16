import { useEffect, useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import { db } from '../../lib/storage/db';
import { withBase } from '../../lib/paths';

interface Props {
  /** Sub-domains covered by the exam just reviewed. */
  subdomainIds: string[];
}

/**
 * "X memory cards queued for your weak topics → Practice now" (§6.3).
 * Cards were flagged by exam-bridge.ts when the session was completed.
 */
export default function ExamGapMemoryCallout({ subdomainIds }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const key = subdomainIds.join(',');

  useEffect(() => {
    let cancelled = false;
    const subs = new Set(subdomainIds);
    db.memory_cards_state
      .toArray()
      .then((rows) => {
        if (cancelled) return;
        setCount(rows.filter((r) => r.unlockedByExamGap && !r.suspended && subs.has(r.subdomainId)).length);
      })
      .catch(() => !cancelled && setCount(0));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!count) return null;

  return (
    <a
      href={withBase('/memorize/session?mode=gap')}
      className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-500/5 px-3.5 py-3 text-xs transition hover:bg-violet-500/10"
    >
      <span className="flex items-center gap-2.5">
        <BrainCircuit className="h-4 w-4 shrink-0 text-violet-500" />
        <span className="text-slate-700 dark:text-slate-200">
          <strong>{count}</strong> memory card{count === 1 ? '' : 's'} queued for your weak topics
        </span>
      </span>
      <span className="shrink-0 font-semibold text-violet-600 dark:text-violet-400">Practice now →</span>
    </a>
  );
}
