// Crowd runner: personas in, independent batched reactions out. Never fails a run.
import pLimit from 'p-limit';
import { chatJSON, getRoster, isMock } from './nebius';
import { InputType, Persona, rng } from './personas';
import { Reaction } from './score';

export type Emit = (event: string, data: unknown) => void;

// Spec default is 12; raised via CROWD_CONCURRENCY to keep 1,000 near the <60s gate without tripping Nebius 503s.
const limit = pLimit(Number(process.env.CROWD_CONCURRENCY) || 24);
const BATCH = 25;

const TYPE_LABEL: Record<InputType, string> = { ad: 'Ad / message', price: 'Price change', spec: 'Spec change' };

const SYSTEM =
  'You simulate independent people reacting to a startup. You output only JSON. Each person reacts alone, in character; they never see each other.';

function card(p: Persona): string {
  return `${p.id} | ${p.name}, ${p.age}, ${p.region}, ${p.incomeBand} income | role: ${p.role} | stake: ${p.stake} | personality: ${p.personality}`;
}

function prompt(personas: Persona[], type: InputType, text: string, price: number | null, brief?: string): string {
  return `Simulate these ${personas.length} people independently. Each is defined by their card. React to the startup input as that person would in real life, given their role, personality and stake. Do not average or agree with each other: skeptics should be skeptical, price-sensitive people should balk at high prices, low-income people should give lower maxPrice. Use the full range of stance from -1 to 1. Compare against the real alternatives when relevant.

Return a JSON object {"reactions": [...]} with exactly one object per person, matching:
{"personaId": string, "stance": number -1..1, "quote": string (<=20 words, first person, in their voice), "intent": number 0..1 (would buy / try / back it), "wouldShare": number 0..1, "objection": string <=12 words or null, "maxPrice": number GBP/month they would pay, or null if not applicable, "comparedTo": name of a real alternative they compared it with, or null}

PEOPLE:
${personas.map(card).join('\n')}

${brief ? `THEY LIVE IN THIS MARKET: ${brief}
` : ''}INPUT (${TYPE_LABEL[type]}): ${text}
FOUNDER'S PRICE: ${price != null ? `£${price}/month` : 'none'}`;
}

const clamp = (x: unknown, lo: number, hi: number, d: number) => {
  const n = typeof x === 'number' ? x : parseFloat(String(x));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

function normalise(raw: unknown, personas: Persona[], model: string): Reaction[] {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && typeof raw === 'object') {
    const v = Object.values(raw as Record<string, unknown>).find(Array.isArray);
    if (v) arr = v as unknown[];
  }
  const ids = new Set(personas.map((p) => p.id));
  const used = new Set<string>();
  const out: Reaction[] = [];
  arr.forEach((o, i) => {
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    let id = String(r.personaId ?? r.id ?? '');
    if (!ids.has(id) || used.has(id)) id = personas[i]?.id ?? ''; // fall back to position
    if (!id || used.has(id)) return;
    used.add(id);
    const mp = r.maxPrice == null ? null : clamp(r.maxPrice, 0, 10000, NaN);
    out.push({
      personaId: id,
      stance: clamp(r.stance, -1, 1, 0),
      quote: String(r.quote ?? '').slice(0, 160),
      intent: clamp(r.intent, 0, 1, 0),
      wouldShare: clamp(r.wouldShare, 0, 1, 0),
      objection: r.objection ? String(r.objection).slice(0, 100) : null,
      maxPrice: mp == null || Number.isNaN(mp) ? null : mp,
      comparedTo: r.comparedTo ? String(r.comparedTo).slice(0, 60) : null,
      model,
    });
  });
  return out;
}

