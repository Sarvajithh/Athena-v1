import { useState, type ReactNode } from 'react';
import styles from './CollapseList.module.css';

const VISIBLE_LIMIT = 5;

interface CollapseListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  className?: string;
}

/**
 * Enforces the spec's hard "max 5 visible before collapse" rule (spec
 * §5.1) for any list in the app. Expand animates height via a grid-rows
 * transition, not opacity-only — it should feel like revealing, not
 * popping in (SPRINT2_SPEC.md §11).
 */
export function CollapseList<T>({ items, renderItem, getKey, className }: CollapseListProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const visible = items.slice(0, VISIBLE_LIMIT);
  const hidden = items.slice(VISIBLE_LIMIT);

  return (
    <div className={[styles.list, className].filter(Boolean).join(' ')}>
      {visible.map((item, index) => (
        <div key={getKey(item, index)}>{renderItem(item, index)}</div>
      ))}
      {hidden.length > 0 ? (
        <>
          <div className={styles.hiddenGroup} data-expanded={expanded}>
            <div className={styles.hiddenGroupInner}>
              {hidden.map((item, index) => (
                <div key={getKey(item, index + VISIBLE_LIMIT)}>{renderItem(item, index + VISIBLE_LIMIT)}</div>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={`${styles.expandButton} type-caption`}
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : `+${hidden.length} more`}
          </button>
        </>
      ) : null}
    </div>
  );
}
