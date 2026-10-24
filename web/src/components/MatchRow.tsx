import { memo, useEffect, useRef, useState } from 'react';
import { isLive, type Match } from '@live-scores/shared';
import { formatKickOff } from '../api/time';
import { LiveDot } from './LiveDot';
import { TennisScore } from './TennisScore';
import styles from './MatchRow.module.css';

export const FLASH_MS = 1500;

interface MatchRowProps {
  match: Match;
  timeZone: string;
  /** Connection lost: live dots fade to grey. */
  stale?: boolean;
}

function statusText(m: Match, timeZone: string): string {
  switch (m.status) {
    case 'scheduled':
      return formatKickOff(m.startTime, timeZone);
    case 'postponed':
      return 'Postponed';
    case 'cancelled':
      return 'Cancelled';
    case 'finished':
      return m.statusLabel || 'FT';
    default:
      return m.statusLabel;
  }
}

function statusClass(m: Match) {
  if (isLive(m)) return styles.statusLive;
  if (m.status === 'postponed' || m.status === 'cancelled') return styles.statusAlert;
  return styles.status;
}

/** Flashes the row briefly whenever the score changes (not on first render). */
function useScoreFlash(m: Match): number {
  const key = `${m.home.score}:${m.away.score}:${JSON.stringify(m.periodScores ?? [])}`;
  const previous = useRef(key);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    setFlash((n) => n + 1);
    const timer = setTimeout(() => setFlash(0), FLASH_MS);
    return () => clearTimeout(timer);
  }, [key]);

  return flash;
}

export const MatchRow = memo(function MatchRow({
  match: m,
  timeZone,
  stale = false,
}: MatchRowProps) {
  const flash = useScoreFlash(m);
  const live = isLive(m);
  const started = m.status !== 'scheduled' && m.home.score !== null && m.away.score !== null;
  const isTennis = m.sport === 'tennis' && !!m.periodScores?.length;
  const currentSet = live && isTennis ? m.periodScores!.length - 1 : -1;
  const homeWon = m.status === 'finished' && (m.home.score ?? 0) > (m.away.score ?? 0);
  const awayWon = m.status === 'finished' && (m.away.score ?? 0) > (m.home.score ?? 0);

  const side = (which: 'home' | 'away', won: boolean) => {
    const team = m[which];
    return (
      <div className={styles.team}>
        <span className={won ? `${styles.name} ${styles.winner}` : styles.name}>{team.name}</span>
        {isTennis ? (
          <TennisScore
            games={m.periodScores!.map((s) => s[which])}
            sets={team.score}
            currentSet={currentSet}
          />
        ) : (
          started && <span className={styles.score}>{team.score}</span>
        )}
      </div>
    );
  };

  return (
    <li className={styles.row} data-flashing={flash > 0 || undefined} data-status={m.status}>
      {flash > 0 && <span key={flash} className={styles.flash} aria-hidden />}
      <span className={styles.dotCell}>{live && <LiveDot stale={stale} />}</span>
      <div className={styles.teams}>
        {side('home', homeWon)}
        {side('away', awayWon)}
      </div>
      <span className={statusClass(m)}>{statusText(m, timeZone)}</span>
    </li>
  );
});
