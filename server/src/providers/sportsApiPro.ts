import WebSocket from 'ws';
import { z } from 'zod';
import {
  ALL_SPORTS,
  categoryOf,
  type Match,
  type MatchStatus,
  type UpstreamState,
} from '@live-scores/shared';
import { backoffDelay } from '../live/backoff';
import { AuthError, RateLimitError, type ScoresProvider } from './types';

/*
 * Adapter for SportsAPI Pro V1.
 *
 * Confirmed by the docs: the response envelope, `homeCompetitor` / `awayCompetitor` with
 * `name` and `score`, and the WebSocket protocol (connected / subscribe / scores / ping).
 *
 * ASSUMED, to be checked against real responses (SPEC task 0, `npm run sample -w server`):
 * the status fields (`statusGroup`, `statusText`, `shortStatusText`), the clock
 * (`gameTimeDisplay`), per-period scores (`stages`), `startTime`, `competitionId` and
 * `sportId`. All of them sit in `GameSchema` and `mapStatus` / `toMatch` below.
 */

const CompetitorSchema = z.object({
  name: z.string(),
  // Providers in this family use -1 for "no score yet".
  score: z.number().nullish(),
});

const StageSchema = z.object({
  name: z.string().optional(),
  homeCompetitorScore: z.number(),
  awayCompetitorScore: z.number(),
});

const GameSchema = z.object({
  id: z.union([z.number(), z.string()]),
  sportId: z.number().optional(),
  competitionId: z.union([z.number(), z.string()]).optional(),
  competitionDisplayName: z.string().optional(),
  startTime: z.string(),
  statusGroup: z.number().optional(),
  statusText: z.string().optional(),
  shortStatusText: z.string().optional(),
  gameTimeDisplay: z.string().optional(),
  homeCompetitor: CompetitorSchema,
  awayCompetitor: CompetitorSchema,
  stages: z.array(StageSchema).optional(),
});
export type ApiGame = z.infer<typeof GameSchema>;

const CompetitionSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  countryId: z.union([z.number(), z.string()]).optional(),
});

const CountrySchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
});

const EnvelopeSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    // Games are parsed one by one so a single bad game does not reject the list.
    games: z.array(z.unknown()).default([]),
    competitions: z.array(CompetitionSchema).default([]),
    countries: z.array(CountrySchema).default([]),
  }),
});

const ScoresMessageSchema = z.object({
  type: z.literal('scores'),
  channel: z.string().optional(),
  games: z.array(z.unknown()),
  ts: z.number().optional(),
});

/** ASSUMED sportId values; used only for WebSocket games not seen in a REST snapshot. */
const SPORT_IDS: Record<number, string> = {
  1: 'football',
  2: 'basketball',
  3: 'tennis',
  4: 'hockey',
  5: 'handball',
  6: 'american-football',
  7: 'baseball',
  8: 'volleyball',
  9: 'rugby',
};

const BREAK_TEXT = /half[\s-]?time|^ht$|break|intermission|pause/i;
const POSTPONED_TEXT = /postpon|delay/i;
const CANCELLED_TEXT = /cancel|abandon|interrupt/i;

export interface CompetitionInfo {
  name: string;
  country?: string;
}

/** Logs and returns 'scheduled' for unknown values, so a match is never falsely shown live. */
export function mapStatus(game: ApiGame, warn: (msg: string) => void = console.warn): MatchStatus {
  const text = `${game.shortStatusText ?? ''} ${game.statusText ?? ''}`.trim();
  if (CANCELLED_TEXT.test(text)) return 'cancelled';
  if (POSTPONED_TEXT.test(text)) return 'postponed';
  switch (game.statusGroup) {
    case 2:
      return 'scheduled';
    case 3:
      return BREAK_TEXT.test(text) ? 'break' : 'live';
    case 4:
      return 'finished';
    default:
      warn(`[sportsapipro] unknown status ${game.statusGroup} "${text}" for game ${game.id}`);
      return 'scheduled';
  }
}

