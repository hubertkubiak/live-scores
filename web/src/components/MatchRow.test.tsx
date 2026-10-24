import { act, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it, vi } from 'vitest';
import { match } from '../test/fixtures';
import { renderWithTheme } from '../test/render';
import { FLASH_MS, MatchRow } from './MatchRow';

const tz = 'Europe/Warsaw';
const row = (m: ReturnType<typeof match>) => (
  <ul>
    <MatchRow match={m} timeZone={tz} />
  </ul>
);

describe('MatchRow', () => {
  it.each(['live', 'break'] as const)('shows the live dot for %s matches', (status) => {
    renderWithTheme(row(match('1', { status })));
    expect(screen.getByRole('img', { name: 'Match in progress' })).toBeInTheDocument();
  });

  it.each(['scheduled', 'finished', 'postponed', 'cancelled'] as const)(
    'has no live dot for %s matches',
    (status) => {
      renderWithTheme(row(match('1', { status })));
      expect(screen.queryByTestId('live-dot')).not.toBeInTheDocument();
    },
  );

  it('shows the kick-off time instead of a score for scheduled matches', () => {
    renderWithTheme(
      row(
        match('1', {
          status: 'scheduled',
          startTime: '2026-10-24T16:30:00.000Z',
          home: { name: 'Lech', score: null },
          away: { name: 'Legia', score: null },
        }),
      ),
    );
    expect(screen.getByText('18:30')).toBeInTheDocument(); // UTC+2 in Warsaw on 24 Oct
  });

  it('flashes for about 1.5 s after a score change, not on first render', () => {
    vi.useFakeTimers();
    const first = match('1');
    const { container, rerender } = renderWithTheme(row(first));
    const li = () => container.querySelector('li')!;
    expect(li()).not.toHaveAttribute('data-flashing');

    const scored = { ...first, home: { ...first.home, score: 1 }, updatedAt: 2 };
    rerender(<MantineProvider>{row(scored)}</MantineProvider>);
    expect(li()).toHaveAttribute('data-flashing');

    act(() => vi.advanceTimersByTime(FLASH_MS + 10));
    expect(li()).not.toHaveAttribute('data-flashing');

    // A status-only change (minute ticks on) does not flash.
    rerender(
      <MantineProvider>{row({ ...scored, statusLabel: '13′', updatedAt: 3 })}</MantineProvider>,
    );
    expect(li()).not.toHaveAttribute('data-flashing');
    vi.useRealTimers();
  });

  it('shows tennis scores by set', () => {
    renderWithTheme(
      row(
        match('t', {
          sport: 'tennis',
          category: 'tennis',
          statusLabel: 'Set 2',
          home: { name: 'Hurkacz', score: 1 },
          away: { name: 'Sinner', score: 0 },
          periodScores: [
            { home: 6, away: 4 },
            { home: 3, away: 2 },
          ],
        }),
      ),
    );
    const homeLine = screen.getByText('Hurkacz').parentElement!;
    expect(homeLine).toHaveTextContent('Hurkacz631');
    expect(screen.getByText('Sinner').parentElement).toHaveTextContent('Sinner420');
  });
});
