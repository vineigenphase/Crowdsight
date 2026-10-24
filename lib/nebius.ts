// Nebius Token Factory client: roster, JSON calls with repair + retry, cost meter.
import OpenAI from 'openai';
import { pickRoster, pinnedRoster, Roster } from './models';

const MOCK = process.env.NEBIUS_MOCK === '1';

let client: OpenAI | null = null;
export function nebius(): OpenAI {
  if (!client) client = new OpenAI({ baseURL: process.env.NEBIUS_BASE_URL, apiKey: process.env.NEBIUS_API_KEY, maxRetries: 0, timeout: 90_000 });
  return client;
}

let roster: Roster | null = null;
export async function getRoster(): Promise<Roster> {
  if (roster) return roster;
  if (MOCK) return (roster = { crowd: ['mock/llama', 'mock/qwen', 'mock/mistral', 'mock/gemma', 'mock/deepseek', 'mock/gpt-oss'], strong: 'mock/strong', vision: 'mock/vl', mono: 'mock/llama' });
  roster = pinnedRoster();
  if (!roster) {
    const ids: string[] = [];
    for await (const m of nebius().models.list()) ids.push(m.id);
    roster = pickRoster(ids);
  }
  return roster;
}

export async function ping(): Promise<number> {
  const t = Date.now();
  if (!MOCK) await nebius().models.list();
  return Date.now() - t;
}

export const meter = { calls: 0, failed: 0, promptTokens: 0, completionTokens: 0 };

/** Strip reasoning blocks and code fences, then pull out the first JSON value. */
export function repairJSON(raw: string): unknown {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(s);
  } catch {}
  const start = s.search(/[[{]/);
  if (start < 0) throw new Error('no json');
  s = s.slice(start);
  // Walk to the matching close bracket; if truncated, close what's open at the last complete element.
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[' || ch === '{') stack.push(ch === '[' ? ']' : '}');
    else if (ch === ']' || ch === '}') {
      stack.pop();
      if (stack.length === 0) return JSON.parse(s.slice(0, i + 1).replace(/,\s*([\]}])/g, '$1'));
      if (stack.length === 1 || stack.length === 2) lastSafe = i;
    }
  }
  if (lastSafe > 0) {
    const head = s.slice(0, lastSafe + 1);
    // Recount what is still open at lastSafe and close it.
    const open: string[] = [];
    let q = false, e = false;
    for (const ch of head) {
      if (q) { if (e) e = false; else if (ch === '\\') e = true; else if (ch === '"') q = false; continue; }
      if (ch === '"') q = true;
      else if (ch === '[' || ch === '{') open.push(ch === '[' ? ']' : '}');
      else if (ch === ']' || ch === '}') open.pop();
    }
    return JSON.parse(head + open.reverse().join(''));
  }
  throw new Error('unrepairable json');
}

const noJsonMode = new Set<string>();

export async function chatJSON(
  model: string,
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number; retries?: number; timeoutMs?: number } = {},
): Promise<{ data: unknown; ms: number; tokens: number }> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const t = Date.now();
    try {
      meter.calls++;
      const res = await nebius().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: opts.temperature ?? 0.9,
        max_tokens: opts.maxTokens ?? 9000,
        ...(noJsonMode.has(model) ? {} : { response_format: { type: 'json_object' as const } }),
      }, opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined);
      const text = res.choices[0]?.message?.content ?? '';
      if (!text.trim()) throw Object.assign(new Error(`empty content (finish: ${res.choices[0]?.finish_reason})`), { status: 0 });
      meter.promptTokens += res.usage?.prompt_tokens ?? 0;
      meter.completionTokens += res.usage?.completion_tokens ?? 0;
      return { data: repairJSON(text), ms: Date.now() - t, tokens: res.usage?.total_tokens ?? 0 };
    } catch (e: unknown) {
      lastErr = e;
      const status = (e as { status?: number }).status;
      if (status === 400 && !noJsonMode.has(model)) {
        noJsonMode.add(model); // model rejects response_format; retry in plain mode
        attempt--;
        continue;
      }
      meter.failed++;
      console.warn(`[crowdsight] ${model} attempt ${attempt + 1} failed: status=${status} ${String((e as Error).message).slice(0, 140)}`);
      const wait = status === 429 || status === 503 || status === 529 ? 2000 * (attempt + 1) + Math.random() * 1000 : 400;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/** Plain-text chat turn (persona and agent conversations). Reasoning blocks are stripped. */
export async function chatText(model: string, messages: { role: 'system' | 'user' | 'assistant'; content: string }[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  if (MOCK) return 'Mock reply: I would want to see the real locations before committing.';
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      meter.calls++;
      const res = await nebius().chat.completions.create({ model, messages, temperature: opts.temperature ?? 0.8, max_tokens: opts.maxTokens ?? 1500 }, { timeout: 60_000 });
      meter.promptTokens += res.usage?.prompt_tokens ?? 0;
      meter.completionTokens += res.usage?.completion_tokens ?? 0;
      const text = (res.choices[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (text) return text;
      throw new Error('empty reply');
    } catch (e) {
      lastErr = e;
      meter.failed++;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export const isMock = () => MOCK;
