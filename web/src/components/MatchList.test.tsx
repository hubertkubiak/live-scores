import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../api/client';
import { match } from '../test/fixtures';
import { renderWithTheme } from '../test/render';
import { MatchList } from './MatchList';

const base = {
  category: 'football' as const,
  liveOnly: false,
  isLoading: false,
  error: null,
  timeZone: 'Europe/Warsaw',
  stale: false,
};

const matches = [
  match('done', { status: 'finished', statusLabel: 'FT', home: { name: 'Finished FC', score: 2 } }),
  match('later', {
    status: 'scheduled',
    home: { name: 'Scheduled FC', score: null },
    away: { name: 'Away later', score: null },
  }),
  match('now', { status: 'live', home: { name: 'Live FC', score: 1 } }),
];

describe('MatchList', () => {
  it('lists live first, then scheduled, then finished', () => {
    renderWithTheme(<MatchList {...base} matches={matches} />);
    const rows = within(screen.getByRole('region', { name: 'Ekstraklasa' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual([
      'live',
      'scheduled',
      'finished',
    ]);
  });

  it('"Live only" hides matches that are not in progress', () => {
    renderWithTheme(<MatchList {...base} liveOnly matches={matches} />);
    expect(screen.getByText('Live FC')).toBeInTheDocument();
    expect(screen.queryByText('Scheduled FC')).not.toBeInTheDocument();
    expect(screen.queryByText('Finished FC')).not.toBeInTheDocument();
  });

  it('says there are no live matches when the filter empties the list', () => {
    renderWithTheme(<MatchList {...base} liveOnly matches={[matches[0]!]} />);
    expect(screen.getByText('No live matches right now')).toBeInTheDocument();
  });

  it('says there are no matches today when the day is empty', () => {
    renderWithTheme(<MatchList {...base} matches={[]} />);
    expect(screen.getByText('No matches today')).toBeInTheDocument();
  });

  it('shows the rate-limit notice', () => {
    renderWithTheme(
      <MatchList
        {...base}
        matches={[]}
        error={new ApiRequestError(429, 'RATE_LIMITED', 'quota')}
      />,
    );
    expect(screen.getByText('Daily data limit reached')).toBeInTheDocument();
  });

  it('shows skeletons on first load', () => {
    renderWithTheme(<MatchList {...base} matches={[]} isLoading />);
    expect(screen.getByLabelText('Loading matches')).toBeInTheDocument();
  });

  it('groups "Other" under a header per sport', () => {
    renderWithTheme(
      <MatchList
        {...base}
        category="other"
        matches={[
          match('h', {
            sport: 'handball',
            category: 'other',
            competition: { id: 'h', name: 'EHF' },
          }),
          match('r', {
            sport: 'rugby',
            category: 'other',
            competition: { id: 'r', name: 'Top 14' },
          }),
        ]}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Handball' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Rugby' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'EHF' })).toBeInTheDocument();
  });
});
