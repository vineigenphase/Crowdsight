'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CrowdNetwork, NetworkHandle } from '@/components/CrowdNetwork';
import { FinancialsLens, MarketingLens, ProductLens } from '@/components/LensTabs';
import { SegmentTabs } from '@/components/SegmentTabs';
import { Dock, LoopTimeline, ModelCard, ModelStat, Pending, PersonaCard, Stage, Status, TopBar, Version } from '@/components/Shell';
import { useVoice, VoiceVisual } from '@/components/VoiceVisual';
import { streamSSE } from '@/lib/client';
import { defaultConfigs, InputType, parsePrice, samplePersonas, SegmentConfig, splitSentences } from '@/lib/personas';
import { diversity, financials, Reaction, summarise } from '@/lib/score';
import { Transcript } from '@/components/Transcript';
import { FeedRow, Favicons, LiveFeed } from '@/components/LiveFeed';
import { SummaryPanel } from '@/components/SummaryPanel';
import type { FinalSummary } from '@/lib/loop';

const N = 1000;
const SEED = 7;
const TABS = ['Crowd', 'Feed', 'Summary', 'Segments', 'Marketing', 'Product', 'Financials'] as const;
type Tab = (typeof TABS)[number];

const EXAMPLES: Record<InputType, string> = {
  ad: 'Meet Loop: the gym that charges per visit. No contracts, no joining fee. Tap in at any of 40 London studios. £14/mo gets you four visits, then £3 a visit.',
  price: '£9/mo → £14/mo. The new price adds a monthly 1:1 coaching session and priority booking at peak times.',
  spec: 'Removing the free tier. Adding team seats so companies can buy Loop for staff, with one invoice and usage reports.',
};

