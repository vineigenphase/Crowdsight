// Tavily grounding: real competitors, prices, complaints and news, summarised by the Nebius strong model.
import { tavily } from '@tavily/core';
import { chatJSON, getRoster } from './nebius';

export type Source = { title: string; url: string; snippet: string };
export type MarketBrief = { competitors: { name: string; price: string | null; url: string }[]; painPoints: string[]; trends: string[]; sources: Source[] };

const MOCK = !process.env.TAVILY_API_KEY || process.env.NEBIUS_MOCK === '1';
const cache = new Map<string, Source[]>();

export async function search(q: string, opts: Record<string, unknown> = {}): Promise<Source[]> {
  const key = q + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key)!;
  if (MOCK) return [{ title: `Mock result for ${q}`, url: 'https://example.com', snippet: 'Competitor X charges £10/mo; users complain about cancellation fees.' }];
  const res = await tavily({ apiKey: process.env.TAVILY_API_KEY! }).search(q, { maxResults: 5, ...opts });
  const out = res.results.map((r: { title: string; url: string; content: string }) => ({ title: r.title, url: r.url, snippet: String(r.content).slice(0, 400) }));
  cache.set(key, out);
  return out;
}

/** 3 searches in parallel → one Nebius strong-model call → Market Brief. */
export async function ground(category: string, emit: (e: string, d: unknown) => void): Promise<MarketBrief> {
  const queries: [string, Record<string, unknown>][] = [
    [`${category} competitors pricing`, {}],
    [`${category} customer complaints reviews reddit`, {}],
    [`${category} news`, { topic: 'news' }],
  ];
  const results = await Promise.all(queries.map(async ([q, o]) => {
    const r = await search(q, o).catch(() => [] as Source[]);
    r.forEach((s) => emit('ground_source', { query: q, ...s }));
    return r;
  }));
  const sources = results.flat();
  let d: Partial<MarketBrief> = {};
  try {
    const roster = await getRoster();
    const res = await chatJSON(roster.strong, 'Output only JSON.',
      `Summarise these web results about "${category}" into {"competitors":[{"name","price","url"}],"painPoints":[<=6 short],"trends":[<=4 short]}. Use only facts in the results.\n\n${sources.map((s) => `${s.title} (${s.url}): ${s.snippet}`).join('\n')}`,
      { temperature: 0.2, maxTokens: 1500 });
    d = res.data as Partial<MarketBrief>;
  } catch {}
  const brief = { competitors: Array.isArray(d.competitors) ? d.competitors : [], painPoints: Array.isArray(d.painPoints) ? d.painPoints : [], trends: Array.isArray(d.trends) ? d.trends : [], sources };
  emit('brief', brief);
  return brief;
}

export const briefText = (b: MarketBrief) =>
  `Competitors: ${b.competitors.map((c) => `${c.name}${c.price ? ` (${c.price})` : ''}`).join(', ') || 'unknown'}. Known pain points: ${b.painPoints.join('; ')}. Trends: ${b.trends.join('; ')}.`;
