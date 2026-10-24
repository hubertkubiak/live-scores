# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Live sports scores demo: React app + Node proxy that relays SportsAPI Pro data (or a mock) over WebSocket. `SPEC.md` is the source of requirements (IDs F1–F10, REST/WS contracts in §7, colour tokens in §8); `README.md` lists the deliberate deviations from it.

## Commands

npm workspaces (`shared`, `server`, `web`), Node ≥ 20.12. Run from the repo root:

```bash
npm run dev          # server :8787 (tsx watch) + web :5173 (Vite); mock data without a key
npm test             # vitest run in every workspace
npm run typecheck    # tsc --noEmit in every workspace
npm run lint         # eslint .
npm run format       # prettier --write . (single quotes, width 100, trailing commas)
npm run build        # web only: tsc + vite build → web/dist
npm run sample -w server   # SPEC task 0: capture real API responses into server/fixtures/ (needs key)
```

Single test file / single test:

```bash
npm test -w server -- test/live.test.ts
npm test -w web -- src/components/MatchRow.test.tsx -t "flash"
```

There is no build step for `server` or `shared`: the server runs TypeScript through `tsx`, and `shared` exports `./src/index.ts` directly, so both server and web import `@live-scores/shared` as source.

## Architecture

```
SportsAPI Pro (REST snapshot + upstream WS)  ─┐
MockProvider (simulated changes every 3–8 s) ─┴→ ScoresProvider → LiveHub → Fastify /api + /ws → browser
```

**shared/** — the only data model the UI knows: `Match`, `SportCategory`, `MatchStatus`, `ClientMessage`/`ServerMessage` WS unions, sport→category mapping (`categoryOf`, `sportsOf`, `ALL_SPORTS`), and sorting/grouping helpers used by the web list. Change message or model shapes here and both sides follow.

**server/**
- `src/index.ts` picks the provider (`config.ts`: real provider only when `DATA_PROVIDER=sportsapipro` *and* a key is set) and wires `LiveHub` + `buildApp`.
- `src/app.ts` (`buildApp(hub)`) defines routes; tests use `app.inject()` against a `LiveHub` on `MockProvider` (pass huge `minDelay`/`maxDelay`/`snapshotRefreshMs` to freeze it).
- `src/live/hub.ts` `LiveHub` is the core: one provider subscription for the whole server, in-memory `MatchState`, per-client category subscription, fan-out. `/api/matches` is served from this state, not by re-fetching upstream. It refreshes REST snapshots for all 9 sports at startup and every `SNAPSHOT_REFRESH_MINUTES`; `AuthError` swaps in the mock provider at runtime, `RateLimitError` stops REST until reset while WS data keeps flowing.
- `src/live/diff.ts` `MatchState` fingerprints matches excluding `updatedAt`, so only real changes become `patch` messages. `replaceSport` treats a snapshot as authoritative and drops missing matches.
- `src/providers/` — `ScoresProvider` interface + typed errors in `types.ts`. `sportsApiPro.ts` holds the Zod `GameSchema` and `mapStatus`; many field names are **ASSUMED** (not yet verified against real responses — see README / `server/fixtures/README.md`). Unknown statuses must map to `scheduled`, never live.

**web/**
- `src/api/useLiveScores.ts` implements SPEC §7 client rules: TanStack Query REST snapshot + `LiveSocket` patches merged into the Zustand store, polling fallback when the socket is silent 60 s or down 30 s, socket closed after 5 min in a background tab.
- `src/api/socket.ts` `LiveSocket` handles reconnect with backoff (same schedule as server `live/backoff.ts`), resubscribes after reconnect (server replies with a fresh snapshot), 25 s ping.
- `src/store/matches.ts` — matches indexed by id; both `replaceCategory` and `mergeMatches` keep whichever copy has the newer `updatedAt`, because REST snapshots can arrive after newer WS patches.
- Vite proxies `/api` and `/ws` to the server, so the browser never sees the API key.
- Styling: colours are CSS variables in `src/theme/tokens.css` plus the Mantine `forest` palette in `theme.ts`; don't hard-code colours in components. Components use CSS Modules.
- Tests run in jsdom (`src/test/setup.ts` stubs `matchMedia`/`ResizeObserver` for Mantine). Render components with `renderWithTheme` from `src/test/render.tsx`; shared `Match` builders are in `src/test/fixtures.ts`. Hook tests use MSW for REST and `mock-socket` for WebSocket.

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`; unused vars/args must be prefixed `_`.
- REST quota is the main constraint (100 requests/day free; each snapshot refresh costs 9). Keep live updates on WebSocket and don't add per-request upstream fetches.
- `server/.env` (git-ignored, copy from `.env.example`) holds `SPORTS_API_KEY`; it must never reach web code.
