# Crowdsight
Founders build great products. They fail at everything after.

**Test your launch on a thousand simulated people before you tell one.** Crowdsight runs an ad, a price change or a spec change past 1,000 personas grounded in the real market, then an optimiser agent rewrites it until the simulated market response stops improving.

**The loop:** 1. Ground the category on the live web (Tavily) · 2. 1,000 personas react in independent batches · 3. Code scores per segment and a weighted Launch Score · 4. The optimiser picks one lever (message, price, spec) and writes 3 variants · 5. Variants and the current input race on the same 200 personas · 6. Apply only on a +2 gain, confirm on all 1,000, stop after 3 iterations.

**Nebius Token Factory:** 6 open model families voice the crowd (Qwen, Gemma, DeepSeek, gpt-oss, MiniMax, Hermes/Llama), a strong model writes the market brief and runs the optimiser, a single-model mono run gives the Diversity baseline, and a vision model reads launch-video frames. Model IDs come from `GET /models` (`npm run models`), never hardcoded.

**Tavily:** competitor and pricing search, customer complaints, and category news become a market brief that every persona reacts inside, so skeptics compare you with real alternatives.

**Setup:** copy `.env.example` to `.env.local` and set `NEBIUS_BASE_URL`, `NEBIUS_API_KEY`, `TAVILY_API_KEY` · `npm i` · `npm run models` · `npm run dev` (port 3100). `NEBIUS_MOCK=1` runs the whole UI without keys.

**Demo:** run once, click Save demo, then open `/?demo=1` to replay the recorded run through the same event stream.

Simulated market response, an early signal. Not a forecast.
