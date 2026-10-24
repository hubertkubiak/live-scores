import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatInTimeZone } from 'date-fns-tz';
import type { Match } from '@live-scores/shared';
import { buildApp } from '../src/app';
import { LiveHub } from '../src/live/hub';
import { MockProvider } from '../src/providers/mock';
import { AuthError, type ScoresProvider } from '../src/providers/types';

describe('REST API on the mock', () => {
  const hub = new LiveHub(new MockProvider({ minDelay: 1e9, maxDelay: 1e9 }), {
    snapshotRefreshMs: 1e9,
  });
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await hub.start();
    app = await buildApp(hub);
  });
  afterAll(async () => {
    hub.stop();
    await app.close();
  });

  it('GET /api/sports returns counts for all five categories', async () => {
    const res = await app.inject('/api/sports');
    const body = res.json<{ category: string; total: number; live: number }[]>();
    expect(body.map((c) => c.category)).toEqual([
      'football',
      'tennis',
      'basketball',
      'hockey',
      'other',
    ]);
    expect(body.every((c) => c.total > 0)).toBe(true);
  });

  it("GET /api/matches returns today's matches of a category", async () => {
    const date = formatInTimeZone(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd');
    const res = await app.inject(`/api/matches?category=other&date=${date}&tz=Europe/Warsaw`);
    expect(res.statusCode).toBe(200);
    const matches = res.json<Match[]>();
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.category === 'other')).toBe(true);
  });

  it('GET /api/matches validates its query', async () => {
    expect((await app.inject('/api/matches?category=chess')).statusCode).toBe(400);
    expect((await app.inject('/api/matches?category=football&tz=Mars/Base')).statusCode).toBe(400);
  });

  it('GET /api/health reports the provider', async () => {
    expect((await app.inject('/api/health')).json()).toEqual({
      provider: 'mock',
      upstream: 'connected',
      rateLimitRemaining: null,
    });
  });
});

describe('auth failure', () => {
  it('switches to mock data when the provider rejects the key', async () => {
    const failing: ScoresProvider = {
      name: 'sportsapipro',
      getToday: async () => {
        throw new AuthError(401);
      },
      subscribe: () => () => {},
      rateLimitRemaining: () => null,
    };
    const log = { info: () => {}, warn: () => {}, error: () => {} };
    const hub = new LiveHub(failing, {
      snapshotRefreshMs: 1e9,
      fallback: () => new MockProvider({ minDelay: 1e9, maxDelay: 1e9 }),
      log,
    });
    await hub.start();
    expect(hub.health().provider).toBe('mock');
    expect(hub.matchesFor('football').length).toBeGreaterThan(0);
    hub.stop();
  });
});
