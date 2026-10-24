'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CrowdNetwork, NetworkHandle } from '@/components/CrowdNetwork';
import { FinancialsLens, MarketingLens, ProductLens } from '@/components/LensTabs';
import { SegmentTabs } from '@/components/SegmentTabs';
import { Dock, LoopTimeline, Pending, PersonaCard, Stage, Status, TopBar, Version } from '@/components/Shell';
import { useVoice, VoiceVisual } from '@/components/VoiceVisual';
import { streamSSE } from '@/lib/client';
import { defaultConfigs, InputType, parsePrice, samplePersonas, SegmentConfig, splitSentences } from '@/lib/personas';
import { diversity, Reaction, summarise } from '@/lib/score';

const N = 1000;
const SEED = 7;
const TABS = ['Crowd', 'Segments', 'Marketing', 'Product', 'Financials'] as const;
type Tab = (typeof TABS)[number];

const EXAMPLES: Record<InputType, string> = {
  ad: 'Meet Loop: the gym that charges per visit. No contracts, no joining fee. Tap in at any of 40 London studios. £14/mo gets you four visits, then £3 a visit.',
  price: '£9/mo → £14/mo. The new price adds a monthly 1:1 coaching session and priority booking at peak times.',
  spec: 'Removing the free tier. Adding team seats so companies can buy Loop for staff, with one invoice and usage reports.',
};

type LogEvent = { t: number; stream: 'crowd' | 'optimise'; event: string; data: unknown };

