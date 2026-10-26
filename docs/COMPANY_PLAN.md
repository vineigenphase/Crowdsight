# Crowdsight: Company Plan

*26 Oct 2026*

## Thesis

**Crowdsight becomes a private market lab: a calibrated synthetic market that founders consult at every decision, from the first idea to the Series A.** It is not a chatbot. It is a simulator that keeps answering one question: *what will the market do if I do this?*

**Today (hackathon, 24 Oct 2026):** 1,000 personas, 6 Nebius model families, Tavily grounding, an optimiser loop, segment and persona chat, and a phone layout. It works on any pitch, but it hasn't yet been proven against real outcomes.

**What it becomes:**
- **End to end:** finding the idea, naming, pricing, ads, launch, feature priorities, churn and the fundraise all run on the same crowd, so results compound.
- **Scale on demand:** 1,000 to 1,000,000 personas. Cheap models give breadth, strong models give depth.
- **Calibrated:** real customer outcomes map crowd scores to real numbers. That outcome dataset is the moat.
- **Exclusive:** invite-only, capped cohorts, priced like a research firm.

| Buyer | Job | Willingness to pay |
|---|---|---|
| Venture-backed founders (pre-seed to A) | De-risk launch, pricing and fundraise decisions | High |
| Venture studios and accelerators | Find and filter ideas before funding them | Very high |
| Growth teams at scale-ups | Pre-test every ad and price change | High, recurring |
| VCs (later) | Pressure-test portfolio go-to-market | Very high, low volume |

## End to end

Find the idea (Gem Finder) → Validate (Lab) → Position and price (Pricing Studio) → Pre-launch (ad and page tests) → Launch (Launch Room) → Grow (Monitor and Interviews) → Raise (Pitch Room).

One persistent crowd per company sits under every stage, and real outcomes from launch and growth recalibrate it.

## Crowd scale tiers

| Tier | Personas | Models (Nebius) | Runs as | Est. cost | Time | Use |
|---|---|---|---|---|---|---|
| Pulse | 1,000 | 6 mid families, 25 per call | live | ~$0.10 | 1–2 min | Quick copy and price checks |
| Panel | 10,000 | 6 families + 1 large per segment | queue | ~$1 | 5–8 min | Segment results to about ±2 points |
| Census | 100,000 | small fast models, 50 per call, 2% strong-model audit | batch | ~$3–5 | 20–40 min | Niche sub-segments, regions |
| Atlas | 1,000,000 | ~20,000 LLM representatives across ~2,000 cells, expanded by fitted response models | overnight | ~$5–10 | overnight | Market sizing, region × segment maps |
| Depth | 20–50 | strongest models, persona memory | interactive | ~$0.50 per interview | live | Interviews |

At 1,000 personas the target-customer segment is about 220 people, which means about ±6.6 points of sampling error on a share. At 10,000 it's about ±2.1. That's sampling error only. Whether the crowd's answers match real people is the truth layer's job.

## The truth layer

1. **Backtest corpus:** A/B tests, landing-page variants, price changes and launches where the real winner is known. Target 200 pairs before the paid launch.
2. **Pairwise accuracy:** how often the crowd picks the real winner. The bar to sell is 65%+, published per vertical.
3. **Outcome connectors:** Meta Ads, Google Ads, Stripe and PostHog feed real results back.
4. **Calibration model:** a per-vertical mapping (isotonic regression to start) from crowd score to real metric, shown with intervals and case counts.
5. **Crowd tuning:** prompts, mixes and models are tuned only against the corpus.

**Moat:** thousands of (simulated reaction, real outcome) pairs across verticals. Customers who share their outcomes get a lower price.

## Product surfaces

| Surface | Founder does | Crowdsight does |
|---|---|---|
| Gem Finder | Picks a space | Scans reviews, Reddit, forums and news for unmet pain; generates ideas; scores them on a Panel crowd; sends a weekly Gem Report with evidence |
| Lab | A/B/n tests copy, price, features, names | Same-crowd tests with sampling error; the optimiser proposes the next variant |
| Pricing Studio | Sets candidate prices and plans | Per-segment demand curves, revenue-maximising price, packaging tests, competitor anchors |
| Interviews | Talks to a segment or a persona | Depth-tier personas with memory; exportable report |
| Launch Room | Plans the launch | Simulates waitlist → launch day → week one |
| Monitor | Connects real data | Forecast vs reality, drift, feature prioritisation, churn fixes |
| Pitch Room | Rehearses the raise | Investor personas from real fund theses; objections and slide scores |

**Gem allocation:** each gem is offered to one member. If they claim it, it's hidden from the rest of the cohort for 90 days.

## Exclusivity and pricing

| Tier | Price | Seats | Includes |
|---|---|---|---|
| Founder | £490/mo | 1 | 30 Panel runs, Interviews, Pricing Studio, monthly Gem Report |
| Studio | £2,500/mo | 5 | Census runs, weekly Gem Report with first claim, Launch Room, Pitch Room |
| Fund / Enterprise | from £25k/yr | custom | Portfolio access, Atlas runs, calibrated metrics |
| Credits | £250 per Atlas run | — | Million-persona market maps |

**How access works:**
- Application plus a call; cohorts of 50 each quarter.
- Two referral invites per member.
- 20% off for sharing outcomes.
- First 15 founders free for 6 weeks in exchange for outcome data.

At 50 members (40 Founder, 10 Studio), that's about £44.6k MRR. Token cost at full usage is roughly £2–3k a month, around 5% of revenue.

## Architecture and audit fixes

**Architecture:**
- Next.js plus one UI ported from `public/web`
- Supabase Postgres
- a job queue (Inngest or BullMQ)
- a model router per tier, using Nebius batch inference for Census and Atlas
- Tavily with a Postgres cache
- invite-code auth, Stripe, per-org budgets
- a backtest harness in CI
- tracing and cost observability

**Audit fixes (25 Oct):**
1. Auth, rate limits and spend caps on every API route.
2. Treat pitch text and web snippets as untrusted data.
3. Remove the hard-coded gym ICP description.
4. Move all scoring into `lib/score.ts`.
5. Score revenue, not sentiment alone.
6. Use a noise-aware stop rule instead of a fixed 2 points.
7. Temperature 0.7, shuffled batches, measured batch anchoring.
8. A per-request cost meter; a persistent Tavily cache.
9. Currency normalisation; one-off and per-unit pricing.
10. Replace Hermes 405B in the crowd.

## 90-day roadmap

| Phase | Dates | Build | Gate |
|---|---|---|---|
| Prove it | 26 Oct – 8 Nov | Backtest 40 pairs, scoring and noise fixes, auth and injection fixes | ≥ 65% pairwise accuracy |
| Platform | 9 – 29 Nov | Postgres, queue, auth, one UI, Panel tier, Stripe, invites | 15 founders in beta |
| Depth | 30 Nov – 27 Dec | Interviews, Pricing Studio, Gem Finder v1, Census tier, Pitch Room v1 | 10 of 15 change a decision |
| Cohort 1 | 28 Dec – 24 Jan | Outcome connectors, calibration v1, Launch Room, Monitor, Atlas | £10k MRR + public accuracy report |

**If gate 1 fails:** stop building features and fix the model first.

**Weekly metrics:**
- backtest accuracy per vertical
- runs per active founder
- share of runs that changed a decision
- outcome connections
- MRR
- token cost as a share of revenue

## Running it in Claude Code

See `CLAUDE.md`. Open the repo in Claude Code (Opus) with the Mobbin MCP connected, and start each session with: *"Read CLAUDE.md. Continue the current phase. Show me the next unchecked item, then build it."*
