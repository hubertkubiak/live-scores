import { describe, expect, it } from 'vitest';
import { categoryOf, type Match } from './model';
import { filterLive, groupByCompetition, groupBySport, sortMatches } from './sorting';

function match(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    sport: 'football',
    category: 'football',
    competition: { id: 'c1', name: 'League' },
    home: { name: `Home ${id}`, score: null },
    away: { name: `Away ${id}`, score: null },
    status: 'scheduled',
    statusLabel: '',
    startTime: '2026-10-24T12:00:00.000Z',
    updatedAt: 0,
    ...overrides,
  };
}

describe('sortMatches', () => {
  it('puts live first, then scheduled by start time, finished last', () => {
    const sorted = sortMatches([
      match('finished', { status: 'finished', startTime: '2026-10-24T08:00:00.000Z' }),
      match('late', { startTime: '2026-10-24T20:00:00.000Z' }),
      match('break', { status: 'break', startTime: '2026-10-24T11:00:00.000Z' }),
      match('early', { startTime: '2026-10-24T15:00:00.000Z' }),
      match('live', { status: 'live', startTime: '2026-10-24T10:00:00.000Z' }),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['live', 'break', 'early', 'late', 'finished']);
  });

  it('does not mutate the input', () => {
    const input = [match('b', { status: 'finished' }), match('a', { status: 'live' })];
    sortMatches(input);
    expect(input.map((m) => m.id)).toEqual(['b', 'a']);
  });
});

describe('filterLive', () => {
  const all = [match('s'), match('l', { status: 'live' }), match('b', { status: 'break' })];

  it('keeps everything when off', () => {
    expect(filterLive(all, false)).toHaveLength(3);
  });

  it('keeps only live and break matches when on', () => {
    expect(filterLive(all, true).map((m) => m.id)).toEqual(['l', 'b']);
  });
});

describe('grouping', () => {
  it('groups by competition and orders groups by their best match', () => {
    const groups = groupByCompetition([
      match('a', { competition: { id: 'c1', name: 'First' } }),
      match('b', { competition: { id: 'c2', name: 'Second' }, status: 'live' }),
      match('c', { competition: { id: 'c1', name: 'First' }, status: 'finished' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Second', 'First']);
    expect(groups[1]?.matches.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('groups "other" matches under a header per sport', () => {
    const groups = groupBySport([
      match('h', { sport: 'handball', category: 'other' }),
      match('v', { sport: 'volleyball', category: 'other', status: 'live' }),
    ]);
    expect(groups.map((g) => g.sport)).toEqual(['volleyball', 'handball']);
  });
});

describe('categoryOf', () => {
  it('maps the four main sports to themselves and the rest to other', () => {
    expect(categoryOf('hockey')).toBe('hockey');
    expect(categoryOf('rugby')).toBe('other');
    expect(categoryOf('american-football')).toBe('other');
  });
});
