# SPRINTS.md — Project Athena
### 29 sprints (S0–S28), each 1–3 days, each independently testable. No code included — this is the build plan, not the build.

Legend: **[MVP]** = required for Milestone 3 / the product's core value
proposition. **[FUTURE]** = real, planned, but the product is complete
and usable without it. File paths reference the crate/folder layout
adopted in `MASTER_SPECIFICATION.md` §4.5 and §4.8.

---

## PHASE A — Foundation

### S0 — Workspace & Crate Scaffolding **[MVP]**
**Goal:** A Cargo workspace and Tauri shell that boots to a blank window,
with every crate boundary from the spec physically present (even if
empty), so no later sprint has to invent structure under pressure.

**Features:**
- Cargo workspace with six crates: `athena-domain`, `athena-data`,
  `athena-events`, `athena-reasoning`, `athena-ingestion`, `athena-app`.
- `athena-app` boots a Tauri window; React + TypeScript frontend renders
  a placeholder "Athena" screen.
- Dependency rule from §4.5 encoded in each crate's `Cargo.toml` (e.g.
  `athena-domain` has zero path dependencies).
- CI pipeline: `cargo build`, `cargo test`, `cargo clippy -- -D
  warnings`, frontend `tsc --noEmit`, on every push.

**Files likely to change:**
`Cargo.toml` (workspace root), `src-tauri/crates/*/Cargo.toml`,
`src-tauri/crates/*/src/lib.rs` (stubs), `src-tauri/crates/athena-app/src/main.rs`,
`tauri.conf.json`, `src/App.tsx`, `src/main.tsx`, `package.json`,
`.github/workflows/ci.yml` (or equivalent CI config).

**Definition of Done:**
- [ ] `cargo build --workspace` succeeds with all six crates present.
- [ ] Attempting to add a `sqlx`/`tauri` dependency to `athena-domain`'s
      `Cargo.toml` and running `cargo build` visibly fails a documented
      lint/check (a manual smoke test proving the dependency rule is
      real, not aspirational).
- [ ] The Tauri app launches on the developer's machine and shows a
      window.
- [ ] CI is green on a clean clone.

**Risks:**
- Tauri/Rust toolchain version drift between developer machine and CI —
  mitigate by pinning exact toolchain versions in `rust-toolchain.toml`.
- Over-engineering the crate boundary enforcement this early (e.g.
  building a custom lint) — a plain `cargo build` failure from a missing
  dependency is enough; don't build tooling the spec didn't ask for.

---

### S1 — Database Schema & Migration Runner **[MVP]**
**Goal:** Every table from `MASTER_SPECIFICATION.md` §7.2 exists,
migrations are additive-only by convention, and `athena-data` can open
the database and run migrations on startup.

**Features:**
- All core tables: `semesters`, `courses`, `grade_snapshots`,
  `deadlines`, `dsa_practice_log`, `codeforces_snapshots`, `projects`,
  `project_status_snapshots`, `research_activities`, `deep_work_sessions`,
  `bottlenecks`, `drift_signals`, `opportunities`, `decisions`,
  `recommendations`, `data_sources`, `user_profile`,
  `user_profile_history`, `event_log`.
- Migration runner wired into `athena-app` startup.
- No `tasks`, `streaks`/`badges`/`points`, `weekly_template`,
  `shared_with`/`collaborators`, memory-system, or `mood_log` tables —
  confirm the rejected-tables list from §7.3 by their absence.

**Files likely to change:**
`migrations/0001_init.sql` (and subsequent numbered migrations),
`migrations/README.md`, `src-tauri/crates/athena-data/src/migrations_runner.rs`,
`src-tauri/crates/athena-data/src/lib.rs`.

**Definition of Done:**
- [ ] Running the app on a fresh machine creates a new SQLite file with
      every table from §7.2 present, verified by a migration test that
      asserts the full table list.
- [ ] Running migrations twice in a row is a no-op (idempotency test).
- [ ] A test explicitly asserts none of the rejected tables from §7.3
      exist — this test should fail loudly if someone adds one later.
- [ ] `bottlenecks.status` and `deadlines.leverage_class` enum-style
      constraints match §7.2/DATABASE_SCHEMA exactly (e.g. no
      `resolved_by_inactivity` value is a valid status).

**Risks:**
- Schema churn once real UI/domain work starts (S3+) may require
  migrations before the additive-only discipline is battle-tested — treat
  every schema change from S3 onward as a new migration file, never an
  edit to `0001_init.sql`, starting now.
- SQLite type affinity looseness (no real enum type) means invalid status
  strings can slip in without app-level validation — flag as a dependency
  for S3+ repository code to enforce at the Rust layer, not just trust
  the schema.

---

