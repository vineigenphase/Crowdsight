'use client';
import type { FinalSummary } from '@/lib/loop';

const VERDICT_COLOR: Record<string, string> = { Strong: '#3DDC97', Promising: '#2DD4BF', Mixed: '#F5B451', Weak: '#FF5A4E' };

/** The optimiser's final read of the whole crowd: verdict, what changed, what worked, risks, segments, next steps. */
export function SummaryPanel({ summary, pending, score, startScore }: { summary: (FinalSummary & { score?: number }) | null; pending: boolean; score: number | null; startScore: number | null }) {
  if (!summary) {
    return (
      <div className="grid h-full place-items-center px-8 text-center text-[12px] text-[var(--dim)]">
        {pending ? 'Reading all 1,000 reactions and the loop history…' : 'Run Optimise. When the loop finishes, the strong model reads every reaction and writes the final briefing here.'}
      </div>
    );
  }
  const c = VERDICT_COLOR[summary.verdict] ?? '#EDEDED';
  const delta = score != null && startScore != null ? score - startScore : null;
  return (
    <div className="space-y-4 p-5" style={{ animation: 'rise 250ms ease-out' }}>
      <div className="card p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2.5 py-[2px] text-[11px] font-medium" style={{ color: c, background: c + '1f', border: `1px solid ${c}55` }}>{summary.verdict}</span>
          <span className="text-[11px] text-[var(--dim)]">Final briefing · simulated market response</span>
          {score != null && (
            <span className="num ml-auto text-[13px]">
              {startScore != null && <span className="text-[var(--dim)]">{startScore.toFixed(1)} → </span>}{score.toFixed(1)}
              {delta != null && <span className={delta >= 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}> {delta >= 0 ? '+' : ''}{delta.toFixed(1)}</span>}
            </span>
          )}
        </div>
        <div className="mt-2.5 text-[18px] leading-snug">{summary.headline}</div>
        {summary.whatChanged && <div className="mt-2 text-[12px] text-[var(--dim)]">{summary.whatChanged}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <List title="What worked" items={summary.worked} color="#3DDC97" />
        <List title="Risks" items={summary.risks} color="#FF5A4E" />
      </div>

      {summary.segments.length > 0 && (
        <div className="card p-4">
          <div className="mb-2 text-[12px] text-[var(--dim)]">By segment</div>
          <div className="space-y-1.5">
            {summary.segments.map((s, i) => (
              <div key={i} className="grid grid-cols-[130px_1fr] gap-3 text-[12px]">
                <span className="text-[var(--dim)]">{s.segment}</span><span>{s.line}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="mb-2 text-[12px] text-[var(--dim)]">Next steps</div>
        <ol className="space-y-1.5 text-[13px]">
          {summary.nextSteps.map((s, i) => (
            <li key={i} className="flex gap-2.5"><span className="num text-[var(--brand)]">{i + 1}</span><span>{s}</span></li>
          ))}
        </ol>
      </div>
      <p className="text-[11px] text-[#55555a]">Written by the Nebius strong model from every final reaction and the loop history. An early signal, not a forecast.</p>
    </div>
  );
}

function List({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div className="card p-4">
      <div className="mb-2 text-[12px] text-[var(--dim)]">{title}</div>
      <ul className="space-y-1.5 text-[12px]">
        {items.map((s, i) => <li key={i} className="border-l-2 pl-2" style={{ borderColor: color }}>{s}</li>)}
      </ul>
    </div>
  );
}
