import styles from './MatchRow.module.css';

interface TennisScoreProps {
  /** Games per set, from this player's side. */
  games: number[];
  /** Sets won. */
  sets: number | null;
  /** Index of the set being played, or -1. */
  currentSet: number;
}

export function TennisScore({ games, sets, currentSet }: TennisScoreProps) {
  return (
    <span className={styles.sets}>
      {games.map((g, i) => (
        <span key={i} className={i === currentSet ? styles.setCurrent : styles.set}>
          {g}
        </span>
      ))}
      <span className={styles.score}>{sets ?? ''}</span>
    </span>
  );
}
