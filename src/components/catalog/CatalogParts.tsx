import { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Play, Zap } from 'lucide-react';
import { buildGeneratedExamHref } from '../../lib/exam-engine/assembler';
import type { CatalogDomain, CatalogExam, CatalogSubdomain } from '../../lib/catalog';
import { domainTheme } from '../../lib/ui/domain-theme';
import type { TopicMasteryRecord } from '../../lib/types/session';
import { MasteryBar, MasteryPill, card, useExamMode } from '../ui/primitives';

/* ------------------------------------------------------------------------- */
/* Domain card                                                                */
/* ------------------------------------------------------------------------- */

export function DomainCard({
  domain,
  mastery,
  setCount,
  variant = 'default',
}: {
  domain: CatalogDomain;
  mastery?: TopicMasteryRecord;
  setCount: number;
  variant?: 'default' | 'exam';
}) {
  const [mode] = useExamMode();
  const theme = domainTheme(domain.color);
  const hasQuestions = domain.questionCount > 0;
  const quickLength = Math.min(25, domain.questionCount);

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 dark:border-slate-800/80 dark:bg-slate-900/60 dark:hover:shadow-black/30 ${theme.hoverBorder}`}
    >
      <a href={`/domains/${domain.domainId}`} className="absolute inset-0 rounded-2xl" aria-label={`Open ${domain.name}`} />
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg font-mono text-sm font-bold ${theme.soft} ${theme.text}`}>
          {domain.number}
        </span>
        <span className="font-mono text-[11px] text-slate-400">{domain.weightPercent}% of exam</span>
      </div>
      <h3 className="mt-3 text-sm font-semibold leading-snug text-slate-900 dark:text-white">{domain.name}</h3>
      <div className="mt-auto pt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>
            {hasQuestions ? `${domain.questionCount} questions` : 'Questions coming soon'}
            {setCount > 0 && ` · ${setCount} set${setCount > 1 ? 's' : ''}`}
          </span>
          <MasteryPill record={mastery} />
        </div>
        <MasteryBar record={mastery} />
        {variant === 'exam' && (
          <div className="relative z-10 mt-3 flex gap-2">
            <a
              href={
                hasQuestions
                  ? buildGeneratedExamHref({ scope: 'domain', domainId: domain.domainId, length: quickLength, mode })
                  : undefined
              }
              aria-disabled={!hasQuestions}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 ${
                hasQuestions ? '' : 'pointer-events-none opacity-30'
              }`}
            >
              <Play className="h-3 w-3 fill-current" />
              {quickLength > 0 ? `Quick ${quickLength}` : 'Start'}
            </a>
            <a
              href={`/domains/${domain.domainId}`}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Options
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Predefined exam set card                                                   */
/* ------------------------------------------------------------------------- */

export function PresetExamCard({ exam, index }: { exam: CatalogExam; index?: number }) {
  const [mode] = useExamMode();
  return (
    <a
      href={`/exam/${exam.examId}?mode=${mode}`}
      className={`${card} group flex flex-col p-4 transition hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-slate-900/5`}
    >
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {index !== undefined ? `Set ${index + 1}` : 'Fixed set'}
        </span>
        <span className="inline-flex items-center gap-1 font-mono">
          {exam.questionCount} Qs · <Clock className="h-3 w-3" />
          {exam.timeLimitMinutes}m
        </span>
      </div>
      <h4 className="mt-2.5 text-sm font-semibold leading-snug text-slate-900 group-hover:text-emerald-600 dark:text-white dark:group-hover:text-emerald-400">
        {exam.title.replace(/^Domain \d+ (Set \d+|Mastery Exam):\s*/, '')}
      </h4>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{exam.description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        Start <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}

/* ------------------------------------------------------------------------- */
/* Sub-domain row (expandable, with topics + drill)                           */
/* ------------------------------------------------------------------------- */

export function SubdomainRow({
  sub,
  mastery,
  topicMastery,
  presetSets = [],
  defaultOpen = false,
}: {
  sub: CatalogSubdomain;
  mastery?: TopicMasteryRecord;
  topicMastery: Record<string, TopicMasteryRecord>;
  presetSets?: CatalogExam[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mode] = useExamMode();
  const has = sub.questionCount > 0;
  const drillLen = Math.min(10, sub.questionCount);

  return (
    <li className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-0' : '-rotate-90'}`}
          />
          <span className="w-8 shrink-0 font-mono text-xs font-bold sm:w-10 text-slate-500 dark:text-slate-400">
            {sub.subdomainId}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-sm font-medium leading-snug text-slate-900 sm:truncate dark:text-white">{sub.name}</span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400">
              {has ? `${sub.questionCount} question${sub.questionCount > 1 ? 's' : ''}` : 'No questions yet'} ·{' '}
              {sub.topics.length} topic{sub.topics.length === 1 ? '' : 's'}
            </span>
          </span>
        </button>
        <MasteryPill record={mastery} />
        <a
          href={
            has
              ? buildGeneratedExamHref({ scope: 'subdomain', subdomainId: sub.subdomainId, length: drillLen, mode })
              : undefined
          }
          aria-disabled={!has}
          title={has ? `Drill ${drillLen} questions from ${sub.subdomainId}` : 'No questions yet'}
          aria-label={has ? `Drill ${drillLen} questions from ${sub.subdomainId}` : undefined}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/10 p-2.5 text-xs sm:px-2.5 sm:py-1.5 font-semibold text-emerald-700 transition hover:bg-emerald-500 hover:text-slate-950 dark:text-emerald-400 ${
            has ? '' : 'pointer-events-none opacity-30'
          }`}
        >
          <Zap className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Drill</span>
        </a>
      </div>

      {open && (
        <div className="px-4 pb-4 pl-[3.25rem] sm:pl-[5.75rem]">
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{sub.summary}</p>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {sub.topics.map((t) => (
              <li
                key={t.topicId}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/50"
              >
                <span className="min-w-0 truncate text-slate-700 dark:text-slate-300" title={t.name}>
                  <span className="mr-1.5 font-mono text-slate-400">{t.topicId}</span>
                  {t.name}
                </span>
                {topicMastery[`topic:${t.topicId}`] ? (
                  <MasteryPill record={topicMastery[`topic:${t.topicId}`]} />
                ) : (
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">{t.questionCount}q</span>
                )}
              </li>
            ))}
          </ul>
          {presetSets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {presetSets.map((e) => (
                <a
                  key={e.examId}
                  href={`/exam/${e.examId}?mode=${mode}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Play className="h-3 w-3" /> {e.title} ({e.questionCount})
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
