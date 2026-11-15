import { useState } from 'react';
import {
  Calculator,
  Clock,
  Lightbulb,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface Flashcard {
  id: string;
  subdomain: string;
  title: string;
  ruleOfThumb: string;
  contrastLeft: { label: string; points: string[] };
  contrastRight: { label: string; points: string[] };
  examTrap: string;
}

const DOMAIN_1_FLASHCARDS: Flashcard[] = [
  {
    id: 'ethics',
    subdomain: '1.1 ISC2 Code of Ethics',
    title: 'Strict Canon Priority Order (1 → 4)',
    ruleOfThumb:
      'When two ethical obligations conflict, always obey the higher-numbered priority Canon.',
    contrastLeft: {
      label: 'Priority 1 & 2 (Highest)',
      points: [
        'Canon I: Protect society, the common good, and public trust',
        'Canon II: Act honorably, honestly, justly, responsibly, and legally',
      ],
    },
    contrastRight: {
      label: 'Priority 3 & 4 (Subordinate)',
      points: [
        'Canon III: Provide diligent and competent service to principals',
        'Canon IV: Advance and protect the profession',
      ],
    },
    examTrap:
      'Never follow a boss/employer directive (Canon III) if it endangers human safety (Canon I) or violates the law (Canon II).',
  },
  {
    id: 'roles',
    subdomain: '1.3 Security Governance Roles',
    title: 'Data Owner vs. Data Custodian',
    ruleOfThumb: 'Business Leaders Decide ("Owner"); IT & Security Engineers Enforce ("Custodian").',
    contrastLeft: {
      label: 'Data Owner (Business VP/Exec)',
      points: [
        'Assigns data classification level',
        'Approves who gets access',
        'Remains accountable for asset value',
      ],
    },
    contrastRight: {
      label: 'Data Custodian (IT / Cloud / Ops)',
      points: [
        'Configures ACLs & permissions',
        'Maintains backups & encryption',
        'Follows Data Owner specifications',
      ],
    },
    examTrap:
      'Distractors love having a sysadmin or CISO approve access directly—always route access authorization to the Data Owner.',
  },
  {
    id: 'duecare',
    subdomain: '1.12 Due Care vs. Due Diligence',
    title: 'Knowing ("Detect") vs. Doing ("Correct")',
    ruleOfThumb: 'Due Diligence = Researching risk; Due Care = Acting to protect.',
    contrastLeft: {
      label: 'Due Diligence (Do Detect)',
      points: [
        'Auditing a vendor before M&A',
        'Running vulnerability assessments',
        'Researching regulatory requirements',
      ],
    },
    contrastRight: {
      label: 'Due Care (Do Correct)',
      points: [
        'Applying security patches & MFA',
        'Publishing & enforcing policies',
        'Prudent Person standard of action',
      ],
    },
    examTrap:
      'If the scenario describes investigating, auditing, or assessing before a decision, pick Due Diligence.',
  },
  {
    id: 'policy',
    subdomain: '1.8 Policy Hierarchy',
    title: 'Policy vs. Standard vs. Procedure vs. Guideline',
    ruleOfThumb: 'Only Guidelines are optional; Policies, Standards, Baselines, and Procedures are mandatory.',
    contrastLeft: {
      label: 'Mandatory Documents',
      points: [
        'Policy: High-level strategic intent ("What & Why")',
        'Standard: Uniform tech specification (e.g., AES-256)',
        'Procedure: Step-by-step execution clicks',
      ],
    },
    contrastRight: {
      label: 'Discretionary / Reference',
      points: [
        'Guideline: Recommended best practices ("Should")',
        'Baseline: Minimum security floor across systems',
      ],
    },
    examTrap:
      'When asked what document specifies mandatory uniform algorithms like AES-256 across the org, choose Standard (not Guideline).',
  },
  {
    id: 'personnel',
    subdomain: '1.10 Personnel Controls',
    title: 'Separation of Duties vs. Mandatory Vacation',
    ruleOfThumb: 'Separation of Duties PREVENTS solo fraud; Mandatory Vacations DETECT ongoing fraud.',
    contrastLeft: {
      label: 'Separation of Duties (Preventive)',
      points: [
        'Splits critical workflow across ≥ 2 roles',
        'Forces collusion to commit fraud',
        'Example: Requestor ≠ Approver',
      ],
    },
    contrastRight: {
      label: 'Mandatory Vacation (Detective)',
      points: [
        'Forces employee offline for 1–2 weeks',
        'Audits transactions while replacement covers',
        'Uncovers hidden ongoing embezzlement',
      ],
    },
    examTrap:
      'If the stem asks what prevents a single person from both creating a vendor and approving payment, choose Separation of Duties.',
  },
];

export default function InteractiveConceptDeck() {
  const [activeTab, setActiveTab] = useState<'cards' | 'riskCalc' | 'biaTimeline'>('cards');
  const [cardIndex, setCardIndex] = useState(0);

  // Quantitative Risk Calculator state
  const [assetValue, setAssetValue] = useState(800000);
  const [preEfPct, setPreEfPct] = useState(30);
  const [postEfPct, setPostEfPct] = useState(5);
  const [aro, setAro] = useState(0.25);
  const [controlCost, setControlCost] = useState(55000);

  // BIA Timeline state
  const [rpoHours, setRpoHours] = useState(4);
  const [rtoHours, setRtoHours] = useState(5);
  const [wrtHours, setWrtHours] = useState(4);
  const [mtdHours, setMtdHours] = useState(12);

  const preSle = Math.round(assetValue * (preEfPct / 100));
  const preAle = Math.round(preSle * aro);
  const postSle = Math.round(assetValue * (postEfPct / 100));
  const postAle = Math.round(postSle * aro);
  const netBenefit = preAle - postAle - controlCost;

  const totalDowntime = rtoHours + wrtHours;
  const biaCompliant = totalDowntime <= mtdHours;

  const currentCard = DOMAIN_1_FLASHCARDS[cardIndex];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/70 pb-4 dark:border-slate-800/70">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Interactive Domain 1 Learning Studio
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Visual mindset cards & live CISSP formula simulators
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('cards')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              activeTab === 'cards'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            Mindset Contrasts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('riskCalc')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              activeTab === 'riskCalc'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Calculator className="h-3.5 w-3.5 text-emerald-500" />
            ALE Risk Simulator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('biaTimeline')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              activeTab === 'biaTimeline'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-sky-500" />
            BIA Timeline (RTO/MTD)
          </button>
        </div>
      </div>

      {/* TAB 1: MINDSET CONTRAST CARDS */}
      {activeTab === 'cards' && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {currentCard.subdomain}
            </span>
            <div className="flex items-center gap-1.5">
              {DOMAIN_1_FLASHCARDS.map((c, idx) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCardIndex(idx)}
                  aria-label={`Card ${idx + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    idx === cardIndex
                      ? 'w-6 bg-emerald-500'
                      : 'w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>

          <h4 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
            {currentCard.title}
          </h4>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {currentCard.ruleOfThumb}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {currentCard.contrastLeft.label}
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                {currentCard.contrastLeft.points.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3.5">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                {currentCard.contrastRight.label}
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                {currentCard.contrastRight.points.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span>
                <strong>Watch the Trap:</strong> {currentCard.examTrap}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setCardIndex((prev) =>
                    prev === 0 ? DOMAIN_1_FLASHCARDS.length - 1 : prev - 1
                  )
                }
                className="rounded-lg border border-amber-500/30 p-1 hover:bg-amber-500/20"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setCardIndex((prev) => (prev + 1) % DOMAIN_1_FLASHCARDS.length)
                }
                className="rounded-lg border border-amber-500/30 p-1 hover:bg-amber-500/20"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: QUANTITATIVE RISK CALCULATOR */}
      {activeTab === 'riskCalc' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-6">
            <div className="grid grid-cols-2 gap-3">
              <label className="block rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <span className="text-[11px] font-medium text-slate-500">
                  Asset Value (AV $)
                </span>
                <input
                  type="number"
                  step={50000}
                  value={assetValue}
                  onChange={(e) => setAssetValue(Math.max(0, Number(e.target.value)))}
                  className="mt-1 w-full bg-transparent font-mono text-sm font-bold text-slate-900 focus:outline-none dark:text-white"
                />
              </label>
              <label className="block rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <span className="text-[11px] font-medium text-slate-500">
                  ARO (Events / Year)
                </span>
                <input
                  type="number"
                  step={0.05}
                  value={aro}
                  onChange={(e) => setAro(Math.max(0, Number(e.target.value)))}
                  className="mt-1 w-full bg-transparent font-mono text-sm font-bold text-slate-900 focus:outline-none dark:text-white"
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="block rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <span className="text-[11px] font-medium text-slate-500">
                  Pre-Control EF (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={preEfPct}
                  onChange={(e) =>
                    setPreEfPct(Math.min(100, Math.max(0, Number(e.target.value))))
                  }
                  className="mt-1 w-full bg-transparent font-mono text-sm font-bold text-slate-900 focus:outline-none dark:text-white"
                />
              </label>
              <label className="block rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <span className="text-[11px] font-medium text-slate-500">
                  Post-Control EF (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={postEfPct}
                  onChange={(e) =>
                    setPostEfPct(Math.min(100, Math.max(0, Number(e.target.value))))
                  }
                  className="mt-1 w-full bg-transparent font-mono text-sm font-bold text-slate-900 focus:outline-none dark:text-white"
                />
              </label>
              <label className="block rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <span className="text-[11px] font-medium text-slate-500">
                  Control Cost (ACS $/yr)
                </span>
                <input
                  type="number"
                  step={5000}
                  value={controlCost}
                  onChange={(e) => setControlCost(Math.max(0, Number(e.target.value)))}
                  className="mt-1 w-full bg-transparent font-mono text-sm font-bold text-slate-900 focus:outline-none dark:text-white"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60 lg:col-span-6">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-white p-2.5 dark:bg-slate-900">
                <div className="text-slate-500">Before Control (ALE₁)</div>
                <div className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-white">
                  ${preAle.toLocaleString()}/yr
                </div>
                <div className="text-[11px] text-slate-400">
                  SLE₁ = ${preSle.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg bg-white p-2.5 dark:bg-slate-900">
                <div className="text-slate-500">After Control (ALE₂)</div>
                <div className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-white">
                  ${postAle.toLocaleString()}/yr
                </div>
                <div className="text-[11px] text-slate-400">
                  SLE₂ = ${postSle.toLocaleString()}
                </div>
              </div>
            </div>

            <div
              className={`mt-3 flex items-center justify-between rounded-xl p-3 ${
                netBenefit >= 0
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              }`}
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider">
                  Net Safeguard Value (ALE₁ - ALE₂ - ACS)
                </div>
                <div className="mt-0.5 text-xs">
                  {netBenefit >= 0
                    ? 'Cost-justified! Recommend approval to management.'
                    : 'Negative ROI! Control costs more than the risk it reduces.'}
                </div>
              </div>
              <div className="font-mono text-lg font-bold">
                {netBenefit >= 0 ? '+' : '-'}${Math.abs(netBenefit).toLocaleString()}/yr
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BIA TIMELINE SIMULATOR */}
      {activeTab === 'biaTimeline' && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-500">
                RPO (Data Loss Backwards)
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={rpoHours}
                  onChange={(e) => setRpoHours(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <span className="font-mono text-xs font-bold">{rpoHours}h</span>
              </div>
            </label>
            <label className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-500">
                RTO (IT System Restore)
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={rtoHours}
                  onChange={(e) => setRtoHours(Number(e.target.value))}
                  className="w-full accent-sky-500"
                />
                <span className="font-mono text-xs font-bold">{rtoHours}h</span>
              </div>
            </label>
            <label className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-500">
                WRT (Verify & Catch-up)
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={wrtHours}
                  onChange={(e) => setWrtHours(Number(e.target.value))}
                  className="w-full accent-teal-500"
                />
                <span className="font-mono text-xs font-bold">{wrtHours}h</span>
              </div>
            </label>
            <label className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-500">
                MTD (Max Tolerable Limit)
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={4}
                  max={24}
                  value={mtdHours}
                  onChange={(e) => setMtdHours(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <span className="font-mono text-xs font-bold">{mtdHours}h</span>
              </div>
            </label>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Rule: <strong>RTO ({rtoHours}h) + WRT ({wrtHours}h) = {totalDowntime}h</strong>{' '}
                must be ≤ <strong>MTD ({mtdHours}h)</strong>
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${
                  biaCompliant
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                }`}
              >
                {biaCompliant ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Compliant ({mtdHours - totalDowntime}h
                    buffer)
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" /> Violates MTD by{' '}
                    {totalDowntime - mtdHours}h!
                  </>
                )}
              </span>
            </div>

            {/* Visual Timeline Bar */}
            <div className="mt-3 flex h-7 w-full overflow-hidden rounded-lg bg-slate-200/70 text-[11px] font-semibold dark:bg-slate-800">
              <div
                style={{ width: `${Math.min(30, rpoHours * 2.5)}%` }}
                className="flex items-center justify-center bg-indigo-500/80 text-white"
                title="RPO: Backward acceptable data loss"
              >
                ← RPO ({rpoHours}h)
              </div>
              <div className="flex w-1.5 items-center justify-center bg-rose-500" title="Disaster Event" />
              <div
                style={{ width: `${Math.min(40, (rtoHours / 24) * 70)}%` }}
                className="flex items-center justify-center bg-sky-500 text-slate-950"
              >
                RTO ({rtoHours}h)
              </div>
              <div
                style={{ width: `${Math.min(40, (wrtHours / 24) * 70)}%` }}
                className="flex items-center justify-center bg-teal-400 text-slate-950"
              >
                WRT ({wrtHours}h)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
