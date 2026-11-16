/**
 * Plugin: kerberos-flow — animated sequence diagram of a Kerberos logon.
 * Message text comes from the card's own sequenceData (6 steps), so editing the JSON
 * updates the animation. The geometry (who talks to whom) lives here.
 *
 * props (all optional):
 *   facts?: string[]   override the three "remember" chips under the diagram
 */
import { useMemo, useState } from 'react';
import { Clock, KeyRound, ServerCrash } from 'lucide-react';
import { shuffle, type PluginViewProps, type RecallGameProps } from '../types';
import { choiceBtn, choiceDim, choiceIdle, choiceRight, choiceWrong, GameHeader, PlaybackBar, useStagger } from '../ui';

type Actor = 'C' | 'AS' | 'TGS' | 'S';
const X: Record<Actor, number> = { C: 44, AS: 150, TGS: 236, S: 326 };
const ACTOR_LABEL: Record<Actor, string> = { C: 'Client', AS: 'AS', TGS: 'TGS', S: 'Service' };

const FLOW: { from: Actor; to: Actor; short: string; token: string }[] = [
  { from: 'C', to: 'AS', short: 'User ID', token: '#94a3b8' },
  { from: 'AS', to: 'C', short: 'TGT + session key', token: '#f59e0b' },
  { from: 'C', to: 'TGS', short: 'TGT + authenticator', token: '#f59e0b' },
  { from: 'TGS', to: 'C', short: 'Service ticket', token: '#10b981' },
  { from: 'C', to: 'S', short: 'Service ticket + authenticator', token: '#10b981' },
  { from: 'S', to: 'C', short: 'Access granted', token: '#0ea5e9' },
];
const ROW0 = 74;
const ROW_H = 34;
const H = ROW0 + ROW_H * FLOW.length + 6;

