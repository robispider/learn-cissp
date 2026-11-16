import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';

/** True when the OS asks for reduced motion. Animations then jump straight to the end state. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

export interface StaggerControls {
  /** Number of items currently revealed (0..count). */
  shown: number;
  playing: boolean;
  done: boolean;
  play: () => void;
  pause: () => void;
  step: () => void;
  replay: () => void;
  showAll: () => void;
}

/**
 * Drives a staged reveal: item 1, item 2, … one per `intervalMs`.
 * With `enabled=false` (review mode or reduced motion) everything is shown at once.
 */
export function useStagger(count: number, intervalMs: number, enabled: boolean): StaggerControls {
  const reduced = usePrefersReducedMotion();
  const active = enabled && !reduced;
  const [shown, setShown] = useState(active ? 0 : count);
  const [playing, setPlaying] = useState(active);

  useEffect(() => {
    setShown(active ? 0 : count);
    setPlaying(active);
  }, [active, count]);

  useEffect(() => {
    if (!playing) return;
    if (shown >= count) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setShown((s) => Math.min(count, s + 1)), shown === 0 ? 350 : intervalMs);
    return () => window.clearTimeout(t);
  }, [playing, shown, count, intervalMs]);

  return {
    shown,
    playing,
    done: shown >= count,
    play: () => {
      if (shown >= count) setShown(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    step: () => {
      setPlaying(false);
      setShown((s) => Math.min(count, s + 1));
    },
    replay: () => {
      setShown(0);
      setPlaying(true);
    },
    showAll: () => {
      setPlaying(false);
      setShown(count);
    },
  };
}

/** Play / pause / step / replay controls for a staged animation. */
export function PlaybackBar({ ctl, total, label }: { ctl: StaggerControls; total: number; label?: string }) {
  const btn =
    'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100/80 px-2 py-1 dark:bg-slate-900/70">
      <div className="flex items-center gap-0.5">
        {ctl.playing ? (
          <button type="button" className={btn} onClick={ctl.pause}>
            <Pause className="h-3.5 w-3.5" /> Pause
          </button>
        ) : (
          <button type="button" className={btn} onClick={ctl.play}>
            <Play className="h-3.5 w-3.5" /> {ctl.done ? 'Replay' : 'Play'}
          </button>
        )}
        <button type="button" className={btn} onClick={ctl.step} disabled={ctl.done}>
          <SkipForward className="h-3.5 w-3.5" /> Step
        </button>
        {!ctl.done && (
          <button type="button" className={btn} onClick={ctl.showAll}>
            Show all
          </button>
        )}
        {ctl.done && (
          <button type="button" className={btn} onClick={ctl.replay} aria-label="Replay animation">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 pr-1 text-[11px] text-slate-500">
        {label && <span className="hidden sm:inline">{label}</span>}
        <span className="font-mono">
          {Math.min(ctl.shown, total)}/{total}
        </span>
      </div>
    </div>
  );
}

/** Re-triggerable shake: call `shake(key)` and give the element `className={isShaking(key) ? 'mem-shake' : ''}`. */
export function useShake(): { shake: (key: string) => void; isShaking: (key: string) => boolean } {
  const [active, setActive] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const shake = useCallback((key: string) => {
    setActive(null);
    if (timer.current) window.clearTimeout(timer.current);
    window.requestAnimationFrame(() => setActive(key));
    timer.current = window.setTimeout(() => setActive(null), 450);
  }, []);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  return { shake, isShaking: (key) => active === key };
}

/** Header strip shown above every recall game: name, instructions, round dots. */
export function GameHeader({
  title,
  instructions,
  round,
  rounds,
  results,
}: {
  title: string;
  instructions: ReactNode;
  round?: number;
  rounds?: number;
  /** Per-round outcome so far: true = right first time, false = missed. */
  results?: boolean[];
}) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> {title}
        </span>
        {rounds !== undefined && rounds > 1 && (
          <span className="flex items-center gap-1" aria-label={`Round ${(round ?? 0) + 1} of ${rounds}`}>
            {Array.from({ length: rounds }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  results && i < results.length
                    ? results[i]
                      ? 'w-3 bg-emerald-500'
                      : 'w-3 bg-rose-500'
                    : i === round
                      ? 'w-5 bg-violet-500'
                      : 'w-3 bg-slate-300 dark:bg-slate-700'
                }`}
              />
            ))}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{instructions}</p>
    </div>
  );
}

export const choiceBtn =
  'w-full rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition active:scale-[0.99] disabled:cursor-default';
export const choiceIdle =
  'border-slate-200/80 bg-white text-slate-800 hover:border-violet-400/60 hover:bg-violet-500/5 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200';
export const choiceRight = 'border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200';
export const choiceWrong = 'border-rose-500/60 bg-rose-500/10 text-rose-900 dark:text-rose-200';
export const choiceDim = 'border-slate-200/60 bg-slate-50 text-slate-400 dark:border-slate-800/60 dark:bg-slate-950/40';

/** Brief pause after an answer so the learner sees the right/wrong state (corrective feedback). */
export const FEEDBACK_MS_RIGHT = 550;
export const FEEDBACK_MS_WRONG = 1400;
