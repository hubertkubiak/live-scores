import { Group, Text } from '@mantine/core';
import { formatInTimeZone } from 'date-fns-tz';
import type { ConnectionState } from '../store/matches';
import { ConnectionBadge } from './ConnectionBadge';
import { LiveDot } from './LiveDot';
import styles from '../App.module.css';

interface AppHeaderProps {
  connection: ConnectionState;
  lastUpdate: number | null;
  timeZone: string;
  polling: boolean;
}

export function AppHeader({ connection, lastUpdate, timeZone, polling }: AppHeaderProps) {
  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="sm">
      <Group gap="sm" wrap="nowrap">
        <LiveDot decorative />
        <span className={styles.logo}>Live Scores</span>
        <Text visibleFrom="sm" className={styles.date}>
          {formatInTimeZone(Date.now(), timeZone, 'EEEE, d MMMM')}
        </Text>
      </Group>
      <ConnectionBadge
        state={connection}
        lastUpdate={lastUpdate}
        timeZone={timeZone}
        polling={polling}
      />
    </Group>
  );
}
