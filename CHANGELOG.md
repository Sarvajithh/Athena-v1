# CHANGELOG.md — Project Athena

All entries name the sprint ID (matching the `S06: Priority Resolution
core algorithm` commit-message convention, `IMPLEMENTATION_PLAN.md`
§12), what shipped, and which spec section justified any non-cosmetic
decision, per `PROJECT_RULES.md` §5.

---

## S01 — Foundation Scaffold

**Shipped:**

- Six-crate Cargo workspace (`athena-domain`, `athena-data`,
  `athena-events`, `athena-reasoning`, `athena-ingestion`, `athena-app`)
  with the internal dependency graph from Master Spec §4.5 encoded
  directly in each crate's `Cargo.toml` — `athena-domain` depends on
  nothing internal and nothing beyond `std`; `athena-events` and
  `athena-reasoning` depend on `athena-domain` and `athena-data`;
  `athena-ingestion` depends on `athena-data`; `athena-app` depends on
  all four plus `athena-data` directly for its own DB bootstrap.
  *(Implementation Plan §1, §3, §4; PROJECT_RULES.md Immutable Rule
  #1, #4.)*
- Tauri 2.x shell (`athena-app`) that boots a single blank window and
  registers exactly one IPC command, `get_app_version`, returning a
  typed `AppVersionInfo` struct. The React/TypeScript frontend
  (`src/App.tsx`) calls it on load and displays the result.
  *(Implementation Plan §1, §10.1; PROJECT_RULES.md Immutable Rule #8.)*
- SQLite database (`athena-data::connection`) opened in WAL mode with an
  automatic, idempotent `refinery` migration runner and one empty
  baseline migration (`V1__baseline.sql`) that introduces no domain
  tables — only `refinery`'s own bookkeeping table exists after S01.
  *(Implementation Plan §9; PROJECT_RULES.md Immutable Rule #2, #7.)*
- Structured logging via `tracing`, writing daily-rotating JSON-lines
  log files, with `INFO`-level lines at startup and migration
  completion and `ERROR`-level lines on migration failure, per the four
  log levels defined in Implementation Plan §7.
  *(Implementation Plan §7; PROJECT_RULES.md Immutable Rule #8.)*
- Per-crate typed error enum skeletons: `DomainError`, `DataError` (with
  two real variants — `Connection`, `Migration` — since S01's DB
  bootstrap is real fallible code), `EventsError`, `ReasoningError`,
  `IngestionError`. *(Implementation Plan §6.)*
- GitHub Actions CI (`.github/workflows/ci.yml`): `rustfmt`,
  `clippy -D warnings`, `cargo test --workspace` (unit + integration),
  an offline-mode job with network access removed before the test run,
  `npx tsc --noEmit` in strict mode, and a hand-rolled IPC contract
  check (`scripts/check_ipc_contract.py`) comparing the one Rust
  command's signature/payload shape against the TypeScript binding.
  *(Implementation Plan §11, §12; PROJECT_RULES.md §4, §8.)*
- Documentation scaffolds: this file, `CURRENT_CONTEXT.md`,
  `docs/decisions/README.md`, `docs/runbooks/README.md`,
  `tests/e2e/README.md` — all empty of real content beyond their own
  convention, as scoped. *(PROJECT_RULES.md §5.)*

**Explicitly not shipped (by design, per `SPRINT1_SPEC.md` §0/§1):** any
`athena-domain` submodule (`priority/`, `bottleneck/`, `drift/`,
`deep_work/`, `divergence/`); any product screen; any repository beyond
the empty `athena-data::repositories` placeholder; the `LlmProvider`
trait; any outbound network integration; the event bus's interceptor
chain; the OS-keychain secrets plugin; `proptest`, Vitest, and
Playwright (no real logic or user flow exists yet to justify adding
them, per Implementation Plan §11.1).

**Known open items carried to S02** (see `SPRINT1_SPEC.md` §9 and
`CURRENT_CONTEXT.md`): CI job runtime/offline-blocking behavior is
unproven at scale against near-empty test suites; the IPC contract-check
script is a minimal regex-based tool, not a real bindings generator, and
should be re-validated once a command with a non-trivial payload shape
exists; app icons in `tauri.conf.json` are an empty placeholder array
(sufficient to launch in dev mode, insufficient to produce a real
installer bundle) and must be supplied before any packaging/release
work.

**Next sprint:** S02, per `ROADMAP.md`.
