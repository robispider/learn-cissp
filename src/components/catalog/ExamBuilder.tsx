import { useMemo, useState } from 'react';
import { Clock, Info, ListChecks, Play, Shuffle } from 'lucide-react';
import {
  assembleExam,
  buildGeneratedExamHref,
  estimateTimeLimitMinutes,
  type ExamBlueprintScope,
  type GeneratedExamRequest,
  type QuestionMeta,
} from '../../lib/exam-engine/assembler';
import { toBlueprintTaxonomy, type CatalogDomain } from '../../lib/catalog';
import { btnPrimary, useExamMode } from '../ui/primitives';

interface Props {
  domains: CatalogDomain[];
  questionMeta: QuestionMeta[];
  request: Omit<GeneratedExamRequest, 'length' | 'mode'>;
  lengthOptions: Array<{ value: number; label: string }>;
  defaultLength: number;
  /** Show the per-area blueprint allocation table. */
  showPlan?: boolean;
  planTitle?: string;
  startLabel?: string;
}

function toScope(req: Props['request']): ExamBlueprintScope {
  if (req.scope === 'overall') return { kind: 'overall' };
  if (req.scope === 'domain') return { kind: 'domain', domainId: req.domainId ?? '' };
  if (req.scope === 'subdomain') return { kind: 'subdomain', subdomainId: req.subdomainId ?? '' };
  return { kind: 'remediation', subdomainWeights: {} };
}

export default function ExamBuilder({
  domains,
  questionMeta,
  request,
  lengthOptions,
  defaultLength,
  showPlan = true,
  planTitle = 'Blueprint allocation',
  startLabel = 'Start exam',
}: Props) {
  const [mode] = useExamMode();
  const taxonomy = useMemo(() => toBlueprintTaxonomy(domains), [domains]);
  const scope = toScope(request);

  const poolSize = useMemo(
    () => assembleExam(questionMeta, taxonomy, scope, { length: 0, seed: 'pool' }).poolSize,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionMeta, taxonomy, request.scope, request.domainId, request.subdomainId]
  );

  const options = useMemo(() => {
    const opts = lengthOptions.map((o) => ({ ...o, disabled: o.value > poolSize }));
    if (poolSize > 0 && opts.every((o) => o.value !== poolSize) && opts.some((o) => o.disabled)) {
      opts.push({ value: poolSize, label: `All ${poolSize}`, disabled: false });
      opts.sort((a, b) => a.value - b.value);
    }
    return opts;
  }, [lengthOptions, poolSize]);

  const initial =
    options.find((o) => o.value === defaultLength && !o.disabled)?.value ??
    [...options].reverse().find((o) => !o.disabled)?.value ??
    0;
  const [length, setLength] = useState(initial);
  const effectiveLength = options.some((o) => o.value === length && !o.disabled) ? length : initial;

  const preview = useMemo(
    () => assembleExam(questionMeta, taxonomy, scope, { length: effectiveLength, seed: 'preview' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionMeta, taxonomy, effectiveLength, request.scope, request.domainId, request.subdomainId]
  );

  const disabled = poolSize === 0;
  const href = buildGeneratedExamHref({ ...request, length: effectiveLength, mode });
  const maxAllocated = Math.max(1, ...preview.plan.map((p) => p.allocated));

  return (
    <div>
      {/* Length picker */}
      <div className="flex flex-wrap items-center gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => setLength(o.value)}
            title={o.disabled ? `Only ${poolSize} questions available in the bank` : undefined}
            className={`rounded-xl border px-3.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${
              effectiveLength === o.value
                ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
            }`}
          >
            <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">{o.value} Qs</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{o.label}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />~{estimateTimeLimitMinutes(effectiveLength)} min
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Shuffle className="h-3.5 w-3.5" />
            New random draw each attempt
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            {poolSize} in bank
          </span>
        </div>
        <a
          href={disabled ? undefined : href}
          aria-disabled={disabled}
          className={`${btnPrimary} ${disabled ? 'pointer-events-none opacity-40' : ''}`}
        >
          <Play className="h-4 w-4 fill-current" />
          {disabled ? 'No questions yet' : startLabel}
        </a>
      </div>

      {showPlan && preview.plan.length > 1 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{planTitle}</span>
            <span className="hidden sm:inline">weight · questions</span>
          </div>
          <ul className="space-y-1.5">
            {preview.plan.map((row) => (
              <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs">
                <div className="min-w-0">
                  <div
                    className={`truncate ${
                      row.available === 0 ? 'text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {row.label}
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500/80"
                      style={{ width: `${(row.allocated / maxAllocated) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <span className="w-9 text-right text-slate-400">{Math.round(row.weight * 100)}%</span>
                  <span
                    className={`w-8 text-right font-semibold ${
                      row.allocated > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-700'
                    }`}
                  >
                    {row.allocated}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {preview.blueprintCoverage < 0.999 && (
            <p className="mt-3 flex gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The question bank currently covers {Math.round(preview.blueprintCoverage * 100)}% of the blueprint
              weight. Areas without questions are skipped and their share is redistributed to the others.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
