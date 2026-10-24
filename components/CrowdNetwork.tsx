'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { stanceColor } from '@/lib/client';
import { Persona, Segment, SEGMENTS, SEGMENT_LABEL } from '@/lib/personas';
import { Reaction } from '@/lib/score';

export type NetworkHandle = { onEvent: (event: string, data: any) => void; reset: () => void };

type Props = {
  personas: Persona[];
  sentences: string[];
  families: string[];
  mono: boolean;
  reactions: Map<string, Reaction>;
  version: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
};

const SEG_IDX: Record<Segment, number> = { general: 0, icp: 1, expert: 2, marketing: 3, skeptic: 4 };

export const CrowdNetwork = forwardRef<NetworkHandle, Props>(function CrowdNetwork(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;

  const st = useRef({
    w: 0, h: 0,
    pos: new Float32Array(0), // x,y per dot
    shown: new Float32Array(0), // displayed stance (NaN = no reaction)
    target: new Float32Array(0),
    idIndex: new Map<string, number>(),
    inputEdge: new Float32Array(6),
    modelGlow: new Float32Array(6),
    msEdge: new Float32Array(30),
    segGlow: new Float32Array(5),
    sparks: [] as { seg: number; dot: number; a: number; variant: boolean }[],
    monoT: 0, // 0 mixed → 1 mono, animated
    inflight: new Int16Array(7),
    bands: [] as { seg: number; y0: number; y1: number }[],
  });

  // Layout dots whenever the persona set or the size changes.
  const layout = () => {
    const s = st.current;
    const ps = live.current.personas;
    const n = ps.length;
    if (s.pos.length !== n * 2) {
      s.pos = new Float32Array(n * 2);
      s.shown = new Float32Array(n).fill(NaN);
      s.target = new Float32Array(n).fill(NaN);
    }
    s.idIndex = new Map(ps.map((p, i) => [p.id, i]));
    const x0 = s.w * 0.62, x1 = s.w - 12;
    const top = 18, bottom = s.h - 18, gap = 10;
    const counts = SEGMENTS.map((g) => ps.filter((p) => p.segment === g).length);
    const avail = bottom - top - gap * 4;
    let y = top;
    s.bands = [];
    SEGMENTS.forEach((g, si) => {
      const bh = Math.max(8, (counts[si] / Math.max(1, n)) * avail);
      s.bands.push({ seg: si, y0: y, y1: y + bh });
      const idxs = ps.map((p, i) => (p.segment === g ? i : -1)).filter((i) => i >= 0);
      const bw = x1 - x0;
      const cols = Math.max(1, Math.ceil(Math.sqrt((idxs.length * bw) / Math.max(1, bh))));
      const rows = Math.max(1, Math.ceil(idxs.length / cols));
      idxs.forEach((pi, k) => {
        const c = k % cols, r = Math.floor(k / cols);
        const jx = (((pi * 9301 + 49297) % 233280) / 233280 - 0.5) * 2;
        const jy = (((pi * 4993 + 1237) % 233280) / 233280 - 0.5) * 2;
        s.pos[pi * 2] = x0 + ((c + 0.5) / cols) * bw + jx;
        s.pos[pi * 2 + 1] = y + ((r + 0.5) / rows) * bh + jy;
      });
      y += bh + gap;
    });
  };

  // Sync dot targets from the reaction map (version bumps when it changes wholesale).
  useEffect(() => {
    const s = st.current;
    const ps = props.personas;
    if (s.target.length !== ps.length) layout();
    ps.forEach((p, i) => {
      const r = props.reactions.get(p.id);
      s.target[i] = r ? r.stance : NaN;
      if (!r) s.shown[i] = NaN;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.version, props.personas]);

  useEffect(() => {
    layout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.personas]);

  useImperativeHandle(ref, () => ({
    reset() {
      const s = st.current;
      s.shown.fill(NaN);
      s.target.fill(NaN);
      s.sparks = [];
    },
    onEvent(event, data) {
      const s = st.current;
      const m = data?.modelIdx ?? 0;
      const mi = m < 0 ? 6 : m;
      if (event === 'batch_start') {
        if (m >= 0) { s.inputEdge[m] = 1; s.modelGlow[m] = 1; } else { s.inputEdge[0] = 1; s.modelGlow[0] = 1; }
        s.inflight[mi]++;
      } else if (event === 'batch_done' || event === 'batch_failed') {
        s.inflight[mi] = Math.max(0, s.inflight[mi] - 1);
        if (event === 'batch_failed') return;
        const variant = data.phase === 'variant';
        const node = m < 0 ? 0 : m;
        s.modelGlow[node] = 1;
        for (const r of data.reactions as Reaction[]) {
          const i = s.idIndex.get(r.personaId);
          if (i == null) continue;
          const seg = SEG_IDX[live.current.personas[i].segment];
          s.msEdge[node * 5 + seg] = 1;
          s.segGlow[seg] = 1;
          if (s.sparks.length < 600) s.sparks.push({ seg, dot: i, a: variant ? 0.5 : 1, variant });
          if (!variant) s.target[i] = r.stance;
        }
      }
    },
  }));

  useEffect(() => {
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      cv.style.width = r.width + 'px';
      cv.style.height = r.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.current.w = r.width;
      st.current.h = r.height;
      layout();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = st.current;
      const p = live.current;
      const { w, h } = s;
      const decay = Math.exp(-dt / 0.35);
      s.monoT += ((p.mono ? 1 : 0) - s.monoT) * (1 - Math.exp(-dt / 0.12));

      ctx.clearRect(0, 0, w, h);
      const xIn = w * 0.05, xM = w * 0.24, xS = w * 0.43;
      const sentences = p.sentences.slice(0, 14);
      const inY = (i: number) => (sentences.length <= 1 ? h / 2 : h * 0.2 + (i / (sentences.length - 1)) * h * 0.6);
      const mY = (i: number) => { const spread = h * 0.12 + (i / 5) * h * 0.76; return spread + (h / 2 - spread) * s.monoT; };
      const segY = (i: number) => { const b = s.bands[i]; return b ? (b.y0 + b.y1) / 2 : h / 2; };

      // Edges: input → models
      ctx.lineWidth = 1;
      for (let mi = 0; mi < 6; mi++) {
        const a = 0.06 + s.inputEdge[mi] * 0.5 + (s.inflight[mi] || (mi === 0 ? s.inflight[6] : 0) ? 0.12 : 0);
        ctx.strokeStyle = `rgba(233,233,234,${a * (mi > 0 ? 1 - s.monoT : 1)})`;
        ctx.beginPath();
        for (let i = 0; i < Math.max(1, sentences.length); i++) { ctx.moveTo(xIn, inY(i)); ctx.lineTo(xM, mY(mi)); }
        ctx.stroke();
      }
      // models → segments
      for (let mi = 0; mi < 6; mi++) for (let si = 0; si < 5; si++) {
        const a = 0.05 + s.msEdge[mi * 5 + si] * 0.45;
        ctx.strokeStyle = `rgba(233,233,234,${a * (mi > 0 ? 1 - s.monoT : 1)})`;
        ctx.beginPath(); ctx.moveTo(xM, mY(mi)); ctx.lineTo(xS, segY(si)); ctx.stroke();
      }
      // segments → bands (faint fan)
      for (const b of s.bands) {
        ctx.strokeStyle = `rgba(233,233,234,${0.04 + s.segGlow[b.seg] * 0.12})`;
        ctx.beginPath();
        ctx.moveTo(xS, segY(b.seg)); ctx.lineTo(w * 0.62 - 6, b.y0 + 2);
        ctx.moveTo(xS, segY(b.seg)); ctx.lineTo(w * 0.62 - 6, b.y1 - 2);
        ctx.stroke();
      }
      // sparks: segment → dot
      if (s.sparks.length) {
        for (const sp of s.sparks) {
          ctx.strokeStyle = sp.variant ? `rgba(138,138,143,${sp.a * 0.35})` : `rgba(233,233,234,${sp.a * 0.16})`;
          ctx.beginPath(); ctx.moveTo(xS, segY(sp.seg)); ctx.lineTo(s.pos[sp.dot * 2], s.pos[sp.dot * 2 + 1]); ctx.stroke();
          sp.a *= decay;
        }
        s.sparks = s.sparks.filter((sp) => sp.a > 0.03);
      }

      // Dots
      const k = 1 - Math.exp(-dt / 0.2);
      for (let i = 0; i < s.shown.length; i++) {
        const t = s.target[i];
        let v = s.shown[i];
        if (Number.isNaN(t)) v = NaN;
        else v = Number.isNaN(v) ? t * 0.2 : v + (t - v) * k;
        s.shown[i] = v;
        ctx.fillStyle = Number.isNaN(v) ? '#26262A' : stanceColor(v);
        ctx.fillRect(s.pos[i * 2] - 1.75, s.pos[i * 2 + 1] - 1.75, 3.5, 3.5);
      }
      if (p.selected) {
        const i = s.idIndex.get(p.selected);
        if (i != null) { ctx.strokeStyle = '#EDEDED'; ctx.beginPath(); ctx.arc(s.pos[i * 2], s.pos[i * 2 + 1], 6, 0, Math.PI * 2); ctx.stroke(); }
      }

      // Nodes + labels
      ctx.font = '10px var(--font-geist-mono), ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      sentences.forEach((_, i) => {
        node(ctx, xIn, inY(i), 3.5, 0.6);
        ctx.fillStyle = '#8A8A8F'; ctx.textAlign = 'right'; ctx.fillText(`S${i + 1}`, xIn - 8, inY(i));
      });
      for (let mi = 0; mi < 6; mi++) {
        if (mi > 0 && s.monoT > 0.98) continue;
        const busy = s.inflight[mi] > 0 || (mi === 0 && s.inflight[6] > 0);
        node(ctx, xM, mY(mi), 5, 0.35 + s.modelGlow[mi] * 0.65, busy);
        const label = p.mono && mi === 0 ? 'mono · ' + (p.families[0] ?? '') : (p.families[mi] ?? `model ${mi + 1}`);
        tag(ctx, label, xM, mY(mi) - 14, 'center', mi > 0 ? 1 - s.monoT : 1);
      }
      for (let si = 0; si < 5; si++) {
        node(ctx, xS, segY(si), 5, 0.35 + s.segGlow[si] * 0.65);
        tag(ctx, SEGMENT_LABEL[SEGMENTS[si]].toLowerCase(), xS + 10, segY(si), 'left', 1);
      }

      for (let i = 0; i < 6; i++) { s.inputEdge[i] *= decay; s.modelGlow[i] *= decay; }
      for (let i = 0; i < 30; i++) s.msEdge[i] *= decay;
      for (let i = 0; i < 5; i++) s.segGlow[i] *= decay;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onClick = (e: React.MouseEvent) => {
    const s = st.current;
    const r = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = 64;
    for (let i = 0; i < s.shown.length; i++) {
      const d = (s.pos[i * 2] - x) ** 2 + (s.pos[i * 2 + 1] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    props.onSelect(best >= 0 ? props.personas[best].id : null);
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} onClick={onClick} className="block cursor-crosshair" />
    </div>
  );
});

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: 'left' | 'center', a: number) {
  if (a < 0.02) return;
  const w = ctx.measureText(text).width;
  const x0 = align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = `rgba(15,15,17,${0.85 * a})`;
  ctx.fillRect(x0 - 3, y - 7, w + 6, 14);
  ctx.fillStyle = `rgba(138,138,143,${a})`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function node(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, ring = false) {
  ctx.fillStyle = `rgba(233,233,234,${a})`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (ring) { ctx.strokeStyle = 'rgba(233,233,234,.35)'; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke(); }
}
