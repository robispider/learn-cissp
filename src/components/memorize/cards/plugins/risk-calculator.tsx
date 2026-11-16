/**
 * Plugin: risk-calculator — quantitative risk analysis as a live pipeline.
 *
 * props (all optional):
 *   av?: number        asset value for the walkthrough (default 200000)
 *   ef?: number        exposure factor 0..1 (default 0.25)
 *   aro?: number       annualized rate of occurrence (default 0.2)
 *   safeguard?: boolean  show the safeguard value panel and ask safeguard questions
 *   aleAfterPct?: number ALE reduction the safeguard achieves, 0..1 (default 0.7)
 *   acs?: number       annual cost of the safeguard (default 4000)
 */
import { useMemo, useState } from 'react';
import { ArrowRight, X as Times } from 'lucide-react';
import { shuffle, type PluginViewProps, type RecallGameProps } from '../types';
import { choiceBtn, choiceDim, choiceIdle, choiceRight, choiceWrong, GameHeader, PlaybackBar, useStagger } from '../ui';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

const ARO_CHOICES = [
  { aro: 12, label: 'Monthly (12×/yr)' },
  { aro: 1, label: 'Once a year' },
  { aro: 0.5, label: 'Every 2 years' },
  { aro: 0.25, label: 'Every 4 years' },
  { aro: 0.2, label: 'Every 5 years' },
  { aro: 0.1, label: 'Every 10 years' },
  { aro: 0.05, label: 'Every 20 years' },
  { aro: 0.01, label: 'Every 100 years' },
];

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function Tile({
  label,
  value,
  sub,
  cls,
  on,
  pulse,
}: {
  label: string;
  value: string;
  sub: string;
  cls: string;
  on: boolean;
  pulse?: boolean;
}) {
  return (
    <div
      className={`min-w-0 flex-1 rounded-2xl border px-2.5 py-2 text-center transition-all duration-500 ${
        on ? `${cls} mem-pop` : 'border-dashed border-slate-200 opacity-30 dark:border-slate-800'
      } ${pulse ? 'mem-glow' : ''}`}
    >
      <div className="text-[10px] font-black uppercase tracking-wider opacity-80">{label}</div>
      <div className="truncate font-mono text-sm font-bold sm:text-base">{on ? value : '—'}</div>
      <div className="truncate text-[10px] opacity-70">{sub}</div>
    </div>
  );
}

const Op = ({ children }: { children: React.ReactNode }) => (
  <span className="flex shrink-0 items-center px-0.5 font-mono text-base font-black text-slate-400">{children}</span>
);

