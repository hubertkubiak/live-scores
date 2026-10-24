export type SportCategory = 'football' | 'tennis' | 'basketball' | 'hockey' | 'other';
export type MatchStatus = 'scheduled' | 'live' | 'break' | 'finished' | 'postponed' | 'cancelled';

export interface Match {
  /** `${provider}:${sport}:${providerId}` */
  id: string;
  /** Provider slug, e.g. 'handball'. */
  sport: string;
  /** Maps to a sidebar item. */
  category: SportCategory;
  competition: { id: string; name: string; country?: string };
  home: { name: string; score: number | null; logoUrl?: string };
  away: { name: string; score: number | null; logoUrl?: string };
  /** Tennis sets, basketball quarters, hockey periods. */
  periodScores?: { home: number; away: number }[];
  status: MatchStatus;
  /** e.g. "67′", "Set 3", "Half-time". */
  statusLabel: string;
  /** ISO 8601 UTC. */
  startTime: string;
  /** Timestamp (ms) of the last message that touched this match. */
  updatedAt: number;
}

export const CATEGORIES: readonly SportCategory[] = [
  'football',
  'tennis',
  'basketball',
  'hockey',
  'other',
];

export const CATEGORY_LABELS: Record<SportCategory, string> = {
  football: 'Football',
  tennis: 'Tennis',
  basketball: 'Basketball',
  hockey: 'Hockey',
  other: 'Other',
};

/** Provider sports that are aggregated under the "Other" sidebar item. */
export const OTHER_SPORTS = [
  'handball',
  'volleyball',
  'baseball',
  'rugby',
  'american-football',
] as const;

export const ALL_SPORTS = ['football', 'tennis', 'basketball', 'hockey', ...OTHER_SPORTS] as const;

export const SPORT_LABELS: Record<string, string> = {
  football: 'Football',
  tennis: 'Tennis',
  basketball: 'Basketball',
  hockey: 'Hockey',
  handball: 'Handball',
  volleyball: 'Volleyball',
  baseball: 'Baseball',
  rugby: 'Rugby',
  'american-football': 'American football',
};

export function categoryOf(sport: string): SportCategory {
  switch (sport) {
    case 'football':
    case 'tennis':
    case 'basketball':
    case 'hockey':
      return sport;
    default:
      return 'other';
  }
}

/** Provider sports that belong to a sidebar category. */
export function sportsOf(category: SportCategory): string[] {
  return category === 'other' ? [...OTHER_SPORTS] : [category];
}

export const isLive = (m: Match) => m.status === 'live' || m.status === 'break';

export interface SportCount {
  category: SportCategory;
  total: number;
  live: number;
}

export type LiveCounts = Record<SportCategory, number>;

export type UpstreamState = 'connected' | 'reconnecting' | 'down';

export interface Health {
  provider: 'sportsapipro' | 'mock';
  upstream: UpstreamState;
  rateLimitRemaining: number | null;
}

/** Error body returned by the proxy REST API. */
export interface ApiError {
  error: 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'BAD_REQUEST';
  message: string;
}
