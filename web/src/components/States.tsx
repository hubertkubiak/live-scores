import type { ReactNode } from 'react';
import { Skeleton, Stack } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCalendarOff,
  IconHourglass,
  IconPlayerPause,
} from '@tabler/icons-react';
import styles from './States.module.css';

interface StateProps {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  tone?: 'neutral' | 'error';
}

function State({ icon, title, children, tone = 'neutral' }: StateProps) {
  return (
    <div
      className={tone === 'error' ? `${styles.state} ${styles.error}` : styles.state}
      role="status"
    >
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
      <p className={styles.title}>{title}</p>
      {children && <p className={styles.text}>{children}</p>}
    </div>
  );
}

export function EmptyState({ liveOnly }: { liveOnly: boolean }) {
  return liveOnly ? (
    <State icon={<IconPlayerPause size={32} />} title="No live matches right now">
      Turn off “Live only” to see today’s scheduled and finished matches.
    </State>
  ) : (
    <State icon={<IconCalendarOff size={32} />} title="No matches today">
      There is nothing on the schedule for this sport today.
    </State>
  );
}

export function ErrorState({ rateLimited }: { rateLimited: boolean }) {
  return rateLimited ? (
    <State icon={<IconHourglass size={32} />} title="Daily data limit reached" tone="error">
      The free API quota is used up for today. Live updates continue for matches already loaded; the
      full list returns after the quota resets at midnight UTC.
    </State>
  ) : (
    <State icon={<IconAlertTriangle size={32} />} title="Couldn’t load matches" tone="error">
      The scores service isn’t responding. We’ll keep trying in the background.
    </State>
  );
}

export function MatchListSkeleton() {
  return (
    <Stack gap="md" aria-busy="true" aria-label="Loading matches">
      {[3, 2].map((rows, i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={styles.skeletonHeader}>
            <Skeleton height={14} width="35%" />
          </div>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className={styles.skeletonRow}>
              <Skeleton height={10} circle />
              <Stack gap={6}>
                <Skeleton height={12} width="60%" />
                <Skeleton height={12} width="50%" />
              </Stack>
              <Skeleton height={12} />
            </div>
          ))}
        </div>
      ))}
    </Stack>
  );
}
