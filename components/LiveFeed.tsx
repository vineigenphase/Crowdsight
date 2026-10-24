'use client';
import { useEffect, useRef } from 'react';
import { BRAND, modelColor, TAVILY } from '@/lib/colors';
import { Persona, SEGMENT_LABEL } from '@/lib/personas';
import { Reaction } from '@/lib/score';

export type FeedRow = { t: number; event: string; data: any };

const domain = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const ts = (t: number) => { const d = new Date(t); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':'); };

function Tag({ label, color }: { label: string; color: string }) {
  return <span className="shrink-0 rounded-full px-2 py-[1px] text-[10px] font-medium" style={{ color, background: color + '1f', border: `1px solid ${color}40` }}>{label}</span>;
}

export function Favicons({ urls }: { urls: string[] }) {
  const uniq = [...new Set(urls.map(domain))].slice(0, 5);
  return (
    <span className="flex -space-x-1">
      {uniq.map((d) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={d} src={`https://www.google.com/s2/favicons?domain=${d}&sz=32`} alt="" className="h-3.5 w-3.5 rounded-full border border-[var(--panel)] bg-[var(--panel2)]" />
      ))}
    </span>
  );
}

export function SourceChip({ url, title }: { url: string; title?: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--panel2)] px-2 py-1 text-[11px] hover:border-[var(--line2)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://www.google.com/s2/favicons?domain=${domain(url)}&sz=32`} alt="" className="h-3 w-3 rounded-sm" />
      <span className="text-[var(--dim)]">{domain(url)}</span>
      {title && <span className="truncate">{title}</span>}
    </a>
  );
}

