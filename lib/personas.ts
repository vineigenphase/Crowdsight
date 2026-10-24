// Stratified persona sampler. Pure code, seeded, deterministic: the client and the
// server regenerate the identical 1,000 from the same config + seed.

export type Segment = 'general' | 'icp' | 'expert' | 'marketing' | 'skeptic';
export type Stake = 'customer' | 'prospect' | 'investor' | 'competitor_user' | 'partner' | 'expert' | 'critic';
export type Personality = 'early_adopter' | 'pragmatist' | 'skeptic' | 'price_sensitive' | 'status_seeker';
export type Income = 'low' | 'mid' | 'high';
export type Region = 'UK' | 'EU' | 'US';
export type InputType = 'ad' | 'price' | 'spec';

export type Persona = {
  id: string;
  name: string;
  segment: Segment;
  stake: Stake;
  role: string;
  personality: Personality;
  age: number;
  incomeBand: Income;
  region: Region;
  model: number; // index into the crowd roster; resolved to an ID server-side
};

export type SegmentConfig = {
  id: Segment;
  label: string;
  share: number; // 0..100
  importance: number;
  ageMin: number;
  ageMax: number;
  income: Record<Income, number>;
  region: Record<Region, number>;
  description?: string; // ICP only
};

export const SEGMENTS: Segment[] = ['general', 'icp', 'expert', 'marketing', 'skeptic'];

export const SEGMENT_LABEL: Record<Segment, string> = {
  general: 'General population',
  icp: 'Target customer',
  expert: 'Domain experts',
  marketing: 'Marketing & brand',
  skeptic: 'Skeptics & loyalists',
};

const STAKES: Record<Segment, Stake[]> = {
  general: ['prospect'],
  icp: ['customer', 'prospect', 'prospect'],
  expert: ['expert', 'partner', 'investor'],
  marketing: ['expert'],
  skeptic: ['critic', 'competitor_user'],
};

const ROLES: Record<Segment, string[]> = {
  general: [
    'student nurse', 'retail assistant', 'secondary school teacher', 'delivery driver', 'accountant',
    'retired engineer', 'barista', 'civil servant', 'electrician', 'junior lawyer', 'care worker',
    'software tester', 'warehouse supervisor', 'pharmacist', 'stay-at-home parent', 'bus driver',
    'graphic designer', 'university student', 'bank clerk', 'chef', 'plumber', 'NHS administrator',
    'sales rep', 'hairdresser', 'freelance writer', 'police officer', 'shop owner', 'call centre agent',
  ],
  icp: ['target customer'],
  expert: [
    'product manager', 'seed VC', 'angel investor', 'CTO at a scale-up', 'industry analyst',
    'procurement lead', 'solutions architect', 'operations director', 'UX researcher', 'channel partner',
  ],
  marketing: [
    'brand strategist', 'growth marketer', 'copywriter', 'performance marketer', 'creative director',
    'social media manager', 'PR consultant', 'CMO at a DTC brand',
  ],
  skeptic: [
    'loyal user of the market leader', 'consumer rights blogger', 'burned early adopter',
    'tech journalist', 'frugal parent', 'competitor employee', 'Reddit power user', 'cynical analyst',
  ],
};

const PERSONALITY_WEIGHTS: Record<Segment, Record<Personality, number>> = {
  general: { early_adopter: 1, pragmatist: 3, skeptic: 1.5, price_sensitive: 2.5, status_seeker: 1 },
  icp: { early_adopter: 2, pragmatist: 3, skeptic: 1, price_sensitive: 2, status_seeker: 1 },
  expert: { early_adopter: 1.5, pragmatist: 3, skeptic: 2, price_sensitive: 0.5, status_seeker: 0.5 },
  marketing: { early_adopter: 2, pragmatist: 2, skeptic: 1.5, price_sensitive: 0.5, status_seeker: 2 },
  skeptic: { early_adopter: 0.2, pragmatist: 1, skeptic: 4, price_sensitive: 2, status_seeker: 0.5 },
};

