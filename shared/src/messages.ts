import type { LiveCounts, Match, SportCategory, UpstreamState } from './model';

export type ClientMessage = { type: 'subscribe'; category: SportCategory } | { type: 'ping' };

export type ServerMessage =
  | { type: 'snapshot'; category: SportCategory; matches: Match[] }
  | { type: 'patch'; matches: Match[]; ts: number }
  | { type: 'counts'; counts: LiveCounts }
  | { type: 'status'; upstream: UpstreamState }
  | { type: 'pong' };
