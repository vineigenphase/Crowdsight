'use client';
import { useState } from 'react';
import { Income, rebalance, Region, Segment, SegmentConfig, SEGMENT_LABEL } from '@/lib/personas';
import { SegmentScore } from '@/lib/score';

export function SegmentTabs({ configs, onChange, scores }: { configs: SegmentConfig[]; onChange: (c: SegmentConfig[]) => void; scores: SegmentScore[] }) {
  const [active, setActive] = useState<Segment>('icp');
  const c = configs.find((x) => x.id === active)!;
  const set = (patch: Partial<SegmentConfig>) => onChange(configs.map((x) => (x.id === active ? { ...x, ...patch } : x)));
  const sc = scores.find((s) => s.segment === active);

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-[var(--line)] px-3 pt-2">
        {configs.map((x) => {
          const s = scores.find((s) => s.segment === x.id);
          return (
            <button key={x.id} onClick={() => setActive(x.id)} className={`rounded-t-md px-2.5 py-1.5 text-left text-[12px] transition-colors duration-200 ${active === x.id ? 'bg-[var(--panel2)] text-[var(--text)]' : 'text-[var(--dim)] hover:text-[var(--text)]'}`}>
              <div>{SEGMENT_LABEL[x.id]}</div>
              <div className="num text-[11px] text-[var(--dim)]">{x.share}% · {s?.n ? s.score.toFixed(0) : '—'}</div>
            </button>
          );
        })}
      </div>
      <div className="flex-1 space-y-5 overflow-auto p-4">
        <Row label="Share of crowd" value={`${c.share}%`}>
          <input type="range" min={0} max={90} value={c.share} onChange={(e) => onChange(rebalance(configs, active, +e.target.value))} className="w-full" />
        </Row>
        <Row label="Importance weight" value={`×${c.importance.toFixed(1)}`}>
          <input type="range" min={0} max={30} value={c.importance * 10} onChange={(e) => set({ importance: +e.target.value / 10 })} className="w-full" />
        </Row>
        <Row label="Age range" value={`${c.ageMin}–${c.ageMax}`}>
          <div className="flex gap-2">
            <input type="range" min={16} max={80} value={c.ageMin} onChange={(e) => set({ ageMin: Math.min(+e.target.value, c.ageMax) })} className="w-full" />
            <input type="range" min={16} max={80} value={c.ageMax} onChange={(e) => set({ ageMax: Math.max(+e.target.value, c.ageMin) })} className="w-full" />
          </div>
        </Row>
        <Weights label="Income" values={c.income} onChange={(income) => set({ income: income as Record<Income, number> })} />
        <Weights label="Region" values={c.region} onChange={(region) => set({ region: region as Record<Region, number> })} />
        {active === 'icp' && (
          <div>
            <div className="mb-1.5 text-[12px] text-[var(--dim)]">Who is your target customer?</div>
            <input value={c.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. UK indie gym owners" className="field w-full" />
          </div>
        )}
        {sc?.n ? (
          <div className="grid grid-cols-4 gap-2 border-t border-[var(--line)] pt-4">
            <Stat k="Score" v={sc.score.toFixed(1)} />
            <Stat k="Stance" v={(sc.stance * 2 - 1).toFixed(2)} />
            <Stat k="Intent" v={(sc.intent * 100).toFixed(0) + '%'} />
            <Stat k="Share" v={(sc.share * 100).toFixed(0) + '%'} />
          </div>
        ) : null}
        <p className="text-[11px] text-[var(--dim)]">Changing the mix resamples the 1,000 personas. Launch Score = importance-weighted mean of segment scores.</p>
      </div>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[12px]"><span className="text-[var(--dim)]">{label}</span><span className="num">{value}</span></div>
      {children}
    </div>
  );
}

function Weights({ label, values, onChange }: { label: string; values: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] text-[var(--dim)]">{label} split</div>
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(values).map(([k, v]) => (
          <label key={k} className="text-[11px]">
            <div className="mb-1 flex justify-between"><span className="text-[var(--dim)]">{k}</span><span className="num">{v}</span></div>
            <input type="range" min={0} max={100} value={v} onChange={(e) => onChange({ ...values, [k]: +e.target.value })} className="w-full" />
          </label>
        ))}
      </div>
    </div>
  );
}

export function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--dim)]">{k}</div>
      <div className="num text-[15px]">{v}</div>
    </div>
  );
}
