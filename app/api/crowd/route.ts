import { runCrowd } from '@/lib/crowd';
import { getRoster, meter } from '@/lib/nebius';
import { configsFromShares, InputType, samplePersonas, Segment, SegmentConfig } from '@/lib/personas';
import { summarise } from '@/lib/score';
import { replay, sse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Body = { type: InputType; text: string; price: number | null; configs: SegmentConfig[]; seed: number; n: number; mono?: boolean; demo?: boolean; shares?: Partial<Record<Segment, number>>; importance?: Partial<Record<Segment, number>>; brief?: string };

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  if (!b.configs && b.shares) b.configs = configsFromShares(b.shares, b.importance);
  b.seed ??= 7;
  b.n ??= 1000;
  if (b.demo) return replay('crowd', !!b.mono);
  return sse(async (emit) => {
    const roster = await getRoster();
    const personas = samplePersonas(b.configs, b.n, b.seed, roster.crowd.length);
    const t = Date.now();
    emit('run_start', { n: personas.length, mono: !!b.mono, models: b.mono ? [roster.mono] : roster.crowd });
    const reactions = await runCrowd(personas, b.type, b.text, b.price, emit, { mono: b.mono, brief: b.brief, tag: { phase: 'run' } });
    emit('run_done', { ms: Date.now() - t, summary: summarise(personas, reactions, b.configs), meter });
  });
}
