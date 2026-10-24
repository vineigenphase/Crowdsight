# Crowdsight

**Founders build great products. They fail at everything after.**

Crowdsight tests an ad, a price or a product launch on 1,000 AI personas before you spend a pound. Each persona has a role, a personality and a stake in the startup. An optimiser agent then changes one thing at a time and re-tests until the crowd turns.

> Simulated market response. An early signal, not a prediction.

## Run it locally

You need nothing installed except Node (for a static server):

```bash
npm start          # serves on http://localhost:3000
```

or open `index.html` directly in Chrome. Use Chrome for voice mode: localhost counts as a secure context, so the microphone and the Web Speech API work there.

## What's in here

| File | What it does |
|---|---|
| `index.html` | Landing hero with the motto, how it works, and the workspace |
| `styles.css` | Light, bold design system (Bricolage Grotesque, Instrument Serif, Geist) |
| `app.js` | Workspace logic: test types, crowd simulation, click/buy funnel, optimiser loop, voice mode, details drawer, backend view of all 1,000 personas |

## Test types (sidebar)

- **General:** opinion split, top objections, best and worst quotes
- **Ads:** every persona either scrolls past, clicks, or clicks and buys. You get a funnel and click/buy rates per segment.
- **Pricing:** each persona names their max price. You get a demand curve with competitor prices marked.
- **Product launch:** who would try it within 30 days, by segment, plus objections

## Audience segments

| Segment | Default share | Importance |
|---|---|---|
| General population | 50% | ×1 |
| Target customers | 22% | ×2 |
| Domain experts | 12% | ×1.5 |
| Marketing experts | 8% | ×1 |
| Skeptics & loyalists | 8% | ×1 |

Each test type shifts the mix. For example, Ads raises marketing experts to 20%. You can adjust shares and importance in **Details → Segments**.

## Stack

- **Nebius Token Factory:** 6 open model families run the crowd (25 personas per call). A strong model writes the market brief and runs the optimiser. A one-model "mono" crowd is the baseline for the Diversity Score.
- **Tavily:** searches the live web for competitors, prices, complaints and news. The optimiser also uses it for evidence.

## Going live

This UI is served by the `crowdsight` Next.js app at `/web/index.html#app` and runs on the live backend:

1. `/api/ground` searches the market with Tavily and the Nebius strong model writes the brief.
2. `/api/personas` returns the exact 1,000 personas the server samples for the current segment shares.
3. `/api/crowd` streams real reactions from 6 Nebius model families; each dot recolours as its batch lands.
4. `/api/optimise` runs the agent loop (one lever, 3 variants, fair race on 200, confirm on 1,000) and ends with a final AI summary.

Personas without a real reaction are left out of every score. `clicked` and `bought` are derived from intent, share and max price.

Voice mode uses the browser's microphone plus Web Speech API. Where the mic is unavailable, it falls back to a sample pitch.

Built at the Noetic × Nebius One Day Hackathon, Imperial College London, 24 Oct 2026.
