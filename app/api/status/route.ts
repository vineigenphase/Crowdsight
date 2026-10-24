import { family } from '@/lib/models';
import { getRoster, isMock, ping } from '@/lib/nebius';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const roster = await getRoster();
    const latency = await ping();
    return Response.json({ ok: true, mock: isMock(), latency, roster, families: roster.crowd.map(family) });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message ?? e) }, { status: 200 });
  }
}
