import type { Match } from '@live-scores/shared';

/** Everything except `updatedAt`, so a re-sent but unchanged match is not a change. */
function fingerprint(m: Match): string {
  const { updatedAt: _updatedAt, ...rest } = m;
  return JSON.stringify(rest);
}

/** Current state of all matches, indexed by id; reports only what actually changed. */
export class MatchState {
  private byId = new Map<string, { match: Match; fp: string }>();

  /** Merges incoming matches and returns the ones that differ from the stored state. */
  apply(matches: readonly Match[]): Match[] {
    const changed: Match[] = [];
    for (const match of matches) {
      const fp = fingerprint(match);
      if (this.byId.get(match.id)?.fp === fp) continue;
      this.byId.set(match.id, { match, fp });
      changed.push(match);
    }
    return changed;
  }

  /** A REST snapshot is authoritative for its sport: matches missing from it are dropped. */
  replaceSport(sport: string, matches: readonly Match[]): Match[] {
    const keep = new Set(matches.map((m) => m.id));
    for (const [id, entry] of this.byId) {
      if (entry.match.sport === sport && !keep.has(id)) this.byId.delete(id);
    }
    return this.apply(matches);
  }

  all(): Match[] {
    return [...this.byId.values()].map((e) => e.match);
  }

  clear() {
    this.byId.clear();
  }
}