type LogEvent = { t: number; stream: 'crowd' | 'optimise' | 'ground'; event: string; data: unknown };
type Brief = { competitors: { name: string; price: string | null; url: string }[]; painPoints: string[]; trends: string[]; sources: { title: string; url: string }[] };
const FEED_EVENTS = new Set(['ground_source', 'brief', 'batch_done', 'batch_failed', 'proposal', 'variant_done', 'baseline', 'apply', 'version', 'run_done', 'loop_done', 'summary_start', 'summary']);

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
  const [category, setCategory] = useState('pay-per-visit gyms, London');
  const [brief, setBrief] = useState<Brief | null>(null);
  const briefFor = useRef<string | null>(null);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [briefOpen, setBriefOpen] = useState(false);
  const [finalSum, setFinalSum] = useState<(FinalSummary & { score?: number }) | null>(null);
  const [sumPending, setSumPending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<number | null>(null);
  const modelStats = useRef(new Map<string, ModelStat>());
  const [versions, setVersions] = useState<Version[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [themes, setThemes] = useState<{ theme: string; count: number }[] | null>(null);
  const [meter, setMeter] = useState({ calls: 0, tokens: 0 });
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [mode, setMode] = useState<'speak' | 'type'>('type');
  const [stamps, setStamps] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const micStart = useRef(0);
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

  const record = (stream: 'crowd' | 'optimise' | 'ground', event: string, data: unknown) => {
    if (!demo) log.current.events.push({ t: Math.round(performance.now()), stream, event, data });
    if (FEED_EVENTS.has(event)) setFeed((f) => [...f, { t: Date.now(), event, data }].slice(-300));
  };
  const briefStr = (b: Brief | null) => b ? `Competitors: ${b.competitors.map((c) => `${c.name}${c.price ? ` (${c.price})` : ''}`).join(', ') || 'unknown'}. Known pain points: ${b.painPoints.join('; ')}. Trends: ${b.trends.join('; ')}.` : undefined;

  async function groundIfNeeded(): Promise<Brief | null> {
    if (!category.trim() || (briefFor.current === category && brief)) return brief;
    let got: Brief | null = null;
    setTab('Feed');
    try {
      await streamSSE('/api/ground', { category, demo }, (event, data) => {
        record('ground', event, data);
        if (event === 'brief') got = data;
      });
    } catch (e) { setError('Tavily: ' + String((e as Error).message)); }
    if (got) { setBrief(got); briefFor.current = category; }
    return got;
  }

  const handleCrowdEvent = (target: Map<string, Reaction>, event: string, data: any) => {
    if (event === 'meter') setMeter({ calls: data.calls, tokens: data.promptTokens + data.completionTokens });
    if (event === 'batch_start' || event === 'batch_done' || event === 'batch_failed') net.current?.onEvent(event, data);
    if ((event === 'batch_done' || event === 'batch_failed') && data.model) {
      const m = modelStats.current.get(data.model) ?? { id: data.model, batches: 0, failed: 0, ms: 0, tokens: 0, reacted: 0, stanceSum: 0, quotes: [] as string[] };
      if (event === 'batch_failed') m.failed++;
      else {
        m.batches++; m.ms += data.ms ?? 0; m.tokens += data.tokens ?? 0;
        for (const r of data.reactions as Reaction[]) { m.reacted++; m.stanceSum += r.stance; if (r.quote && m.quotes.length < 6) m.quotes.push(r.quote); }
      }
      modelStats.current.set(data.model, m);
    }
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
    const b = await groundIfNeeded();
    const target = asMono ? monoRef.current : mixedRef.current;
    target.clear();
    modelStats.current.clear();
    if (!asMono) { setVersions([]); setPending(null); setThemes(null); setNote(null); setPrevPrice(null); versionReactions.current.clear(); }
    net.current?.reset();
    bump();
    try {
      await streamSSE('/api/crowd', body({ mono: asMono, brief: briefStr(b) }), (event, data) => {
        record('crowd', event, data);
        handleCrowdEvent(target, event, data);
      });
    } catch (e) {
      setError(String((e as Error).message));
    }
    if (!asMono) versionReactions.current.set(0, new Map(mixedRef.current));
    setTab('Crowd');
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
    setFinalSum(null);
    const startText = text;
    let confirmMap = new Map<string, Reaction>();
    try {
      setTab('Feed');
      await streamSSE('/api/optimise', body({ brief: briefStr(brief), reactions: demo ? undefined : [...mixedRef.current.values()] }), (event, data) => {
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
            setPending((p) => (p ? { ...p, scores: p.scores.map((s, i) => (i === data.variant ? (data.rejected ? NaN : data.score) : s)) } : p));
            break;
          case 'baseline':
            setPending((p) => (p ? { ...p, baseline: data.baseline } : p));
            break;
          case 'apply':
            setPending((p) => (p ? { ...p, applied: true } : p));
            setText(data.text);
            if (data.price != null) setPrice(data.price);
            break;
          case 'iter_done':
            if (!data.applied) setPending((p) => (p ? { ...p, applied: true } : p));
            break;
          case 'summary_start':
            setSumPending(true);
            break;
          case 'summary':
            setFinalSum(data);
            setSumPending(false);
            setTab('Summary');
            break;
          case 'loop_done':
            setSumPending(false);
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
    (final) => setText((t) => {
      setStamps((st) => [...st, (performance.now() - micStart.current) / 1000]); const n = (t.trim() ? t.trim() + ' ' : '') + final.charAt(0).toUpperCase() + final.slice(1) + (/[.!?]$/.test(final) ? '' : '.'); const p = parsePrice(n); if (p != null) setPrice(p); return n; }),
    setInterim,
  );
  const toggleMic = async () => {
    if (micOn) { voice.stop(); setAnalyser(null); setMicOn(false); return; }
    try {
      if (!text.trim() || text === EXAMPLES[type]) { setText(''); setStamps([]); }
      setMode('speak');
      micStart.current = performance.now();
      setElapsed(0);
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
    setFeed([]);
    setVersions([]); setPending(null); setStage('Input'); setMono(false); setNote(null); setSelected(null); bump();
  };

  useEffect(() => {
    if (!micOn) return;
    const t = setInterval(() => setElapsed((performance.now() - micStart.current) / 1000), 250);
    return () => clearInterval(t);
  }, [micOn]);

  const personaById = useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas]);
  const display = mono ? monoRef.current : mixedRef.current;
  const sel = selected ? personas.find((p) => p.id === selected) : null;
  const hasRun = summary.n > 0;

  return (
    <div className="flex h-screen flex-col">
      <TopBar stage={stage} status={status} demo={demo} meter={meter} onExit={exit} onSaveDemo={!demo && log.current.events.length ? saveDemo : undefined} />
      <main className="flex min-h-0 flex-1">
        {/* LEFT: input workspace */}
        <section className="flex w-[58%] min-w-0 flex-col border-r border-[var(--line)]">
          <div className="flex h-11 items-center gap-1 border-b border-[var(--line)] px-4">
            {(['ad', 'price', 'spec'] as InputType[]).map((t) => (
              <button key={t} onClick={() => setType(t)} className={`rounded-md px-3 py-1 text-[13px] transition-colors duration-200 ${type === t ? 'bg-[var(--panel2)] text-[var(--text)]' : 'text-[var(--dim)] hover:text-[var(--text)]'}`}>
                {t === 'ad' ? 'Ad' : t === 'price' ? 'Price' : 'Spec'}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-4 text-[12px] text-[var(--dim)]">
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. pay-per-visit gyms, London" className="field w-[210px] py-0.5" title="Market category, searched with Tavily" />
              <span className="flex items-center gap-1.5">
                Price £
                <input type="number" value={price ?? ''} onChange={(e) => setPrice(e.target.value === '' ? null : +e.target.value)} className="field num w-14 py-0.5" />/mo
              </span>
              <span className="flex rounded-md border border-[var(--line)] p-0.5">
                {(['speak', 'type'] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={`rounded px-2.5 py-0.5 transition-colors duration-200 ${mode === m ? 'bg-[var(--panel2)] text-[var(--text)]' : 'hover:text-[var(--text)]'}`}>{m === 'speak' ? 'Speak' : 'Type'}</button>
                ))}
              </span>
            </div>
          </div>
          <VoiceVisual analyser={analyser} status={micOn ? 'listening' : 'idle'} elapsed={elapsed} interim={interim} />
          <div className="min-h-0 flex-1 border-t border-[var(--line)]">
            <Transcript
              mode={mode}
              text={text}
              interim={interim}
              stamps={stamps}
              onChange={onTextChange}
              placeholder={type === 'ad' ? 'Paste your ad, launch post or landing copy…' : type === 'price' ? '£9/mo → £14/mo, plus what changes' : 'What changes in the product'}
            />
          </div>
          {brief && (
            <div className="border-t border-[var(--line)] px-5 py-3">
              <button onClick={() => setBriefOpen((o) => !o)} className="flex w-full items-center gap-2 text-[12px] text-[var(--dim)]">
                <span className="rounded-full px-2 py-[1px] text-[10px]" style={{ color: 'var(--tavily)', background: 'rgba(94,234,212,.12)' }}>Market brief</span>
                <Favicons urls={brief.sources.map((s) => s.url)} /><span>{brief.sources.length} sources via Tavily</span>
                <span className="ml-auto">{briefOpen ? 'Hide' : 'Show'}</span>
              </button>
              {briefOpen && (
                <div className="mt-2 space-y-1.5 text-[12px]">
                  <div className="flex flex-wrap gap-1">{brief.competitors.map((c, i) => <span key={i} className="rounded border border-[var(--line)] px-1.5 py-0.5">{c.name}{c.price ? <span className="num text-[var(--dim)]"> {c.price}</span> : null}</span>)}</div>
                  <div className="text-[var(--dim)]">{brief.painPoints.slice(0, 3).join(' · ')}</div>
                </div>
              )}
            </div>
          )}
          <LoopTimeline versions={versions} pending={pending} viewing={viewing} onView={viewVersion} note={note} />
          {error && <div className="border-t border-[var(--line)] px-4 py-2 text-[12px] text-[var(--neg)]">{error}</div>}
        </section>

        {/* RIGHT: crowd intelligence */}
        <section className="flex w-[42%] min-w-0 flex-col bg-[var(--panel)]">
          <div className="grid grid-cols-4 border-b border-[var(--line)]">
            <Kpi k="Launch Score" v={hasRun ? summary.launch.toFixed(1) : '—'} sub={versions.length > 1 ? `${(versions[versions.length - 1].score - versions[0].score >= 0 ? '+' : '')}${(versions[versions.length - 1].score - versions[0].score).toFixed(1)} vs v0` : 'simulated'} />
            <Kpi k="Reacted" v={display.size ? display.size.toLocaleString() : '—'} sub={running ? 'streaming' : 'of 1,000'} />
            <Kpi k="Diversity" v={display.size ? diversity([...display.values()]).toFixed(0) : '—'} sub={mono ? 'mono model' : monoDiv != null ? `mono ${monoDiv.toFixed(0)}` : '6 models'} />
            <Kpi k={price != null ? `Would pay £${price}` : 'Would pay'} v={hasRun ? financials([...mixedRef.current.values()], price).payPct.toFixed(0) + '%' : '—'} sub="early signal" last />
          </div>
          <div className="flex gap-4 border-b border-[var(--line)] px-4">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b py-2.5 text-[13px] transition-colors duration-200 ${tab === t ? 'border-[var(--text)] text-[var(--text)]' : 'border-transparent text-[var(--dim)] hover:text-[var(--text)]'}`}>{t}</button>
            ))}
          </div>
          <div className="relative min-h-0 flex-1 overflow-auto">
            <div className={tab === 'Crowd' ? 'absolute inset-0' : 'hidden'}>
              <CrowdNetwork ref={net} personas={personas} sentences={sentences} families={status?.families ?? []} mono={mono} reactions={display} version={ver} selected={selected} onSelect={setSelected} selectedModel={selectedModel} onModel={setSelectedModel} />
              {!sel && selectedModel == null && <div className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-[#55555a]">Click a model node to see its Nebius ID and stats, or a dot to read a persona.</div>}
              {selectedModel != null && (() => {
                const id = mono ? status?.roster?.mono : status?.roster?.crowd?.[selectedModel];
                return id ? <ModelCard idx={selectedModel} id={id} family={mono ? `mono · ${status?.families?.[0] ?? ''}` : status?.families?.[selectedModel] ?? ''} stat={modelStats.current.get(id)} onClose={() => setSelectedModel(null)} /> : null;
              })()}
              {sel && <PersonaCard p={sel} r={display.get(sel.id)} model={display.get(sel.id)?.model} onClose={() => setSelected(null)} />}
            </div>
            {tab === 'Summary' && <SummaryPanel summary={finalSum} pending={sumPending} score={versions.length ? versions[versions.length - 1].score : null} startScore={versions.length ? versions[0].score : null} />}
            {tab === 'Feed' && <LiveFeed rows={feed} personas={personaById} families={status?.families ?? []} />}
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

function Kpi({ k, v, sub, last }: { k: string; v: string; sub: string; last?: boolean }) {
  return (
    <div className={`px-4 py-3 ${last ? '' : 'border-r border-[var(--line)]'}`}>
      <div className="truncate text-[11px] text-[var(--dim)]">{k}</div>
      <div className="num mt-1 text-[22px] leading-none tracking-tight">{v}</div>
      <div className="mt-1.5 truncate text-[10px] text-[#55555a]">{sub}</div>
    </div>
  );
}
