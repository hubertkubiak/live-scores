import { create } from 'zustand';
import type { LiveCounts, Match, SportCategory, UpstreamState } from '@live-scores/shared';

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';

interface MatchStore {
  byId: Record<string, Match>;
  counts: LiveCounts | null;
  connection: ConnectionState;
  upstream: UpstreamState;
  lastUpdate: number | null;
  /** A snapshot is authoritative for its category: replaces every match in it. */
  replaceCategory: (category: SportCategory, matches: Match[]) => void;
  /** Merges a patch by id, ignoring anything older than what is stored. */
  mergeMatches: (matches: Match[], ts?: number) => void;
  setCounts: (counts: LiveCounts) => void;
  setConnection: (connection: ConnectionState) => void;
  setUpstream: (upstream: UpstreamState) => void;
}

export const useMatchStore = create<MatchStore>()((set) => ({
  byId: {},
  counts: null,
  connection: 'reconnecting',
  upstream: 'connected',
  lastUpdate: null,

  replaceCategory: (category, matches) =>
    set((s) => {
      const byId: Record<string, Match> = {};
      for (const m of Object.values(s.byId)) if (m.category !== category) byId[m.id] = m;
      for (const m of matches) {
        // A REST snapshot can land after a newer WebSocket patch; keep the newer one.
        const current = s.byId[m.id];
        byId[m.id] = current && current.updatedAt > m.updatedAt ? current : m;
      }
      return { byId, lastUpdate: Date.now() };
    }),

  mergeMatches: (matches, ts) =>
    set((s) => {
      const byId = { ...s.byId };
      let changed = false;
      for (const m of matches) {
        const current = byId[m.id];
        if (current && current.updatedAt > m.updatedAt) continue;
        byId[m.id] = m;
        changed = true;
      }
      return changed ? { byId, lastUpdate: ts ?? Date.now() } : {};
    }),

  setCounts: (counts) => set({ counts }),
  setConnection: (connection) => set({ connection }),
  setUpstream: (upstream) => set({ upstream }),
}));
