import { useEffect, useState } from "react";
import { getAppVersion } from "./ipc/bindings";

/**
 * S01's entire frontend: a blank shell that proves the Rust -> IPC ->
 * TypeScript round trip (SPRINT1_SPEC.md Objective 3, Acceptance
 * Criterion #6) by calling `get_app_version` on load and displaying the
 * result. No screens, no components beyond this — those are later
 * sprints (SPRINT1_SPEC.md §0).
 */
export default function App() {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAppVersion()
      .then((info) => setVersion(info.version))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  return (
    <main>
      <h1>Athena</h1>
      {error && <p role="alert">IPC error: {error}</p>}
      {!error && version === null && <p>Loading…</p>}
      {!error && version !== null && <p>App version: {version}</p>}
    </main>
  );
}
