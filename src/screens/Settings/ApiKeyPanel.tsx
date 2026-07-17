import { useEffect, useState } from 'react';
import { Card } from '../../components/shared/Card';
import styles from './Settings.module.css';

interface ApiKeyPanelProps {
  label: string;
  description: string;
  placeholder: string;
  helpUrl?: string;
  helpLabel?: string;
  hasKey: () => Promise<boolean>;
  saveKey: (key: string) => Promise<void>;
  deleteKey: () => Promise<void>;
}

/**
 * One provider's key-management panel — save/replace and delete,
 * against whichever `has*ApiKey`/`save*ApiKey`/`delete*ApiKey` triplet
 * is passed in (`ipc/bindings.ts`'s AI layer, 06_AI_ENGINE.md §9).
 * Never displays the key itself once saved, matching GitHub's token
 * panel in `ConnectorsStep.tsx` (`ConnectorsStep.tsx`'s `GithubPanel` is
 * the closest existing analog: "read-only... stored in your OS
 * keychain, never in Athena's database").
 */
export function ApiKeyPanel({
  label,
  description,
  placeholder,
  helpUrl,
  helpLabel,
  hasKey,
  saveKey,
  deleteKey,
}: ApiKeyPanelProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    hasKey()
      .then(setConnected)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveKey(value.trim());
      setValue('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteKey();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={styles.card}>
      <div className={styles.section}>
        <span className="type-body-medium">{label}</span>
        <p className={`${styles.sectionDescription} type-caption`}>
          {description}
          {helpUrl ? (
            <>
              {' '}
              <a href={helpUrl} target="_blank" rel="noreferrer">
                {helpLabel ?? 'Get a key'}
              </a>
            </>
          ) : null}
        </p>
      </div>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className="type-caption">API key</span>
          <input
            className={styles.input}
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={connected ? `${label} key saved — enter a new one to replace it` : placeholder}
            disabled={busy}
          />
        </label>
        <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={busy || !value.trim()}>
          {busy ? 'Saving…' : 'Save key'}
        </button>
        {connected ? (
          <button type="button" className={styles.removeButton} onClick={handleDelete} disabled={busy}>
            Disconnect
          </button>
        ) : null}
      </div>

      <div className={styles.statusRow}>
        <span className="type-caption">
          {connected == null ? 'Checking…' : connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      {error ? <p className={`${styles.error} type-caption`}>{error}</p> : null}
    </Card>
  );
}
