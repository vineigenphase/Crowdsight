# Crowdsight: Claude Code build spec

> Model: Opus. Feature freeze 15:35, submit 15:55. **Keep it simple. If a feature isn't in this file, don't build it.**

## 1. Product

A population of 1,000 AI personas, each with a distinct role, personality and stake in the startup, reacts to any startup input: an ad, a price change, or a spec change. The founder sees how the market is likely to respond before acting.

An optimiser agent then closes the loop: it reads the reactions, changes the input, re-tests on the crowd, and repeats until the score stops improving.

**Personas never talk to each other.** Every call is one independent batch: the crowd in, reactions out.

## 2. The closed loop

```
input v0 ──► crowd (1,000 personas, batched) ──► scores + objections
   ▲                                                   │
   └── apply best variant ◄── test 3 variants ◄── optimiser agent proposes
```

1. **React.** 1,000 personas react to v0: 40 calls of 25 personas, across 6 model families.
2. **Score.** Code aggregates reactions into a Launch Score plus per-segment scores.
3. **Propose.** The optimiser (one strong model) reads scores, top objections, segment gaps. Picks **one lever** (message, price or spec), writes 3 variants.
4. **Test.** Each variant runs on a fixed 200-persona stratified sample (8 calls per variant, parallel).
5. **Apply.** Best variant replaces the input only if it beats the current score by ≥ 2 points. Full 1,000 re-run confirms.
6. **Stop** after 3 iterations, or when gain < 2 points.

**Code owns the loop, the scoring and the stop rule. The model owns only the proposal.** No free-form tool calling.

## 3. Inputs (one box, three types)

| Type | Founder enters | Example |
|---|---|---|
| Ad / message | Copy, launch post, landing text | "Meet Loop: the gym that charges per visit." |
| Price change | Current → new price, plus context | "£9/mo → £14/mo, adds coaching" |
| Spec change | What changes in the product | "Removing the free tier, adding team seats" |

Typed or spoken (Web Speech API transcribes into the box).
**Video ad (P2 only):** 6 frames sampled in browser → Nebius VLM → `{claims, onScreenText, visualNotes}` appended to the ad text.

## 4. The 1,000 personas

Sampled in code, not by the LLM.

```ts
type Persona = {
  id: string; name: string;
  segment: Segment;
  stake: 'customer'|'prospect'|'investor'|'competitor_user'|'partner'|'expert'|'critic';
  role: string;
  personality: 'early_adopter'|'pragmatist'|'skeptic'|'price_sensitive'|'status_seeker';
  age: number; incomeBand: 'low'|'mid'|'high'; region: 'UK'|'EU'|'US';
  model: string; // round-robin within segment
};
```

| Segment | Share | Importance | Typical stakes |
|---|---|---|---|
| General population | 50% | 1.0 | prospect |
| Target customer / ICP (one-line description) | 22% | 2.0 | customer, prospect |
| Domain experts / technical buyers | 12% | 1.5 | expert, partner |
| Marketing and brand specialists | 8% | 1.0 | expert |
| Skeptics and competitor loyalists | 8% | 1.0 | critic, competitor_user |

Templates: Ad → marketers 20%. Price → ICP 35%. Spec → experts 30%.
Each segment tab: share slider (others rebalance to 100%), importance weight, age/income/region controls.

## 5. Reaction schema

```ts
type Reaction = {
  personaId: string;
  stance: number;            // -1..1
  quote: string;             // ≤ 20 words, first person
  intent: number;            // 0..1
  wouldShare: number;        // 0..1
  objection: string | null;  // ≤ 12 words
  maxPrice: number | null;   // GBP/month
};
```

Scores (`lib/score.ts`, pure code):
- Segment score = `100 × (0.5·mean(stance+1)/2 + 0.35·mean(intent) + 0.15·mean(wouldShare))`
- Launch Score = importance-weighted mean of segment scores
- Marketing: share rate, top quotes
- Product: intent per segment, top 5 objections (counted by the optimiser in one call)
- Financials: % with maxPrice ≥ founder's price; demand curve; indicative MRR = payers × price. Labelled "simulated".

## 6. Nebius (all through Token Factory)

| Job | Model | Calls |
|---|---|---|
| Crowd | 6 open model families | 40 full / 8 per variant |
| Optimiser | 1 strong reasoning model | 1 per iteration |
| Mono check | 1 model, same 1,000 | 40, once |
| Video | VLM | 1 |

OpenAI SDK, `baseURL = NEBIUS_BASE_URL`, `apiKey = NEBIUS_API_KEY`. `scripts/models.ts` lists `GET /models`; families picked into `lib/models.ts`. Never hardcode model IDs from memory. Concurrency 12 via `p-limit`. JSON mode where supported, repair, drop bad rows, never fail a run. If rate limits bite, run 500 personas.

Mono toggle: re-run crowd on one model. Diversity Score = entropy of 5 stance bins.

## 7. Screen (dark, asymmetric, no chat UI)

- TOP: session name, stage (Input → Crowd → Optimise → Result), Nebius status (dot, 6 models, latency), exit.
- LEFT ~58%: input type tabs (Ad, Price, Spec); voice visual on real mic (1px waveform, thin RMS ring, 24 signal points from frequency bins, mic status dot, no glowing orb, flat when idle); input box; loop timeline v0 → v3 (change, lever, score; click to view).
- RIGHT ~42%: tabs Crowd · Segments · Marketing · Product · Financials. Crowd = 4-layer network: input → 6 models → 5 segments → 1,000 dots (#FF5A4E → grey → #3DDC97). Edges light on real `batch_start`/`batch_done` SSE. Mono collapses model layer. Click dot → persona card + quote.
- DOCK 56px: mic, template, mixed/mono, Run crowd, Optimise, upload video, Launch Score.

Tokens: `--bg:#0A0A0B; --panel:#0F0F11; --line:rgba(255,255,255,.07); --text:#EDEDED; --dim:#8A8A8F; --neg:#FF5A4E; --pos:#3DDC97; --radius:10px;` Geist 13–14px, Geist Mono for numbers. Animations 150–300ms ease-out. No gradients except stance scale. No emoji, sparkles, chat bubbles.

## 8. Stack

Next.js App Router + TypeScript, Tailwind, canvas 2D, Recharts, `openai`, `p-limit`. `public/demo/run.json` recorded run; `?demo=1` replays it through the same SSE events.

## 9. Build order

1. 13:30 typed input → 1,000 personas → `/api/crowd` across 6 models → network recolours live → Launch Score (< 60s).
2. 14:30 segment tabs, lens tabs, Mono.
3. 15:15 optimise loop + timeline, then voice + audio visual.
4. 15:15–15:35 record demo, test `?demo=1`, freeze.
5. Only if green: video.

Cut order: video → voice → Mono → lens charts. Never cut: crowd network, optimise loop, segment tabs.

## 10. Language

"Simulated market response", "early signal". Never "prediction".
