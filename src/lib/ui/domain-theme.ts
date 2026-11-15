/**
 * Static Tailwind class sets per domain accent colour (taxonomy `color` field).
 * Class names are spelled out in full so Tailwind can detect them at build time.
 */
export interface DomainTheme {
  dot: string;
  text: string;
  soft: string;
  bar: string;
  ring: string;
  hoverBorder: string;
}

const THEMES: Record<string, DomainTheme> = {
  emerald: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    soft: 'bg-emerald-500/10',
    bar: 'bg-emerald-500',
    ring: 'ring-emerald-500/30',
    hoverBorder: 'hover:border-emerald-500/50',
  },
  sky: {
    dot: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
    soft: 'bg-sky-500/10',
    bar: 'bg-sky-500',
    ring: 'ring-sky-500/30',
    hoverBorder: 'hover:border-sky-500/50',
  },
  indigo: {
    dot: 'bg-indigo-500',
    text: 'text-indigo-600 dark:text-indigo-400',
    soft: 'bg-indigo-500/10',
    bar: 'bg-indigo-500',
    ring: 'ring-indigo-500/30',
    hoverBorder: 'hover:border-indigo-500/50',
  },
  cyan: {
    dot: 'bg-cyan-500',
    text: 'text-cyan-600 dark:text-cyan-400',
    soft: 'bg-cyan-500/10',
    bar: 'bg-cyan-500',
    ring: 'ring-cyan-500/30',
    hoverBorder: 'hover:border-cyan-500/50',
  },
  violet: {
    dot: 'bg-violet-500',
    text: 'text-violet-600 dark:text-violet-400',
    soft: 'bg-violet-500/10',
    bar: 'bg-violet-500',
    ring: 'ring-violet-500/30',
    hoverBorder: 'hover:border-violet-500/50',
  },
  amber: {
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    soft: 'bg-amber-500/10',
    bar: 'bg-amber-500',
    ring: 'ring-amber-500/30',
    hoverBorder: 'hover:border-amber-500/50',
  },
  rose: {
    dot: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    soft: 'bg-rose-500/10',
    bar: 'bg-rose-500',
    ring: 'ring-rose-500/30',
    hoverBorder: 'hover:border-rose-500/50',
  },
  teal: {
    dot: 'bg-teal-500',
    text: 'text-teal-600 dark:text-teal-400',
    soft: 'bg-teal-500/10',
    bar: 'bg-teal-500',
    ring: 'ring-teal-500/30',
    hoverBorder: 'hover:border-teal-500/50',
  },
};

export function domainTheme(color: string): DomainTheme {
  return THEMES[color] ?? THEMES.emerald;
}
