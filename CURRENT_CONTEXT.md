# CURRENT_CONTEXT.md — Project Athena

This is a snapshot, not a history — per `PROJECT_RULES.md` §5, old
entries move to `CHANGELOG.md`, not accumulate here. A future session
(human or Claude) should be able to re-orient from this file alone.

---

## What's done

Sprint **S01 — Foundation Scaffold** is complete. The repository now
has:

- A booting six-crate Cargo workspace with the Master Spec §4.5
  dependency graph enforced by `Cargo.toml`, not convention.
- A Tauri 2.x shell that opens a single blank window and proves one
  real Rust → IPC → TypeScript round trip (`get_app_version`).
- SQLite in WAL mode, migrated automatically and idempotently on
  startup via `refinery`, with zero domain tables.
- Structured JSON-lines logging to a local rotating file.
- Per-crate typed error enum skeletons.
- Green CI: `rustfmt`, `clippy -D warnings`, unit + integration tests,
  an offline-mode job, TypeScript strict-mode type-check, and an IPC
  contract check.

**There is no domain logic and no product screen yet.** `athena-domain`
is an empty crate with only an error-enum skeleton. The frontend is a
single blank shell displaying a version string — no Now/Trajectory/
SemesterSetup/DecisionLog screens exist.

## What's in flight

Nothing — S01 is closed. No PR is currently open against this scaffold.

## Next sprint

**S02**, per `ROADMAP.md`. Per `PROJECT_RULES.md` §7 (Rules for Future
Claude Sessions), read `MASTER_SPECIFICATION.md`, `ROADMAP.md`, and
`PROJECT_RULES.md` before starting any S02 work — do not reconstruct
scope from this file alone; it is a snapshot, not a substitute for the
authoritative sources.

## Open questions / risks carried forward from S01

These are the known risks `SPRINT1_SPEC.md` §9 flagged as needing
re-validation once real work exists to stress them — carried here per
that section's own instruction, not forgotten once S01 closed:

1. **CI runtime/offline-mode behavior at scale is unproven.** S01's CI
   job ran against a near-empty test suite. Once S02 adds real tests,
   re-check that the offline-mode job's network-blocking step
   (`unshare --net`) still behaves correctly and that CI runtime stays
   within GitHub Actions' free-tier minutes.
2. **The IPC contract-check script (`scripts/check_ipc_contract.py`) is
   a minimal regex-based tool**, validated only against one trivial
   command with a flat, one-field payload. Before trusting it as a
   permanent CI gate, re-validate it against S02's first command with a
   non-trivial (nested, optional-field, or enum) payload shape — it may
   need to become a real bindings generator (e.g. `tauri-specta`)
   instead of a hand-rolled regex check.
3. **`tauri.conf.json`'s `bundle.icon` is an empty placeholder array.**
   Sufficient for `cargo tauri dev`, insufficient for
   `cargo tauri build`'s installer bundling. Real icon assets must be
   added before any packaging/release work begins (Implementation Plan
   §14).

## Explicitly out of scope (do not start early)

Per `SPRINT1_SPEC.md` §1 and `PROJECT_RULES.md` Immutable Rule #7/#3, the
following are later sprints' own deliverables and were deliberately not
started in S01, even partially: any `athena-domain` submodule
(`priority/`, `bottleneck/`, `drift/`, `deep_work/`, `divergence/`), any
of the four product screens, any real repository, the `LlmProvider`
trait and its providers, any outbound network integration, the event
bus's interceptor chain, and the OS-keychain secrets plugin.
