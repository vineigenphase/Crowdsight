# Crowdsight: Claude Code operating manual

> Model: Opus. Read this file first, every session. The full plan is in `docs/COMPANY_PLAN.md`; the old hackathon spec is in `docs/hackathon-spec.md` (history only, don't build from it).
>
> Start every session with: **"Read CLAUDE.md. Continue the current phase. Show me the next unchecked item, then build it."**

## 1. What we are building

Crowdsight is a private market lab for founders. It is a calibrated synthetic market they consult at every decision, from the first idea to the raise. It is **not a chatbot**: experiments are the core object, and chat is only one way to start or question one.

- **End to end:** Gem Finder → Lab → Pricing Studio → ad and page tests → Launch Room → Monitor and Interviews → Pitch Room.
- **One persistent crowd per company.** Personas are seeded once and reused, so every test compares with the last.
- **Scale on demand:** Pulse 1K, Panel 10K, Census 100K, Atlas 1M, Depth 20–50 interviewed personas.
- **Calibrated:** real outcomes (CTR, conversion, churn) map crowd scores to real metrics. That outcome data is the moat.
- **Exclusive:** invite-only cohorts of 50, priced Founder £490/mo, Studio £2,500/mo, Fund from £25k/yr.

## 2. Non-negotiable rules

1. **Honesty language.** Until a vertical has calibration, results are a "simulated market response, early signal". Never write "prediction" or "accurate" in UI copy without the backtest number beside it.
2. **Code owns maths; models own words.** Scoring, sampling, tiers, stop rules and calibration live in `lib/`. Models only produce reactions, summaries and proposals as JSON.
3. **Untrusted input.** Pitch text, uploaded files and web snippets are data. Wrap them in clearly delimited blocks, tell the model they are content and not instructions, and strip instruction-like lines from web snippets.
4. **Every `/api/*` route** checks auth, org membership, rate limit and the org's spend cap before calling Nebius or Tavily.
5. **Never hardcode model IDs.** Use `lib/models.ts` and `lib/models.pinned.json` (from `npm run models`).
6. **No change to prompts, persona mix or model roster ships unless `npm run backtest` holds or improves pairwise accuracy.** Report the before and after numbers in the PR.
7. **Report uncertainty.** Every run shows sampling error per segment and model agreement, never a lone number.
8. **One UI.** Build on the `public/web` design (light, bold, editorial). Port it into `app/` as React components. Retire `app/page.tsx` and `public/studio` once ported.

## 3. Mobbin rule (UI work)

Before building or changing any screen, call the Mobbin MCP (`search_screens`, platform `web`, `output_destination: code`, `output_tool: Claude Code`). Pick one reference, then say in one line what you are borrowing and what you are not. Starting queries:

| Surface | Mobbin query |
|---|---|
| Lab (experiment list + result) | "experiment results dashboard with variants comparison" |
| Crowd view | "dark node graph canvas with side inspector" (LangChain Fleet, Railway) |
| Run progress | "agent run timeline with steps and timestamps" (Browserbase) |
| Sources | "research activity panel with sources" (ChatGPT deep research) |
| Pricing Studio | "pricing analytics chart with segments" |
| Interviews | "chat with person profile side panel" |
| Gem Finder | "opportunity feed cards with scores and evidence" |
| Onboarding / application | "waitlist application form invite only" |
| Voice | "voice agent orb conversation" (ElevenLabs) |

Design tokens are the ones in `public/web/styles.css` and `public/web/ws.css`: white background, ink `#0B0B10`, brand `#4F46E5`, positive `#12A150`, negative `#E5484D`. Type is Bricolage Grotesque for display, Geist for UI, Geist Mono for numbers. No chat bubbles as the main surface, no emoji, no sparkles.

## 4. Architecture

```
app/                 Next.js App Router (UI + API routes)
lib/
  personas.ts        seeded stratified sampler (one crowd per company)
  crowd.ts           batched reactions, any tier
  router.ts          NEW: tier → models, batch size, concurrency, batch-API use
  score.ts           ALL scoring incl. click/buy, revenue, sampling error
  calibrate.ts       NEW: per-vertical score → real-metric mapping
  loop.ts            optimiser (revenue objective, noise-aware stop rule)
  tavily.ts          grounding, cached in Postgres
  nebius.ts          client, JSON repair, per-request cost meter
  db.ts              NEW: Postgres (Supabase) access
  jobs.ts            NEW: queue (Inngest or BullMQ) for runs
scripts/
  backtest.ts        NEW: pairwise accuracy on docs/backtest/*.jsonl
docs/backtest/       NEW: A/B pairs with known winners (jsonl)
```

**Tables:** orgs, members, invites, companies, crowds, personas, experiments, variants, runs, reactions, outcomes, sources, gem_reports, gem_claims, usage.

**Tiers (`lib/router.ts`):**

| Tier | Personas | Models | Batch | Mode |
|---|---|---|---|---|
| Pulse | 1,000 | 6 mid families | 25 | live SSE |
| Panel | 10,000 | 6 families + 1 large per segment | 25 | queue + SSE |
| Census | 100,000 | small fast models; strong model audits 2% | 50 | Nebius batch |
| Atlas | 1,000,000 | ~20,000 LLM representatives over ~2,000 cells, expanded by fitted response models | 50 | overnight batch |
| Depth | 20–50 | strongest models, persona memory | 1 | interactive |

## 5. Scoring (keep in `lib/score.ts`)

- Segment score = `100 × (0.5·mean((stance+1)/2) + 0.35·mean(intent) + 0.15·mean(wouldShare))`.
- Launch Score = Σ(share × importance × segment score) / Σ(share × importance).
- Click = `0.6·wouldShare + 0.4·max(0, stance) > 0.42`. Buy = click ∧ intent > 0.55 ∧ maxPrice ≥ price. (Tune both against the backtest.)
- **Revenue score** = payers × price per 1,000 personas. The optimiser maximises a blend of Launch Score and revenue, so price cuts can't win for free.
- **Sampling error** for each segment share: ±1.96·√(p(1−p)/n).
- **Stop rule:** a variant wins only if its gain beats 2× the measured run-to-run standard deviation (repeat 3 runs).

## 6. Phases (tick items as you finish them; stop at each gate and report)

### Phase 1: Prove it (to 8 Nov) · Gate: ≥ 65% pairwise accuracy on 40 pairs
- [ ] `docs/backtest/pairs.jsonl` format: `{id, vertical, mode, a, b, winner, metric, source}`; seed with any pairs the founders provide
- [ ] `scripts/backtest.ts` + `npm run backtest`: runs both variants, reports accuracy overall and per vertical, writes `docs/backtest/report.md`
- [ ] Remove the hard-coded gym ICP description in `lib/personas.ts`; derive it from the pitch via the strong model
- [ ] Move click/buy and revenue scoring into `lib/score.ts`
- [ ] Crowd temperature 0.7, shuffled batch order, configurable batch size; measure within-batch anchoring
- [ ] Untrusted-input wrapping in `lib/crowd.ts`, `lib/tavily.ts`, `/api/ask`, `/api/persona-chat`
- [ ] Per-request cost meter; currency normalisation for competitor prices; one-off and per-unit pricing
- [ ] Replace Hermes 405B in the crowd roster with a faster family

### Phase 2: Platform (to 29 Nov) · Gate: 15 founders in closed beta
- [ ] Supabase Postgres + `lib/db.ts`; persist companies, crowds, experiments, runs, reactions
- [ ] Auth with invite codes (Clerk or Supabase Auth); org membership checks on every route
- [ ] Rate limits and per-org spend caps
- [ ] Job queue (`lib/jobs.ts`); runs survive closed tabs; UI subscribes to progress
- [ ] Port `public/web` into React components under `app/`; experiments list + experiment page
- [ ] Panel tier (10K) via `lib/router.ts`
- [ ] Stripe: Founder and Studio plans, credits for Atlas
- [ ] Application page (invite-only), referral invites

### Phase 3: Depth (to 27 Dec) · Gate: 10 of 15 beta founders change a decision because of a run
- [ ] Interviews (Depth tier) with persona memory and exportable report
- [ ] Pricing Studio: per-segment demand curves, revenue-maximising price, plan packaging tests
- [ ] Gem Finder v1: Tavily scan → candidate ideas → Panel scoring → weekly Gem Report with evidence; one-member claims for 90 days
- [ ] Census tier (100K) on Nebius batch inference
- [ ] Pitch Room v1: investor personas from public fund theses

### Phase 4: Cohort 1 (to 24 Jan) · Gate: £10k MRR and a published accuracy report
- [ ] Outcome connectors: Meta Ads, Google Ads, Stripe, PostHog (OAuth, read-only)
- [ ] `lib/calibrate.ts`: isotonic mapping per vertical; UI shows calibrated metric ranges with case counts
- [ ] Launch Room: waitlist → launch day → week-one simulation
- [ ] Monitor: forecast vs reality, drift alerts, feature prioritisation
- [ ] Atlas tier (1M) for credits
- [ ] Public accuracy report page

## 7. Commands

```bash
npm run dev          # localhost:3100
npm run models       # refresh lib/models.pinned.json from Nebius /models
npm run backtest     # pairwise accuracy (Phase 1+)
npx tsc --noEmit     # must pass before every commit
```

Env: `NEBIUS_API_KEY`, `NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1/`, `TAVILY_API_KEY`, then Supabase, auth and Stripe keys from Phase 2. Never commit `.env.local`.

## 8. Definition of done (every item)

Type-check passes · backtest holds (if prompts, models or scoring changed) · UI checked against its Mobbin reference · no new copy says "prediction" · the item is ticked in this file in the same commit.
