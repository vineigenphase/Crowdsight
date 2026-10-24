import fs from 'node:fs';
import path from 'node:path';
import { meter } from './nebius';

export type DemoEvent = { t: number; stream: 'crowd' | 'optimise'; event: string; data: unknown };

/** Wraps a job in an SSE response. Every event also carries the running cost meter. */
export function sse(job: (emit: (event: string, data: unknown) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      let closed = false;
      const emit = (event: string, data: unknown) => {
        if (closed) return;
        try {
          ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          if (event === 'batch_done' || event === 'batch_failed') ctrl.enqueue(enc.encode(`event: meter\ndata: ${JSON.stringify(meter)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await job(emit);
      } catch (e) {
        emit('error', { message: String((e as Error).message ?? e) });
      }
      closed = true;
      try { ctrl.close(); } catch {}
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}

/** Replays the recorded demo through the same SSE events, at recorded timing. */
export function replay(stream: 'crowd' | 'optimise', mono = false): Response {
  return sse(async (emit) => {
    const file = path.join(process.cwd(), 'public', 'demo', 'run.json');
    const log = JSON.parse(fs.readFileSync(file, 'utf8')) as { events: DemoEvent[] };
    // A recording holds several runs; split on run_start / loop_start markers.
    const runs: DemoEvent[][] = [];
    for (const e of log.events.filter((e) => e.stream === stream)) {
      if (e.event === 'run_start' || e.event === 'loop_start' || !runs.length) runs.push([]);
      runs[runs.length - 1].push(e);
    }
    const run = runs.find((r) => !!(r[0]?.data as { mono?: boolean })?.mono === mono) ?? runs[0] ?? [];
    const t0 = run[0]?.t ?? 0;
    const start = Date.now();
    for (const e of run) {
      const wait = e.t - t0 - (Date.now() - start);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      emit(e.event, e.data);
    }
  });
}
