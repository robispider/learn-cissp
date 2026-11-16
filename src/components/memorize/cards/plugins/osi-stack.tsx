/**
 * Plugin: osi-stack — animated OSI model with encapsulation.
 *
 * props (all optional):
 *   rounds?: number            how many "where does it live?" questions (default 6)
 *   items?: { item: string; layer: number }[]   extra/replacement placement items
 */
import { useMemo, useState } from 'react';
import { ArrowDown, Check } from 'lucide-react';
import { shuffle, shuffleNotIdentity, type PluginViewProps, type RecallGameProps } from '../types';
import { choiceBtn, choiceIdle, GameHeader, PlaybackBar, useShake, useStagger } from '../ui';

interface Layer {
  n: number;
  name: string;
  pdu: string;
  what: string;
  bar: string;
  text: string;
  soft: string;
}

// Listed top (7) to bottom (1). Class names written out so Tailwind keeps them.
const LAYERS: Layer[] = [
  { n: 7, name: 'Application', pdu: 'Data', what: 'HTTP, DNS, SMTP, SNMP · WAF, app proxy', bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', soft: 'bg-rose-500/10 border-rose-500/30' },
  { n: 6, name: 'Presentation', pdu: 'Data', what: 'Encoding, compression, encryption format', bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', soft: 'bg-orange-500/10 border-orange-500/30' },
  { n: 5, name: 'Session', pdu: 'Data', what: 'Set up / tear down sessions · RPC, NetBIOS', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', soft: 'bg-amber-500/10 border-amber-500/30' },
  { n: 4, name: 'Transport', pdu: 'Segment', what: 'TCP / UDP, ports, flow control', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', soft: 'bg-emerald-500/10 border-emerald-500/30' },
  { n: 3, name: 'Network', pdu: 'Packet', what: 'IP, ICMP, IPsec · routers', bar: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', soft: 'bg-sky-500/10 border-sky-500/30' },
  { n: 2, name: 'Data Link', pdu: 'Frame', what: 'MAC, ARP, 802.1X · switches', bar: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400', soft: 'bg-indigo-500/10 border-indigo-500/30' },
  { n: 1, name: 'Physical', pdu: 'Bits', what: 'Cable, fiber, radio · hubs, repeaters', bar: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400', soft: 'bg-violet-500/10 border-violet-500/30' },
];
const byN = (n: number) => LAYERS.find((l) => l.n === n)!;

const PLACEMENT_ITEMS: { item: string; layer: number }[] = [
  { item: 'Router', layer: 3 },
  { item: 'Switch (standard)', layer: 2 },
  { item: 'Hub / repeater', layer: 1 },
  { item: 'TCP and UDP ports', layer: 4 },
  { item: 'IP addressing', layer: 3 },
  { item: 'MAC address', layer: 2 },
  { item: 'ARP', layer: 2 },
  { item: 'ICMP (ping)', layer: 3 },
  { item: 'IPsec', layer: 3 },
  { item: '802.1X port authentication', layer: 2 },
  { item: 'HTTP / DNS / SMTP', layer: 7 },
  { item: 'Web application firewall', layer: 7 },
  { item: 'Data compression and encoding', layer: 6 },
  { item: 'RPC / NetBIOS session setup', layer: 5 },
  { item: 'PDU called a "frame"', layer: 2 },
  { item: 'PDU called a "packet"', layer: 3 },
  { item: 'PDU called a "segment"', layer: 4 },
  { item: 'Bits on the wire', layer: 1 },
];

/** What the data unit looks like after leaving layer n on the way down. */
function pduBlocks(n: number): { label: string; cls: string }[] {
  const data = { label: 'DATA', cls: 'bg-rose-500/80' };
  const tcp = { label: 'TCP', cls: 'bg-emerald-500' };
  const ip = { label: 'IP', cls: 'bg-sky-500' };
  const mac = { label: 'MAC', cls: 'bg-indigo-500' };
  const fcs = { label: 'FCS', cls: 'bg-indigo-400' };
  if (n >= 5) return [data];
  if (n === 4) return [tcp, data];
  if (n === 3) return [ip, tcp, data];
  return [mac, ip, tcp, data, fcs];
}

function Mnemonics() {
  const up = 'Please Do Not Throw Sausage Pizza Away'.split(' ');
  const down = 'All People Seem To Need Data Processing'.split(' ');
  const word = (w: string, layerN: number, i: number) => (
    <span key={i} className="mr-1 inline-block">
      <span className={`font-black ${byN(layerN).text}`}>{w[0]}</span>
      <span className="text-slate-600 dark:text-slate-300">{w.slice(1)}</span>
    </span>
  );
  return (
    <div className="mem-fade-up grid gap-2 text-sm sm:grid-cols-2">
      <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Layer 1 → 7</div>
        {up.map((w, i) => word(w, i + 1, i))}
      </div>
      <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Layer 7 → 1</div>
        {down.map((w, i) => word(w, 7 - i, i))}
      </div>
    </div>
  );
}

export function OsiStackView({ mode }: PluginViewProps) {
  // Steps: 1..7 = data moves down from L7 to L1; 8 = mnemonics.
  const ctl = useStagger(8, 1700, mode === 'learn');
  const activeN = ctl.shown >= 1 && ctl.shown <= 7 ? 8 - ctl.shown : null;
  const reached = (n: number) => ctl.shown >= 8 - n; // layer n reached once data passed it
  const pduN = activeN ?? (ctl.shown >= 7 ? 1 : 7);

  return (
    <div className="space-y-3">
      {mode === 'learn' && <PlaybackBar ctl={ctl} total={8} label="Encapsulation: data travels down the stack" />}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <ol className="space-y-1">
          {LAYERS.map((l) => {
            const on = reached(l.n);
            const active = activeN === l.n;
            return (
              <li
                key={l.n}
                className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 transition-all duration-500 ${
                  on ? l.soft : 'border-slate-200/70 opacity-40 dark:border-slate-800'
                } ${active ? 'mem-glow translate-x-1 scale-[1.02]' : ''}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-black text-white ${l.bar}`}>
                  {l.n}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-bold ${on ? l.text : 'text-slate-500'}`}>{l.name}</div>
                  <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{l.what}</div>
                </div>
                <span className="shrink-0 rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
                  {l.pdu}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Encapsulation panel */}
        <div className="flex flex-col justify-center rounded-2xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">What leaves layer {pduN}</div>
          <div key={pduN} className="mem-drop mt-2">
            {pduN === 1 ? (
              <div className="break-all font-mono text-sm font-bold tracking-widest text-violet-600 dark:text-violet-400">
                0110 1001 1100 0101 1011 0010
              </div>
            ) : (
              <div className="flex overflow-hidden rounded-lg text-[10px] font-black text-white shadow-sm">
                {pduBlocks(pduN).map((b, i) => (
                  <span key={i} className={`${b.cls} ${b.label === 'DATA' ? 'flex-[2]' : 'flex-1'} px-1 py-2 text-center`}>
                    {b.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className={`mt-2 text-sm font-bold ${byN(pduN).text}`}>
            {pduN === 4 ? 'Segment (TCP) / datagram (UDP)' : byN(pduN).pdu}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {pduN >= 5
              ? 'Upper layers work on application data.'
              : pduN === 4
                ? 'Transport adds a header with ports.'
                : pduN === 3
                  ? 'Network adds source and destination IP.'
                  : pduN === 2
                    ? 'Data Link adds MACs and a trailer (FCS).'
                    : 'Physical sends it as signals.'}
          </p>
          <ArrowDown className="mx-auto mt-2 h-4 w-4 text-slate-300 dark:text-slate-600" />
          <p className="text-center text-[10px] text-slate-400">Receiver de-encapsulates bottom-up</p>
        </div>
      </div>
      {ctl.shown >= 8 && <Mnemonics />}
    </div>
  );
}

export function OsiStackRecall({ props, onComplete }: RecallGameProps) {
  const rounds = typeof props.rounds === 'number' ? props.rounds : 6;
  const extra = Array.isArray(props.items) ? (props.items as { item: string; layer: number }[]) : [];
  const [names] = useState(() => shuffleNotIdentity([...LAYERS].reverse()));
  const placements = useMemo(() => shuffle([...extra, ...PLACEMENT_ITEMS]).slice(0, rounds), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [built, setBuilt] = useState<number[]>([]); // layer numbers placed, bottom-up
  const [missedSlots, setMissedSlots] = useState<Set<number>>(new Set());
  const [qi, setQi] = useState(0);
  const [qResults, setQResults] = useState<boolean[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [misses, setMisses] = useState<string[]>([]);
  const [start] = useState(() => Date.now());
  const { shake, isShaking } = useShake();

  const phaseA = built.length < 7;
  const nextN = built.length + 1;

  const tapName = (n: number) => {
    if (n === nextN) {
      setBuilt((b) => [...b, n]);
      return;
    }
    shake(`n${n}`);
    if (!missedSlots.has(nextN)) {
      setMissedSlots((s) => new Set(s).add(nextN));
      setMisses((m) => [...m, `Layer ${nextN} is ${byN(nextN).name}`]);
    }
  };

  const q = placements[qi];
  const tapLayer = (n: number) => {
    if (phaseA || picked !== null || !q) return;
    setPicked(n);
    const ok = n === q.layer;
    const nextRes = [...qResults, ok];
    setQResults(nextRes);
    const nextMisses = ok ? misses : [...misses, `${q.item} → Layer ${q.layer} ${byN(q.layer).name}`];
    setMisses(nextMisses);
    window.setTimeout(
      () => {
        if (qi + 1 >= placements.length) {
          onComplete({
            correct: 7 - missedSlots.size + nextRes.filter(Boolean).length,
            total: 7 + placements.length,
            hintsUsed: 0,
            durationMs: Date.now() - start,
            misses: nextMisses,
          });
        } else {
          setQi(qi + 1);
          setPicked(null);
        }
      },
      ok ? 600 : 1500
    );
  };

  // Show the stack top-down; unbuilt slots are empty.
  return (
    <div>
      {phaseA ? (
        <GameHeader title="Build the stack" instructions={<>Tap the layers from the bottom up. Next: <strong>Layer {nextN}</strong>.</>} />
      ) : (
        <GameHeader
          title="Where does it live?"
          instructions="Tap the layer this belongs to."
          round={qi}
          rounds={placements.length}
          results={qResults}
        />
      )}

      {!phaseA && q && (
        <div key={qi} className="mem-pop mb-3 rounded-2xl border-2 border-violet-500/40 bg-violet-500/5 px-4 py-3 text-center text-base font-bold text-slate-900 dark:text-white">
          {q.item}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="space-y-1">
          {LAYERS.map((l) => {
            const isBuilt = built.includes(l.n);
            const right = picked !== null && q && l.n === q.layer;
            const wrong = picked === l.n && q && l.n !== q.layer;
            return (
              <li key={l.n}>
                <button
                  type="button"
                  disabled={phaseA || picked !== null}
                  onClick={() => tapLayer(l.n)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                    isBuilt
                      ? `mem-drop ${l.soft} ${!phaseA && picked === null ? 'hover:scale-[1.02] hover:shadow-md' : ''}`
                      : 'border-dashed border-slate-200 dark:border-slate-800'
                  } ${right ? 'ring-2 ring-emerald-500' : ''} ${wrong ? 'mem-shake ring-2 ring-rose-500' : ''}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-black ${isBuilt ? `${l.bar} text-white` : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                    {l.n}
                  </span>
                  <span className={`text-sm font-bold ${isBuilt ? l.text : 'text-slate-300 dark:text-slate-700'}`}>
                    {isBuilt ? l.name : l.n === nextN ? '?' : ''}
                  </span>
                  {isBuilt && missedSlots.has(l.n) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-500" title="Missed first try" />}
                  {right && <Check className="ml-auto h-4 w-4 text-emerald-500" />}
                </button>
              </li>
            );
          })}
        </ol>
        {phaseA && (
          <div className="grid content-start grid-cols-2 gap-2">
            {names
              .filter((l) => !built.includes(l.n))
              .map((l) => (
                <button key={l.n} type="button" onClick={() => tapName(l.n)} className={`${choiceBtn} ${choiceIdle} ${isShaking(`n${l.n}`) ? 'mem-shake border-rose-500/60' : ''} text-center`}>
                  {l.name}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