export function RiskCalculatorView({ props, mode }: PluginViewProps) {
  const safeguard = Boolean(props.safeguard);
  const [av, setAv] = useState(num(props.av, 200000));
  const [ef, setEf] = useState(num(props.ef, 0.25));
  const [aro, setAro] = useState(num(props.aro, 0.2));
  const [reduction, setReduction] = useState(num(props.aleAfterPct, 0.7));
  const [acs, setAcs] = useState(num(props.acs, 4000));
  const steps = safeguard ? 6 : 5;
  const ctl = useStagger(steps, 1700, mode === 'learn');

  const sle = av * ef;
  const ale = sle * aro;
  const aleAfter = ale * (1 - reduction);
  const value = ale - aleAfter - acs;
  const aroLabel = ARO_CHOICES.find((c) => c.aro === aro)?.label ?? `${aro}/yr`;

  const captions = [
    `Asset value: what the asset is worth — ${money(av)}.`,
    `Exposure factor: one event destroys ${Math.round(ef * 100)}% of it. EF is a fraction of value, not a probability.`,
    `SLE = AV × EF = ${money(sle)}: the cost of ONE occurrence.`,
    `ARO: ${aroLabel.toLowerCase()} → ${aro} per year. "Once every N years" is 1/N, not N.`,
    `ALE = SLE × ARO = ${money(ale)} per year: the most you should spend each year on this risk.`,
    `Safeguard value = ALE before − ALE after − annual cost = ${money(value)}. Positive means worth it.`,
  ];
  const caption = captions[Math.max(0, Math.min(steps, ctl.shown) - 1)];
  const live = ctl.done;

  // Relative bars: everything as a share of AV so you can *see* EF slice the asset and ARO scale it per year.
  const pct = (n: number) => `${Math.max(1.5, Math.min(100, (n / av) * 100))}%`;

  return (
    <div className="space-y-3">
      {mode === 'learn' && <PlaybackBar ctl={ctl} total={steps} label="Walk through the math" />}

      <div className="flex items-stretch gap-1">
        <Tile label="AV" value={money(av)} sub="asset value" cls="border-slate-400/40 bg-slate-500/10 text-slate-800 dark:text-slate-100" on={ctl.shown >= 1} pulse={ctl.shown === 1 && !live} />
        <Op>×</Op>
        <Tile label="EF" value={`${Math.round(ef * 100)}%`} sub="exposure" cls="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200" on={ctl.shown >= 2} pulse={ctl.shown === 2 && !live} />
        <Op>=</Op>
        <Tile label="SLE" value={money(sle)} sub="per event" cls="border-orange-500/40 bg-orange-500/10 text-orange-800 dark:text-orange-200" on={ctl.shown >= 3} pulse={ctl.shown === 3 && !live} />
      </div>
      <div className="flex items-stretch gap-1 sm:pl-[33%]">
        <Tile label="SLE" value={money(sle)} sub="per event" cls="border-orange-500/40 bg-orange-500/10 text-orange-800 dark:text-orange-200" on={ctl.shown >= 3} />
        <Op>×</Op>
        <Tile label="ARO" value={`${aro}`} sub="per year" cls="border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200" on={ctl.shown >= 4} pulse={ctl.shown === 4 && !live} />
        <Op>=</Op>
        <Tile label="ALE" value={money(ale)} sub="per year" cls="border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200" on={ctl.shown >= 5} pulse={ctl.shown === 5 && !live} />
      </div>

      {/* shrinking bars */}
      <div className="space-y-1.5 rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        {[
          { k: 'AV', v: av, cls: 'bg-slate-400', on: ctl.shown >= 1 },
          { k: 'SLE', v: sle, cls: 'bg-orange-500', on: ctl.shown >= 3 },
          { k: 'ALE', v: ale, cls: 'bg-rose-500', on: ctl.shown >= 5 },
        ].map((b) => (
          <div key={b.k} className="flex items-center gap-2 text-[11px]">
            <span className="w-8 font-mono font-bold text-slate-500">{b.k}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-full rounded-full ${b.cls} transition-all duration-700`} style={{ width: b.on ? pct(b.v) : '0%' }} />
            </div>
            <span className="w-20 text-right font-mono text-slate-600 dark:text-slate-300">{b.on ? money(b.v) : ''}</span>
          </div>
        ))}
      </div>

      {safeguard && ctl.shown >= 6 && (
        <div className="mem-fade-up rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Safeguard value</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                value >= 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
              }`}
            >
              {value >= 0 ? 'Worth it' : 'Not worth it'}
            </span>
          </div>
          <div className="mt-2 font-mono text-sm text-slate-700 dark:text-slate-200">
            {money(ale)} − {money(aleAfter)} − {money(acs)} = <strong>{money(value)}</strong>
          </div>
        </div>
      )}

      {!live && caption && (
        <p key={ctl.shown} className="mem-fade-up rounded-xl bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {caption}
        </p>
      )}

      {live && (
        <div className="mem-fade-up space-y-2.5 rounded-2xl border border-violet-500/25 bg-violet-500/5 p-3 text-xs">
          <div className="font-bold text-violet-700 dark:text-violet-300">Play with it — see which inputs move ALE</div>
          <label className="block">
            <span className="flex justify-between text-slate-500">
              Asset value <span className="font-mono">{money(av)}</span>
            </span>
            <input type="range" min={10000} max={1000000} step={10000} value={av} onChange={(e) => setAv(Number(e.target.value))} className="w-full accent-slate-500" />
          </label>
          <label className="block">
            <span className="flex justify-between text-slate-500">
              Exposure factor <span className="font-mono">{Math.round(ef * 100)}%</span>
            </span>
            <input type="range" min={0.05} max={1} step={0.05} value={ef} onChange={(e) => setEf(Number(e.target.value))} className="w-full accent-amber-500" />
          </label>
          <div>
            <span className="text-slate-500">How often?</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {ARO_CHOICES.map((c) => (
                <button
                  key={c.aro}
                  type="button"
                  onClick={() => setAro(c.aro)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                    aro === c.aro ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {safeguard && (
            <>
              <label className="block">
                <span className="flex justify-between text-slate-500">
                  Safeguard cuts ALE by <span className="font-mono">{Math.round(reduction * 100)}%</span>
                </span>
                <input type="range" min={0} max={1} step={0.05} value={reduction} onChange={(e) => setReduction(Number(e.target.value))} className="w-full accent-emerald-500" />
              </label>
              <label className="block">
                <span className="flex justify-between text-slate-500">
                  Annual cost of safeguard <span className="font-mono">{money(acs)}</span>
                </span>
                <input type="range" min={0} max={50000} step={500} value={acs} onChange={(e) => setAcs(Number(e.target.value))} className="w-full accent-emerald-500" />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recall: generated scenarios; wrong options are classic exam errors  */
/* ------------------------------------------------------------------ */
interface Q {
  scenario: string;
  ask: string;
  answer: number;
  options: { v: number; why?: string }[];
}

const ASSETS = ['customer database server', 'regional warehouse', 'e-commerce web farm', 'data center floor', 'branch office'];
const THREATS = ['ransomware outbreak', 'flood', 'fire', 'multi-day DDoS outage', 'burst water pipe'];
const AVS = [50000, 80000, 120000, 200000, 250000, 400000, 500000, 1000000];
const EFS = [0.1, 0.2, 0.25, 0.4, 0.5, 0.6, 0.75];
const FREQ = [
  { years: 2, aro: 0.5 },
  { years: 4, aro: 0.25 },
  { years: 5, aro: 0.2 },
  { years: 10, aro: 0.1 },
  { years: 20, aro: 0.05 },
];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function withOptions(answer: number, wrong: { v: number; why: string }[]): Q['options'] {
  const seen = new Set<number>([Math.round(answer)]);
  const opts: Q['options'] = [{ v: answer }];
  for (const w of wrong) {
    const r = Math.round(w.v);
    if (r > 0 && !seen.has(r)) {
      seen.add(r);
      opts.push(w);
    }
    if (opts.length === 4) break;
  }
  while (opts.length < 4) {
    const v = Math.round(answer * pick([0.5, 1.5, 2, 3, 4]));
    if (!seen.has(v)) {
      seen.add(v);
      opts.push({ v, why: 'Arithmetic slip' });
    }
  }
  return shuffle(opts);
}

function makeQuestions(safeguard: boolean): Q[] {
  const out: Q[] = [];
  for (let s = 0; s < 3; s++) {
    const asset = pick(ASSETS);
    const threat = pick(THREATS);
    const av = pick(AVS);
    const ef = pick(EFS);
    const f = pick(FREQ);
    const sle = av * ef;
    const ale = sle * f.aro;
    const scenario = `A ${asset} worth ${money(av)}. A ${threat} would destroy ${Math.round(ef * 100)}% of it and is expected once every ${f.years} years.`;
    if (!safeguard) {
      out.push({
        scenario,
        ask: 'What is the SLE?',
        answer: sle,
        options: withOptions(sle, [
          { v: ale, why: 'That is the ALE (you already applied ARO)' },
          { v: av * f.aro, why: 'Used ARO instead of EF' },
          { v: av - sle, why: 'That is what survives, not what is lost' },
        ]),
      });
      out.push({
        scenario,
        ask: 'What is the ALE?',
        answer: ale,
        options: withOptions(ale, [
          { v: sle * f.years, why: `Multiplied by ${f.years} — ARO is 1/${f.years} = ${f.aro}` },
          { v: sle, why: 'Forgot to multiply by ARO' },
          { v: av * f.aro, why: 'Skipped the exposure factor' },
        ]),
      });
    } else {
      const cut = pick([0.5, 0.6, 0.75, 0.8, 0.9]);
      const after = ale * (1 - cut);
      const acs = Math.round((ale * pick([0.2, 0.4, 0.6, 1.1])) / 100) * 100;
      const val = ale - after - acs;
      out.push({
        scenario,
        ask: 'What is the ALE before any safeguard?',
        answer: ale,
        options: withOptions(ale, [
          { v: sle * f.years, why: `ARO is 1/${f.years}, not ${f.years}` },
          { v: sle, why: 'That is the SLE' },
          { v: av * f.aro, why: 'Skipped EF' },
        ]),
      });
      out.push({
        scenario: `${scenario} A safeguard cuts the ALE to ${money(after)} and costs ${money(acs)} per year.`,
        ask: 'What is the safeguard value to the company?',
        answer: val,
        options: withOptions(val, [
          { v: ale - after, why: 'Forgot to subtract the annual cost (ACS)' },
          { v: ale - acs, why: 'Used ALE before − ACS; you must subtract ALE after too' },
          { v: acs - (ale - after), why: 'Sign flipped' },
        ]),
      });
    }
  }
  return out;
}

export function RiskCalculatorRecall({ props, onComplete }: RecallGameProps) {
  const safeguard = Boolean(props.safeguard);
  const qs = useMemo(() => makeQuestions(safeguard), [safeguard]);
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [misses, setMisses] = useState<string[]>([]);
  const [start] = useState(() => Date.now());
  const q = qs[i];

  const choose = (opt: Q['options'][number]) => {
    if (chosen !== null) return;
    setChosen(opt.v);
    const ok = opt.v === q.answer;
    const res = [...results, ok];
    setResults(res);
    const ms = ok ? misses : [...misses, `${q.ask} ${money(q.answer)} — you picked ${money(opt.v)}${opt.why ? ` (${opt.why})` : ''}`];
    setMisses(ms);
  };
  const next = () => {
    if (i + 1 >= qs.length) {
      onComplete({ correct: results.filter(Boolean).length, total: qs.length, hintsUsed: 0, durationMs: Date.now() - start, misses });
    } else {
      setI(i + 1);
      setChosen(null);
    }
  };
  const chosenOpt = q.options.find((o) => o.v === chosen);

  return (
    <div>
      <GameHeader title="Run the numbers" instructions="Work it out in your head or on paper, then pick." round={i} rounds={qs.length} results={results} />
      <div key={i} className="mem-fade-up space-y-3">
        <p className="rounded-2xl border border-slate-200/80 bg-white p-3.5 text-sm leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
          {q.scenario}
        </p>
        <div className="text-sm font-bold text-slate-900 dark:text-white">{q.ask}</div>
        <div className="grid grid-cols-2 gap-2">
          {q.options.map((o) => {
            const st = chosen === null ? choiceIdle : o.v === q.answer ? choiceRight : o.v === chosen ? choiceWrong : choiceDim;
            return (
              <button key={o.v} type="button" disabled={chosen !== null} onClick={() => choose(o)} className={`${choiceBtn} ${st} text-center font-mono font-bold`}>
                {money(o.v)}
              </button>
            );
          })}
        </div>
        {chosen !== null && (
          <div className="mem-fade-up flex flex-wrap items-center justify-between gap-2">
            <p className={`flex-1 text-xs ${chosen === q.answer ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {chosen === q.answer ? (
                'Correct.'
              ) : (
                <>
                  <Times className="mr-1 inline h-3.5 w-3.5" />
                  {chosenOpt?.why ?? 'Not quite.'} Answer: {money(q.answer)}.
                </>
              )}
            </p>
            <button type="button" onClick={next} autoFocus className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">
              Next <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