const FIRST = [
  'Amara', 'Ben', 'Chloe', 'Dev', 'Ellie', 'Farhan', 'Grace', 'Hamza', 'Isla', 'Jack', 'Kemi', 'Liam',
  'Maya', 'Noah', 'Olivia', 'Priya', 'Quinn', 'Ravi', 'Sofia', 'Tom', 'Uma', 'Viktor', 'Wen', 'Yusuf',
  'Zara', 'Aoife', 'Bilal', 'Carmen', 'Dmitri', 'Esme', 'Femi', 'Hana', 'Ines', 'Jonas', 'Kai', 'Lena',
  'Marco', 'Nadia', 'Oscar', 'Pia', 'Rosa', 'Sam', 'Tariq', 'Valentina', 'Will', 'Ximena', 'Yara', 'Zoe',
];
const LAST = [
  'Okafor', 'Smith', 'Patel', 'Nguyen', 'Jones', 'Khan', 'Murphy', 'Garcia', 'Williams', 'Kowalski',
  'Brown', 'Ahmed', 'Rossi', 'Taylor', 'Müller', 'Chen', 'Evans', 'Dubois', 'Singh', 'Walsh', 'Moreau',
  'Hughes', 'Novak', 'Ali', 'Clarke', 'Silva', 'Ivanova', 'Byrne', 'Lopez', 'Hassan', 'Wright', 'Kim',
];

const BASE: Omit<SegmentConfig, 'share'>[] = [
  { id: 'general', label: SEGMENT_LABEL.general, importance: 1.0, ageMin: 18, ageMax: 75, income: { low: 35, mid: 45, high: 20 }, region: { UK: 50, EU: 25, US: 25 } },
  { id: 'icp', label: SEGMENT_LABEL.icp, importance: 2.0, ageMin: 22, ageMax: 50, income: { low: 20, mid: 55, high: 25 }, region: { UK: 60, EU: 20, US: 20 }, description: 'Busy UK professionals aged 25–40 who want flexible fitness' },
  { id: 'expert', label: SEGMENT_LABEL.expert, importance: 1.5, ageMin: 28, ageMax: 60, income: { low: 5, mid: 40, high: 55 }, region: { UK: 50, EU: 20, US: 30 } },
  { id: 'marketing', label: SEGMENT_LABEL.marketing, importance: 1.0, ageMin: 24, ageMax: 50, income: { low: 10, mid: 55, high: 35 }, region: { UK: 50, EU: 20, US: 30 } },
  { id: 'skeptic', label: SEGMENT_LABEL.skeptic, importance: 1.0, ageMin: 20, ageMax: 65, income: { low: 30, mid: 50, high: 20 }, region: { UK: 50, EU: 25, US: 25 } },
];

const MIXES: Record<InputType, Record<Segment, number>> = {
  ad: { general: 42, icp: 22, expert: 8, marketing: 20, skeptic: 8 },
  price: { general: 35, icp: 35, expert: 10, marketing: 7, skeptic: 13 },
  spec: { general: 30, icp: 22, expert: 30, marketing: 8, skeptic: 10 },
};

export const DEFAULT_MIX: Record<Segment, number> = { general: 50, icp: 22, expert: 12, marketing: 8, skeptic: 8 };

export function defaultConfigs(template: InputType | 'default' = 'default'): SegmentConfig[] {
  const mix = template === 'default' ? DEFAULT_MIX : MIXES[template];
  return BASE.map((b) => ({ ...b, income: { ...b.income }, region: { ...b.region }, share: mix[b.id] }));
}

