import { useState } from 'react';
import { AppShell, Box, Group, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type LiveCounts,
  type SportCategory,
} from '@live-scores/shared';
import { fetchHealth, fetchSports } from './api/client';
import { useLiveScores } from './api/useLiveScores';
import { AppHeader } from './components/AppHeader';
import { LiveOnlyToggle } from './components/LiveOnlyToggle';
import { MatchList } from './components/MatchList';
import { SportNav } from './components/SportNav';
import { useMatchStore } from './store/matches';
import styles from './App.module.css';

export function App() {
  const [category, setCategory] = useState<SportCategory>('football');
  const [liveOnly, setLiveOnly] = useState(false);
  const live = useLiveScores(category);

  const connection = useMatchStore((s) => s.connection);
  const lastUpdate = useMatchStore((s) => s.lastUpdate);
  const wsCounts = useMatchStore((s) => s.counts);

  const sports = useQuery({ queryKey: ['sports'], queryFn: fetchSports, staleTime: Infinity });
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 60_000 });

  // WebSocket counts win; the REST list fills the sidebar until the first one arrives.
  const counts: LiveCounts | null =
    wsCounts ??
    (sports.data
      ? (Object.fromEntries(
          CATEGORIES.map((c) => [c, sports.data.find((s) => s.category === c)?.live ?? 0]),
        ) as LiveCounts)
      : null);

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: 'lg', collapsed: { mobile: true } }}
      padding="md"
    >
      <AppShell.Header className={styles.header}>
        <AppHeader
          connection={connection}
          lastUpdate={lastUpdate}
          timeZone={live.timeZone}
          polling={live.polling}
        />
      </AppShell.Header>

      <AppShell.Navbar className={styles.navbar}>
        <SportNav variant="sidebar" active={category} counts={counts} onSelect={setCategory} />
      </AppShell.Navbar>

      <AppShell.Main className={styles.main}>
        <Box hiddenFrom="lg">
          <SportNav variant="tabs" active={category} counts={counts} onSelect={setCategory} />
        </Box>
        <div className={styles.content}>
          {health.data?.provider === 'mock' && (
            <p className={styles.banner} role="note">
              <strong>Demo data</strong> – scores are simulated. Add a SportsAPI Pro key in
              server/.env for real matches.
            </p>
          )}
          <Group justify="space-between" align="center" className={styles.toolbar}>
            <Title order={1} size="h2" className={styles.title}>
              {CATEGORY_LABELS[category]}
            </Title>
            <LiveOnlyToggle checked={liveOnly} onChange={setLiveOnly} />
          </Group>
          <MatchList
            category={category}
            matches={live.matches}
            liveOnly={liveOnly}
            isLoading={live.isLoading}
            error={live.error}
            timeZone={live.timeZone}
            stale={connection === 'offline'}
          />
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
