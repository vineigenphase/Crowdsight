# Crowdsight: models and Nebius access

Status as of 2026-10-26. Every model call goes through Nebius Token Factory (`https://api.tokenfactory.nebius.com/v1/`) via the OpenAI SDK. The roster is pinned in `lib/models.pinned.json`, written by `npm run models` and editable by hand. Env overrides: `NEBIUS_CROWD_MODELS`, `NEBIUS_STRONG_MODEL`, `NEBIUS_VISION_MODEL`, `NEBIUS_MONO_MODEL`.

## Roster

| Role | Model | Used for | Live check (2026-10-26) |
|---|---|---|---|
| Crowd 1 + mono | `Qwen/Qwen3-30B-A3B-Instruct-2507` | Persona reactions; single-model Diversity baseline | OK, 157ms |
| Crowd 2 | `google/gemma-3-27b-it` | Persona reactions | OK, 379ms (times out under load, see below) |
| Crowd 3 | `deepseek-ai/DeepSeek-V4.1-Flash-1017` | Persona reactions | OK, 499ms |
| Crowd 4 | `openai/gpt-oss-120b` | Persona reactions | OK, 292ms |
| Crowd 5 | `MiniMaxAI/MiniMax-M3.1-Flash` | Persona reactions | OK, 541ms |
| Crowd 6 | `NousResearch/Hermes-4-405B` | Persona reactions | OK, 301ms |
| Strong | `Qwen/Qwen3-235B-A22B-Instruct-2507` | Optimiser (`lib/loop.ts`), final summary, Tavily market brief and category (`lib/tavily.ts`), `/api/ask`, persona chat | OK, 471ms |
| Vision | `nvidia/Nemotron-3.5-Super-VL` | Launch-video frames (`/api/video`) | OK, 585ms |

Persona `p` is voiced by `crowd[p.model % 6]` (`lib/crowd.ts`); mono runs use `mono` for all 1,000.

## Known issue: Gemma under load

In the last dev session `google/gemma-3-27b-it` logged 446 retry attempts (other crowd models 150 to 180), mostly `Request timed out`. Full 1,000-persona `/api/crowd` runs took 125 to 145s against the 60s target. A single call answers fast, so the model is up; it fails under parallel batch load. Options: swap it for another family, or give it lower per-model concurrency.

## Swap candidates in the catalogue (30 models)

- Crowd: `zai-org/GLM-5.3-Flash`, `nvidia/Nemotron-3_5-Lightning`, `moonshotai/Kimi-K2.6`, `Qwen/Qwen3.8-27B`
- Strong: `deepseek-ai/DeepSeek-V4-Pro`, `Qwen/Qwen3.5-397B-A17B`

## Real-time access

- **In the app:** `GET /api/status` returns ping latency, the roster and model families.
- **From a shell:** `NEBIUS_BASE_URL` and `NEBIUS_API_KEY` in `.env.local` (git-ignored) give direct API access; `npm run models` lists the live catalogue and re-pins the roster.
- There is no Nebius MCP server; direct API access with the project key is the chosen route.
