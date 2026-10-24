import type { CompetitionGroupData } from '@live-scores/shared';
import { MatchRow } from './MatchRow';
import styles from './CompetitionGroup.module.css';

interface CompetitionGroupProps {
  group: CompetitionGroupData;
  timeZone: string;
  stale: boolean;
  headingLevel?: 2 | 3;
}

export function CompetitionGroup({
  group,
  timeZone,
  stale,
  headingLevel = 2,
}: CompetitionGroupProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={styles.card} aria-label={group.name}>
      <Heading className={styles.header}>
        {group.name}
        {group.country && <span className={styles.country}>{group.country}</span>}
      </Heading>
      <ul className={styles.list}>
        {group.matches.map((m) => (
          <MatchRow key={m.id} match={m} timeZone={timeZone} stale={stale} />
        ))}
      </ul>
    </section>
  );
}
