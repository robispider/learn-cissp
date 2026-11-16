/**
 * Plugin: blp-biba-lab — Bell-LaPadula vs. Biba on a security-level ladder.
 *
 * props (all optional):
 *   rounds?: number   number of "allowed or blocked?" decisions (default 8)
 */
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Check, PenLine, User, X } from 'lucide-react';
import { shuffle, type PluginViewProps, type RecallGameProps } from '../types';
import { GameHeader, PlaybackBar, useStagger } from '../ui';

type Model = 'blp' | 'biba';
type Action = 'read' | 'write';
type Dir = 'up' | 'down';

const LEVELS: Record<Model, string[]> = {
  // index 0 = lowest
  blp: ['Unclassified', 'Confidential', 'Secret', 'Top Secret'],
  biba: ['Low integrity', 'Medium integrity', 'High integrity', 'Very high integrity'],
};

const MODEL_META: Record<Model, { name: string; goal: string; flow: string; accent: string; soft: string; ring: string }> = {
  blp: {
    name: 'Bell-LaPadula',
    goal: 'Confidentiality',
    flow: 'Secrets may only flow UP. Read down, write up.',
    accent: 'text-sky-600 dark:text-sky-400',
    soft: 'bg-sky-500/10 border-sky-500/30',
    ring: 'ring-sky-500',
  },
  biba: {
    name: 'Biba',
    goal: 'Integrity',
    flow: 'Trusted data may only flow DOWN. Read up, write down.',
    accent: 'text-fuchsia-600 dark:text-fuchsia-400',
    soft: 'bg-fuchsia-500/10 border-fuchsia-500/30',
    ring: 'ring-fuchsia-500',
  },
};

interface Rule {
  action: Action;
  dir: Dir;
  allowed: boolean;
  property: string;
  why: string;
}

const RULES: Record<Model, Rule[]> = {
  blp: [
    { action: 'read', dir: 'up', allowed: false, property: 'Simple Security Property', why: 'No read up: you cannot read above your clearance.' },
    { action: 'write', dir: 'down', allowed: false, property: '* (Star) Property', why: 'No write down: you could leak secrets to a lower level.' },
    { action: 'read', dir: 'down', allowed: true, property: 'Read down is fine', why: 'Reading below your clearance leaks nothing.' },
    { action: 'write', dir: 'up', allowed: true, property: 'Write up is fine', why: 'Writing upward cannot disclose secrets.' },
  ],
  biba: [
    { action: 'read', dir: 'down', allowed: false, property: 'Simple Integrity Axiom', why: 'No read down: low-integrity data could corrupt your decisions.' },
    { action: 'write', dir: 'up', allowed: false, property: '* (Star) Integrity Axiom', why: 'No write up: you would contaminate more trusted data.' },
    { action: 'read', dir: 'up', allowed: true, property: 'Read up is fine', why: 'Reading more trusted data is safe.' },
    { action: 'write', dir: 'down', allowed: true, property: 'Write down is fine', why: 'Trusted data flowing to lower levels does no harm to integrity.' },
  ],
};

export function isAllowed(model: Model, action: Action, subj: number, obj: number): boolean {
  const dir: Dir = obj > subj ? 'up' : 'down';
  return RULES[model].find((r) => r.action === action && r.dir === dir)!.allowed;
}

