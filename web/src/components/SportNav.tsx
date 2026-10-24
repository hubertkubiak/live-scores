import type { ComponentType } from 'react';
import {
  IconBallBasketball,
  IconBallFootball,
  IconBallTennis,
  IconCategory,
  IconIceSkating,
  type IconProps,
} from '@tabler/icons-react';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type LiveCounts,
  type SportCategory,
} from '@live-scores/shared';
import styles from './SportNav.module.css';

const ICONS: Record<SportCategory, ComponentType<IconProps>> = {
  football: IconBallFootball,
  tennis: IconBallTennis,
  basketball: IconBallBasketball,
  hockey: IconIceSkating,
  other: IconCategory,
};

interface SportNavProps {
  active: SportCategory;
  counts: LiveCounts | null;
  onSelect: (category: SportCategory) => void;
  variant: 'sidebar' | 'tabs';
}

export function SportNav({ active, counts, onSelect, variant }: SportNavProps) {
  return (
    <nav className={variant === 'tabs' ? styles.tabs : styles.nav} aria-label="Sports">
      <ul className={styles.list}>
        {CATEGORIES.map((category) => {
          const Icon = ICONS[category];
          const live = counts?.[category] ?? 0;
          return (
            <li key={category}>
              <button
                type="button"
                className={styles.item}
                aria-current={category === active ? 'page' : undefined}
                onClick={() => onSelect(category)}
              >
                <Icon size={20} stroke={1.8} aria-hidden />
                <span className={styles.label}>{CATEGORY_LABELS[category]}</span>
                <span className={live > 0 ? styles.count : styles.countNone}>
                  {counts ? `${live} live` : '–'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