/** Narrates the run from real SSE events. Not a chat: there is no input. */
export function LiveFeed({ rows, personas, families }: { rows: FeedRow[]; personas: Map<string, Persona>; families: string[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [rows.length]);
  if (!rows.length) return <div className="grid h-full place-items-center px-8 text-center text-[12px] text-[var(--dim)]">The feed narrates each run: web sources from Tavily, the market brief, every Nebius batch with sample quotes, and each optimiser decision.</div>;
  return (
    <div className="space-y-2.5 p-5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[58px_1fr] gap-3" style={{ animation: 'rise 200ms ease-out' }}>
          <div className="num pt-0.5 text-[10px] text-[#55555a]">{ts(r.t)}</div>
          <div className="min-w-0"><Row r={r} personas={personas} families={families} /></div>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

function Row({ r, personas, families }: { r: FeedRow; personas: Map<string, Persona>; families: string[] }) {
  const d = r.data;
  switch (r.event) {
    case 'ground_source':
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2"><Tag label="Search" color={TAVILY} /><span className="truncate text-[12px] text-[var(--dim)]">{d.query}</span></div>
          <SourceChip url={d.url} title={d.title} />
        </div>
      );
    case 'brief':
      return (
        <div className="card space-y-2 p-3 text-[12px]">
          <Tag label="Brief" color={BRAND} />
          {d.competitors?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {d.competitors.map((c: any, i: number) => <span key={i} className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[11px]">{c.name}{c.price ? <span className="num text-[var(--dim)]"> {c.price}</span> : null}</span>)}
            </div>
          )}
          {d.painPoints?.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-[var(--dim)]">{d.painPoints.slice(0, 4).map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>}
          <div className="flex items-center gap-2 text-[11px] text-[var(--dim)]"><Favicons urls={(d.sources ?? []).map((s: any) => s.url)} />Grounded in {d.sources?.length ?? 0} sources</div>
        </div>
      );
    case 'batch_done': {
      const rs: Reaction[] = d.reactions ?? [];
      const color = modelColor(d.modelIdx);
      const neg = rs.filter((x) => x.stance < -0.2).length;
      const pos = rs.filter((x) => x.stance > 0.2).length;
      const n = Math.max(1, rs.length);
      const q = [...rs].sort((a, b) => Math.abs(b.stance) - Math.abs(a.stance)).slice(0, 2);
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[12px]">
            <Tag label={d.phase === 'variant' ? 'Test batch' : 'Batch'} color={color} />
            <span>{d.modelIdx >= 0 ? families[d.modelIdx] : 'mono'}</span>
            <span className="num text-[var(--dim)]">{rs.length} people · {((d.ms ?? 0) / 1000).toFixed(1)}s</span>
          </div>
          <div className="flex h-[3px] w-40 overflow-hidden rounded">
            <div style={{ width: `${(100 * neg) / n}%`, background: 'var(--neg)' }} />
            <div style={{ width: `${(100 * (rs.length - neg - pos)) / n}%`, background: '#5c5c62' }} />
            <div style={{ width: `${(100 * pos) / n}%`, background: 'var(--pos)' }} />
          </div>
          {d.phase !== 'variant' && q.map((x) => {
            const p = personas.get(x.personaId);
            return (
              <div key={x.personaId} className="border-l-2 pl-2 text-[12px]" style={{ borderColor: x.stance > 0.2 ? 'var(--pos)' : x.stance < -0.2 ? 'var(--neg)' : '#5c5c62' }}>
                <span>&ldquo;{x.quote}&rdquo;</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--dim)]">
                  <span>{p?.name}</span>
                  {p && <span className="rounded border border-[var(--line)] px-1">{SEGMENT_LABEL[p.segment]}</span>}
                  {x.comparedTo && <span className="rounded px-1" style={{ color: TAVILY, background: TAVILY + '1a' }}>vs {x.comparedTo}</span>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    case 'batch_failed':
      return <div className="flex items-center gap-2 text-[12px]"><Tag label="Failed" color="#FF5A4E" /><span className="truncate text-[var(--dim)]">{String(d.model).split('/').pop()}: {String(d.error).slice(0, 80)}</span></div>;
    case 'proposal':
      return (
        <details className="card p-3 text-[12px]">
          <summary className="flex cursor-pointer list-none items-center gap-2"><Tag label="Agent" color={BRAND} /><Tag label={d.lever} color="#EDEDED" /><span className="text-[var(--dim)]">{d.reason}</span></summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[var(--dim)]">{(d.variants ?? []).map((v: string, i: number) => <li key={i}>{v}</li>)}</ol>
        </details>
      );
    case 'variant_done':
      return <div className="flex items-center gap-2 text-[12px]"><Tag label="Test" color="#F5B451" /><span>Variant {Number(d.variant) + 1}</span><span className="num">{d.rejected ? `skipped: ${d.rejected}` : Number(d.score).toFixed(1)}</span></div>;
    case 'baseline':
      return <div className="flex items-center gap-2 text-[12px]"><Tag label="Test" color="#F5B451" /><span>Current input on the same 200</span><span className="num">{Number(d.baseline).toFixed(1)}</span></div>;
    case 'apply':
      return <div className="card p-3 text-[12px]"><Tag label="Applied" color="#3DDC97" /><div className="mt-1.5 text-[var(--pos)]">{d.text}</div></div>;
    case 'version':
      return <div className="flex items-center gap-2 text-[12px]"><Tag label="Version" color="#3DDC97" /><span>v{d.version}</span><span className="num">{Number(d.score).toFixed(1)}</span><span className="truncate text-[var(--dim)]">{d.change}</span></div>;
    case 'run_done':
      return <div className="flex items-center gap-2 text-[12px]"><Tag label="Done" color="#EDEDED" /><span className="num">{d.summary?.n} reactions · score {Number(d.summary?.launch).toFixed(1)} · {Math.round(d.ms / 1000)}s</span></div>;
    case 'summary_start':
      return <div className="flex items-center gap-2 text-[12px]"><Tag label="Summary" color={BRAND} /><span className="text-[var(--dim)]">Reading every final reaction and the loop history…</span></div>;
    case 'summary':
      return (
        <div className="card p-3 text-[12px]">
          <div className="flex items-center gap-2"><Tag label="Summary" color={BRAND} /><Tag label={d.verdict} color="#EDEDED" /></div>
          <div className="mt-1.5 text-[14px]">{d.headline}</div>
          {d.nextSteps?.[0] && <div className="mt-1 text-[var(--dim)]">Next: {d.nextSteps[0]}</div>}
        </div>
      );
    case 'loop_done':
      return <div className="flex items-center gap-2 text-[12px]"><Tag label="Done" color="#EDEDED" /><span className="text-[var(--dim)]">{d.reason}</span></div>;
    default:
      return null;
  }
}
