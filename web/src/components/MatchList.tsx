import { useMemo } from 'react';
import { Stack, Title } from '@mantine/core';
import {
  filterLive,
  groupByCompetition,
  groupBySport,
  SPORT_LABELS,
  type Match,
  type SportCategory,
} from '@live-scores/shared';
import type { ApiRequestError } from '../api/client';
import { CompetitionGroup } from './CompetitionGroup';
import { EmptyState, ErrorState, MatchListSkeleton } from './States';

interface MatchListProps {
  category: SportCategory;
  matches: Match[];
  liveOnly: boolean;
  isLoading: boolean;
  error: ApiRequestError | null;
  timeZone: string;
  stale: boolean;
}

export function MatchList({
  category,
  matches,
  liveOnly,
  isLoading,
  error,
  timeZone,
  stale,
}: MatchListProps) {
  const visible = useMemo(() => filterLive(matches, liveOnly), [matches, liveOnly]);

  if (isLoading) return <MatchListSkeleton />;
  if (error) return <ErrorState rateLimited={error.isRateLimit} />;
  if (visible.length === 0) return <EmptyState liveOnly={liveOnly && matches.length > 0} />;

  if (category === 'other') {
    return (
      <Stack gap="xl">
        {groupBySport(visible).map((sport) => (
          <Stack
            key={sport.sport}
            gap="sm"
            component="section"
            aria-label={SPORT_LABELS[sport.sport]}
          >
            <Title order={2} size="h4" c="var(--color-green-900)">
              {SPORT_LABELS[sport.sport] ?? sport.sport}
            </Title>
            {sport.competitions.map((g) => (
              <CompetitionGroup
                key={g.id}
                group={g}
                timeZone={timeZone}
                stale={stale}
                headingLevel={3}
              />
            ))}
          </Stack>
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {groupByCompetition(visible).map((g) => (
        <CompetitionGroup key={g.id} group={g} timeZone={timeZone} stale={stale} />
      ))}
    </Stack>
  );
}