export default function Home() {
  const [demo, setDemo] = useState(false);
  const [type, setType] = useState<InputType>('ad');
  const [text, setText] = useState(EXAMPLES.ad);
  const [interim, setInterim] = useState('');
  const [price, setPrice] = useState<number | null>(14);
  const [configs, setConfigs] = useState<SegmentConfig[]>(() => defaultConfigs('ad'));
  const [tab, setTab] = useState<Tab>('Crowd');
  const [stage, setStage] = useState<Stage>('Input');
  const [status, setStatus] = useState<Status>(null);
  const [running, setRunning] = useState(false);
  const [mono, setMono] = useState(false);
  const [ver, setVer] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [themes, setThemes] = useState<{ theme: string; count: number }[] | null>(null);
  const [meter, setMeter] = useState({ calls: 0, tokens: 0 });
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mixedRef = useRef(new Map<string, Reaction>());
  const monoRef = useRef(new Map<string, Reaction>());
  const versionReactions = useRef(new Map<number, Map<string, Reaction>>());
  const net = useRef<NetworkHandle>(null);
  const log = useRef<{ state: unknown; events: LogEvent[] }>({ state: null, events: [] });
  const bump = useCallback(() => setVer((v) => v + 1), []);

  const personas = useMemo(() => samplePersonas(configs, N, SEED, 6), [configs]);
  const sentences = useMemo(() => splitSentences(text + (interim ? ' ' + interim : '')), [text, interim]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summarise(personas, mixedRef.current, configs), [personas, configs, ver]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monoDiv = useMemo(() => (monoRef.current.size ? diversity([...monoRef.current.values()]) : null), [ver]);

  // Demo mode: load the recorded session state.
  useEffect(() => {
    const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';
    setDemo(isDemo);
    if (isDemo) {
      fetch('/demo/run.json').then((r) => r.json()).then((d) => {
        const s = d.state;
        if (!s) return;
        setType(s.type); setText(s.text); setPrice(s.price); setConfigs(s.configs);
      }).catch(() => setError('No recorded demo found at /demo/run.json'));
    }
    // A failed poll keeps the last known roster so model labels never drop out mid-run.
    const poll = () =>
      fetch('/api/status')
        .then((r) => r.json())
        .then((s: NonNullable<Status>) => setStatus((prev) => (s.ok ? s : { ...prev, ...s, families: prev?.families })))
        .catch(() => setStatus((prev) => ({ ...prev, ok: false })));
    poll();
    const t = setInterval(poll, 20000);
    return () => clearInterval(t);
  }, []);

  const onTextChange = (t: string) => {
    setText(t);
    const p = parsePrice(t);
    if (p != null) setPrice(p);
  };

  const record = (stream: 'crowd' | 'optimise', event: string, data: unknown) => {
    if (!demo) log.current.events.push({ t: Math.round(performance.now()), stream, event, data });
  };

  const handleCrowdEvent = (target: Map<string, Reaction>, event: string, data: any) => {
    if (event === 'meter') setMeter({ calls: data.calls, tokens: data.promptTokens + data.completionTokens });
    if (event === 'batch_start' || event === 'batch_done' || event === 'batch_failed') net.current?.onEvent(event, data);
    if (event === 'batch_done' && data.phase !== 'variant') {
      for (const r of data.reactions as Reaction[]) target.set(r.personaId, r);
      bump();
    }
    if (event === 'error') setError(data.message);
  };

  const body = (extra: object = {}) => ({ type, text, price, configs, seed: SEED, n: N, demo, ...extra });

  async function runCrowd(asMono = false) {
    if (running) return;
    setRunning(true);
    setError(null);
    setStage('Crowd');
    setSelected(null);
    if (!log.current.events.length) log.current.state = { type, text, price, configs };
    const target = asMono ? monoRef.current : mixedRef.current;
    target.clear();
    if (!asMono) { setVersions([]); setPending(null); setThemes(null); setNote(null); setPrevPrice(null); versionReactions.current.clear(); }
    net.current?.reset();
    bump();
    try {
      await streamSSE('/api/crowd', body({ mono: asMono }), (event, data) => {
        record('crowd', event, data);
        handleCrowdEvent(target, event, data);
      });
    } catch (e) {
      setError(String((e as Error).message));
    }
    if (!asMono) versionReactions.current.set(0, new Map(mixedRef.current));
    setRunning(false);
    bump();
  }

  async function runOptimise() {
    if (running) return;
    setRunning(true);
    setError(null);
    setStage('Optimise');
    setMono(false);
    setVersions([]);
    setPending(null);
    setNote(null);
    setPrevPrice(price);
    const startText = text;
    let confirmMap = new Map<string, Reaction>();
    try {
      await streamSSE('/api/optimise', body({ reactions: demo ? undefined : [...mixedRef.current.values()] }), (event, data) => {
        record('optimise', event, data);
        if (data?.phase === 'confirm' && event === 'batch_done') {
          for (const r of data.reactions as Reaction[]) confirmMap.set(r.personaId, r);
        }
        handleCrowdEvent(mixedRef.current, event, data);
        switch (event) {
          case 'version':
            setVersions((v) => [...v.filter((x) => x.version !== data.version), data]);
            versionReactions.current.set(data.version, data.version === 0 && !confirmMap.size ? new Map(mixedRef.current) : new Map(mixedRef.current));
            setViewing(data.version);
            confirmMap = new Map();
            break;
          case 'iter_start':
            setPending({ iter: data.iter, lever: '…', reason: '', variants: [], scores: [], baseline: null });
            break;
          case 'proposal':
            setPending({ iter: data.iter, lever: data.lever, reason: data.reason, variants: data.variants, scores: data.variants.map(() => null), baseline: null });
            if (data.objectionThemes?.length) setThemes(data.objectionThemes);
            break;
          case 'variant_done':
            setPending((p) => (p ? { ...p, baseline: data.baseline, scores: p.scores.map((s, i) => (i === data.variant ? data.score : s)) } : p));
            break;
          case 'apply':
            setPending((p) => (p ? { ...p, applied: true } : p));
            setText(data.text);
            if (data.price != null) setPrice(data.price);
            break;
          case 'iter_done':
            if (!data.applied) setPending((p) => (p ? { ...p, applied: true } : p));
            break;
          case 'loop_done':
            setNote(data.reason);
            setStage('Result');
            break;
        }
      });
    } catch (e) {
      setError(String((e as Error).message));
      setText(startText);
    }
    setRunning(false);
    bump();
  }

  async function toggleMono() {
    const next = !mono;
    setMono(next);
    if (next && !monoRef.current.size && !running) await runCrowd(true);
  }

  const viewVersion = (v: number) => {
    const ver = versions.find((x) => x.version === v);
    const rs = versionReactions.current.get(v);
    if (!ver) return;
    setViewing(v);
    setText(ver.text);
    setPrice(ver.price);
    if (rs) { mixedRef.current = new Map(rs); bump(); }
  };

  const changeTemplate = (t: InputType) => {
    setType(t);
    setConfigs(defaultConfigs(t));
    setText(EXAMPLES[t]);
    setPrice(parsePrice(EXAMPLES[t]));
    mixedRef.current.clear(); monoRef.current.clear(); net.current?.reset(); setVersions([]); setPending(null); setStage('Input'); bump();
  };

  const changeConfigs = (c: SegmentConfig[]) => {
    setConfigs(c);
    mixedRef.current.clear(); monoRef.current.clear(); net.current?.reset(); setStage('Input'); bump();
  };

  const voice = useVoice(
    (final) => setText((t) => { const n = (t.trim() ? t.trim() + ' ' : '') + final.charAt(0).toUpperCase() + final.slice(1) + (/[.!?]$/.test(final) ? '' : '.'); const p = parsePrice(n); if (p != null) setPrice(p); return n; }),
    setInterim,
  );
  const toggleMic = async () => {
    if (micOn) { voice.stop(); setAnalyser(null); setMicOn(false); return; }
    try {
      if (!text.trim() || text === EXAMPLES[type]) setText('');
      setAnalyser(await voice.start());
      setMicOn(true);
    } catch { setError('Microphone permission denied'); }
  };

  async function onVideo(file: File) {
    setVideoBusy(true);
    try {
      const frames = await sampleFrames(file, 6);
      const res = await fetch('/api/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frames }) });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      const add = [d.claims?.length ? `Video claims: ${d.claims.join('; ')}.` : '', d.onScreenText?.length ? `On-screen text: ${d.onScreenText.join('; ')}.` : '', d.visualNotes?.length ? `Visual impression: ${d.visualNotes.join('; ')}.` : ''].filter(Boolean).join(' ');
      setText((t) => (t.trim() + '\n' + add).trim());
    } catch (e) { setError('Video: ' + String((e as Error).message)); }
    setVideoBusy(false);
  }

  const saveDemo = async () => {
    const r = await fetch('/api/record', { method: 'POST', body: JSON.stringify(log.current) });
    setNote(r.ok ? `Saved demo (${log.current.events.length} events)` : 'Save failed');
  };

  const exit = () => {
    if (micOn) toggleMic();
    mixedRef.current.clear(); monoRef.current.clear(); net.current?.reset();
    log.current = { state: null, events: [] };
    setVersions([]); setPending(null); setStage('Input'); setMono(false); setNote(null); setSelected(null); bump();
  };

  const display = mono ? monoRef.current : mixedRef.current;
  const sel = selected ? personas.find((p) => p.id === selected) : null;
  const hasRun = summary.n > 0;

  return (
    <div className="flex h-screen flex-col">
      <TopBar stage={stage} status={status} demo={demo} meter={meter} onExit={exit} onSaveDemo={!demo && log.current.events.length ? saveDemo : undefined} />
      <main className="flex min-h-0 flex-1">
        {/* LEFT: input workspace */}
        <section className="flex w-[58%] min-w-0 flex-col border-r border-[var(--line)]">
          <div className="flex items-center gap-1 px-4 pt-3">
            {(['ad', 'price', 'spec'] as InputType[]).map((t) => (
              <button key={t} onClick={() => setType(t)} className={`rounded-md px-3 py-1.5 text-[13px] transition-colors duration-200 ${type === t ? 'bg-[var(--panel2)] text-[var(--text)]' : 'text-[var(--dim)] hover:text-[var(--text)]'}`}>
                {t === 'ad' ? 'Ad' : t === 'price' ? 'Price' : 'Spec'}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 text-[12px] text-[var(--dim)]">
              Founder&apos;s price £
              <input type="number" value={price ?? ''} onChange={(e) => setPrice(e.target.value === '' ? null : +e.target.value)} className="field num w-16 py-1" />/mo
            </div>
          </div>
          <div className="mt-3"><VoiceVisual analyser={analyser} status={micOn ? 'listening' : 'idle'} /></div>
          <div className="relative min-h-0 flex-1 p-4">
            <textarea
              value={text + (interim ? (text ? ' ' : '') + interim : '')}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder={type === 'ad' ? 'Paste your ad, launch post or landing copy…' : type === 'price' ? '£9/mo → £14/mo, plus what changes' : 'What changes in the product'}
              className="h-full w-full resize-none bg-transparent text-[17px] leading-relaxed outline-none placeholder:text-[#4a4a4f]"
            />
            <div className="absolute bottom-3 right-4 flex gap-1">
              {sentences.slice(0, 14).map((_, i) => <span key={i} className="num rounded border border-[var(--line)] px-1.5 text-[10px] text-[var(--dim)]">S{i + 1}</span>)}
            </div>
          </div>
          <LoopTimeline versions={versions} pending={pending} viewing={viewing} onView={viewVersion} note={note} />
          {error && <div className="border-t border-[var(--line)] px-4 py-2 text-[12px] text-[var(--neg)]">{error}</div>}
        </section>

        {/* RIGHT: crowd intelligence */}
        <section className="flex w-[42%] min-w-0 flex-col bg-[var(--panel)]">
          <div className="flex gap-4 border-b border-[var(--line)] px-4">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b py-2.5 text-[13px] transition-colors duration-200 ${tab === t ? 'border-[var(--text)] text-[var(--text)]' : 'border-transparent text-[var(--dim)] hover:text-[var(--text)]'}`}>{t}</button>
            ))}
          </div>
          <div className="relative min-h-0 flex-1 overflow-auto">
            <div className={tab === 'Crowd' ? 'absolute inset-0' : 'hidden'}>
              <CrowdNetwork ref={net} personas={personas} sentences={sentences} families={status?.families ?? []} mono={mono} reactions={display} version={ver} selected={selected} onSelect={setSelected} />
              <div className="pointer-events-none absolute right-3 top-2 text-right text-[11px] text-[var(--dim)]">
                <div><span className="num">{display.size}</span> / 1,000 reacted</div>
                {display.size > 0 && <div>diversity <span className="num text-[var(--text)]">{diversity([...display.values()]).toFixed(0)}</span>{mono ? ' (mono)' : ''}</div>}
              </div>
              {sel && <PersonaCard p={sel} r={display.get(sel.id)} model={display.get(sel.id)?.model} onClose={() => setSelected(null)} />}
            </div>
            {tab === 'Segments' && <SegmentTabs configs={configs} onChange={changeConfigs} scores={summary.segments} />}
            {tab === 'Marketing' && <MarketingLens personas={personas} reactions={mixedRef.current} segments={summary.segments} />}
            {tab === 'Product' && <ProductLens personas={personas} reactions={mixedRef.current} segments={summary.segments} themes={themes} />}
            {tab === 'Financials' && <FinancialsLens personas={personas} reactions={mixedRef.current} segments={summary.segments} price={price} prevPrice={prevPrice} />}
          </div>
        </section>
      </main>
      <Dock
        micOn={micOn} onMic={toggleMic}
        template={type} onTemplate={changeTemplate}
        mono={mono} onMono={toggleMono} diversity={{ mixed: hasRun ? summary.diversity : null, mono: monoDiv }}
        running={running} onRun={() => runCrowd(false)} onOptimise={runOptimise} canOptimise={hasRun || demo}
        onVideo={onVideo} videoBusy={videoBusy}
        score={hasRun ? summary.launch : null}
      />
    </div>
  );
}

async function sampleFrames(file: File, k: number): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.src = url; v.muted = true; v.playsInline = true;
  await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = j; });
  const cv = document.createElement('canvas');
  const scale = Math.min(1, 640 / v.videoWidth);
  cv.width = v.videoWidth * scale; cv.height = v.videoHeight * scale;
  const ctx = cv.getContext('2d')!;
  const out: string[] = [];
  for (let i = 0; i < k; i++) {
    v.currentTime = ((i + 0.5) / k) * v.duration;
    await new Promise((r) => { v.onseeked = r; });
    ctx.drawImage(v, 0, 0, cv.width, cv.height);
    out.push(cv.toDataURL('image/jpeg', 0.7));
  }
  URL.revokeObjectURL(url);
  return out;
}
