import { describe, expect, it } from 'vitest';
import type { Match, ServerMessage } from '@live-scores/shared';
import { backoffDelay } from '../src/live/backoff';
import { MatchState } from '../src/live/diff';
import { LiveHub } from '../src/live/hub';
import { MockProvider } from '../src/providers/mock';
import type { ScoresProvider } from '../src/providers/types';

function match(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    sport: 'football',
    category: 'football',
    competition: { id: 'c1', name: 'League' },
    home: { name: 'A', score: 0 },
    away: { name: 'B', score: 0 },
    status: 'live',
    statusLabel: '10′',
    startTime: '2026-10-24T12:00:00.000Z',
    updatedAt: 1,
    ...overrides,
  };
}

describe('MatchState diff', () => {
  it('a score change produces exactly one changed match', () => {
    const state = new MatchState();
    state.apply([match('1'), match('2')]);
    const changed = state.apply([
      match('1', { home: { name: 'A', score: 1 } }),
      match('2', { updatedAt: 999 }),
    ]);
    expect(changed.map((m) => m.id)).toEqual(['1']);
  });

  it('no change produces nothing, even with a newer updatedAt', () => {
    const state = new MatchState();
    state.apply([match('1')]);
    expect(state.apply([match('1', { updatedAt: 2 })])).toEqual([]);
  });

  it('a sport snapshot drops matches it no longer contains', () => {
    const state = new MatchState();
    state.apply([match('1'), match('2'), match('t', { sport: 'tennis', category: 'tennis' })]);
    state.replaceSport('football', [match('1')]);
    expect(
      state
        .all()
        .map((m) => m.id)
        .sort(),
    ).toEqual(['1', 't']);
  });
});

/** A provider the test drives by hand. */
function manualProvider(initial: Match[]) {
  let push: (matches: Match[]) => void = () => {};
  const provider: ScoresProvider = {
    name: 'mock',
    getToday: async (sport) => initial.filter((m) => m.sport === sport),
    subscribe: (fn) => {
      push = fn;
      return () => {};
    },
    rateLimitRemaining: () => null,
  };
  return { provider, push: (m: Match[]) => push(m) };
}

describe('LiveHub', () => {
  it('sends a snapshot on subscribe and patches only to clients of that category', async () => {
    const tennis = match('t', { sport: 'tennis', category: 'tennis' });
    const { provider, push } = manualProvider([match('1'), tennis]);
    const hub = new LiveHub(provider, { snapshotRefreshMs: 60_000 });
    await hub.start();

    const football: ServerMessage[] = [];
    const tennisClient: ServerMessage[] = [];
    hub.addClient((m) => football.push(m)).subscribe('football');
    hub.addClient((m) => tennisClient.push(m)).subscribe('tennis');

    expect(football[0]).toMatchObject({ type: 'snapshot', category: 'football' });
    expect(football.find((m) => m.type === 'counts')).toMatchObject({
      counts: { football: 1, tennis: 1 },
    });

    football.length = 0;
    tennisClient.length = 0;
    push([match('1', { home: { name: 'A', score: 1 } })]);

    expect(football).toEqual([
      expect.objectContaining({ type: 'patch', matches: [expect.objectContaining({ id: '1' })] }),
    ]);
    expect(tennisClient).toEqual([]);

    // Same data again: no message at all.
    push([match('1', { home: { name: 'A', score: 1 } })]);
    expect(football).toHaveLength(1);

    // Finishing the match changes the live count, which every client gets.
    push([match('1', { home: { name: 'A', score: 1 }, status: 'finished', statusLabel: 'FT' })]);
    expect(tennisClient).toEqual([
      { type: 'counts', counts: expect.objectContaining({ football: 0 }) },
    ]);
    hub.stop();
  });
});

describe('MockProvider', () => {
  it('generates about 20 matches for today, covering every sidebar category', async () => {
    const mock = new MockProvider();
    const sports = [
      'football',
      'tennis',
      'basketball',
      'hockey',
      'handball',
      'volleyball',
      'baseball',
      'rugby',
      'american-football',
    ];
    const all = (await Promise.all(sports.map((s) => mock.getToday(s)))).flat();
    expect(all.length).toBeGreaterThanOrEqual(18);
    expect(all.length).toBeLessThanOrEqual(24);
    expect(new Set(all.map((m) => m.category))).toEqual(
      new Set(['football', 'tennis', 'basketball', 'hockey', 'other']),
    );
    for (const m of all) {
      if (m.status === 'scheduled') expect(m.home.score).toBeNull();
      else expect(m.home.score).not.toBeNull();
    }
  });

  it('tennis scores count sets and keep per-set games', async () => {
    const mock = new MockProvider();
    for (let i = 0; i < 200; i++) mock.tick();
    for (const m of await mock.getToday('tennis')) {
      if (m.status === 'scheduled') continue;
      const setsWon = (m.periodScores ?? []).filter(
        (s) => (s.home >= 6 && s.home - s.away >= 2) || (s.home === 7 && s.away === 6),
      ).length;
      expect(m.home.score).toBe(setsWon);
    }
  });

  it('every tick changes at least one match while any is live', () => {
    const mock = new MockProvider();
    expect(mock.tick().length).toBeGreaterThan(0);
  });
});

describe('backoffDelay', () => {
  it('doubles from 1 s and caps at 30 s', () => {
    const noJitter = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 6].map((a) => backoffDelay(a, noJitter))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
    expect(backoffDelay(10, () => 1)).toBe(30_000);
    expect(backoffDelay(0, () => 0)).toBe(800);
  });
});
