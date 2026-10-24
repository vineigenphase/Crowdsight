'use client';
import { useEffect, useRef } from 'react';
import { splitSentences } from '@/lib/personas';

const fmt = (s: number | undefined) => (s == null ? '' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

/** Live transcript: one row per [S#] sentence with a time gutter. Type mode swaps in an editor. */
export function Transcript({ mode, text, interim, stamps, placeholder, onChange }: { mode: 'speak' | 'type'; text: string; interim: string; stamps: number[]; placeholder: string; onChange: (t: string) => void }) {
  const end = useRef<HTMLDivElement>(null);
  const sentences = splitSentences(text);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [sentences.length, interim]);

  if (mode === 'type') {
    return (
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full resize-none bg-transparent px-6 py-4 text-[18px] leading-[1.6] outline-none placeholder:text-[#4a4a4f]"
      />
    );
  }

  return (
    <div className="h-full overflow-auto px-6 py-4">
      {!sentences.length && !interim && <div className="pt-6 text-[18px] text-[#4a4a4f]">Press Speak and pitch it out loud. Each sentence lands here as it is recognised.</div>}
      <div className="space-y-3">
        {sentences.map((s, i) => (
          <div key={i} className="grid grid-cols-[56px_1fr] gap-3" style={{ animation: 'rise 200ms ease-out' }}>
            <div className="pt-[5px] text-right">
              <div className="num text-[11px] text-[var(--dim)]">S{i + 1}</div>
              <div className="num text-[10px] text-[#55555a]">{fmt(stamps[i])}</div>
            </div>
            <div className="text-[18px] leading-[1.55]">{s}</div>
          </div>
        ))}
        {interim && (
          <div className="grid grid-cols-[56px_1fr] gap-3">
            <div className="num pt-[5px] text-right text-[11px] text-[#55555a]">S{sentences.length + 1}</div>
            <div className="text-[18px] leading-[1.55] text-[var(--dim)]">{interim}<span className="ml-0.5 inline-block h-[18px] w-px translate-y-[3px] animate-pulse bg-[var(--text)]" /></div>
          </div>
        )}
      </div>
      <div ref={end} />
    </div>
  );
}
