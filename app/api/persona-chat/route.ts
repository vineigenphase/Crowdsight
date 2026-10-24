// Talk to one segment's collective voice (strong model) or to one individual persona (its own crowd model).
import { chatText, getRoster } from '@/lib/nebius';
import { configsFromShares, samplePersonas, Segment, SEGMENT_LABEL } from '@/lib/personas';
import { Reaction } from '@/lib/score';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  kind: 'segment' | 'persona';
  segment?: Segment;
  personaId?: string;
  shares: Partial<Record<Segment, number>>;
  importance?: Partial<Record<Segment, number>>;
  pitch: string;
  mode: string;
  brief?: string;
  reactions: Reaction[];
  history: { role: 'user' | 'assistant'; content: string }[];
  message: string;
};

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  try {
    const roster = await getRoster();
    const personas = samplePersonas(configsFromShares(b.shares, b.importance), 1000, 7, roster.crowd.length);
    let model = roster.strong;
    let system = '';
    if (b.kind === 'persona') {
      const p = personas.find((x) => x.id === b.personaId);
      if (!p) return Response.json({ error: 'persona not found' }, { status: 404 });
      model = roster.crowd[p.model % roster.crowd.length];
      const r = b.reactions[0];
      system = `You are ${p.name}, ${p.age}, a ${p.role} in the ${p.region} with ${p.incomeBand} income. Your stake: ${p.stake.replace('_', ' ')}. Personality: ${p.personality.replace('_', ' ')}.
A founder showed you this ${b.mode} pitch: "${b.pitch}"
${b.brief ? `You know this market: ${b.brief}\n` : ''}${r ? `Your earlier reaction: stance ${r.stance.toFixed(2)} (-1 hate to 1 love), you said "${r.quote}"${r.objection ? `, objection: ${r.objection}` : ''}${r.maxPrice != null ? `, the most you'd pay is £${r.maxPrice}/month` : ''}.` : ''}
Stay fully in character. Answer the founder in first person, plainly, in under 80 words. Do not mention being an AI or a simulation.`;
    } else {
      const seg = b.segment as Segment;
      const rs = b.reactions;
      const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
      system = `You speak as the collective voice of the "${SEGMENT_LABEL[seg]}" segment: ${rs.length} simulated people who reacted to a founder's ${b.mode} pitch: "${b.pitch}".
${b.brief ? `Market context: ${b.brief}\n` : ''}Segment stats: mean stance ${mean(rs.map((r) => r.stance)).toFixed(2)}, mean intent ${(mean(rs.map((r) => r.intent)) * 100).toFixed(0)}%, would share ${(mean(rs.map((r) => r.wouldShare)) * 100).toFixed(0)}%.
What they said: ${rs.slice(0, 40).map((r) => `"${r.quote}"${r.objection ? ` [objection: ${r.objection}]` : ''}`).join(' | ')}
Answer the founder as "we", grounded only in these reactions; note disagreement inside the segment when it exists. Under 110 words, plain text. This is a simulated market response, an early signal, never a prediction.`;
    }
    const reply = await chatText(model, [{ role: 'system', content: system }, ...b.history.slice(-8), { role: 'user', content: b.message }], { maxTokens: 1200 });
    return Response.json({ reply, model });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e).slice(0, 200) }, { status: 200 });
  }
}
