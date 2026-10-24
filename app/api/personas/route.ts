import { configsFromShares, samplePersonas, Segment } from '@/lib/personas';

export const runtime = 'nodejs';

/** The exact 1,000 personas the crowd routes will sample for these shares (same seed). */
export async function POST(req: Request) {
  const b = (await req.json()) as { shares: Partial<Record<Segment, number>>; importance?: Partial<Record<Segment, number>>; seed?: number; n?: number };
  return Response.json(samplePersonas(configsFromShares(b.shares, b.importance), b.n ?? 1000, b.seed ?? 7, 6));
}