### S2 — IPC Chokepoint & Screen Shells **[MVP]**
**Goal:** The four approved screens (§4.8, §5.2) exist as navigable,
empty shells, and the single chokepoint rule ("`ipc/` is the only place
allowed to call `invoke()`") is structurally true, not just documented.

**Features:**
- Four screens: `Now`, `Trajectory`, `SemesterSetup`, `DecisionLog`, with
  basic navigation between them.
- `src/ipc/` established as the only module permitted to call Tauri's
  `invoke()` — enforced via a lint rule or code-review checklist item, not
  yet by a real command (no commands exist yet).
- One real round-trip Tauri command (e.g. `ping`) to prove the IPC
  boundary works end-to-end, frontend to Rust and back.

**Files likely to change:**
`src/screens/Now/`, `src/screens/Trajectory/`, `src/screens/SemesterSetup/`,
`src/screens/DecisionLog/`, `src/ipc/`, `src-tauri/crates/athena-app/src/commands.rs`,
`src/App.tsx` (routing).

**Definition of Done:**
- [ ] All four screens render, navigable via the app's chrome, with no
      placeholder fifth screen anywhere (confirms the four-screen
      constraint from the first commit, not retrofitted later).
- [ ] The `ping` command round-trips visibly in the UI.
- [ ] A grep/lint check confirms no `invoke(` call exists outside
      `src/ipc/`.

**Risks:**
- Temptation to add a fifth "Settings" screen "just for now" — explicitly
  disallowed per §4.8; any settings that exist belong inside
  `SemesterSetup` or a compact preferences panel, not a new screen.

---

## PHASE B — Manual Core Loop

### S3 — Semester Setup: Core Entry **[MVP]**
**Goal:** The user can manually create a semester, add courses, and add
deadlines — the minimum data needed for anything downstream to reason
about.

**Features:**
- `SemesterRepository`, `CourseRepository`, `DeadlineRepository` in
  `athena-data`, each exposing a narrow domain-shaped interface (no raw
  SQL leaking upward, per §12 Engineering Guideline #1's spirit extended
  to the data layer).
- `Semester Setup` wizard UI: create semester (label, start/end date,
  deep-work window defaulting to 20:00–00:00 per §7.2's schema note),
  add courses, add deadlines.
- `CommitScheduleItem`-shaped writes go through a Command, even though
  the interceptor chain doesn't exist yet (S8) — the Command *type*
  exists now so S8 doesn't require touching this code again.

**Files likely to change:**
`src-tauri/crates/athena-data/src/repositories/semester_repository.rs`,
`.../course_repository.rs`, `.../deadline_repository.rs`,
`src/screens/SemesterSetup/*`, `src/ipc/semester.ts`,
`src-tauri/crates/athena-app/src/commands.rs`.

**Definition of Done:**
- [ ] A new semester with ≥1 course and ≥1 deadline can be created
      through the UI and persists across an app restart.
- [ ] `semester_id` is a required, non-null foreign key on `courses` and
      `deadlines` rows created this way (confirms §7.1 rule #2 from the
      first real data, not just the schema).
- [ ] Repository-level unit tests cover create/read for all three
      repositories without going through the UI.

**Risks:**
- Building a "smart" deadline importer prematurely — resist; CSV/ICS
  import is explicitly S22, not this sprint. Manual entry only.

---

### S4 — Manual Grade & DSA Logging **[MVP]**
**Goal:** The user can log a grade snapshot and a DSA practice session
manually — the two trajectory metrics with no external connector until
Phase D.

**Features:**
- `GradeSnapshotRepository`, `DsaPracticeLogRepository`.
- Simple logging forms (course selector, assessment label, score,
  optional whole-CGPA snapshot; topic, problems attempted/solved).
- `source_id` correctly stamped as `manual_entry` in `data_sources` for
  every row created this way (this is what makes S21's Codeforces
  connector distinguishable later without a migration).

**Files likely to change:**
`src-tauri/crates/athena-data/src/repositories/grade_snapshot_repository.rs`,
`.../dsa_practice_log_repository.rs`, `src/screens/SemesterSetup/*` or a
lightweight logging entry point reachable from `Now` (per §5.3's
guidance that any quick-add must create a typed entity, not a freeform
capture box).

**Definition of Done:**
- [ ] A grade snapshot and a DSA log entry can each be created and
      persist across restart.
- [ ] Both are correctly tagged with `source_id → data_sources.kind =
      'manual_entry'`.
- [ ] `score_percent` accepts NULL without defaulting to zero (confirms
      §7.2's explicit nullability rule).

**Risks:**
- None significant — this sprint is intentionally low-risk, mechanical
  CRUD, by design (it should be the easiest sprint in the plan).

---

### S5 — Local Backup System v1 **[MVP]** *(pulled forward — see ROADMAP.md §3)*
**Goal:** From this point on, real user data (grades, deadlines) is never
one disk failure away from being lost.

**Features:**
- Rolling local timestamped backups of the SQLite file
  (`athena-YYYY-MM-DD-HHmm.sqlite`) on a retention window (e.g. last 30
  daily + last 12 monthly, per `FOLDER_STRUCTURE.md`'s original spec).
- Backup runs on app startup/shutdown at minimum; a scheduled trigger can
  be deferred to S17 once the Scheduler exists.
- `backups/` is gitignored, runtime-only, documented in a short
  `backups/README.md`.

**Files likely to change:**
`src-tauri/crates/athena-app/src/main.rs` (backup trigger on
startup/shutdown), a small new module (e.g.
`src-tauri/crates/athena-data/src/backup.rs`), `backups/README.md`,
`.gitignore`.

**Definition of Done:**
- [ ] Closing and reopening the app produces a new timestamped backup
      file distinct from the live database.
- [ ] Retention pruning removes backups beyond the documented window in a
      test with synthetic timestamps.
- [ ] Restoring from a backup file (manual copy-over, documented in
      `backups/README.md`) is verified once by hand.

**Risks:**
- Backup-on-every-startup could be slow if the DB grows large — low risk
  at single-user, single-semester scale (§4 indexing notes: tens of
  thousands of rows over 5 years), but worth a note for S27's hardening
  pass to revisit if it ever becomes noticeable.

---

### S6 — Priority Resolution Engine v1 **[MVP]**
**Goal:** The single load-bearing algorithm of the entire product exists,
is pure, is deterministic, and is tested to the spec's explicit >90%
branch-coverage bar — before any AI, drift, or challenge work is allowed
to depend on it.

**Features:**
- `athena-domain::priority` — takes a snapshot of current state
  (open deadlines, deep-work window, time-of-day, current bottleneck if
  any — none exist yet, so this sprint's input is deadlines + time only)
  and produces a single ranked answer, or a short ranked list only when
  two candidates are within a defined closeness threshold (§3.2
  Principle #9).
- Zero I/O, zero dependency on `athena-data`, `tauri`, or the network —
  pure functions over plain Rust structs, fed by data the caller already
  fetched.

**Files likely to change:**
`src-tauri/crates/athena-domain/src/priority/mod.rs` and submodules,
`src-tauri/crates/athena-domain/tests/priority_tests.rs`.

**Definition of Done:**
- [ ] `cargo tarpaulin` (or equivalent) reports >90% branch coverage on
      the `priority` module specifically.
- [ ] A fixed-input/fixed-expected-output test suite exists covering: a
      single obvious top deadline, two deadlines within the closeness
      threshold (list output), and an empty-input cold-start case
      (`insufficient_data`-shaped output, even though the full confidence
      model doesn't exist until S12 — the *shape* of "I don't know yet"
      exists now).
- [ ] The module compiles as part of `athena-domain` with the
      zero-internal-dependency rule from §4.5 intact.

**Risks:**
- This is the highest-risk sprint to under-scope. If the closeness
  threshold or ranking weights are hand-waved now, every later sprint
  (Now screen, Challenge Layer, Trajectory) inherits a shaky foundation.
  Budget the full 3 days; do not compress this one to make up time
  elsewhere.

---

### S7 — Now Screen v1 (Template-Only) **[MVP]**
**Goal:** The `Now` screen shows a real, ranked recommendation — with a
template-generated (not yet LLM-generated) reasoning string — proving the
domain→application→presentation path end-to-end before AI is introduced.

**Features:**
- A Tauri query command that calls `athena-domain::priority`, fed by
  live data from `athena-data` repositories built in S3–S4.
- `RecommendationCard` component rendering `{verdict, reason,
  confidence}` — `reason` is a hand-written template string at this
  stage (e.g. "X is due soonest and has the highest leverage_class"), not
  natural language synthesis.
- Confirms §12 Engineering Guideline #3: no bare notification type exists
  anywhere in this path — even the template output carries a mandatory
  reasoning field.

**Files likely to change:**
`src-tauri/crates/athena-app/src/commands.rs` (priority query command),
`src/screens/Now/*`, `src/components/RecommendationCard/`,
`src/components/ConfidenceBadge/`, `src/ipc/priority.ts`.

**Definition of Done:**
- [ ] Opening `Now` with real Semester Setup data shows a single ranked
      recommendation with a non-empty reasoning string, sourced from
      real deadline data (verified by changing a deadline and seeing the
      recommendation change).
- [ ] The empty-state (`insufficient_data`) case from S6 renders as an
      honest gap, not a blank screen or a crash.

**Risks:**
- Temptation to reach for the LLM early to make the reasoning sound
  better — explicitly deferred to S11; template text is intentionally
  workmanlike at this stage.

---

### S8 — Event Bus & Command Dispatcher **[MVP]**
**Goal:** The Command/Event distinction from §4.6 exists as real
infrastructure — synchronous, interceptable commands and async
fire-and-forget events, both persisted to `event_log` — before any
interceptor (Deep Work Guard, Challenge Layer) is built on top of it.

**Features:**
- `athena-events`: typed command dispatcher, in-process event bus
  (`tokio::sync::broadcast` or equivalent), interceptor registry with a
  fixed evaluation order (empty for now — S9 adds the first entry).
- `event_log` persistence for every event and every command outcome,
  regardless of subscriber count.
- Failure semantics from §4.6 implemented: commands fail closed,
  events fail open per-subscriber.

**Files likely to change:**
`src-tauri/crates/athena-events/src/bus.rs`, `.../commands/mod.rs`,
`.../events/mod.rs`, `.../lib.rs`, wiring into
`src-tauri/crates/athena-app/src/main.rs`.

**Definition of Done:**
- [ ] A test command with zero registered interceptors passes straight
      through to commit and emits a corresponding event.
- [ ] A test interceptor that always returns `RequiresConfirmation` (a
      throwaway, test-only interceptor) blocks a command until a
      confirm/cancel response is supplied.
- [ ] Every command and event in a test run appears in `event_log`,
      including ones with zero subscribers.
- [ ] A test subscriber that panics does not prevent a sibling subscriber
      from completing (fail-open-per-subscriber, proven, not assumed).

**Risks:**
- Building this before S9 exists means it's tested with throwaway
  interceptors rather than a real one — acceptable, since the bus's
  correctness shouldn't depend on which interceptor is plugged in, but
  worth re-validating with the real Deep Work Guard in S9's Definition of
  Done too.

---

### S9 — Deep Work Guard **[MVP]**
**Goal:** The 8 PM–midnight window (Non-Negotiable §3) is now
mechanically protected — the first real interceptor on the bus built in
S8.

**Features:**
- `athena-domain::deep_work` — hard guard (intercepts any
  `CommitScheduleItem` touching 20:00–00:00 with `leverage_class = low`)
  and allocator (within the protected window, picks the single
  highest-expected-return activity from open deadlines — reuses S6's
  priority logic, scoped to the window).
- Registered as the first interceptor in `athena-events`' fixed order.
- `deep_work_sessions` table wired: `allocated_activity`,
  `allocated_activity_ref`, `protected`, `override_reason`.
- Override flow: a low-leverage commit into the window is blocked unless
  `override_confirmed=true` is explicitly supplied by the caller.

**Files likely to change:**
`src-tauri/crates/athena-domain/src/deep_work/mod.rs`,
`src-tauri/crates/athena-events/src/commands/mod.rs` (interceptor
registration), `src-tauri/crates/athena-data/src/repositories/deep_work_session_repository.rs`,
`src/screens/Now/*` (surfacing tonight's allocation).

**Definition of Done:**
- [ ] Attempting to commit a low-leverage item into 20:00–00:00 without
      `override_confirmed=true` is blocked with a reasoning string.
- [ ] Supplying the override commits the item and records
      `override_reason`.
- [ ] The allocator produces a real `allocated_activity` for tonight's
      window when the user opens `Now`, sourced from real open deadlines.
- [ ] `deep_work_sessions.protected` correctly reflects whether the guard
      fired that evening.

**Risks:**
- `leverage_class` classification (high/low) is itself a judgment call
  that currently has no dedicated classifier — for this sprint, a simple
  deterministic rule (e.g. deadline vs. non-deadline, or an explicit
  field set at creation time in S3) is sufficient; a smarter classifier
  is not in scope here and shouldn't be invented ad hoc.

---
### ── MILESTONE 1 — see MILESTONES.md for full acceptance criteria ──
---

## PHASE C — Grounded AI Synthesis

### S10 — AI Retrieval Layer (Pipeline Stage 2) **[MVP]**
**Goal:** `athena-reasoning` can pull exactly the rows relevant to a
trigger, tagged with freshness stamps, with missing/stale data passed
forward as a fact rather than silently skipped — before any LLM is
involved.

**Features:**
- `athena-reasoning::retrieval` — pulls current deadlines, latest
  grade/DSA snapshots, current bottleneck (none exist until S15; handled
  as absent), tagged with `data_sources.last_synced_at`.
- Explicit "no snapshot in N days" retrieval facts when data is stale or
  missing, per §6.2 Stage 2.

**Files likely to change:**
`src-tauri/crates/athena-reasoning/src/retrieval.rs`,
`src-tauri/crates/athena-reasoning/src/lib.rs`.

**Definition of Done:**
- [ ] A retrieval call for a "priority_now" trigger returns a typed
      payload containing only rows that actually exist, each tagged with
      source and freshness.
- [ ] A retrieval call against a semester with no grade snapshots yet
      returns an explicit "no data" fact rather than omitting the field
      silently.
- [ ] Fully unit-testable with a seeded test database — no LLM call
      involved at this stage.

**Risks:**
- Scope creep toward "smart" retrieval (ranking, summarizing) — this
  stage is retrieval only, per §6.2; summarization/interpretation belongs
  to Stage 3 (already built, S6/S9) and Stage 4 (S11), not here.

---

### S11 — LLM Synthesis Integration (Pipeline Stage 4) **[MVP]**
**Goal:** The LLM turns an already-computed Stage 3 verdict into a
well-reasoned sentence, via a narrow, schema-constrained prompt — and
cannot introduce new facts by construction of the prompt (enforcement of
that guarantee is S12's job, not this sprint's).

**Features:**
- Anthropic API client wrapper in `athena-reasoning::synthesis`.
- Prompt construction: takes Stage 3's verdict (from S6/S9's existing
  domain output) plus Stage 2's retrieval manifest (S10), asks only ",
  explain this answer clearly," never "what should the user do."
- JSON-schema-constrained response format separating `verdict` (fixed),
  `tone`, `confirmed` vs. `inferred` claims, and cited evidence IDs.
- Persona/tone guidance from §6.6 encoded directly in the system prompt.

**Files likely to change:**
`src-tauri/crates/athena-reasoning/src/synthesis.rs`,
a prompt-template file/module (e.g. `.../prompts/priority_now.rs` or a
`.txt`/`.md` template asset), API key configuration handling.

**Definition of Done:**
- [ ] Given a fixed Stage 3 verdict and retrieval manifest, a synthesis
      call returns a schema-conformant response with distinguishable
      `confirmed`/`inferred` sections and cited evidence IDs.
- [ ] A manual review confirms the persona guidance is visibly present in
      output tone (direct, no "Great question!", no hedged
      disagreement).
- [ ] API failures (timeout, auth error) surface as a typed error, not a
      panic or a silently empty response.

**Risks:**
- API cost/rate limits during development — mitigate with a small,
  representative fixture set for automated tests rather than live-calling
  the API on every CI run; live calls reserved for manual/integration
  testing.
- Prompt drift over time as the underlying model updates — this is
  exactly why S12's grounding check must be code-enforced and not
  prompt-trusted; this sprint should not try to solve that with prompt
  engineering alone.

---

### S12 — Grounding Check & Confidence Labeling (Pipeline Stages 5–6) **[MVP]**
**Goal:** No ungrounded claim ever reaches the user. This sprint is the
single concrete enforcement of Non-Negotiable §5, in code.

**Features:**
- `athena-reasoning::grounding` — parses S11's cited evidence IDs,
  verifies every one resolves to a row present in S10's retrieval
  payload; any unverified claim triggers one retry with a stricter
  prompt; a second failure falls back to template-flattened output (reuse
  of S7's template mechanism).
- `recommendations` table fully populated: `verdict`, `reasoning`,
  `confidence` (non-nullable), `grounded_in`, `data_freshness_note`.
- Confidence model's three classes (`confirmed`/`inferred`/
  `insufficient_data`) implemented and attached to every recommendation.

**Files likely to change:**
`src-tauri/crates/athena-reasoning/src/grounding.rs`,
`src-tauri/crates/athena-reasoning/src/confidence.rs`,
`src-tauri/crates/athena-data/src/repositories/recommendation_repository.rs`.

**Definition of Done:**
- [ ] A synthesis output that cites a fabricated evidence ID is rejected
      and triggers the retry path, verified with an injected fake LLM
      response in tests (no live API call needed for this test).
- [ ] A second consecutive failure produces the template-flattened
      fallback, not an error screen.
- [ ] Every `recommendations` row written in a test run has a non-null
      `confidence` value — a database constraint or repository-level
      check makes a null value impossible, not just discouraged.

**Risks:**
- This sprint's tests need synthetic "bad" LLM outputs to exercise the
  rejection path — building a good fixture set of realistic hallucinated
  outputs is itself real design work; budget time for it rather than
  testing only the happy path.

---

### S13 — Local Model Fallback **[MVP — offline-first is a stated non-functional requirement, not optional]**
**Goal:** The pipeline degrades to something grounded and honest with
zero network access — proving §4.7's offline-first requirement for the
AI layer specifically, not just for logging/viewing.

**Features:**
- `athena-reasoning::local_model` — localhost-only call to a local
  inference server (e.g. Ollama), reusing S11/S12's exact prompt/grounding
  contract.
- Fallback trigger: cloud call failure or explicit user opt-out for a
  session routes to the local path instead of failing the whole
  pipeline.

**Files likely to change:**
`src-tauri/crates/athena-reasoning/src/local_model.rs`,
`src-tauri/crates/athena-reasoning/src/synthesis.rs` (fallback routing
logic).

**Definition of Done:**
- [ ] With network access disabled entirely, a priority query still
      produces a `recommendations` row (via local model or, if that's
      also unavailable, S12's template fallback) — never a hard failure.
- [ ] The local model path is exercised by the same grounding check as
      the cloud path — no separate, looser validation for the fallback.

**Risks:**
- Local model quality may be poor enough that its "well-reasoned
  sentence" reads as noticeably worse than cloud output — acceptable per
  spec ("doesn't need to match cloud quality; needs to guarantee grounded
  and honest"), but worth a manual quality check so the fallback isn't
  embarrassingly bad, just less polished.
- Requires the developer to have a local inference runtime installed for
  testing — document the dev-environment setup clearly so this sprint
  isn't blocked on tooling friction.

---

### S14 — Now Screen v2 (AI-Synthesized) **[MVP]**
**Goal:** `Now` renders real synthesized recommendations with visible
confidence/staleness state, replacing S7's template text.

**Features:**
- `Now` screen calls the full S10→S13 pipeline instead of S7's
  template-only path.
- `ConfidenceBadge` renders all three confidence classes distinctly;
  `data_freshness_note` renders when present.
- `insufficient_data` state (cold-start) renders as an honest gap per
  §4.7, not a generic placeholder.

**Files likely to change:**
`src/screens/Now/*`, `src/components/RecommendationCard/`,
`src/components/ConfidenceBadge/`, `src/ipc/priority.ts`.

**Definition of Done:**
- [ ] Opening `Now` on a semester with real data shows AI-synthesized
      reasoning, not template text.
- [ ] Manually forcing a stale data source (e.g. backdating
      `last_synced_at` in a test fixture) visibly renders the staleness
      note.
- [ ] Disconnecting the network and reopening `Now` still shows a
      recommendation (via S13's fallback), never a broken screen.

**Risks:** Low — this sprint is primarily wiring; most of the real risk
was absorbed in S10–S13.

---
### ── MILESTONE 2 — see MILESTONES.md ──
---

## PHASE D — Drift, Bottlenecks, and the Challenge Layer

### S15 — Bottleneck Detection **[MVP]**
**Goal:** The system can name the user's single biggest current
constraint and refuses to let it be silently dropped.

**Features:**
- `athena-domain::bottleneck` — scans grade/DSA/project trend data for
  the single biggest current constraint; categories: `weak_subject`,
  `stalled_project`, `missing_skill`, `other`.
- `bottlenecks` table wired: `status` only ever `active` or
  `resolved_by_evidence` — no inactivity-based resolution path exists in
  the repository layer, full stop.
- `current_bottleneck` exposed as a materialized, always-available query
  consumed by `Now` (S14's screen gets a small follow-up update here to
  surface it).

**Files likely to change:**
`src-tauri/crates/athena-domain/src/bottleneck/mod.rs`,
`src-tauri/crates/athena-data/src/repositories/bottleneck_repository.rs`,
`src/screens/Now/*` (bottleneck banner).

**Definition of Done:**
- [ ] Given synthetic trend data with an obvious weak subject, the
      detector opens a `bottlenecks` row with correct category and
      evidence reference.
- [ ] A test explicitly asserts there is no code path that can set
      `status` to anything other than `active` or `resolved_by_evidence`
      (attempting `dismissed` should not compile/should fail a
      repository-level check).
- [ ] `Now` shows the current bottleneck when one is active.

**Risks:**
- Defining "biggest" constraint requires a real scoring heuristic — keep
  it simple and documented in this sprint (e.g. weighted by
  grade-impact and recency) rather than over-building a multi-factor
  model; refine later if evidence shows it's wrong, per Engineering
  Guideline #7 ("when in doubt, cut, don't add").

---

### S16 — Drift Scoring **[MVP]**
**Goal:** The system detects trend-line drift (a sustained deviation)
across grade, practice-volume, and deep-work-protection data — early
signal, not a post-mortem.

**Features:**
- `athena-domain::drift` — trend-line detection over `grade_snapshots`,
  `dsa_practice_log`, `deep_work_sessions.protected`.
- `drift_signals` rows: `signal_type`, `severity` (`watch`/`flag`/
  `urgent`), `evidence_refs` (JSON array — never a bare "something feels
  off").
- Signal Threshold algorithm (§6.5) implemented here: a candidate signal
  surfaces only if ≥2 of {recurrence, stakes, reversibility,
  contradiction} hold.

**Files likely to change:**
`src-tauri/crates/athena-domain/src/drift/mod.rs`,
`src-tauri/crates/athena-data/src/repositories/drift_signal_repository.rs`.

**Definition of Done:**
- [ ] Synthetic data showing a sustained decline (3+ data points) in DSA
      practice volume produces a `drift_signals` row with correct
      `signal_type` and non-empty `evidence_refs`.
- [ ] A single bad data point (one missed day) does NOT produce a signal
      — the sustained-deviation requirement is proven by a negative test,
      not just a positive one.
- [ ] Signal Threshold logic is unit-tested against all four criteria
      independently.

**Risks:**
- Trend detection thresholds (how many data points, what magnitude of
  decline) are judgment calls with no "correct" answer from the spec —
  document the chosen thresholds explicitly in code comments so they're
  a visible, revisable decision, not a buried magic number.

---

### S17 — Scheduler: DriftScan & Staleness Jobs **[MVP]**
**Goal:** Drift detection and staleness checking run on their own
initiative, daily, without the user needing to open a screen.

**Features:**
- Scheduler inside `athena-app` (not its own crate, per §4.5): a
  periodic `DriftScan` trigger (daily) that fires an event consumed by
  S16's drift module; a staleness check on `data_sources` firing
  `DataSourceStale` events.
- Confirms §4.6's rule: `DriftScan` is scheduler-triggered, not
  event-triggered, because drift is a trend property.
- S5's backup trigger can optionally be folded into this scheduler now
  that one exists (startup/shutdown trigger from S5 remains as a
  fallback either way).

**Files likely to change:**
`src-tauri/crates/athena-app/src/scheduler.rs`,
`src-tauri/crates/athena-events/src/events/mod.rs` (new event types).

**Definition of Done:**
- [ ] With the app left running across a simulated day boundary (test
      harness with a mockable clock), `DriftScan` fires exactly once and
      emits the expected event.
- [ ] A `data_sources` row past its `staleness_threshold_hours` triggers
      `DataSourceStale`.
- [ ] The scheduler contains no domain logic itself — a test confirms
      firing the same event through the bus manually produces identical
      behavior to the scheduler firing it (proves "dumb timer" per §4.5).

**Risks:**
- Testing time-based behavior is inherently fiddly — invest in a
  mockable clock abstraction now rather than sleeping in tests, or this
  sprint's test suite will be slow and flaky for the rest of the
  project's life.

---

### S18 — Divergence Check **[MVP]**
**Goal:** The system can tell when the user is completing tasks at a
normal rate while trajectory metrics slide — the concrete enforcement of
Non-Negotiable §9 (no metric gaming).

**Features:**
- `athena-domain::divergence` — the only code path allowed to compare
  proxy metrics (`deadlines.status='done'`, `problems_attempted`) against
  trajectory metrics (`grade_snapshots`, `codeforces_snapshots.rating`,
  `portfolio_strength_score`).
- Raises a `drift_signal` (reuses S16's table/type) when the two move in
  opposite directions.

**Files likely to change:**
`src-tauri/crates/athena-domain/src/divergence/mod.rs`.

**Definition of Done:**
- [ ] Synthetic data with a normal task-completion rate alongside a
      declining grade trend produces a divergence-flagged `drift_signal`.
- [ ] Synthetic data with both moving together (or both declining
      together) does NOT flag divergence — proven by a negative test.
- [ ] No other module in the codebase directly compares a proxy-metric
      column to a trajectory-metric column — a code-review checklist item
      formalizing §7.4's rule.

**Risks:** Low — this sprint reuses `drift_signals`' existing shape; the
main risk is scope creep into a general "analytics" feature, which
should be resisted (Trajectory screen visualization is S23's job, not
this sprint's).

---

### S19 — Decision Challenge Layer + ChallengeDialog **[MVP]**
**Goal:** Athena can now say "I think this is a mistake" before a bad
decision commits — the second (and last) interceptor on the bus, and the
one deliberate blocking UI interruption in the whole app.

**Features:**
- `SubmitDecision` command type; Challenge interceptor evaluates the
  decision hypothetically against S15/S16/S18's rules before commit.
- On a flagged conflict, `athena-reasoning` (S11–S13's pipeline) 
  synthesizes a single plain-language challenge from the domain verdict.
- `ChallengeDialog` — the one named exception to "no modals" (§1.3, §5.1)
  — blocking, shown once, never re-triggered for the same decision.
- `decisions` table wired: `challenged`, `challenge_reasoning`,
  `final_outcome` (`accepted_as_is`/`revised_by_user`/`overridden_by_user`).

**Files likely to change:**
`src-tauri/crates/athena-events/src/commands/mod.rs` (second interceptor
registration), a new `athena-domain`/`athena-events` module for the
Challenge Layer's evaluation logic, `src-tauri/crates/athena-data/src/repositories/decision_repository.rs`,
`src/components/ChallengeDialog/`.

**Definition of Done:**
- [ ] Submitting a decision that hypothetically worsens an active
      bottleneck triggers a blocking dialog with domain-grounded
      reasoning, sourced from real S15/S16 output (not hand-written for
      this sprint).
- [ ] Confirming, revising, or cancelling all correctly write to
      `decisions.final_outcome` and unblock the command.
- [ ] Submitting the *same* decision again after a prior challenge and
      confirmation does NOT re-trigger the dialog — proven by a repeat
      test, not just asserted in the spec.
- [ ] A decision that doesn't trip any rule commits with `challenged =
      false` and no dialog — endorsement, not just challenge, is a tested
      path.

**Risks:**
- This is the second-highest-risk sprint after S6 (Priority Resolution) —
  it's the direct enforcement of Non-Negotiable §4, and it depends on
  three prior domain modules (S15, S16, S18) plus the full AI pipeline
  (S10–S13) being correct. Do not start this sprint until all of those
  are individually green; a bug here would look like Athena "silently
  allowing" a bad decision, the single worst failure mode in the whole
  product.

---

### S20 — Decision Log Screen **[MVP]**
**Goal:** The `Decision Log` screen — the one screen the UI docs never
designed at all — exists, using the same visual language established in
`Now`/`Trajectory`.

**Features:**
- Chronological, filterable list of past decisions: description,
  whether challenged, the reasoning given, and the final outcome.
- Reuses `RecommendationCard`/timeline visual components rather than
  inventing new ones (per §5.2's note that this screen shares visual
  language with Trajectory).

**Files likely to change:**
`src/screens/DecisionLog/*`, `src/ipc/decisions.ts`.

**Definition of Done:**
- [ ] Every decision recorded during S19's tests is visible, in order,
      with its full outcome.
- [ ] Filtering by `challenged = true` correctly narrows the list.
- [ ] The screen reads real data end-to-end from `decisions` — no mock
      data left in the shipped build.

**Risks:** Low — primarily a rendering sprint over data structures that
already exist and are already tested from S19.

---
### ── MILESTONE 3 — MVP COMPLETE — see MILESTONES.md ──
---

## PHASE E — External Grounding

### S21 — Codeforces Ingestion Connector **[FUTURE]**
**Goal:** DSA/competitive-programming trajectory is backed by live data,
not just self-reported logs.

**Features:**
- `athena-ingestion::codeforces` — read-only polling of `user.rating`,
  `user.status` against the public Codeforces API.
- Writes to `codeforces_snapshots`, stamps `data_sources.last_synced_at`.
- On failure, `last_synced_at` simply doesn't advance — no silent stale
  data treated as current (feeds S24's staleness handling).

**Files likely to change:**
`src-tauri/crates/athena-ingestion/src/codeforces/mod.rs`,
`src-tauri/crates/athena-data/src/repositories/codeforces_snapshot_repository.rs`.

**Definition of Done:**
- [ ] Given a real (or recorded fixture) Codeforces handle, a sync
      populates `codeforces_snapshots` with rating/problems-solved data.
- [ ] A simulated API failure leaves the prior `last_synced_at` untouched
      and does not crash the sync job.
- [ ] The app functions fully with this connector disabled or offline
      (offline-first, re-confirmed at the connector level).

**Risks:**
- Codeforces API rate limits or schema changes — isolated to this one
  crate by design (§4.5's stated reason for `athena-ingestion`'s
  existence), so a break here should never cascade into the domain or
  presentation layers.

---

### S22 — CSV/ICS Import Connectors **[FUTURE]**
**Goal:** Bulk semester setup via institute-exported CSV (grades/timetable)
and calendar `.ics` (deadlines/exam dates), extending S3's manual entry.

**Features:**
- `athena-ingestion::csv_import`, `athena-ingestion::ics_import` — local
  file parse only, no live polling, no OAuth, no scraping (per §8's
  explicit rejection of institute portal scraping).
- Wired into `Semester Setup` as an alternative/supplement to manual
  entry, run once per semester.

**Files likely to change:**
`src-tauri/crates/athena-ingestion/src/csv_import/mod.rs`,
`.../ics_import/mod.rs`, `src/screens/SemesterSetup/*` (import flow).

**Definition of Done:**
- [ ] A sample institute-format CSV correctly populates
      courses/deadlines/grades via the same repositories S3/S4 already
      built (no parallel data path).
- [ ] A sample `.ics` file correctly populates deadlines.
- [ ] Malformed input fails with a clear, user-visible error — never a
      partial silent import.

**Risks:**
- Institute CSV export formats are unknown/unstandardized until a real
  sample is obtained — treat the parser as configurable/tolerant of
  minor format variation rather than hardcoded to one exact export, and
  budget extra time if the real format turns out messier than expected.

---

### S23 — Trajectory Screen Full Build **[FUTURE]**
**Goal:** The `Trajectory` screen — previously a shell since S2 — becomes
the full multi-metric, three-zoom-level view specified in §5.2.

**Features:**
- CGPA, DSA/Codeforces, project/research status as time series against
  target lines.
- Three zoom levels (week/month/semester), reusing the calm visual
  language (muted severity dots, never suppressed per §1.2/§5.2).
- Career/internship section folded in here (not a separate screen),
  showing real `apply_by` urgency honestly.

**Files likely to change:**
`src/screens/Trajectory/*`, `src/components/TrendChart/`,
`src/ipc/trajectory.ts`.

**Definition of Done:**
- [ ] All three trajectory metrics render as real time series from real
      data (S4's manual grades, S21's Codeforces sync).
- [ ] Zoom level switching preserves context (no jarring reload/loss of
      position).
- [ ] A synthetic `urgent`-severity bottleneck/deadline renders visibly
      distinct from a `watch`-severity one — confirms §1.2's ruling is
      actually implemented, not just written down.

**Risks:**
- The richest visual sprint in the plan — highest risk of scope creep
  into "just one more chart." Hold the line at exactly what §5.2
  specifies; anything else is a Future Feature candidate for §10 review,
  not an in-sprint addition.

---

### S24 — Data Source Staleness Handling, End-to-End **[FUTURE]**
**Goal:** Staleness is visible everywhere it matters, not just logged
internally.

**Features:**
- `DataSourceStale` events (from S17) now have a real consumer: any
  `recommendations` row grounded in a stale source gets a populated
  `data_freshness_note` (S12's field, now exercised by a real external
  connector instead of only test fixtures).
- Trajectory and Now screens both render a staleness indicator when
  relevant.

**Files likely to change:**
`src-tauri/crates/athena-reasoning/src/retrieval.rs` (staleness
propagation), `src/components/ConfidenceBadge/` (staleness variant),
`src/screens/Trajectory/*`.

**Definition of Done:**
- [ ] Disabling Codeforces sync for a period beyond
      `staleness_threshold_hours` causes a visible staleness note on any
      recommendation or trajectory view that depends on it.
- [ ] The app never presents stale data as current anywhere in the UI —
      an audit pass across all four screens confirms this explicitly.

**Risks:** Low — mostly a verification/wiring sprint over infrastructure
that already exists from S10–S17 and S21.

---
### ── MILESTONE 4 — see MILESTONES.md ──
---

## PHASE F — Opportunity Surfacing and Hardening

### S25 — Opportunities Engine **[FUTURE]**
**Goal:** Real upside (internships, research positions, competitions) is
surfaced sparingly and only when it fits the current trajectory —
implemented as a deterministic query, per §1.1's correction of the
original "Opportunity Engine" concept.

**Features:**
- `opportunities` table CRUD (manual entry for now — no external
  opportunity-sourcing connector is in scope).
- A deterministic relevance query against current `trajectory_metrics`
  and stated goals (`user_profile`), not an LLM "scanning for passing
  mentions."
- Surfaced on `Now` only when relevance and timing criteria are met, at
  most one at a time (mirrors the restraint principle even though the
  underlying mechanism changed from LLM-driven to query-driven).

**Files likely to change:**
`src-tauri/crates/athena-domain/src/opportunity/mod.rs` (new),
`src-tauri/crates/athena-data/src/repositories/opportunity_repository.rs`,
`src/screens/Now/*` (opportunity surfacing slot).

**Definition of Done:**
- [ ] A manually-entered opportunity with a near `apply_by` date and
      relevant category surfaces on `Now`; one with no relevance or no
      urgency does not.
- [ ] At most one opportunity surfaces at a time, confirmed by a test
      with multiple qualifying candidates.

**Risks:**
- Without a real sourcing connector, this feature's value depends
  entirely on the user remembering to enter opportunities manually —
  worth flagging honestly as a limitation, not overselling the feature's
  autonomy.

---

### S26 — Cross-Platform Notification/Tray **[FUTURE]**
**Goal:** Native notifications and tray integration work correctly on
Windows, macOS, and Linux — generalized per §1.6's ruling against the
original Windows-only assumption.

**Features:**
- Tauri's native notification/tray APIs wired for deep-work session
  start/close-out, staleness alerts, and drift flags on all three
  platforms.
- Every notification remains a delivery channel for a typed
  `Recommendation`/`Alert` object — the tray module accepts no raw
  string, per §8's integration rule.

**Files likely to change:**
`src-tauri/crates/athena-app/src/tray.rs` (renamed/generalized from any
Windows-specific naming), platform-specific Tauri config sections in
`tauri.conf.json`.

**Definition of Done:**
- [ ] A manual test pass confirms native notifications and tray behavior
      on at least two of the three target platforms (the developer's
      primary machine plus one other, e.g. via VM or CI runner).
- [ ] No notification in the codebase is constructed from a raw string —
      a code-review checklist item, not just a runtime test.

**Risks:**
- Genuine platform-specific quirks in Tauri's notification/tray APIs —
  budget extra time if the developer's primary OS isn't the one with the
  best-documented Tauri support at build time.

---

### S27 — Offline-First Audit & Hardening **[FUTURE]**
**Goal:** Offline-first is proven as a testable property across the
entire app, not just the AI pipeline's fallback path (S13).

**Features:**
- A CI mode that runs the core loop (Semester Setup, logging, Priority
  Resolution, Trajectory viewing, Decision Log) with network access
  disabled entirely.
- A full manual audit pass across all four screens confirming nothing
  blocks or crashes with no connectivity.
- General hardening pass: error handling review, edge cases from earlier
  sprints revisited (e.g. very large DB, malformed import files,
  clock-skew edge cases in the Scheduler).

**Files likely to change:**
CI configuration (network-disabled test job), and small fixes scattered
across whichever files the audit surfaces issues in — genuinely
unpredictable in advance, which is why this sprint is scoped as an audit
with a fixed time-box rather than a fixed feature list.

**Definition of Done:**
- [ ] CI's network-disabled job passes.
- [ ] A written audit checklist (one line per screen × per network-
      dependent feature) is completed and attached to the sprint's
      record, confirming graceful degradation everywhere it's claimed.
- [ ] Any bug found during the audit is either fixed in this sprint or
      explicitly logged as a follow-up with a reason it couldn't be
      fixed in the time-box.

**Risks:**
- Audit sprints have unbounded discovery risk by nature — the fixed
  time-box (2–3 days) is a deliberate constraint; if it surfaces more
  than can be fixed in-sprint, triage and follow up rather than letting
  this sprint balloon past 3 days.

---

### S28 — Documentation & Release QA **[FUTURE, but required before calling v1 "done"]**
**Goal:** The project is in a state a future maintainer (including a
future version of the developer) could pick up cold.

**Features:**
- `README.md` at the repo root: what the app is, how to build/run it,
  where the foundational docs live.
- Final pass confirming every Engineering Guideline in §12 holds across
  the actual codebase (a checklist, not new code): domain layer has zero
  disallowed dependencies, no bare notification types exist, migrations
  are additive-only in practice, `priority` coverage bar still holds,
  every non-cosmetic decision made along the way is traceable to a spec
  section or a documented deviation (like ROADMAP.md §3).
- End-to-end manual acceptance test against Milestone 5's criteria (see
  `MILESTONES.md`).

**Files likely to change:**
`README.md`, possibly small doc updates inside `docs/` if any sprint
introduced a deviation worth recording (following the same pattern as
ROADMAP.md §3).

**Definition of Done:**
- [ ] A developer who has never seen the project can clone the repo,
      read the README, and get the app running without asking a
      question.
- [ ] The §12 Engineering Guidelines checklist is completed and attached
      to this sprint's record, with every item checked or an explicit,
      justified exception noted.
- [ ] Milestone 5's acceptance criteria (see `MILESTONES.md`) all pass.

**Risks:** Low — this sprint is verification and writing, not new
functionality; the main risk is treating it as optional busywork and
skipping it, which would undermine the entire 5-year-maintainability
goal the project was built around.

---
### ── MILESTONE 5 — v1 COMPLETE — see MILESTONES.md ──
---
