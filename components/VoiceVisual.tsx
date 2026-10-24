'use client';
import { useEffect, useRef } from 'react';

/**
 * Centrepiece audio visual on real mic input: a fine 1px waveform that passes behind a thin
 * RMS ring, 24 signal points driven by frequency bins, and a dot-grid halo whose points lift
 * with amplitude. Flat line, still ring and resting dots when idle. No glow.
 */
export function VoiceVisual({ analyser, status, elapsed }: { analyser: AnalyserNode | null; status: 'idle' | 'listening' | 'muted'; elapsed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(analyser);
  live.current = analyser;

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let rmsS = 0;
    const time = new Uint8Array(2048);
    const freq = new Uint8Array(1024);
    const binsS = new Float32Array(24);
    const frame = (now: number) => {
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = r.width * dpr; cv.height = r.height * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = r.width, h = r.height;
      ctx.clearRect(0, 0, w, h);
      const a = live.current;
      let rms = 0;
      if (a) {
        a.getByteTimeDomainData(time);
        a.getByteFrequencyData(freq);
        for (let i = 0; i < a.fftSize; i++) { const v = (time[i] - 128) / 128; rms += v * v; }
        rms = Math.sqrt(rms / a.fftSize);
      }
      rmsS += (rms - rmsS) * 0.2;
      const amp = Math.min(1, rmsS * 5);
      for (let i = 0; i < 24; i++) {
        const b = a ? freq[Math.floor(2 + (i / 24) * 140)] / 255 : 0;
        binsS[i] += (b - binsS[i]) * 0.3;
      }

      const cx = w / 2, cy = h / 2;
      const base = Math.min(h * 0.2, 44);
      const ringR = base * (1 + amp * 0.35);
      const haloR = base * 2.3;

      // Dot-grid halo: a square lattice clipped to a circle; dots near the ring lift with amplitude.
      const step = 9;
      for (let y = -haloR; y <= haloR; y += step) {
        for (let x = -haloR; x <= haloR; x += step) {
          const d = Math.hypot(x, y);
          if (d > haloR || d < ringR + 8) continue;
          const ang = Math.atan2(y, x);
          const bi = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 24) % 24;
          const falloff = 1 - (d - ringR) / (haloR - ringR);
          const lift = binsS[bi] * falloff;
          ctx.fillStyle = `rgba(237,237,237,${0.07 + lift * 0.55})`;
          ctx.fillRect(cx + x - 0.75, cy + y - 0.75, 1.5, 1.5);
        }
      }

      // Fine waveform across the full width, broken where it passes the halo.
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(237,237,237,.6)';
      const N = 320;
      let pen = false;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const x = 16 + (i / N) * (w - 32);
        if (Math.abs(x - cx) < haloR + 10) { pen = false; continue; }
        const v = a ? (time[Math.floor((i / N) * (a.fftSize - 1))] - 128) / 128 : 0;
        const edge = Math.min(1, (x - 16) / 60, (w - 16 - x) / 60); // taper at the ends
        const y = cy + v * h * 0.38 * edge;
        if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Ring
      ctx.strokeStyle = 'rgba(237,237,237,.7)';
      ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
      // Amplitude-reactive geometry: two counter-rotating squares inside the ring.
      const g = ringR * 0.62;
      const rot = now / 6000;
      ctx.strokeStyle = `rgba(237,237,237,${0.1 + amp * 0.25})`;
      for (const [k, dir] of [[1, 1], [0.7, -1]] as const) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4 + dir * (rot + amp * 0.6));
        const s = g * k * (1 + amp * 0.2);
        ctx.strokeRect(-s / 2, -s / 2, s, s); ctx.restore();
      }
      // 24 signal points, offset outward by their frequency bin.
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const d = ringR + 6 + binsS[i] * 18;
        ctx.fillStyle = `rgba(237,237,237,${0.35 + binsS[i] * 0.65})`;
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
  return (
    <div className="relative h-[220px] shrink-0">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="absolute left-5 top-4 flex items-center gap-2 text-[11px] text-[var(--dim)]">
        <span className={`h-1.5 w-1.5 rounded-full transition-colors duration-200 ${status === 'listening' ? 'bg-[var(--pos)]' : status === 'muted' ? 'bg-[var(--neg)]' : 'bg-[#4a4a4f]'}`} />
        <span>{status === 'listening' ? 'Listening' : status === 'muted' ? 'Muted' : 'Mic idle'}</span>
      </div>
      <div className="num absolute right-5 top-4 text-[11px] text-[var(--dim)]">{mm}:{ss}</div>
    </div>
  );
}

type SR = { start(): void; stop(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null };

/** Mic + analyser + Web Speech transcription. Final sentences are appended via onFinal. */
export function useVoice(onFinal: (text: string) => void, onInterim: (text: string) => void) {
  const state = useRef<{ stream: MediaStream | null; ctx: AudioContext | null; rec: SR | null; on: boolean }>({ stream: null, ctx: null, rec: null, on: false });
  const cb = useRef({ onFinal, onInterim });
  cb.current = { onFinal, onInterim };

  async function start(): Promise<AnalyserNode | null> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    src.connect(analyser);
    state.current = { stream, ctx, rec: null, on: true };
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (Ctor) {
      const rec: SR = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-GB';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) cb.current.onFinal(t.trim());
          else interim += t;
        }
        cb.current.onInterim(interim);
      };
      rec.onend = () => { if (state.current.on) try { rec.start(); } catch {} };
      rec.onerror = () => {};
      rec.start();
      state.current.rec = rec;
    }
    return analyser;
  }

  function stop() {
    const s = state.current;
    s.on = false;
    try { s.rec?.stop(); } catch {}
    s.stream?.getTracks().forEach((t) => t.stop());
    s.ctx?.close();
    state.current = { stream: null, ctx: null, rec: null, on: false };
    cb.current.onInterim('');
  }

  return { start, stop };
}
