// Follow-up questions to the main agent about the latest test in a chat (plus any referenced chats).
import { chatText, getRoster } from '@/lib/nebius';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const b = (await req.json()) as { question: string; context: string; history: { role: 'user' | 'assistant'; content: string }[] };
  try {
    const roster = await getRoster();
    const system = `You are Crowdsight's analyst. You answer a founder's questions about a simulated market test of 1,000 personas. Ground every claim in the context below; quote numbers from it; say when the data cannot answer. Under 140 words, plain text, no headings. Call it a simulated market response or early signal, never a prediction.

CONTEXT:
${b.context.slice(0, 12000)}`;
    const reply = await chatText(roster.strong, [{ role: 'system', content: system }, ...b.history.slice(-6), { role: 'user', content: b.question }], { temperature: 0.4, maxTokens: 1200 });
    return Response.json({ reply, model: roster.strong });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e).slice(0, 200) });
  }
}
