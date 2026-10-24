import type { Match, UpstreamState } from '@live-scores/shared';

export interface ScoresProvider {
  readonly name: 'sportsapipro' | 'mock';
  /** REST snapshot of today's matches for one provider sport slug. */
  getToday(sport: string): Promise<Match[]>;
  /** Live updates; returns an unsubscribe function. */
  subscribe(onUpdate: (matches: Match[]) => void): () => void;
  /** Upstream connection state changes. */
  onStatus?(listener: (state: UpstreamState) => void): () => void;
  /** Last known `X-RateLimit-Remaining`, or null when unknown / not applicable. */
  rateLimitRemaining(): number | null;
}

/** The daily REST quota is used up; no REST calls until `resetAt`. */
export class RateLimitError extends Error {
  constructor(readonly resetAt: number) {
    super(`Rate limit exceeded until ${new Date(resetAt).toISOString()}`);
    this.name = 'RateLimitError';
  }
}

/** 401/403 from the provider: the key is missing, wrong or not allowed. */
export class AuthError extends Error {
  constructor(readonly status: number) {
    super(`Provider rejected the API key (HTTP ${status})`);
    this.name = 'AuthError';
  }
}