function RuleTile({ r, model, pop }: { r: Rule; model: Model; pop: boolean }) {
  const Arrow = r.dir === 'up' ? ArrowUp : ArrowDown;
  const ActIcon = r.action === 'read' ? BookOpen : PenLine;
  return (
    <div
      className={`${pop ? 'mem-pop' : ''} relative rounded-2xl border p-3 ${
        r.allowed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/10'
      }`}
    >
      <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
        <ActIcon className="h-4 w-4" />
        {r.action === 'read' ? 'Read' : 'Write'}
        <Arrow className="h-4 w-4" />
        {r.dir}
        <span
          className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full ${r.allowed ? 'bg-emerald-500' : 'bg-rose-500'} text-white`}
        >
          {r.allowed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>
      </div>
      <div className={`mt-1 text-[11px] font-bold ${r.allowed ? 'text-emerald-700 dark:text-emerald-300' : MODEL_META[model].accent}`}>{r.property}</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">{r.why}</p>
    </div>
  );
}

function Ladder({ model, subj, obj, action }: { model: Model; subj: number; obj?: number; action?: Action }) {
  const levels = LEVELS[model];
  return (
    <div className="flex flex-col-reverse justify-center gap-1">
      {levels.map((name, i) => (
        <div
          key={name}
          className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${
            i === subj
              ? `${MODEL_META[model].soft} font-bold`
              : i === obj
                ? 'border-violet-500/40 bg-violet-500/5'
                : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900'
          }`}
          style={{ opacity: 0.55 + (i / levels.length) * 0.45 }}
        >
          <span className="w-4 font-mono text-[10px] text-slate-400">{i + 1}</span>
          <span className="flex-1 text-slate-800 dark:text-slate-100">{name}</span>
          {i === subj && (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-white dark:text-slate-900">
              <User className="h-3 w-3" /> Subject
            </span>
          )}
          {i === obj && (
            <span className="mem-pop inline-flex items-center gap-1 rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {action === 'write' ? <PenLine className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />} File
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function BlpBibaView({ mode }: PluginViewProps) {
  // 1-4: BLP rules, 5-8: Biba rules, 9: comparison line.
  const ctl = useStagger(9, 1600, mode === 'learn');
  const [tab, setTab] = useState<Model>('blp');
  const model: Model = ctl.done ? tab : ctl.shown <= 4 ? 'blp' : 'biba';
  const visibleRules = ctl.done ? 4 : model === 'blp' ? ctl.shown : ctl.shown - 4;
  const meta = MODEL_META[model];

  return (
    <div className="space-y-3">
      {mode === 'learn' && <PlaybackBar ctl={ctl} total={9} label="One model, then its mirror image" />}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
        {(['blp', 'biba'] as Model[]).map((m) => (
          <button
            key={m}
            type="button"
            disabled={!ctl.done}
            onClick={() => setTab(m)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition ${
              model === m ? `bg-white shadow-sm dark:bg-slate-800 ${MODEL_META[m].accent}` : 'text-slate-500'
            }`}
          >
            {MODEL_META[m].name} · {MODEL_META[m].goal}
          </button>
        ))}
      </div>
      <div key={model} className="mem-fade-up grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <Ladder model={model} subj={2} />
        <div className="grid grid-cols-2 gap-2">
          {RULES[model].slice(0, Math.max(0, visibleRules)).map((r) => (
            <RuleTile key={`${r.action}-${r.dir}`} r={r} model={model} pop={!ctl.done} />
          ))}
        </div>
      </div>
      {(ctl.shown >= 9 || ctl.done) && (
        <div className={`mem-pop rounded-2xl border px-3.5 py-2.5 text-sm ${meta.soft}`}>
          <span className={`font-bold ${meta.accent}`}>{meta.name}: </span>
          <span className="text-slate-700 dark:text-slate-200">{meta.flow}</span>
          <div className="mt-1 text-[11px] text-slate-500">
            Exam wording: "simple" = <strong>read</strong> rule, "star (*)" = <strong>write</strong> rule.
          </div>
        </div>
      )}
    </div>
  );
}

interface Round {
  model: Model;
  subj: number;
  obj: number;
  action: Action;
}

export function BlpBibaRecall({ props, onComplete }: RecallGameProps) {
  const n = typeof props.rounds === 'number' ? props.rounds : 8;
  const rounds = useMemo<Round[]>(() => {
    const out: Round[] = [];
    for (let i = 0; i < n; i++) {
      const model: Model = i % 2 === 0 ? 'blp' : 'biba';
      const subj = 1 + Math.floor(Math.random() * 2); // 1..2 so both directions exist
      let obj = Math.floor(Math.random() * 4);
      while (obj === subj) obj = Math.floor(Math.random() * 4);
      out.push({ model, subj, obj, action: Math.random() < 0.5 ? 'read' : 'write' });
    }
    return shuffle(out);
  }, [n]);

  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [misses, setMisses] = useState<string[]>([]);
  const [start] = useState(() => Date.now());
  const r = rounds[i];
  const truth = isAllowed(r.model, r.action, r.subj, r.obj);
  const rule = RULES[r.model].find((x) => x.action === r.action && x.dir === (r.obj > r.subj ? 'up' : 'down'))!;

  const answer = (allowed: boolean) => {
    if (chosen !== null) return;
    setChosen(allowed);
    const ok = allowed === truth;
    const res = [...results, ok];
    setResults(res);
    const ms = ok ? misses : [...misses, `${MODEL_META[r.model].name}: ${r.action} ${r.obj > r.subj ? 'up' : 'down'} is ${truth ? 'allowed' : `blocked (${rule.property})`}`];
    setMisses(ms);
    window.setTimeout(
      () => {
        if (i + 1 >= rounds.length) {
          onComplete({ correct: res.filter(Boolean).length, total: rounds.length, hintsUsed: 0, durationMs: Date.now() - start, misses: ms });
        } else {
          setI(i + 1);
          setChosen(null);
        }
      },
      ok ? 800 : 2000
    );
  };

  const meta = MODEL_META[r.model];
  const levels = LEVELS[r.model];
  return (
    <div>
      <GameHeader title="Allowed or blocked?" instructions="Decide fast — models flip between rounds." round={i} rounds={rounds.length} results={results} />
      <div key={i} className="mem-fade-up space-y-3">
        <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-100">
          Under <strong className={meta.accent}>{meta.name}</strong>, a subject at <strong>{levels[r.subj]}</strong> wants to{' '}
          <strong className="uppercase">{r.action}</strong> a file at <strong>{levels[r.obj]}</strong>.
        </p>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Ladder model={r.model} subj={r.subj} obj={r.obj} action={r.action} />
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((v) => {
                const isRight = chosen !== null && v === truth;
                const isWrong = chosen === v && v !== truth;
                return (
                  <button
                    key={String(v)}
                    type="button"
                    disabled={chosen !== null}
                    onClick={() => answer(v)}
                    className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-3 py-4 text-sm font-extrabold transition ${
                      isRight
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : isWrong
                          ? 'mem-shake border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : chosen !== null
                            ? 'border-slate-200 text-slate-400 dark:border-slate-800'
                            : v
                              ? 'border-emerald-500/30 bg-white text-emerald-700 hover:bg-emerald-500/10 dark:bg-slate-900 dark:text-emerald-300'
                              : 'border-rose-500/30 bg-white text-rose-700 hover:bg-rose-500/10 dark:bg-slate-900 dark:text-rose-300'
                    }`}
                  >
                    {v ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                    {v ? 'Allowed' : 'Blocked'}
                  </button>
                );
              })}
            </div>
            {chosen !== null && (
              <p className={`mem-fade-up rounded-xl px-3 py-2 text-xs leading-relaxed ${chosen === truth ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : 'bg-rose-500/10 text-rose-800 dark:text-rose-200'}`}>
                <strong>{rule.property}.</strong> {rule.why}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
