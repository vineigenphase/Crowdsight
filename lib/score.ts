// Pure scoring. Shared by the client (lens tabs) and the server (optimise loop).
import { Persona, Segment, SegmentConfig, SEGMENTS } from './personas';

export type Reaction = {
  personaId: string;
  stance: number;
  quote: string;
  intent: number;
  wouldShare: number;
  objection: string | null;
  maxPrice: number | null;
  comparedTo?: string | null;
  model?: string;
};

export type SegmentScore = {
  segment: Segment;
  n: number;
  score: number;
  stance: number;
  intent: number;
  share: number;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function segmentScores(personas: Persona[], reactions: Map<string, Reaction>): SegmentScore[] {
  return SEGMENTS.map((segment) => {
    const rs = personas.filter((p) => p.segment === segment).map((p) => reactions.get(p.id)).filter(Boolean) as Reaction[];
    const stance = mean(rs.map((r) => (r.stance + 1) / 2));
    const intent = mean(rs.map((r) => r.intent));
    const share = mean(rs.map((r) => r.wouldShare));
    return { segment, n: rs.length, stance, intent, share, score: rs.length ? 100 * (0.5 * stance + 0.35 * intent + 0.15 * share) : 0 };
  });
}

export function launchScore(seg: SegmentScore[], configs: SegmentConfig[]): number {
  let num = 0;
  let den = 0;
  for (const s of seg) {
    if (!s.n) continue;
    const c = configs.find((c) => c.id === s.segment);
    const w = (c?.share ?? 0) * (c?.importance ?? 1);
    num += w * s.score;
    den += w;
  }
  return den ? num / den : 0;
}

/** Normalised Shannon entropy of 5 stance bins, 0..100. */
export function diversity(reactions: Reaction[]): number {
  if (!reactions.length) return 0;
  const bins = [0, 0, 0, 0, 0];
  for (const r of reactions) bins[Math.min(4, Math.floor(((r.stance + 1) / 2) * 5))]++;
  let h = 0;
  for (const b of bins) if (b) { const p = b / reactions.length; h -= p * Math.log(p); }
  return (100 * h) / Math.log(5);
}

export function topObjections(reactions: Reaction[], k = 5): { theme: string; count: number }[] {
  const counts = new Map<string, { text: string; count: number }>();
  for (const r of reactions) {
    if (!r.objection) continue;
    const key = r.objection.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length > 3).slice(0, 3).join(' ');
    if (!key) continue;
    const e = counts.get(key) ?? { text: r.objection, count: 0 };
    e.count++;
    counts.set(key, e);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, k).map((e) => ({ theme: e.text, count: e.count }));
}

export function topQuotes(reactions: Reaction[], k = 3) {
  const sorted = [...reactions].filter((r) => r.quote).sort((a, b) => b.stance - a.stance);
  return { pos: sorted.slice(0, k), neg: sorted.slice(-k).reverse() };
}

export function financials(reactions: Reaction[], price: number | null) {
  const priced = reactions.map((r) => r.maxPrice).filter((x): x is number => typeof x === 'number' && x >= 0);
  const max = Math.max(10, ...priced.map((p) => Math.min(p, 500)));
  const step = max > 100 ? 10 : max > 40 ? 5 : 2;
  const curve: { price: number; pct: number }[] = [];
  for (let p = 0; p <= max + step; p += step) {
    curve.push({ price: p, pct: priced.length ? (100 * priced.filter((x) => x >= p).length) / reactions.length : 0 });
  }
  const interested = reactions.filter((r) => r.intent > 0.5).length;
  const payers = price != null ? reactions.filter((r) => r.intent > 0.5 && (r.maxPrice ?? 0) >= price).length : 0;
  const payPct = price != null && reactions.length ? (100 * reactions.filter((r) => (r.maxPrice ?? 0) >= price).length) / reactions.length : 0;
  return { curve, interested, payers, payPct, mrr: price != null ? payers * price : 0 };
}

export type Summary = { launch: number; segments: SegmentScore[]; diversity: number; n: number };

export function summarise(personas: Persona[], reactions: Map<string, Reaction>, configs: SegmentConfig[]): Summary {
  const segments = segmentScores(personas, reactions);
  const rs = personas.map((p) => reactions.get(p.id)).filter(Boolean) as Reaction[];
  return { launch: launchScore(segments, configs), segments, diversity: diversity(rs), n: rs.length };
}
