import { replay, sse } from '@/lib/sse';
import { deriveCategory, ground } from '@/lib/tavily';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const b = (await req.json()) as { category?: string; pitch?: string; demo?: boolean };
  if (b.demo) return replay('ground');
  return sse(async (emit) => {
    const category = b.category?.trim() || (await deriveCategory(b.pitch ?? ''));
    emit('category', { category });
    const brief = await ground(category, emit);
    emit('ground_done', { sources: brief.sources.length });
  });
}
