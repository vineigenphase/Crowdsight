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

The UI runs on a deterministic simulated engine so it demos anywhere. To connect the real backend (the `crowdsight` Next.js repo):

1. Serve these files from that app, e.g. copy them into `public/`.
2. In `app.js`, replace the batch loop in `startRun()` with a `fetch('/api/crowd')` SSE reader. Map `batch_done.reactions` onto `reacted` and the reaction fields.
3. Replace `optimise()` with `/api/optimise` and render its `proposal`, `variant_done` and `apply` events into the loop rows.
4. Add `clicked` and `bought` to the reaction schema in `lib/crowd.ts`.

Voice mode uses the browser's microphone plus Web Speech API. Where the mic is unavailable, it falls back to a sample pitch.

Built at the Noetic × Nebius One Day Hackathon, Imperial College London, 24 Oct 2026.
