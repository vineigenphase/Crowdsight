'use client';
import { InputType, Persona, SEGMENT_LABEL } from '@/lib/personas';
import { Reaction } from '@/lib/score';

export type Stage = 'Input' | 'Crowd' | 'Optimise' | 'Result';
const STAGES: Stage[] = ['Input', 'Crowd', 'Optimise', 'Result'];

export type Status = { ok: boolean; mock?: boolean; latency?: number; families?: string[]; error?: string } | null;

export function TopBar({ stage, status, demo, meter, onExit, onSaveDemo }: { stage: Stage; status: Status; demo: boolean; meter: { calls: number; tokens: number }; onExit: () => void; onSaveDemo?: () => void }) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-[var(--line)] px-4">
      <div className="flex items-center gap-6">
        <div className="text-[13px] font-medium tracking-tight">Crowdsight</div>
        <div className="text-[12px] text-[var(--dim)]">Loop launch test{demo ? ' · recorded demo' : ''}</div>
      </div>
      <nav className="flex items-center gap-2 text-[12px]">
        {STAGES.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span className={`transition-colors duration-200 ${s === stage ? 'text-[var(--text)]' : STAGES.indexOf(stage) > i ? 'text-[var(--dim)]' : 'text-[#4a4a4f]'}`}>{s}</span>
            {i < STAGES.length - 1 && <span className="text-[#3a3a3e]">→</span>}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-4 text-[12px] text-[var(--dim)]">
        <span className="num">{meter.calls} calls · {(meter.tokens / 1000).toFixed(0)}k tok</span>
        <span className="flex items-center gap-1.5" title={status?.error}>
          <span className={`h-1.5 w-1.5 rounded-full ${status?.ok ? 'bg-[var(--pos)]' : status ? 'bg-[var(--neg)]' : 'bg-[var(--dim)]'}`} />
          Nebius{status?.mock ? ' (mock)' : ''} · <span className="num">{status?.families?.length ?? 0} models · {status?.latency ?? '—'}ms</span>
        </span>
        {onSaveDemo && <button onClick={onSaveDemo} className="hover:text-[var(--text)]">Save demo</button>}
        <button onClick={onExit} className="text-[16px] leading-none hover:text-[var(--text)]" aria-label="Exit">×</button>
      </div>
    </header>
  );
}

export type Version = { version: number; text: string; price: number | null; score: number; lever: string | null; change: string };
export type Pending = { iter: number; lever: string; reason: string; variants: string[]; scores: (number | null)[]; baseline: number | null; applied?: boolean };

