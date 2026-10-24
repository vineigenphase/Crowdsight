import { replay, sse } from '@/lib/sse';
import { ground } from '@/lib/tavily';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const b = (await req.json()) as { category: string; demo?: boolean };
  if (b.demo) return replay('ground');
  return sse(async (emit) => {
    const brief = await ground(b.category, emit);
    emit('ground_done', { sources: brief.sources.length });
  });
}
