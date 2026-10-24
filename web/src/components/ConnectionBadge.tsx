import { formatInTimeZone } from 'date-fns-tz';
import type { ConnectionState } from '../store/matches';
import styles from './ConnectionBadge.module.css';

const LABELS: Record<ConnectionState, string> = {
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  offline: 'Offline – showing last data',
};

interface ConnectionBadgeProps {
  state: ConnectionState;
  lastUpdate: number | null;
  timeZone: string;
  polling: boolean;
}

export function ConnectionBadge({ state, lastUpdate, timeZone, polling }: ConnectionBadgeProps) {
  return (
    <div className={styles.badge}>
      <span className={`${styles.indicator} ${styles[state]}`} aria-hidden />
      <span role="status" aria-live="polite">
        {LABELS[state]}
        {polling && state !== 'offline' ? ' (polling)' : ''}
      </span>
      {lastUpdate && (
        <span className={styles.updated}>
          · Updated {formatInTimeZone(lastUpdate, timeZone, 'HH:mm:ss')}
        </span>
      )}
    </div>
  );
}
