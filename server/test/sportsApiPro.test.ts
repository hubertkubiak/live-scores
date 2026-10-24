import { describe, expect, it, vi } from 'vitest';
import {
  mapStatus,
  parseEnvelope,
  SportsApiProProvider,
  toMatch,
} from '../src/providers/sportsApiPro';
import { AuthError, RateLimitError } from '../src/providers/types';

// Hand-written payloads following the ASSUMED field names; replace with server/fixtures/*.json
// once task 0 has captured real responses.
const envelope = {
  success: true,
  type: 'games',
  cacheHit: false,
  sport: 'tennis',
  ttl: 5,
  data: {
    countries: [{ id: 7, name: 'Austria' }],
    competitions: [{ id: 42, name: 'ATP Vienna', countryId: 7 }],
    games: [
      {
        id: 1001,
        competitionId: 42,
        startTime: '2026-10-24T10:00:00+00:00',
        statusGroup: 3,
        statusText: 'Set 3',
        homeCompetitor: { name: 'H. Hurkacz', score: 1 },
        awayCompetitor: { name: 'J. Sinner', score: 1 },
        stages: [
          { name: 'Set 1', homeCompetitorScore: 6, awayCompetitorScore: 4 },
          { name: 'Set 2', homeCompetitorScore: 3, awayCompetitorScore: 6 },
          { name: 'Set 3', homeCompetitorScore: 2, awayCompetitorScore: 1 },
        ],
      },
      { id: 1002, startTime: 'x', homeCompetitor: { name: 'Missing away' } },
      {
        id: 1003,
        competitionId: 42,
        startTime: '2026-10-24T16:00:00Z',
        statusGroup: 2,
        homeCompetitor: { name: 'C. Ruud', score: -1 },
        awayCompetitor: { name: 'T. Fritz', score: -1 },
      },
    ],
  },
};

const quiet = () => {};

describe('SportsAPI Pro adapter', () => {
  it('rejects only the invalid game and keeps the rest', () => {
    const parsed = parseEnvelope(envelope, quiet);
    expect(parsed.games.map((g) => g.id)).toEqual([1001, 1003]);
    expect(parsed.rejected).toBe(1);
  });

  it('maps tennis set scores, competition and country', () => {
    const { games, competitions } = parseEnvelope(envelope, quiet);
    const m = toMatch(games[0]!, 'tennis', competitions, 5, quiet);
    expect(m).toMatchObject({
      id: 'sportsapipro:tennis:1001',
      category: 'tennis',
      competition: { id: 'tennis:42', name: 'ATP Vienna', country: 'Austria' },
      home: { name: 'H. Hurkacz', score: 1 },
      periodScores: [
        { home: 6, away: 4 },
        { home: 3, away: 6 },
        { home: 2, away: 1 },
      ],
      status: 'live',
      statusLabel: 'Set 3',
      startTime: '2026-10-24T10:00:00.000Z',
    });
  });

  it('treats a negative score as no score', () => {
    const { games, competitions } = parseEnvelope(envelope, quiet);
    const m = toMatch(games[1]!, 'tennis', competitions, 5, quiet);
    expect(m.home.score).toBeNull();
    expect(m.status).toBe('scheduled');
  });

  it('maps "other" sports to the other category', () => {
    const { games, competitions } = parseEnvelope(envelope, quiet);
    expect(toMatch(games[1]!, 'handball', competitions, 5, quiet).category).toBe('other');
  });

  it.each([
    [{ statusGroup: 3, shortStatusText: 'HT' }, 'break'],
    [{ statusGroup: 3, statusText: 'Intermission' }, 'break'],
    [{ statusGroup: 3, statusText: "67'" }, 'live'],
    [{ statusGroup: 4, statusText: 'Ended' }, 'finished'],
    [{ statusGroup: 2, statusText: 'Postponed' }, 'postponed'],
    [{ statusGroup: 4, statusText: 'Cancelled' }, 'cancelled'],
  ] as const)('maps status %o to %s', (fields, expected) => {
    const game = parseEnvelope(envelope, quiet).games[1]!;
    expect(mapStatus({ ...game, ...fields }, quiet)).toBe(expected);
  });

  it('logs unknown statuses and never treats them as live', () => {
    const warn = vi.fn();
    const game = parseEnvelope(envelope, quiet).games[1]!;
    expect(mapStatus({ ...game, statusGroup: 99 }, warn)).toBe('scheduled');
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('SportsApiProProvider REST', () => {
  const respond = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));

  it('sends the key in a header, never in the URL', async () => {
    const fetch = respond(200, envelope, { 'X-RateLimit-Remaining': '97' });
    const provider = new SportsApiProProvider({
      apiKey: 'secret',
      baseUrl: 'https://v1.{sport}.example',
      fetch,
    });
    vi.spyOn(console, 'warn').mockImplementation(quiet);
    const matches = await provider.getToday('tennis');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://v1.tennis.example/games/current');
    expect(init.headers).toEqual({ 'x-api-key': 'secret' });
    expect(matches).toHaveLength(2);
    expect(provider.rateLimitRemaining()).toBe(97);
  });

  it('stops REST calls after a 429 until the reset time', async () => {
    const reset = Math.floor(Date.now() / 1000) + 3600;
    const fetch = respond(429, { error: 'RATE_LIMITED' }, { 'X-RateLimit-Reset': String(reset) });
    const provider = new SportsApiProProvider({ apiKey: 'k', baseUrl: 'https://{sport}', fetch });
    await expect(provider.getToday('football')).rejects.toBeInstanceOf(RateLimitError);
    await expect(provider.getToday('hockey')).rejects.toMatchObject({ resetAt: reset * 1000 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports 401/403 as an auth error', async () => {
    const provider = new SportsApiProProvider({
      apiKey: 'k',
      baseUrl: 'https://{sport}',
      fetch: respond(403),
    });
    await expect(provider.getToday('football')).rejects.toBeInstanceOf(AuthError);
  });
});