function Diagram({ drawn, animateLast, highlight }: { drawn: number; animateLast: boolean; highlight?: number }) {
  return (
    <svg viewBox={`0 0 370 ${H}`} className="mx-auto w-full max-w-lg" role="img" aria-label="Kerberos message sequence diagram">
      {/* KDC box */}
      <rect x={112} y={6} width={162} height={H - 10} rx={14} className="fill-amber-500/5 stroke-amber-500/40" strokeDasharray="4 4" />
      <text x={193} y={20} textAnchor="middle" className="fill-amber-600 text-[9px] font-bold uppercase tracking-wider dark:fill-amber-400">
        KDC
      </text>
      {(Object.keys(X) as Actor[]).map((a) => (
        <g key={a}>
          <line x1={X[a]} x2={X[a]} y1={50} y2={H - 4} className="stroke-slate-300 dark:stroke-slate-700" strokeDasharray="3 4" />
          <rect x={X[a] - 34} y={28} width={68} height={22} rx={8} className="fill-white stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-600" />
          <text x={X[a]} y={43} textAnchor="middle" className="fill-slate-800 text-[11px] font-bold dark:fill-slate-100">
            {ACTOR_LABEL[a]}
          </text>
        </g>
      ))}
      {FLOW.slice(0, drawn).map((m, i) => {
        const y = ROW0 + i * ROW_H + 14;
        const x1 = X[m.from];
        const x2 = X[m.to];
        const dir = x2 > x1 ? 1 : -1;
        const len = Math.abs(x2 - x1);
        const last = animateLast && i === drawn - 1;
        const hl = highlight === i;
        return (
          <g key={i}>
            <line
              x1={x1}
              y1={y}
              x2={x2 - dir * 6}
              y2={y}
              strokeWidth={hl ? 2.5 : 1.8}
              className={`${hl ? 'stroke-violet-500' : 'stroke-slate-600 dark:stroke-slate-300'} ${last ? 'mem-draw' : ''}`}
              style={{ ['--mem-len' as string]: len }}
            />
            <polygon
              points={`${x2},${y} ${x2 - dir * 8},${y - 4.5} ${x2 - dir * 8},${y + 4.5}`}
              className={hl ? 'fill-violet-500' : 'fill-slate-600 dark:fill-slate-300'}
            />
            <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" className="fill-slate-700 text-[9.5px] font-semibold dark:fill-slate-200">
              {i + 1}. {m.short}
            </text>
            {last && (
              <rect width={14} height={9} rx={2} y={-4.5} x={-7} fill={m.token}>
                <animateMotion dur="0.8s" fill="freeze" path={`M ${x1} ${y} L ${x2 - dir * 10} ${y}`} />
              </rect>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Facts({ facts }: { facts: string[] }) {
  const icons = [KeyRound, Clock, ServerCrash];
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {facts.map((f, i) => {
        const Icon = icons[i % icons.length];
        return (
          <div key={f} className="mem-fade-up flex items-start gap-2 rounded-xl border border-slate-200/80 bg-white p-2.5 text-[11px] leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {f}
          </div>
        );
      })}
    </div>
  );
}

const DEFAULT_FACTS = [
  'The password never crosses the network — the AS reply is encrypted with a key derived from it.',
  'Clocks must be in sync (default 5-minute skew) or authenticators are rejected.',
  'The KDC (AS + TGS) is a single point of failure — and a prime target.',
];

export function KerberosFlowView({ card, props, mode }: PluginViewProps) {
  const ctl = useStagger(FLOW.length, 2200, mode === 'learn');
  const steps = card.sequenceData?.steps ?? [];
  const facts = Array.isArray(props.facts) ? (props.facts as string[]) : DEFAULT_FACTS;
  const cur = Math.max(0, ctl.shown - 1);
  return (
    <div className="space-y-3">
      {mode === 'learn' && <PlaybackBar ctl={ctl} total={FLOW.length} label="Follow the tickets" />}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-950/40">
        <Diagram key={ctl.shown} drawn={ctl.shown} animateLast={mode === 'learn'} highlight={mode === 'learn' && !ctl.done ? cur : undefined} />
      </div>
      {mode === 'learn' && !ctl.done && steps[cur] && ctl.shown > 0 && (
        <p key={cur} className="mem-fade-up rounded-xl bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <strong>{steps[cur].label}.</strong> {steps[cur].detail}
        </p>
      )}
      {(ctl.done || mode === 'review') && <Facts facts={facts} />}
    </div>
  );
}

export function KerberosFlowRecall({ card, onComplete }: RecallGameProps) {
  const labels = useMemo(() => {
    const s = card.sequenceData?.steps;
    return s && s.length === FLOW.length ? s.map((x) => x.label) : FLOW.map((f) => f.short);
  }, [card.sequenceData]);
  const options = useMemo(
    () =>
      FLOW.map((_, i) => {
        const wrong = shuffle(labels.filter((_, j) => j !== i)).slice(0, 2);
        return shuffle([labels[i], ...wrong]);
      }),
    [labels]
  );
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [misses, setMisses] = useState<string[]>([]);
  const [start] = useState(() => Date.now());

  const pick = (opt: string) => {
    if (chosen !== null) return;
    setChosen(opt);
    const ok = opt === labels[i];
    const res = [...results, ok];
    setResults(res);
    const ms = ok ? misses : [...misses, `Step ${i + 1} is "${labels[i]}"`];
    setMisses(ms);
    window.setTimeout(
      () => {
        if (i + 1 >= FLOW.length) {
          onComplete({ correct: res.filter(Boolean).length, total: FLOW.length, hintsUsed: 0, durationMs: Date.now() - start, misses: ms });
        } else {
          setI(i + 1);
          setChosen(null);
        }
      },
      ok ? 900 : 1700
    );
  };

  return (
    <div>
      <GameHeader title="What happens next?" instructions={i === 0 ? 'The user just typed their password. What is the first message?' : 'Given the messages so far, pick the next one.'} round={i} rounds={FLOW.length} results={results} />
      <div className="mb-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-950/40">
        <Diagram key={`${i}-${chosen !== null}`} drawn={chosen !== null ? i + 1 : i} animateLast={chosen !== null} highlight={chosen !== null ? i : undefined} />
      </div>
      <div className="space-y-2">
        {options[i].map((o) => {
          const st = chosen === null ? choiceIdle : o === labels[i] ? choiceRight : o === chosen ? `${choiceWrong} mem-shake` : choiceDim;
          return (
            <button key={o} type="button" disabled={chosen !== null} onClick={() => pick(o)} className={`${choiceBtn} ${st}`}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
