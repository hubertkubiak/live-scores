import type { Match } from '@live-scores/shared';

export function match(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    sport: 'football',
    category: 'football',
    competition: { id: 'c1', name: 'Ekstraklasa', country: 'Poland' },
    home: { name: `Home ${id}`, score: 0 },
    away: { name: `Away ${id}`, score: 0 },
    status: 'live',
    statusLabel: '12′',
    startTime: new Date().toISOString(),
    updatedAt: 1,
    ...overrides,
  };
}
