import { formatInTimeZone } from 'date-fns-tz';
import {
  ALL_SPORTS,
  CATEGORIES,
  isLive,
  sportsOf,
  type ApiError,
  type Health,
  type LiveCounts,
  type Match,
  type ServerMessage,
  type SportCategory,
  type SportCount,
  type UpstreamState,
} from '@live-scores/shared';
import { AuthError, RateLimitError, type ScoresProvider } from '../providers/types';
import { MatchState } from './diff';

export interface HubClient {
  subscribe(category: SportCategory): void;
  remove(): void;
}

interface ClientEntry {
  send: (msg: ServerMessage) => void;
  category?: SportCategory;
}

export interface HubOptions {
  snapshotRefreshMs: number;
  /** Builds the provider to fall back to when the real one rejects the key. */
  fallback?: () => ScoresProvider;
  log?: Pick<Console, 'info' | 'warn' | 'error'>;
}

/**
 * Holds one provider subscription for the whole server and fans changes out to browser
 * clients, each of which sees only its current sidebar category.
 */
export class LiveHub {
  private state = new MatchState();
  private clients = new Set<ClientEntry>();
  private upstream: UpstreamState = 'down';
  private lastCounts = '';
  private rateLimitedUntil = 0;
  private failedSports = new Set<string>();
  private unsubscribers: (() => void)[] = [];
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private readonly log: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(
    private provider: ScoresProvider,
    private readonly options: HubOptions,
  ) {
    this.log = options.log ?? console;
  }

  get providerName() {
    return this.provider.name;
  }

  async start() {
    this.attach();
    await this.refreshSnapshots();
    this.refreshTimer = setInterval(
      () => void this.refreshSnapshots(),
      this.options.snapshotRefreshMs,
    );
  }

  stop() {
    clearInterval(this.refreshTimer);
    this.detach();
  }

  addClient(send: (msg: ServerMessage) => void): HubClient {
    const entry: ClientEntry = { send };
    this.clients.add(entry);
    return {
      subscribe: (category) => {
        entry.category = category;
        send({ type: 'snapshot', category, matches: this.matchesFor(category) });
        send({ type: 'counts', counts: this.counts() });
        send({ type: 'status', upstream: this.upstream });
      },
      remove: () => this.clients.delete(entry),
    };
  }

  /** Matches of a category, optionally limited to one calendar day in `timeZone`. */
  matchesFor(category: SportCategory, date?: string, timeZone = 'Europe/Warsaw'): Match[] {
    return this.state
      .all()
      .filter((m) => m.category === category)
      .filter((m) => !date || formatInTimeZone(m.startTime, timeZone, 'yyyy-MM-dd') === date);
  }

  /** Why a category has no data, if the reason is an error rather than an empty day. */
  errorFor(category: SportCategory): ApiError | null {
    if (this.matchesFor(category).length > 0) return null;
    if (Date.now() < this.rateLimitedUntil) {
      return { error: 'RATE_LIMITED', message: 'The daily API quota is used up.' };
    }
    if (sportsOf(category).some((s) => this.failedSports.has(s))) {
      return { error: 'UPSTREAM_ERROR', message: 'The scores provider could not be reached.' };
    }
    return null;
  }

  counts(): LiveCounts {
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as LiveCounts;
    for (const m of this.state.all()) if (isLive(m)) counts[m.category]++;
    return counts;
  }

  sportCounts(): SportCount[] {
    const all = this.state.all();
    return CATEGORIES.map((category) => {
      const matches = all.filter((m) => m.category === category);
      return { category, total: matches.length, live: matches.filter(isLive).length };
    });
  }

  health(): Health {
    return {
      provider: this.provider.name,
      upstream: this.upstream,
      rateLimitRemaining: this.provider.rateLimitRemaining(),
    };
  }

  /** Fetches today's matches for every sport. Called at startup and on an interval. */
  async refreshSnapshots(): Promise<void> {
    for (const sport of ALL_SPORTS) {
      if (Date.now() < this.rateLimitedUntil) return;
      try {
        const matches = await this.provider.getToday(sport);
        this.failedSports.delete(sport);
        this.publish(this.state.replaceSport(sport, matches));
      } catch (err) {
        if (err instanceof AuthError && this.options.fallback) {
          this.log.error(`${err.message}; switching to mock data`);
          this.switchProvider(this.options.fallback());
          return this.refreshSnapshots();
        }
        if (err instanceof RateLimitError) {
          // REST stops until the reset; WebSocket data keeps flowing.
          this.log.warn(err.message);
          this.rateLimitedUntil = err.resetAt;
          return;
        }
        this.failedSports.add(sport);
        this.log.warn(`snapshot for ${sport} failed: ${(err as Error).message}`);
      }
    }
  }

  private attach() {
    this.unsubscribers.push(
      this.provider.subscribe((matches) => this.publish(this.state.apply(matches))),
    );
    if (this.provider.onStatus) {
      this.unsubscribers.push(this.provider.onStatus((state) => this.setUpstream(state)));
    } else {
      this.setUpstream('connected');
    }
  }

  private detach() {
    for (const off of this.unsubscribers.splice(0)) off();
  }

  private switchProvider(next: ScoresProvider) {
    this.detach();
    this.provider = next;
    this.state.clear();
    this.failedSports.clear();
    this.rateLimitedUntil = 0;
    this.attach();
    // Clients get a fresh snapshot of the new data set.
    for (const c of this.clients) {
      if (c.category) c.send({ type: 'snapshot', category: c.category, matches: [] });
    }
  }

  private setUpstream(state: UpstreamState) {
    if (state === this.upstream) return;
    this.upstream = state;
    this.broadcast({ type: 'status', upstream: state });
  }

  /** Sends changed matches to the clients watching their category, then counts if they moved. */
  private publish(changed: Match[]) {
    if (changed.length === 0) return;
    const ts = Date.now();
    for (const c of this.clients) {
      const mine = changed.filter((m) => m.category === c.category);
      if (mine.length) c.send({ type: 'patch', matches: mine, ts });
    }
    const counts = this.counts();
    const key = JSON.stringify(counts);
    if (key !== this.lastCounts) {
      this.lastCounts = key;
      this.broadcast({ type: 'counts', counts });
    }
  }

  private broadcast(msg: ServerMessage) {
    for (const c of this.clients) c.send(msg);
  }
}