// Dev-only stand-in so the pipeline can be exercised without credits (NEBIUS_MOCK=1).
function mockReactions(personas: Persona[], text: string, price: number | null, modelIdx: number, model: string): Reaction[] {
  const h = [...text].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const r = rng(h + modelIdx * 101 + personas.length);
  const lean = (h % 100) / 100 - 0.4;
  return personas.map((p) => {
    const base = { skeptic: -0.45, expert: 0.05, marketing: 0.1, icp: 0.3, general: 0 }[p.segment] + lean * 0.5 + (modelIdx - 2.5) * 0.06;
    const stance = Math.max(-1, Math.min(1, base + (r() - 0.5) * 1.1));
    const inc = { low: 8, mid: 18, high: 35 }[p.incomeBand];
    const maxPrice = Math.round(inc * (0.5 + r()) * (1 + stance * 0.4));
    return {
      personaId: p.id,
      stance,
      quote: stance > 0.3 ? 'I would genuinely try this next week.' : stance < -0.3 ? 'Sounds like every other subscription trap.' : 'Interesting, but I need to see more.',
      intent: Math.max(0, Math.min(1, (stance + 1) / 2 + (r() - 0.5) * 0.3 - (price && price > maxPrice ? 0.25 : 0))),
      wouldShare: Math.max(0, Math.min(1, (stance + 0.5) / 2 + (r() - 0.5) * 0.3)),
      objection: stance < 0.2 ? ['Too expensive for what it is', 'Not sure it is different', 'Worried about cancelling'][Math.floor(r() * 3)] : null,
      maxPrice,
      comparedTo: stance < 0 ? 'Competitor X' : null,
      model,
    };
  });
}

export type CrowdOpts = { mono?: boolean; tag?: Record<string, unknown>; brief?: string };

/** Runs a crowd. Batches never mix models; failed batches are dropped, not fatal. */
export async function runCrowd(
  personas: Persona[],
  type: InputType,
  text: string,
  price: number | null,
  emit: Emit,
  opts: CrowdOpts = {},
): Promise<Map<string, Reaction>> {
  const roster = await getRoster();
  const groups = new Map<number, Persona[]>();
  for (const p of personas) {
    const idx = opts.mono ? 0 : p.model % roster.crowd.length;
    if (!groups.has(idx)) groups.set(idx, []);
    groups.get(idx)!.push(p);
  }
  const batches: { idx: number; model: string; personas: Persona[] }[] = [];
  for (const [idx, ps] of groups) {
    const model = opts.mono ? roster.mono : roster.crowd[idx];
    for (let i = 0; i < ps.length; i += BATCH) batches.push({ idx, model, personas: ps.slice(i, i + BATCH) });
  }
  // Interleave so all models light up together rather than one after another.
  batches.sort((a, b) => batches.filter((x) => x.idx === a.idx).indexOf(a) - batches.filter((x) => x.idx === b.idx).indexOf(b) || a.idx - b.idx);

  const out = new Map<string, Reaction>();
  const tag = opts.tag ?? {};
  await Promise.all(
    batches.map((b, n) =>
      limit(async () => {
        const batchId = `${String(tag.phase ?? 'run')}-${String(tag.variant ?? '')}-${n}`;
        emit('batch_start', { ...tag, batchId, modelIdx: opts.mono ? -1 : b.idx, model: b.model, personaIds: b.personas.map((p) => p.id) });
        try {
          let reactions: Reaction[];
          let ms = 0;
          let tokens = 0;
          if (isMock()) {
            const t = Date.now();
            await new Promise((r) => setTimeout(r, 300 + Math.random() * 900));
            reactions = mockReactions(b.personas, text, price, opts.mono ? 0 : b.idx, b.model);
            ms = Date.now() - t;
          } else {
            const res = await chatJSON(b.model, SYSTEM, prompt(b.personas, type, text, price, opts.brief));
            reactions = normalise(res.data, b.personas, b.model);
            ms = res.ms;
            tokens = res.tokens;
          }
          for (const r of reactions) out.set(r.personaId, r);
          emit('batch_done', { ...tag, batchId, modelIdx: opts.mono ? -1 : b.idx, model: b.model, ms, tokens, reactions });
        } catch (e) {
          emit('batch_failed', { ...tag, batchId, modelIdx: opts.mono ? -1 : b.idx, model: b.model, error: String((e as Error).message ?? e).slice(0, 200) });
        }
      }),
    ),
  );
  return out;
}
