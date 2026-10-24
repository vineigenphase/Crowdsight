// Add-on: video frames → Nebius VLM → claims / on-screen text / visual notes.
import { getRoster, isMock, nebius, repairJSON } from '@/lib/nebius';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { frames } = (await req.json()) as { frames: string[] };
  try {
    if (isMock()) return Response.json({ claims: ['Pay per visit'], onScreenText: ['No contracts'], visualNotes: ['Clean, well-lit studio shots'] });
    const roster = await getRoster();
    if (!roster.vision) return Response.json({ error: 'No vision model in the Nebius catalogue' });
    const res = await nebius().chat.completions.create({
      model: roster.vision,
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'These are frames from a product launch video. List the claims made, the on-screen text and any visual signals a viewer would notice (quality, trust, confusion). Return only JSON {"claims":[],"onScreenText":[],"visualNotes":[]}.' },
          ...frames.slice(0, 8).map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ],
      }],
    });
    const d = repairJSON(res.choices[0]?.message?.content ?? '{}');
    return Response.json(d);
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e).slice(0, 200) });
  }
}
