# Live Scores

Today's sports results with live score updates over WebSocket. Built from [SPEC.md](SPEC.md).

```
web/     React 18 + Vite + Mantine 7, TanStack Query, Zustand        → http://localhost:5173
server/  Node proxy (Fastify + @fastify/websocket), holds the API key → http://localhost:8787
shared/  Match model, WebSocket message types, sorting/grouping helpers
```

## Run

```bash
npm install
npm run dev        # server (8787) + web (5173); opens on simulated data, no key needed
```

Open http://localhost:5173. Without a key the server uses `MockProvider` (about 20 matches
across all sports, with a score or status change every 3–8 s) and the UI shows a "Demo data" banner.

### Real data (SportsAPI Pro)

```bash
cp server/.env.example server/.env    # set SPORTS_API_KEY, DATA_PROVIDER=sportsapipro
npm run sample -w server              # SPEC task 0: saves real responses to server/fixtures/
npm run dev
```

The key stays in `server/.env`. The browser only talks to the proxy, and the proxy sends the key
in the `x-api-key` header. A 401/403 makes the server switch to mock data.

> **Unverified:** SPEC task 0 has not been run. The SportsAPI Pro status, clock, set-score,
> competition and sport-id field names in `server/src/providers/sportsApiPro.ts` are educated
> guesses marked `ASSUMED`. Run `npm run sample -w server` with a key and adjust `GameSchema` /
> `mapStatus` to the captured fixtures before relying on real data.

## Scripts

| Command                           | What it does                                 |
| --------------------------------- | -------------------------------------------- |
| `npm run dev`                     | Server + web with reload                     |
| `npm test`                        | Vitest in all packages                       |
| `npm run typecheck`               | `tsc` in all packages                        |
| `npm run lint` / `npm run format` | ESLint / Prettier                            |
| `npm run build`                   | Production build of the web app (`web/dist`) |

## Configuration (`server/.env`)

| Variable                   | Default                               |                                                  |
| -------------------------- | ------------------------------------- | ------------------------------------------------ |
| `SPORTS_API_KEY`           | –                                     | Without it the server runs on the mock           |
| `SPORTS_API_BASE`          | `https://v1.{sport}.sportsapipro.com` | `{sport}` is replaced per sport                  |
| `SPORTS_API_WS`            | football host + `/ws`                 | Upstream WebSocket URL                           |
| `DATA_PROVIDER`            | `mock`                                | `sportsapipro` or `mock`                         |
| `PORT`                     | `8787`                                |                                                  |
| `SNAPSHOT_REFRESH_MINUTES` | `10`                                  | REST snapshot refresh; each one costs 9 requests |

**Quota note:** with the SPEC's 10-minute refresh, 9 sports use about 54 requests an hour, so the
100/day free quota runs out in under two hours. After that the server stops making REST calls until
the reset and keeps going on WebSocket data only. For a long-running demo, raise
`SNAPSHOT_REFRESH_MINUTES` (e.g. `120`).

## Differences from SPEC

- `--color-muted` is `#5C6B61` rather than `#6B7A70`, because the SPEC value is 3.9:1 on
  `cream-100`, below the SPEC's own WCAG AA requirement. `green-500` (3.8:1 on cream) is used only
  for accents and icons, never for body text.
- Hockey uses Tabler's `IconIceSkating`, since Tabler has no hockey icon.
- The proxy serves `/api/matches` from the in-memory state that the periodic snapshot plus live
  updates keep current, instead of re-fetching per request on a 60 s TTL. This keeps REST usage
  independent of how many browsers are connected.