export function LoopTimeline({ versions, pending, viewing, onView, note }: { versions: Version[]; pending: Pending | null; viewing: number | null; onView: (v: number) => void; note: string | null }) {
  if (!versions.length && !pending) return null;
  return (
    <div className="border-t border-[var(--line)] p-4">
      <div className="mb-2 flex justify-between text-[12px] text-[var(--dim)]"><span>Optimisation loop</span>{note && <span>{note}</span>}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {versions.map((v, i) => {
          const delta = i > 0 ? v.score - versions[i - 1].score : null;
          return (
            <button key={v.version} onClick={() => onView(v.version)} className={`w-[180px] shrink-0 rounded-[var(--radius)] border p-3 text-left transition-colors duration-200 ${viewing === v.version ? 'border-[var(--line2)] bg-[var(--panel2)]' : 'border-[var(--line)] hover:bg-[var(--panel2)]'}`}>
              <div className="flex items-baseline justify-between">
                <span className="num text-[12px] text-[var(--dim)]">v{v.version}</span>
                <span className="num text-[18px]">{v.score.toFixed(1)}</span>
              </div>
              <div className="mt-1 flex justify-between text-[11px]">
                <span className="text-[var(--dim)]">{v.lever ?? 'baseline'}{v.price != null ? ` · £${v.price}` : ''}</span>
                {delta != null && <span className={`num ${delta >= 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}`}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}</span>}
              </div>
              <div className="mt-1.5 line-clamp-2 text-[11px] text-[var(--dim)]">{v.change}</div>
            </button>
          );
        })}
        {pending && !pending.applied && (
          <div className="w-[260px] shrink-0 rounded-[var(--radius)] border border-dashed border-[var(--line2)] p-3">
            <div className="flex justify-between text-[12px]"><span className="num text-[var(--dim)]">v{pending.iter}</span><span className="text-[var(--dim)]">testing {pending.lever}</span></div>
            <div className="mt-1 line-clamp-2 text-[11px] text-[var(--dim)]">{pending.reason || 'Optimiser reading reactions…'}</div>
            <div className="mt-2 space-y-1">
              {pending.variants.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate">{t}</span>
                  <span className="num shrink-0">{pending.scores[i] != null ? pending.scores[i]!.toFixed(1) : '…'}</span>
                </div>
              ))}
              {pending.baseline != null && <div className="flex justify-between text-[11px] text-[var(--dim)]"><span>current, same 200</span><span className="num">{pending.baseline.toFixed(1)}</span></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PersonaCard({ p, r, model, onClose }: { p: Persona; r: Reaction | undefined; model: string | undefined; onClose: () => void }) {
  return (
    <div className="absolute bottom-3 left-3 w-[300px] rounded-[var(--radius)] border border-[var(--line2)] bg-[var(--panel2)] p-3 text-[12px] shadow-2xl" style={{ animation: 'rise 200ms ease-out' }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px]">{p.name}, <span className="num">{p.age}</span></div>
          <div className="text-[11px] text-[var(--dim)]">{p.role} · {SEGMENT_LABEL[p.segment]}</div>
        </div>
        <button onClick={onClose} className="text-[var(--dim)] hover:text-[var(--text)]">×</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-[var(--dim)]">
        {[p.stake.replace('_', ' '), p.personality.replace('_', ' '), `${p.incomeBand} income`, p.region].map((t) => <span key={t} className="rounded border border-[var(--line)] px-1.5 py-0.5">{t}</span>)}
      </div>
      {r ? (
        <>
          <div className="mt-3">&ldquo;{r.quote}&rdquo;</div>
          {r.objection && <div className="mt-1.5 text-[11px] text-[var(--neg)]">Objection: {r.objection}</div>}
          <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
            <KV k="stance" v={r.stance.toFixed(2)} /><KV k="intent" v={r.intent.toFixed(2)} /><KV k="share" v={r.wouldShare.toFixed(2)} /><KV k="max £" v={r.maxPrice != null ? String(r.maxPrice) : '—'} />
          </div>
          <div className="mt-2 truncate text-[10px] text-[var(--dim)]">model: <span className="num">{model ?? r.model}</span></div>
        </>
      ) : (
        <div className="mt-3 text-[11px] text-[var(--dim)]">No reaction yet.</div>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return <div><div className="text-[var(--dim)]">{k}</div><div className="num">{v}</div></div>;
}

export function Dock(props: {
  micOn: boolean; onMic: () => void;
  template: InputType; onTemplate: (t: InputType) => void;
  mono: boolean; onMono: () => void; diversity: { mixed: number | null; mono: number | null };
  running: boolean; onRun: () => void; onOptimise: () => void; canOptimise: boolean;
  onVideo: (f: File) => void; videoBusy: boolean;
  score: number | null;
}) {
  return (
    <footer className="flex h-14 items-center justify-between border-t border-[var(--line)] px-4">
      <div className="flex items-center gap-2">
        <button onClick={props.onMic} className={`btn ${props.micOn ? 'btn-on' : ''}`} aria-label="Microphone">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          {props.micOn ? 'Stop' : 'Speak'}
        </button>
        <select value={props.template} onChange={(e) => props.onTemplate(e.target.value as InputType)} className="btn bg-transparent">
          <option value="ad">Template: ad</option>
          <option value="price">Template: price</option>
          <option value="spec">Template: spec</option>
        </select>
        <button onClick={props.onMono} className="btn">
          <span className={props.mono ? 'text-[var(--dim)]' : ''}>Mixed</span>/<span className={props.mono ? '' : 'text-[var(--dim)]'}>Mono</span>
          <span className="num text-[var(--dim)]">div {props.diversity.mixed != null ? props.diversity.mixed.toFixed(0) : '—'}{props.diversity.mono != null ? ` vs ${props.diversity.mono.toFixed(0)}` : ''}</span>
        </button>
        <label className={`btn cursor-pointer ${props.videoBusy ? 'opacity-50' : ''}`}>
          {props.videoBusy ? 'Reading video…' : 'Upload video'}
          <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && props.onVideo(e.target.files[0])} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={props.onRun} disabled={props.running} className="btn btn-primary">{props.running ? 'Running…' : 'Run crowd'}</button>
        <button onClick={props.onOptimise} disabled={props.running || !props.canOptimise} className="btn">Optimise</button>
        <div className="ml-4 flex items-baseline gap-2">
          <span className="text-[12px] text-[var(--dim)]">Launch Score</span>
          <span className="num w-[52px] text-right text-[22px] tabular-nums">{props.score != null ? props.score.toFixed(1) : '—'}</span>
        </div>
      </div>
    </footer>
  );
}
