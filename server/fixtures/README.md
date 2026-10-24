# Fixtures

Real SportsAPI Pro responses captured by `npm run sample -w server` (SPEC task 0) go here.
None have been captured yet, so `test/sportsApiPro.test.ts` uses hand-written payloads that
follow the *assumed* field names. Once real files exist, add tests that load them and fix
`GameSchema` / `mapStatus` in `src/providers/sportsApiPro.ts` to match.
