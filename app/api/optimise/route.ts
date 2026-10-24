import { optimise } from '@/lib/loop';
import { getRoster } from '@/lib/nebius';
import { InputType, samplePersonas, SegmentConfig } from '@/lib/personas';
import { Reaction } from '@/lib/score';
import { replay, sse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 800;

type Body = { type: InputType; text: string; price: number | null; configs: SegmentConfig[]; seed: number; n: number; reactions?: Reaction[]; demo?: boolean; brief?: string };

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  if (b.demo) return replay('optimise');
  return sse(async (emit) => {
    const roster = await getRoster();
    const personas = samplePersonas(b.configs, b.n, b.seed, roster.crowd.length);
    const prior = b.reactions?.length ? new Map(b.reactions.map((r) => [r.personaId, r])) : null;
    emit('loop_start', { n: personas.length, strong: roster.strong });
    await optimise(b.type, b.text, b.price, personas, b.configs, prior, emit, b.brief);
  });
}
