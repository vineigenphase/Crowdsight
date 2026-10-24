'use client';
import { useEffect, useRef } from 'react';

/** Real mic input: 1px waveform, thin RMS ring, 24 signal points from frequency bins. Flat when idle. */
export function VoiceVisual({ analyser, status }: { analyser: AnalyserNode | null; status: 'idle' | 'listening' | 'muted' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(analyser);
  live.current = analyser;

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let rmsSmooth = 0;
    const time = new Uint8Array(2048);
    const freq = new Uint8Array(1024);
    const frame = () => {
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(r.width * dpr)) { cv.width = r.width * dpr; cv.height = r.height * dpr; }
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
      rmsSmooth += (rms - rmsSmooth) * 0.25;
      const cx = w * 0.18, cy = h / 2;

      // Waveform across the width (right of the ring)
      ctx.strokeStyle = 'rgba(237,237,237,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = w * 0.32, x1 = w - 8;
      const N = 256;
      for (let i = 0; i <= N; i++) {
        const x = x0 + (i / N) * (x1 - x0);
        const v = a ? (time[Math.floor((i / N) * (a.fftSize - 1))] - 128) / 128 : 0;
        const y = cy + v * h * 0.42;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();

      // Ring: radius follows RMS
      const base = Math.min(h * 0.26, 34);
      const rad = base * (1 + Math.min(1, rmsSmooth * 4) * 0.45);
      ctx.strokeStyle = 'rgba(237,237,237,.5)';
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
      // Subtle geometry: inner square rotates/scales with amplitude
      const g = base * 0.55 * (1 + rmsSmooth * 2);
      ctx.strokeStyle = 'rgba(237,237,237,.12)';
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4 + rmsSmooth * 2); ctx.strokeRect(-g / 2, -g / 2, g, g); ctx.restore();
      // 24 signal points offset by frequency bins
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const bin = a ? freq[Math.floor(2 + (i / 24) * 120)] / 255 : 0;
        const d = rad + 5 + bin * 16;
        ctx.fillStyle = `rgba(237,237,237,${0.3 + bin * 0.7})`;
        ctx.fillRect(cx + Math.cos(ang) * d - 1, cy + Math.sin(ang) * d - 1, 2, 2);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative h-[92px] border-b border-[var(--line)]">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="absolute right-3 top-2 flex items-center gap-1.5 text-[11px] text-[var(--dim)]">
        <span className={`h-1.5 w-1.5 rounded-full ${status === 'listening' ? 'bg-[var(--pos)]' : status === 'muted' ? 'bg-[var(--neg)]' : 'bg-[var(--dim)]'}`} />
        {status}
      </div>
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
