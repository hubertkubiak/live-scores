import styles from './LiveDot.module.css';

interface LiveDotProps {
  /** Offline: the match may have moved on, so the dot fades to grey. */
  stale?: boolean;
  /** Decorative uses (the logo) hide it from assistive tech. */
  decorative?: boolean;
}

export function LiveDot({ stale = false, decorative = false }: LiveDotProps) {
  return (
    <span
      className={stale ? `${styles.dot} ${styles.stale}` : styles.dot}
      data-testid="live-dot"
      {...(decorative
        ? { 'aria-hidden': true }
        : {
            role: 'img',
            'aria-label': stale ? 'Match in progress (connection lost)' : 'Match in progress',
          })}
    />
  );
}
