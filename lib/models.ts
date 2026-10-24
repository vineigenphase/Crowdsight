// Model roster. IDs are never hardcoded: they come from lib/models.pinned.json
// (written by `npm run models`), env overrides, or live discovery via GET /models.
import fs from 'node:fs';
import path from 'node:path';

export type Roster = { crowd: string[]; strong: string; vision: string | null; mono: string };

const FAMILIES: { name: string; re: RegExp }[] = [
  { name: 'llama', re: /llama|hermes/i },
  { name: 'qwen', re: /qwen/i },
  { name: 'mistral', re: /mistral|mixtral/i },
  { name: 'gemma', re: /gemma/i },
  { name: 'deepseek', re: /deepseek/i },
  { name: 'gpt-oss', re: /gpt-oss/i },
  { name: 'nemotron', re: /nemotron/i },
  { name: 'phi', re: /phi-/i },
  { name: 'glm', re: /glm/i },
  { name: 'kimi', re: /kimi/i },
  { name: 'minimax', re: /minimax/i },
];

const NOT_CHAT = /embed|bge|e5-|guard|flux|sdxl|stable-diffusion|whisper|reward|image|tts|rerank|-vl|vision|coder|math/i;
const SLOW = /r1|thinking|qwq|reason/i;

function sizeB(id: string): number {
  const m = id.match(/(\d+(?:\.\d+)?)b\b/i);
  return m ? parseFloat(m[1]) : 40;
}

export function family(id: string): string {
  return FAMILIES.find((f) => f.re.test(id))?.name ?? id.split('/').pop()!.split('-')[0];
}

/** Pick one fast chat model per family, a strong model and a vision model from a catalogue. */
export function pickRoster(ids: string[]): Roster {
  const chat = ids.filter((id) => !NOT_CHAT.test(id));
  const crowd: string[] = [];
  for (const f of FAMILIES) {
    const cands = chat.filter((id) => f.re.test(id));
    if (!cands.length) continue;
    // Prefer fast instruct variants in the 7–72B band; avoid reasoning models for the crowd.
    const scored = cands
      .map((id) => {
        const s = sizeB(id);
        let score = Math.abs(Math.log(s / 20));
        if (SLOW.test(id)) score += 3;
        if (/instruct|chat|-it\b/i.test(id)) score -= 0.3;
        if (/fast/i.test(id)) score -= 0.2;
        return { id, score };
      })
      .sort((a, b) => a.score - b.score);
    crowd.push(scored[0].id);
    if (crowd.length === 6) break;
  }
  // Pad if the catalogue has fewer than 6 families.
  for (const id of chat) {
    if (crowd.length >= 6) break;
    if (!crowd.includes(id) && !SLOW.test(id)) crowd.push(id);
  }
  const strong =
    chat.find((id) => /deepseek-v3/i.test(id)) ??
    chat.find((id) => /qwen3-235b/i.test(id)) ??
    chat.find((id) => /gpt-oss-120b/i.test(id)) ??
    [...chat].sort((a, b) => sizeB(b) - sizeB(a))[0] ??
    crowd[0];
  const vision = ids.find((id) => /-vl|vision/i.test(id) && !/embed/i.test(id)) ?? null;
  return { crowd, strong, vision, mono: crowd[0] };
}

export function pinnedRoster(): Roster | null {
  const env = process.env.NEBIUS_CROWD_MODELS;
  if (env) {
    const crowd = env.split(',').map((s) => s.trim()).filter(Boolean);
    return {
      crowd,
      strong: process.env.NEBIUS_STRONG_MODEL || crowd[0],
      vision: process.env.NEBIUS_VISION_MODEL || null,
      mono: process.env.NEBIUS_MONO_MODEL || crowd[0],
    };
  }
  try {
    const p = path.join(process.cwd(), 'lib', 'models.pinned.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Roster;
  } catch {
    return null;
  }
}
