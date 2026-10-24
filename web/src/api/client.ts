import type { ApiError, Health, Match, SportCategory, SportCount } from '@live-scores/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError['error'] | 'NETWORK',
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  get isRateLimit() {
    return this.status === 429 || this.code === 'RATE_LIMITED';
  }
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(new URL(path, window.location.origin), {
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    throw new ApiRequestError(0, 'NETWORK', (err as Error).message);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      res.status,
      body?.error ?? 'UPSTREAM_ERROR',
      body?.message ?? `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}

export function fetchMatches(category: SportCategory, date: string, tz: string) {
  const params = new URLSearchParams({ category, date, tz });
  return getJson<Match[]>(`/api/matches?${params}`);
}

export const fetchSports = () => getJson<SportCount[]>('/api/sports');

export const fetchHealth = () => getJson<Health>('/api/health');
