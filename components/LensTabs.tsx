'use client';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Persona, SEGMENT_LABEL } from '@/lib/personas';
import { financials, Reaction, SegmentScore, topObjections, topQuotes } from '@/lib/score';
import { Stat } from './SegmentTabs';

const AXIS = { stroke: '#8A8A8F', fontSize: 10, fontFamily: 'var(--font-geist-mono)', tickLine: false, axisLine: false } as const;
const TIP = { contentStyle: { background: '#141416', border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, fontSize: 11, fontFamily: 'var(--font-geist-mono)' }, labelStyle: { color: '#8A8A8F' }, itemStyle: { color: '#EDEDED' }, cursor: { fill: 'rgba(255,255,255,.03)' } };

type P = { personas: Persona[]; reactions: Map<string, Reaction>; segments: SegmentScore[] };

const all = (p: P) => [...p.reactions.values()];
const short = (s: string) => SEGMENT_LABEL[s as keyof typeof SEGMENT_LABEL].split(' ')[0];

function Empty() {
  return <div className="grid h-full place-items-center text-[12px] text-[var(--dim)]">Run the crowd to see this lens.</div>;
}

export function MarketingLens(p: P) {
  const rs = all(p);
  if (!rs.length) return <Empty />;
  const shareRate = rs.filter((r) => r.wouldShare > 0.5).length / rs.length;
  const data = p.segments.map((s) => ({ seg: short(s.segment), share: +(s.share * 100).toFixed(1) }));
  const q = topQuotes(rs, 3);
  const byId = new Map(p.personas.map((x) => [x.id, x]));
  return (
    <div className="space-y-5 p-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat k="Share rate" v={(shareRate * 100).toFixed(0) + '%'} />
        <Stat k="Mean stance" v={(rs.reduce((s, r) => s + r.stance, 0) / rs.length).toFixed(2)} />
        <Stat k="Reactions" v={rs.length.toLocaleString()} />
      </div>
      <Chart title="Would share, by segment (%)">
        <BarChart data={data}><CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} /><XAxis dataKey="seg" {...AXIS} /><YAxis {...AXIS} width={28} /><Tooltip {...TIP} /><Bar dataKey="share" fill="#E9E9EA" radius={[3, 3, 0, 0]} /></BarChart>
      </Chart>
      <Quotes title="Loudest support" items={q.pos} byId={byId} />
      <Quotes title="Loudest pushback" items={q.neg} byId={byId} />
    </div>
  );
}

export function ProductLens(p: P & { themes: { theme: string; count: number }[] | null }) {
  const rs = all(p);
  if (!rs.length) return <Empty />;
  const data = p.segments.map((s) => ({ seg: short(s.segment), intent: +(s.intent * 100).toFixed(1) }));
  const themes = p.themes?.length ? p.themes : topObjections(rs, 5);
  const max = Math.max(1, ...themes.map((t) => t.count));
  return (
    <div className="space-y-5 p-4">
      <Chart title="Intent to try or buy, by segment (%)">
        <BarChart data={data}><CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} /><XAxis dataKey="seg" {...AXIS} /><YAxis {...AXIS} width={28} /><Tooltip {...TIP} /><Bar dataKey="intent" fill="#3DDC97" radius={[3, 3, 0, 0]} /></BarChart>
      </Chart>
      <div>
        <div className="mb-2 text-[12px] text-[var(--dim)]">Top objections{p.themes?.length ? ' (themes from the optimiser)' : ''}</div>
        <div className="space-y-2">
          {themes.map((t) => (
            <div key={t.theme} className="text-[12px]">
              <div className="mb-1 flex justify-between gap-3"><span>{t.theme}</span><span className="num text-[var(--dim)]">{t.count}</span></div>
              <div className="h-[3px] rounded bg-[var(--line)]"><div className="h-full rounded bg-[var(--neg)] transition-all duration-300" style={{ width: `${(100 * t.count) / max}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FinancialsLens(p: P & { price: number | null; prevPrice: number | null }) {
  const rs = all(p);
  if (!rs.length) return <Empty />;
  const f = financials(rs, p.price);
  const scale = 1000 / rs.length;
  const funnel = [
    { k: 'Crowd', v: 1000 },
    { k: 'Interested (intent > 0.5)', v: Math.round(f.interested * scale) },
    { k: p.price != null ? `Would pay £${p.price}` : 'Would pay (no price set)', v: Math.round(f.payers * scale) },
  ];
  return (
    <div className="space-y-5 p-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat k="Would pay your price" v={f.payPct.toFixed(0) + '%'} />
        <Stat k="Payers per 1,000" v={String(Math.round(f.payers * scale))} />
        <Stat k="Indicative MRR" v={'£' + Math.round(f.mrr * scale).toLocaleString()} />
      </div>
      <Chart title="Demand curve: % of crowd who would pay at each price (simulated)">
        <LineChart data={f.curve}>
          <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
          <XAxis dataKey="price" {...AXIS} tickFormatter={(v) => `£${v}`} />
          <YAxis {...AXIS} width={28} domain={[0, 100]} />
          <Tooltip {...TIP} labelFormatter={(v) => `£${v}/mo`} formatter={(v: number) => [v.toFixed(1) + '%', 'would pay']} />
          {p.prevPrice != null && p.prevPrice !== p.price && <ReferenceLine x={nearest(f.curve, p.prevPrice)} stroke="#8A8A8F" strokeDasharray="3 3" label={{ value: `was £${p.prevPrice}`, fill: '#8A8A8F', fontSize: 10, position: 'insideTopRight' }} />}
          {p.price != null && <ReferenceLine x={nearest(f.curve, p.price)} stroke="#EDEDED" label={{ value: `£${p.price}`, fill: '#EDEDED', fontSize: 10, position: 'insideTopLeft' }} />}
          <Line dataKey="pct" stroke="#3DDC97" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </Chart>
      <div>
        <div className="mb-2 text-[12px] text-[var(--dim)]">Simulated funnel</div>
        {funnel.map((s) => (
          <div key={s.k} className="mb-2 text-[12px]">
            <div className="mb-1 flex justify-between"><span>{s.k}</span><span className="num">{s.v}</span></div>
            <div className="h-[6px] rounded bg-[var(--line)]"><div className="h-full rounded bg-[var(--accent)] transition-all duration-300" style={{ width: `${s.v / 10}%` }} /></div>
          </div>
        ))}
        <p className="mt-3 text-[11px] text-[var(--dim)]">Simulated market response. An early signal, not a forecast.</p>
      </div>
    </div>
  );
}

function nearest(curve: { price: number }[], x: number) {
  return curve.reduce((a, b) => (Math.abs(b.price - x) < Math.abs(a.price - x) ? b : a), curve[0]).price;
}

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div>
      <div className="mb-2 text-[12px] text-[var(--dim)]">{title}</div>
      <div className="h-[170px]"><ResponsiveContainer>{children}</ResponsiveContainer></div>
    </div>
  );
}

function Quotes({ title, items, byId }: { title: string; items: Reaction[]; byId: Map<string, Persona> }) {
  return (
    <div>
      <div className="mb-2 text-[12px] text-[var(--dim)]">{title}</div>
      <div className="space-y-2">
        {items.map((r) => {
          const p = byId.get(r.personaId);
          return (
            <div key={r.personaId} className="border-l border-[var(--line2)] pl-3 text-[12px]">
              <div>&ldquo;{r.quote}&rdquo;</div>
              <div className="mt-0.5 text-[11px] text-[var(--dim)]">{p?.name}, {p?.role} · <span className="num">{r.stance.toFixed(2)}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