/** Set one segment's share and rebalance the rest proportionally to keep 100. */
export function rebalance(configs: SegmentConfig[], id: Segment, share: number): SegmentConfig[] {
  share = Math.max(0, Math.min(100, Math.round(share)));
  const others = configs.filter((c) => c.id !== id);
  const otherTotal = others.reduce((s, c) => s + c.share, 0);
  const remaining = 100 - share;
  let out = configs.map((c) => {
    if (c.id === id) return { ...c, share };
    const w = otherTotal > 0 ? c.share / otherTotal : 1 / others.length;
    return { ...c, share: Math.round(w * remaining) };
  });
  // Fix rounding drift on the largest other segment.
  const drift = 100 - out.reduce((s, c) => s + c.share, 0);
  if (drift !== 0) {
    const big = out.filter((c) => c.id !== id).sort((a, b) => b.share - a.share)[0];
    out = out.map((c) => (c.id === big.id ? { ...c, share: c.share + drift } : c));
  }
  return out;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T extends string>(r: () => number, w: Record<T, number>): T {
  const entries = Object.entries(w) as [T, number][];
  const total = entries.reduce((s, [, v]) => s + Math.max(0, v), 0) || 1;
  let x = r() * total;
  for (const [k, v] of entries) {
    x -= Math.max(0, v);
    if (x <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

export function segmentCounts(configs: SegmentConfig[], n: number): Record<Segment, number> {
  const total = configs.reduce((s, c) => s + c.share, 0) || 1;
  const raw = configs.map((c) => ({ id: c.id, exact: (c.share / total) * n }));
  const counts = Object.fromEntries(raw.map((r) => [r.id, Math.floor(r.exact)])) as Record<Segment, number>;
  let left = n - Object.values(counts).reduce((s, v) => s + v, 0);
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left-- <= 0) break;
    counts[r.id]++;
  }
  return counts;
}

export function samplePersonas(configs: SegmentConfig[], n = 1000, seed = 7, modelCount = 6): Persona[] {
  const r = rng(seed);
  const counts = segmentCounts(configs, n);
  const out: Persona[] = [];
  for (const c of configs) {
    for (let i = 0; i < counts[c.id]; i++) {
      const stake = STAKES[c.id][Math.floor(r() * STAKES[c.id].length)];
      const roles = ROLES[c.id];
      const role = c.id === 'icp' ? (c.description || 'target customer') : roles[Math.floor(r() * roles.length)];
      const age = Math.round(c.ageMin + r() * Math.max(0, c.ageMax - c.ageMin));
      out.push({
        id: 'p' + String(out.length).padStart(4, '0'),
        name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
        segment: c.id,
        stake,
        role,
        personality: weighted(r, PERSONALITY_WEIGHTS[c.id]),
        age,
        incomeBand: weighted(r, c.income),
        region: weighted(r, c.region),
        model: i % modelCount, // round-robin within segment
      });
    }
  }
  return out;
}

/** Fixed stratified sample: every k-th persona within each segment. */
export function stratifiedSample(personas: Persona[], k: number): Persona[] {
  const out: Persona[] = [];
  for (const s of SEGMENTS) {
    const seg = personas.filter((p) => p.segment === s);
    const want = Math.round((seg.length / personas.length) * k);
    const step = seg.length / Math.max(1, want);
    for (let i = 0; i < want; i++) out.push(seg[Math.floor(i * step)]);
  }
  return out;
}

/** Pull the founder's price (GBP/month) out of free text. Monthly amounts win; the last one is the "new" price. */
export function parsePrice(text: string): number | null {
  const monthly = [...text.matchAll(/£\s?(\d+(?:\.\d{1,2})?)\s*(?:\/\s*mo|\/\s*month|per month|a month|pcm|monthly)/gi)].map((m) => parseFloat(m[1]));
  if (monthly.length) return monthly[monthly.length - 1];
  const all = [...text.matchAll(/£\s?(\d+(?:\.\d{1,2})?)/g)].map((m) => parseFloat(m[1]));
  return all.length ? all[all.length - 1] : null;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