const score = (s: number | null | undefined) => (s == null || s < 0 ? null : s);

export function toMatch(
  game: ApiGame,
  sport: string,
  competitions: ReadonlyMap<string, CompetitionInfo>,
  now: number,
  warn?: (msg: string) => void,
): Match {
  const status = mapStatus(game, warn);
  const competitionId = String(game.competitionId ?? 'unknown');
  const competition = competitions.get(competitionId);
  return {
    id: `sportsapipro:${sport}:${game.id}`,
    sport,
    category: categoryOf(sport),
    competition: {
      id: `${sport}:${competitionId}`,
      name: competition?.name ?? game.competitionDisplayName ?? 'Other competitions',
      country: competition?.country,
    },
    home: { name: game.homeCompetitor.name, score: score(game.homeCompetitor.score) },
    away: { name: game.awayCompetitor.name, score: score(game.awayCompetitor.score) },
    periodScores: game.stages?.length
      ? game.stages.map((s) => ({ home: s.homeCompetitorScore, away: s.awayCompetitorScore }))
      : undefined,
    status,
    statusLabel: statusLabel(game, status),
    startTime: new Date(game.startTime).toISOString(),
    updatedAt: now,
  };
}

function statusLabel(game: ApiGame, status: MatchStatus): string {
  if (status === 'finished') return 'FT';
  if (status === 'live' && game.gameTimeDisplay) return game.gameTimeDisplay.replace(/'$/, '′');
  return game.shortStatusText || game.statusText || '';
}

export interface ParsedGames {
  games: ApiGame[];
  competitions: Map<string, CompetitionInfo>;
  rejected: number;
}

/** Parses one REST envelope; games that fail validation are dropped and logged. */
export function parseEnvelope(
  body: unknown,
  warn: (msg: string) => void = console.warn,
): ParsedGames {
  const envelope = EnvelopeSchema.parse(body);
  const countries = new Map(envelope.data.countries.map((c) => [String(c.id), c.name]));
  const competitions = new Map<string, CompetitionInfo>(
    envelope.data.competitions.map((c) => [
      String(c.id),
      {
        name: c.name,
        country: c.countryId != null ? countries.get(String(c.countryId)) : undefined,
      },
    ]),
  );
  const { games, rejected } = parseGames(envelope.data.games, warn);
  return { games, competitions, rejected };
}

export function parseGames(raw: unknown[], warn: (msg: string) => void = console.warn) {
  const games: ApiGame[] = [];
  let rejected = 0;
  for (const item of raw) {
    const result = GameSchema.safeParse(item);
    if (result.success) {
      games.push(result.data);
    } else {
      rejected++;
      warn(
        `[sportsapipro] rejected game: ${result.error.issues[0]?.message}; sample: ${JSON.stringify(item).slice(0, 300)}`,
      );
    }
  }
  return { games, rejected };
}

function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** `X-RateLimit-Reset` may be epoch seconds, epoch ms or a date string. */
function parseReset(value: string | null, now: number): number {
  if (!value) return nextUtcMidnight(now);
  const n = Number(value);
  if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : nextUtcMidnight(now);
}

export interface SportsApiProOptions {
  apiKey: string;
  /** Contains `{sport}`, e.g. `https://v1.{sport}.sportsapipro.com`. */
  baseUrl: string;
  /** Upstream WebSocket URL without the key; defaults to the football host. */
  wsUrl?: string;
  fetch?: typeof fetch;
}

export class SportsApiProProvider implements ScoresProvider {
  readonly name = 'sportsapipro' as const;
  private readonly fetchImpl: typeof fetch;
  private remaining: number | null = null;
  private blockedUntil = 0;
  /** Game id → sport, learned from snapshots, for WebSocket games. */
  private sportOfGame = new Map<string, string>();
  private competitions = new Map<string, CompetitionInfo>();
  private updateListeners = new Set<(matches: Match[]) => void>();
  private statusListeners = new Set<(state: UpstreamState) => void>();
  private socket: WebSocket | undefined;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private state: UpstreamState = 'down';

  constructor(private readonly options: SportsApiProOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  rateLimitRemaining() {
    return this.remaining;
  }

  async getToday(sport: string): Promise<Match[]> {
    const now = Date.now();
    if (now < this.blockedUntil) throw new RateLimitError(this.blockedUntil);

    const url = `${this.options.baseUrl.replaceAll('{sport}', sport)}/games/current`;
    const res = await this.fetchImpl(url, { headers: { 'x-api-key': this.options.apiKey } });

    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining !== null && Number.isFinite(Number(remaining)))
      this.remaining = Number(remaining);

    if (res.status === 401 || res.status === 403) throw new AuthError(res.status);
    if (res.status === 429) {
      this.blockedUntil = parseReset(res.headers.get('x-ratelimit-reset'), now);
      this.remaining = 0;
      throw new RateLimitError(this.blockedUntil);
    }
    if (!res.ok) throw new Error(`SportsAPI Pro ${sport}: HTTP ${res.status}`);

    const parsed = parseEnvelope(await res.json());
    for (const [id, info] of parsed.competitions) this.competitions.set(id, info);
    return parsed.games.map((g) => {
      this.sportOfGame.set(String(g.id), sport);
      return toMatch(g, sport, this.competitions, now);
    });
  }

  subscribe(onUpdate: (matches: Match[]) => void): () => void {
    this.updateListeners.add(onUpdate);
    if (!this.socket && !this.reconnectTimer) this.connect();
    return () => {
      this.updateListeners.delete(onUpdate);
      if (this.updateListeners.size === 0) this.close();
    };
  }

  onStatus(listener: (state: UpstreamState) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.state);
    return () => this.statusListeners.delete(listener);
  }

  private setState(state: UpstreamState) {
    if (state === this.state) return;
    this.state = state;
    for (const l of this.statusListeners) l(state);
  }

  private wsUrl() {
    const base =
      this.options.wsUrl ??
      `${this.options.baseUrl.replaceAll('{sport}', 'football').replace(/^http/, 'ws')}/ws`;
    const url = new URL(base);
    url.searchParams.set('x-api-key', this.options.apiKey);
    return url.toString();
  }

  private connect() {
    this.reconnectTimer = undefined;
    const socket = new WebSocket(this.wsUrl());
    this.socket = socket;

    socket.on('open', () => {
      this.attempt = 0;
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'live' }));
      this.pingTimer = setInterval(() => socket.send(JSON.stringify({ type: 'ping' })), 25_000);
      this.setState('connected');
    });
    socket.on('message', (data) => this.handleMessage(data.toString()));
    socket.on('error', (err) => console.warn(`[sportsapipro] websocket error: ${err.message}`));
    socket.on('close', () => {
      clearInterval(this.pingTimer);
      this.socket = undefined;
      if (this.updateListeners.size === 0) return;
      this.setState('reconnecting');
      const delay = backoffDelay(this.attempt++);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }

  private close() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    clearInterval(this.pingTimer);
    this.socket?.close();
    this.socket = undefined;
    this.setState('down');
  }

  private handleMessage(raw: string) {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return;
    }
    const msg = ScoresMessageSchema.safeParse(body);
    if (!msg.success) return; // connected, pong and other control messages

    const now = msg.data.ts ?? Date.now();
    const channel = msg.data.channel;
    const channelSport =
      channel && (ALL_SPORTS as readonly string[]).includes(channel) ? channel : undefined;
    const matches: Match[] = [];
    for (const game of parseGames(msg.data.games).games) {
      const sport =
        this.sportOfGame.get(String(game.id)) ??
        channelSport ??
        (game.sportId !== undefined ? SPORT_IDS[game.sportId] : undefined);
      if (!sport) {
        console.warn(`[sportsapipro] skipping live game ${game.id}: unknown sport`);
        continue;
      }
      matches.push(toMatch(game, sport, this.competitions, now));
    }
    if (matches.length) for (const l of this.updateListeners) l(matches);
  }
}
