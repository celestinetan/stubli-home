# How Stubli Home works

The setup steps are in the [README](README.md). This page explains how the parts fit together,
for anyone who wants to change or extend the dashboard.

## The parts

| Area | What it shows | Source |
|---|---|---|
| Header | Clock; current weather with "before you go" advice; next 6 hours and 3 days | In Switzerland MeteoSwiss's forecast and warnings (unofficial app feed); elsewhere Open-Meteo |
| Your day | Next up, today's events, the next 3 days, holidays, your own items | iCal links you add, OpenHolidays API |
| News | Top stories and a card per topic; tap for sources and summary | RSS feeds you choose, grouped, ranked and translated by Gemini (optional) |
| What's on | Your own items, plus optional sources (today, weekend, 7 days); free ones first | Your list; Kultur Züri and Zürich venues (optional) |
| Ticker | Weather warnings, rain alerts and top headlines | The same news and weather data |
| Bottom bar | Now playing and whole-home moods (optional) | Sonos Control API, Philips Hue Remote API |

Everything runs on one Cloudflare Worker on the free plan. It fetches each source on a schedule
and keeps the results in Workers KV, so the tablet only ever talks to your own dashboard.

- `worker/`: the server. `config.ts` holds the defaults, `settings.ts` lays your saved settings
  over them, and there is one file per source (`weather.ts`, `calendar.ts`, `news.ts`, `events.ts`,
  `local.ts`, `sonos.ts`, `hue.ts`).
- `web/`: the screen, built with Preact and Vite for Safari 16 and Chrome 105 or later.

## Who can open it

- **Pairing (default):** a new dashboard is locked. Each device is paired once with a code: the
  `PAIRING_SECRET` set at deploy time or, if there is none, the code chosen by the first person who
  opens the dashboard. A paired device stays paired for about a year.
- **Cloudflare Access (optional):** sign in with your email instead. In Cloudflare Zero Trust, add
  a self-hosted application for your dashboard's address with a policy for your email, then add
  the secret `ACCESS_PROTECTED` with the value `true` so the dashboard stops asking for a pairing
  code. You can add a "Bypass" policy for your home network's IP addresses so the wall tablet
  never has to sign in, and set the session length to a month.
- **Settings PIN (optional):** with a `SETTINGS_PIN` secret, saving settings needs the PIN even on a paired device.

## Secrets

Set these in Cloudflare (Workers and Pages, your dashboard, Settings, Variables and Secrets) or
with `npx wrangler secret put NAME`. None of them are needed to get started.

| Name | What |
|---|---|
| `PAIRING_SECRET` | The pairing code, if you prefer to set it at deploy time |
| `ACCESS_PROTECTED` | `true` when Cloudflare Access guards the dashboard |
| `SETTINGS_PIN` | A PIN needed to save settings |
| `SONOS_CLIENT_ID`, `SONOS_CLIENT_SECRET` | Sonos developer integration (Smart home, redirect `…/auth/sonos/callback`) |
| `HUE_CLIENT_ID`, `HUE_CLIENT_SECRET` | Hue Remote API app (callback `…/auth/hue/callback`) |

Calendar links and the Gemini key are added in Settings and stored in KV, never in the code.

## Changing the defaults

Most things are in Settings. A few only in code:

- `news.categories`, `news.ranking`, `news.blockKeywords` in `worker/config.ts`: the topic cards,
  how stories are ranked and topics to mute.
- Hue moods: `HOME_PRESETS` in `worker/hue.ts`.

Then run `npm run deploy`, or push to your GitHub copy if you deployed with the button.

## Commands

- `npm run deploy`: build and publish
- `npm run dev`: run locally at http://localhost:8787 (local secrets go in `.dev.vars`; see `.dev.vars.example`)
- `npx wrangler tail`: live server logs
- `/health` on your dashboard: when each source last updated, and recent errors

## Free-plan limits it's designed around

- About 50 outbound requests per run: news is collected in two halves a few minutes apart.
- Gemini runs at most every 30 minutes and streams its answer (long answers otherwise time out).
- One schedule that fires 16 times an hour and does a different job each time (news in two halves,
  calendar plus events, weather). The free plan allows only five schedules per account, shared by all your workers.
