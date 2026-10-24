import { isLive, type Match } from './model';

/** live/break first, then scheduled (and postponed/cancelled) by start time, finished last. */
function rank(m: Match): number {
  if (isLive(m)) return 0;
  if (m.status === 'finished') return 2;
  return 1;
}

export function compareMatches(a: Match, b: Match): number {
  return (
    rank(a) - rank(b) ||
    a.startTime.localeCompare(b.startTime) ||
    a.home.name.localeCompare(b.home.name)
  );
}

export function sortMatches(matches: readonly Match[]): Match[] {
  return [...matches].sort(compareMatches);
}

export function filterLive(matches: readonly Match[], liveOnly: boolean): Match[] {
  return liveOnly ? matches.filter(isLive) : [...matches];
}

export interface CompetitionGroupData {
  id: string;
  name: string;
  country?: string;
  matches: Match[];
}

/**
 * Groups by competition, keeping matches sorted inside each group.
 * Groups are ordered by their best match, so a league with a live game comes first.
 */
export function groupByCompetition(matches: readonly Match[]): CompetitionGroupData[] {
  const groups = new Map<string, CompetitionGroupData>();
  for (const m of sortMatches(matches)) {
    let group = groups.get(m.competition.id);
    if (!group) {
      group = { ...m.competition, matches: [] };
      groups.set(m.competition.id, group);
    }
    group.matches.push(m);
  }
  return [...groups.values()];
}

export interface SportGroupData {
  sport: string;
  competitions: CompetitionGroupData[];
}

/** Used by the "Other" category: one header per sport, competitions inside. */
export function groupBySport(matches: readonly Match[]): SportGroupData[] {
  const bySport = new Map<string, Match[]>();
  for (const m of sortMatches(matches)) {
    const list = bySport.get(m.sport) ?? [];
    list.push(m);
    bySport.set(m.sport, list);
  }
  return [...bySport.entries()].map(([sport, list]) => ({
    sport,
    competitions: groupByCompetition(list),
  }));
}
