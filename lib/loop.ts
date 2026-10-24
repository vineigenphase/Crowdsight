// The closed loop. Code owns iteration, scoring and the stop rule; the model only proposes.
import { runCrowd, Emit } from './crowd';
import { chatJSON, getRoster, isMock } from './nebius';
import { InputType, parsePrice, Persona, SegmentConfig, SEGMENT_LABEL, stratifiedSample } from './personas';
import { financials, Reaction, summarise, topObjections } from './score';

const MAX_ITERS = 3;
const MIN_GAIN = 2;
const SAMPLE = 200;
const MAX_PRICE_CUT = 0.3; // never more than 30% below the founder's original price

export type Proposal = { lever: 'message' | 'price' | 'spec'; reason: string; objectionThemes: { theme: string; count: number }[]; variants: string[] };

async function propose(type: InputType, text: string, price: number | null, floor: number | null, personas: Persona[], reactions: Map<string, Reaction>, configs: SegmentConfig[], tried: string[]): Promise<Proposal> {
  const s = summarise(personas, reactions, configs);
  const rs = [...reactions.values()];
  const fin = financials(rs, price);
  const objections = rs.filter((r) => r.objection).slice(0, 400).map((r) => r.objection);
  if (isMock()) {
    const lever = tried.length % 2 === 0 ? 'message' : 'price';
    return {
      lever,
      reason: 'Skeptics doubt the value; lead with a concrete outcome.',
      objectionThemes: topObjections(rs),
      variants: [1, 2, 3].map((i) => (lever === 'price' && price ? text.replace(`£${price}/mo`, `£${Math.max(1, price - 2 * i)}/mo`) : `${text} Variant ${tried.length}.${i}: cancel anytime, first visit free.`)),
    };
  }
  const roster = await getRoster();
  const user = `You optimise a startup's launch. Current input, Launch Score, per-segment scores, top objections and price data are below. Choose ONE lever (message, price or spec) that most raises the weighted score without misrepresenting the product. Write 3 variants of the input that change only that lever. Keep each variant a similar length to the input. If you change the price, state the new price in £ in the variant text. ${floor != null ? `You may lower the price, but never below £${floor}/month (30% under the founder's original price).` : ''}
Also cluster the objections into the top 5 themes with counts.

Return JSON {"lever": "message"|"price"|"spec", "reason": string (<=20 words), "objectionThemes": [{"theme": string, "count": number}], "variants": [string, string, string]}

INPUT TYPE: ${type}
CURRENT INPUT: ${text}
FOUNDER'S PRICE: ${price != null ? `£${price}/month` : 'none'}
LAUNCH SCORE: ${s.launch.toFixed(1)}
SEGMENTS (score, importance, share): ${s.segments.map((g) => { const c = configs.find((c) => c.id === g.segment)!; return `${SEGMENT_LABEL[g.segment]}: ${g.score.toFixed(1)}, x${c.importance}, ${c.share}%`; }).join('; ')}
PRICE DATA: ${fin.payPct.toFixed(0)}% would pay the founder's price; demand curve ${fin.curve.filter((_, i) => i % 2 === 0).map((c) => `£${c.price}:${c.pct.toFixed(0)}%`).join(', ')}
PREVIOUS ITERATIONS: ${tried.length ? tried.join(' | ') : 'none'}
OBJECTIONS (${objections.length}): ${objections.join(' | ')}`;
  const res = await chatJSON(roster.strong, 'You are a rigorous launch optimiser. Output only JSON.', user, { temperature: 0.6, maxTokens: 6000, retries: 3 });
  const d = res.data as Partial<Proposal>;
  const variants = (Array.isArray(d.variants) ? d.variants : []).map((v) => (typeof v === 'string' ? v : String((v as { text?: string })?.text ?? ''))).filter(Boolean).slice(0, 3);
  if (!variants.length) throw new Error('optimiser returned no variants');
  return {
    lever: (['message', 'price', 'spec'].includes(String(d.lever)) ? d.lever : 'message') as Proposal['lever'],
    reason: String(d.reason ?? '').slice(0, 160),
    objectionThemes: Array.isArray(d.objectionThemes) ? d.objectionThemes.slice(0, 5).map((t) => ({ theme: String(t.theme), count: Number(t.count) || 0 })) : topObjections(rs),
    variants,
  };
}

export type FinalSummary = {
  verdict: string;
  headline: string;
  whatChanged: string;
  worked: string[];
  risks: string[];
  segments: { segment: string; line: string }[];
  nextSteps: string[];
};

/** One strong-model read of the whole final crowd plus the loop history. */
async function finalSummary(type: InputType, text0: string, text: string, price0: number | null, price: number | null, personas: Persona[], reactions: Map<string, Reaction>, configs: SegmentConfig[], versions: { version: number; score: number; lever: string | null; change: string }[], reason: string, brief?: string): Promise<FinalSummary | null> {
  if (isMock()) return { verdict: 'Promising', headline: 'Mock summary', whatChanged: 'Mock', worked: ['Mock'], risks: ['Mock'], segments: [], nextSteps: ['Mock'] };
  const s = summarise(personas, reactions, configs);
  const rs = [...reactions.values()];
  const byId = new Map(personas.map((p) => [p.id, p]));
  const sorted = [...rs].filter((r) => r.quote).sort((a, b) => b.stance - a.stance);
  const voice = (r: Reaction) => { const p = byId.get(r.personaId); return `${p ? `${SEGMENT_LABEL[p.segment]}, ${p.role}` : ''} (${r.stance.toFixed(2)}): "${r.quote}"${r.comparedTo ? ` [vs ${r.comparedTo}]` : ''}`; };
  const fin = financials(rs, price);
  const user = `You write the final briefing for a startup founder after a simulated market test of ${rs.length} personas and an optimisation loop. Be specific, plain-spoken and honest; this is a simulated market response and an early signal, never a prediction.

Return JSON {"verdict": "Strong"|"Promising"|"Mixed"|"Weak", "headline": string (<=16 words), "whatChanged": string (<=30 words, what the optimiser changed and the score effect), "worked": [3 short bullets], "risks": [3 short bullets, cite objections], "segments": [{"segment": string, "line": string <=14 words}] one per segment, "nextSteps": [3 concrete actions]}

INPUT TYPE: ${type}
ORIGINAL (£${price0 ?? '-'}): ${text0}
FINAL (£${price ?? '-'}): ${text}
VERSIONS: ${versions.map((v) => `v${v.version} ${v.score.toFixed(1)} ${v.lever ?? 'baseline'}: ${v.change}`).join(' | ')}
LOOP ENDED: ${reason}
LAUNCH SCORE: ${s.launch.toFixed(1)}; DIVERSITY ${s.diversity.toFixed(0)}
SEGMENTS: ${s.segments.map((g) => `${SEGMENT_LABEL[g.segment]} score ${g.score.toFixed(1)}, intent ${(g.intent * 100).toFixed(0)}%, share ${(g.share * 100).toFixed(0)}%`).join('; ')}
PRICE: ${fin.payPct.toFixed(0)}% would pay £${price ?? '-'}; ${fin.interested} interested of ${rs.length}
${brief ? `MARKET: ${brief}
` : ''}TOP OBJECTIONS: ${topObjections(rs, 8).map((o) => `${o.theme} (${o.count})`).join('; ')}
MOST POSITIVE: ${sorted.slice(0, 6).map(voice).join(' | ')}
MOST NEGATIVE: ${sorted.slice(-6).map(voice).join(' | ')}`;
  try {
    const roster = await getRoster();
    const res = await chatJSON(roster.strong, 'You are a sharp go-to-market advisor. Output only JSON.', user, { temperature: 0.4, maxTokens: 2500, retries: 3 });
    const d = res.data as Partial<FinalSummary>;
    const arr = (x: unknown) => (Array.isArray(x) ? x.map(String).slice(0, 5) : []);
    return {
      verdict: String(d.verdict ?? 'Mixed'),
      headline: String(d.headline ?? ''),
      whatChanged: String(d.whatChanged ?? ''),
      worked: arr(d.worked),
      risks: arr(d.risks),
      segments: Array.isArray(d.segments) ? d.segments.slice(0, 5).map((x) => ({ segment: String(x.segment), line: String(x.line) })) : [],
      nextSteps: arr(d.nextSteps),
    };
  } catch {
    return null;
  }
}

export async function optimise(
  type: InputType,
  text0: string,
  price0: number | null,
  personas: Persona[],
  configs: SegmentConfig[],
  reactions0: Map<string, Reaction> | null,
  outerEmit: Emit,
  brief?: string,
) {
  // Hold back loop_done so the final summary can run first; track the latest state for it.
  const state = { text: text0, price: price0, reactions: reactions0 ?? new Map<string, Reaction>(), versions: [] as { version: number; score: number; lever: string | null; change: string }[] };
  let done: { reason: string; score: number } | null = null;
  const emit: Emit = (event, data) => {
    if (event === 'loop_done') { done = data as { reason: string; score: number }; return; }
    if (event === 'version') { const v = data as { version: number; text: string; price: number | null; score: number; lever: string | null; change: string }; state.versions.push(v); state.text = v.text; state.price = v.price; }
    outerEmit(event, data);
  };
  await optimiseLoop(type, text0, price0, personas, configs, reactions0, emit, brief, state);
  const end = done ?? { reason: 'Loop ended.', score: 0 };
  outerEmit('summary_start', {});
  const summary = await finalSummary(type, text0, state.text, price0, state.price, personas, state.reactions, configs, state.versions, end.reason, brief);
  if (summary) outerEmit('summary', { ...summary, score: end.score, versions: state.versions.length });
  outerEmit('loop_done', end);
}

async function optimiseLoop(
  type: InputType,
  text0: string,
  price0: number | null,
  personas: Persona[],
  configs: SegmentConfig[],
  reactions0: Map<string, Reaction> | null,
  emit: Emit,
  brief: string | undefined,
  state: { reactions: Map<string, Reaction> },
) {
  const sample = stratifiedSample(personas, SAMPLE);
  let text = text0;
  let price = price0;
  let reactions = reactions0 && reactions0.size > personas.length * 0.5 ? reactions0 : await runCrowd(personas, type, text, price, emit, { brief, tag: { phase: 'confirm', iter: 0 } });
  state.reactions = reactions;
  let current = summarise(personas, reactions, configs).launch;
  emit('version', { version: 0, text, price, score: current, lever: null, change: 'Original input' });
  const tried: string[] = [];
  const floor = price0 != null ? Math.round(price0 * (1 - MAX_PRICE_CUT) * 100) / 100 : null;

  for (let iter = 1; iter <= MAX_ITERS; iter++) {
    emit('iter_start', { iter });
    let proposal: Proposal;
    try {
      proposal = await propose(type, text, price, floor, personas, reactions, configs, tried);
    } catch (e) {
      emit('loop_done', { reason: `Optimiser failed: ${String((e as Error).message).slice(0, 120)}`, score: current });
      return;
    }
    emit('proposal', { iter, ...proposal });

    // Fair race: the current input re-runs on the same 200 alongside the variants.
    const [baseRun, ...results] = await Promise.all([
      runCrowd(sample, type, text, price, emit, { brief, tag: { phase: 'variant', iter, variant: 'current' } }),
      ...proposal.variants.map(async (v, i) => {
        const vPrice = proposal.lever === 'price' ? (parsePrice(v) ?? price) : price;
        if (floor != null && vPrice != null && vPrice < floor) {
          emit('variant_done', { iter, variant: i, score: null, rejected: `£${vPrice} is below the £${floor} floor`, n: 0 });
          return { text: v, price: vPrice, score: -Infinity };
        }
        const rs = await runCrowd(sample, type, v, vPrice, emit, { brief, tag: { phase: 'variant', iter, variant: i } });
        const score = summarise(sample, rs, configs).launch;
        emit('variant_done', { iter, variant: i, score, n: rs.size });
        return { text: v, price: vPrice, score };
      }),
    ]);
    const baseline = summarise(sample, baseRun, configs).launch;
    emit('baseline', { iter, baseline, n: baseRun.size });
    const best = results.reduce((a, b) => (b.score > a.score ? b : a));
    tried.push(`${proposal.lever}: ${proposal.reason} (sample ${baseline.toFixed(1)} -> best ${best.score.toFixed(1)})`);

    if (baseRun.size < sample.length * 0.5) {
      emit('iter_done', { iter, applied: false, baseline, best: best.score });
      emit('loop_done', { reason: `Nebius unavailable during iteration ${iter} (${baseRun.size}/${sample.length} baseline reactions); stopped.`, score: current });
      return;
    }
    if (!Number.isFinite(best.score) || best.score < baseline + MIN_GAIN) {
      emit('iter_done', { iter, applied: false, baseline, best: best.score });
      emit('loop_done', { reason: `Gain under ${MIN_GAIN} points on iteration ${iter}; stopped.`, score: current });
      return;
    }

    // Apply, then confirm on the full crowd.
    text = best.text;
    price = best.price;
    emit('apply', { iter, text, price, sampleScore: best.score });
    const confirmRun = await runCrowd(personas, type, text, price, emit, { brief, tag: { phase: 'confirm', iter } });
    if (confirmRun.size < personas.length * 0.5) {
      // Provider trouble: keep the sample result, mark it unconfirmed, and stop rather than record a false score.
      emit('version', { version: iter, text, price, score: best.score, lever: proposal.lever, change: `${proposal.reason} (sample score; full confirm incomplete)` });
      emit('iter_done', { iter, applied: true, baseline, best: best.score, confirmed: null });
      emit('loop_done', { reason: `Confirm run incomplete (${confirmRun.size}/${personas.length} reactions); stopped.`, score: best.score });
      return;
    }
    reactions = confirmRun;
    state.reactions = reactions;
    const confirmed = summarise(personas, reactions, configs).launch;
    emit('version', { version: iter, text, price, score: confirmed, lever: proposal.lever, change: proposal.reason });
    emit('iter_done', { iter, applied: true, baseline, best: best.score, confirmed });
    current = confirmed;
  }
  emit('loop_done', { reason: `Reached ${MAX_ITERS} iterations.`, score: current });
}
