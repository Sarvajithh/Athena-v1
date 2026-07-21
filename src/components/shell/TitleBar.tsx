import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X } from 'lucide-react';
import { Icon } from '../shared/Icon';
import styles from './TitleBar.module.css';

type Platform = 'macos' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  return /Mac/i.test(navigator.userAgent) ? 'macos' : 'other';
}

const appWindow = getCurrentWindow();

/**
 * Custom frameless title bar (Tauri `decorations: false`, see
 * `tauri.conf.json`). Turning `decorations` off hands *everything* the
 * OS used to do — dragging, minimize, maximize/restore, close — to this
 * component; none of it is automatic. Two things previously broken:
 *
 * 1. Drag and the min/max/close commands go through Tauri v2's ACL
 *    permission system. Without `core:window:allow-minimize`,
 *    `allow-toggle-maximize`, `allow-close`, and `allow-start-dragging`
 *    granted in `capabilities/default.json`, every one of these calls —
 *    and `data-tauri-drag-region` itself, which dispatches to the same
 *    start-dragging command under the hood — was silently rejected.
 *    Those permissions are now granted there.
 * 2. macOS previously rendered inert dots with no click handlers at
 *    all, so the window was unminimizable/unclosable without a native
 *    frame on macOS specifically. Every platform now gets real
 *    buttons; only the icon set and left/right placement differ
 *    (macOS traffic-light order on the left, Windows/Linux caption
 *    buttons on the right — matches native OS conventions on each).
 *
 * `isMaximized` is tracked so the maximize button swaps to a restore
 * icon and so double-clicking the empty drag region toggles maximize,
 * both standard native title-bar behavior this component has to
 * reimplement by hand now that the OS chrome is gone.
 */
export function TitleBar() {
  const [platform, setPlatform] = useState<Platform>('other');
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    appWindow
      .isMaximized()
      .then((maximized) => {
        if (!cancelled) setIsMaximized(maximized);
      })
      .catch(() => undefined);

    appWindow
      .onResized(() => {
        appWindow
          .isMaximized()
          .then((maximized) => setIsMaximized(maximized))
          .catch(() => undefined);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleMinimize = () => {
    void appWindow.minimize();
  };

  const handleToggleMaximize = () => {
    void appWindow.toggleMaximize();
  };

  const handleClose = () => {
    void appWindow.close();
  };

  const handleDragRegionDoubleClick = () => {
    handleToggleMaximize();
  };

  const buttons = (
    <>
      <button type="button" className={styles.captionButton} onClick={handleMinimize} aria-label="Minimize">
        <Icon icon={Minus} size="inline" />
      </button>
      <button
        type="button"
        className={styles.captionButton}
        onClick={handleToggleMaximize}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
      >
        <Icon icon={isMaximized ? Copy : Square} size="inline" />
      </button>
      <button
        type="button"
        className={`${styles.captionButton} ${styles.closeButton}`}
        onClick={handleClose}
        aria-label="Close"
      >
        <Icon icon={X} size="inline" />
      </button>
    </>
  );

  const captionControls =
    platform === 'macos' ? (
      <div className={`${styles.captionControls} ${styles.macosControls}`}>{buttons}</div>
    ) : (
      <div className={styles.captionControls}>{buttons}</div>
    );

  return (
    <header className={styles.titleBar} data-platform={platform}>
      {platform === 'macos' && captionControls}
      <span
        className={`${styles.appName} type-caption`}
        data-tauri-drag-region
        onDoubleClick={handleDragRegionDoubleClick}
      >
        Athena
      </span>
      <div className={styles.spacer} data-tauri-drag-region onDoubleClick={handleDragRegionDoubleClick} />
      {platform !== 'macos' && captionControls}
    </header>
  );
}
