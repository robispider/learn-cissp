import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import ExamRunner from './ExamRunner';
import {
  assembleExam,
  estimateTimeLimitMinutes,
  generatedExamId,
  type ExamBlueprintScope,
} from '../../lib/exam-engine/assembler';
import { fetchQuestionBank, resolveSessionExam } from '../../lib/exam-engine/payload';
import { toBlueprintTaxonomy, toQuestionMeta, type CatalogDomain } from '../../lib/catalog';
import { getSessionById } from '../../lib/storage/session-store';
import { getAllMasteryRecords } from '../../lib/storage/mastery-store';
import { loadExposureMap, weakSubdomainWeights } from '../../lib/storage/use-progress';
import type { HydratedExamPayload } from '../../lib/types/question';
import type { TopicMasteryRecord } from '../../lib/types/session';
import { withBase } from '../../lib/paths';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: HydratedExamPayload };

export default function GeneratedExamLauncher({ domains }: { domains: CatalogDomain[] }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);

        // Resume an existing generated session.
        const sessionId = params.get('sessionId');
        if (sessionId) {
          const session = await getSessionById(sessionId);
          if (!session) throw new Error('That saved session no longer exists in this browser.');
          if (session.status === 'completed') {
            window.location.replace(withBase(`/results?sessionId=${session.sessionId}`));
            return;
          }
          setState({ status: 'ready', payload: await resolveSessionExam(session) });
          return;
        }

        const scopeParam = params.get('scope') ?? 'overall';
        const length = Math.max(1, Math.min(250, Number(params.get('n')) || 25));
        const taxonomy = toBlueprintTaxonomy(domains);
        const [bank, exposure] = await Promise.all([fetchQuestionBank(), loadExposureMap()]);

        let scope: ExamBlueprintScope;
        let title: string;
        let examScope: HydratedExamPayload['examScope'];
        let domainId: HydratedExamPayload['domainId'] = 'all';
        let subdomainId: string | null = null;
        let blueprintWeights: Record<string, number> = {};

        if (scopeParam === 'domain') {
          const dom = domains.find((d) => d.domainId === params.get('d'));
          if (!dom) throw new Error('Unknown domain.');
          scope = { kind: 'domain', domainId: dom.domainId };
          title = `Domain ${dom.number} Exam · ${dom.name}`;
          examScope = 'domain_full';
          domainId = dom.domainId as HydratedExamPayload['domainId'];
          for (const s of dom.subdomains) blueprintWeights[s.subdomainId] = s.weight;
        } else if (scopeParam === 'subdomain') {
          const sid = params.get('s') ?? '';
          const dom = domains.find((d) => d.subdomains.some((s) => s.subdomainId === sid));
          const sub = dom?.subdomains.find((s) => s.subdomainId === sid);
          scope = { kind: 'subdomain', subdomainId: sid };
          title = `Drill ${sid}${sub ? ` · ${sub.name}` : ''}`;
          examScope = 'subdomain';
          domainId = (dom?.domainId ?? 'all') as HydratedExamPayload['domainId'];
          subdomainId = sid;
          blueprintWeights = { [sid]: 1 };
        } else if (scopeParam === 'weak') {
          const mastery = await getAllMasteryRecords();
          const map: Record<string, TopicMasteryRecord> = {};
          for (const m of mastery) map[m.key] = m;
          const weights = weakSubdomainWeights(map);
          if (Object.keys(weights).length === 0) {
            throw new Error('No weak areas yet — complete an exam first and come back.');
          }
          scope = { kind: 'remediation', subdomainWeights: weights };
          title = 'Weak-Area Review';
          examScope = 'remediation';
          blueprintWeights = weights;
        } else {
          scope = { kind: 'overall' };
          title = `Full CISSP Practice · ${length} Questions`;
          examScope = 'overall';
          for (const d of domains) {
            for (const s of d.subdomains) blueprintWeights[s.subdomainId] = (d.weightPercent / 100) * s.weight;
          }
        }

        const assembled = assembleExam(bank.map(toQuestionMeta), taxonomy, scope, { length, exposure });
        if (assembled.questionIds.length === 0) {
          throw new Error('There are no questions for this selection yet.');
        }

        setState({
          status: 'ready',
          payload: {
            examId: generatedExamId(scope),
            title,
            description: 'Auto-generated from the question bank using the CISSP blueprint.',
            examScope,
            domainId,
            subdomainId,
            timeLimitMinutes: estimateTimeLimitMinutes(assembled.questionIds.length),
            passingScorePercent: 70,
            masteryScorePercent: 85,
            questionIds: assembled.questionIds,
            blueprintWeights,
            // Whole bank so a resumed attempt (different draw) still resolves its questions.
            questions: bank,
          },
        });
      } catch (err) {
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not build the exam.' });
      }
    })();
  }, [domains]);

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          Building your exam from the blueprint…
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Can’t start this exam</h1>
        <p className="mt-2 text-sm text-slate-500">{state.message}</p>
        <a
          href={withBase('/exams')}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          <ArrowLeft className="h-4 w-4" /> Back to exams
        </a>
      </div>
    );
  }

  return <ExamRunner exam={state.payload} />;
}
