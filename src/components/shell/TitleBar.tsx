import { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { Icon } from '../shared/Icon';
import styles from './TitleBar.module.css';

type Platform = 'macos' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  return /Mac/i.test(navigator.userAgent) ? 'macos' : 'other';
}

/**
 * Custom frameless title bar (Tauri `decorations: false`). Native OS
 * caption-button placement is respected per platform — macOS left,
 * Windows/Linux right (SPRINT2_SPEC.md §13, §17) — but the buttons
 * themselves are structurally present and visually inert this sprint:
 * wiring them to the real Tauri window API is a Tauri IPC call, which
 * this sprint's Definition of Done excludes entirely (§18, "zero Tauri
 * IPC command invocations anywhere in this sprint's code").
 */
export function TitleBar() {
  const [platform, setPlatform] = useState<Platform>('other');

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const captionControls =
    platform === 'macos' ? (
      <div className={styles.captionControls} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    ) : (
      <div className={styles.captionControls} aria-hidden="true">
        <span className={styles.captionButton}>
          <Icon icon={Minus} size="inline" />
        </span>
        <span className={styles.captionButton}>
          <Icon icon={Square} size="inline" />
        </span>
        <span className={styles.captionButton}>
          <Icon icon={X} size="inline" />
        </span>
      </div>
    );

  return (
    <header className={styles.titleBar} data-platform={platform}>
      {captionControls}
      <span className={`${styles.appName} type-caption`}>Athena</span>
    </header>
  );
}
