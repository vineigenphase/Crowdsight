// Dev only: saves the client's event log as the replayable demo.
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') return new Response('disabled', { status: 403 });
  const body = await req.text();
  fs.writeFileSync(path.join(process.cwd(), 'public', 'demo', 'run.json'), body);
  return Response.json({ ok: true, bytes: body.length });
}
