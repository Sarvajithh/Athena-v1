# 01_ARCHITECTURE.md — Project Athena
### Complete Software Architecture (implementation-ready)
### Standing: subordinate to `MASTER_SPECIFICATION.md` §4/§6/§7/§8 and `PROJECT_RULES.md`. This document adds detail; it does not add architecture. Every non-cosmetic statement below cites the section that justifies it, per `PROJECT_RULES.md` Immutable Rule #8.

---

## 0. Purpose of This Document

`MASTER_SPECIFICATION.md` already settled the architecture. This
document exists to make that architecture **traceable end-to-end** —
subsystem by subsystem, request by request — so a future implementation
session never has to reconstruct "how does a click on Now actually
become a stored recommendation" from first principles. Nothing here
introduces a new subsystem, a new table, a new screen, or a new
dependency. Where this document elaborates beyond the Master
Specification's prose, it is elaboration of *mechanism*, not a change of
*shape*.

---

## 1. Subsystems

### 1.1 Subsystem Map

| Subsystem | Crate | Owns | Depends on |
|---|---|---|---|
| **Presentation** | (frontend, not a crate) React + TypeScript | Rendering the four screens; local UI-only state (density toggle, scroll position) | Tauri IPC only |
| **Application Layer** | `athena-app` | Tauri command/query handlers, IPC bindings, the Scheduler (dumb timer) | all four domain-facing crates |
| **Domain Layer** | `athena-domain` | Priority Resolution, Bottleneck Detection, Drift Scoring, Deep Work Guard, Divergence Check — pure functions | nothing internal |
| **Event/Command Bus** | `athena-events` | Typed dispatcher, interceptor registry (Deep Work Guard → Decision Challenge Layer → Divergence Check), `event_log` persistence | `athena-domain`, `athena-data` |
| **AI Orchestration** | `athena-reasoning` | Retrieval, prompt construction, grounding validation, confidence labeling, local-model fallback | `athena-domain`, `athena-data` |
| **Data Layer** | `athena-data` | One repository per aggregate, migrations, the only crate permitted to write SQL | nothing internal (leaf) |
| **Ingestion** | `athena-ingestion` | Codeforces connector, ICS import, CSV import | `athena-data` |

*(MASTER_SPECIFICATION.md §4.5 — Module Map; §4.4 — Layering)*

### 1.2 Why Six Crates and Not Fewer

Per `PROJECT_RULES.md` Immutable Rule #1, this shape is settled and is
not re-litigated here. The dependency direction is enforced by
`Cargo.toml`, not convention (`CHANGELOG.md` S01), so a crate that would
violate the graph fails to compile — this is a compile-time guarantee,
not a review-time hope. `athena-domain` depending on nothing internal is
the single decision that makes >90% branch coverage on `priority/`
meaningful in isolation (`PROJECT_RULES.md` Immutable Rule #10).

### 1.3 Subsystem Responsibilities, One Line Each

- **Presentation** never contains domain logic. If a screen needs to
  know whether a deadline is "urgent," it asks Rust; it never computes
  urgency itself from a raw date. *(MASTER_SPECIFICATION.md §4.2 — "never
  domain logic.")*
- **Application Layer** is intentionally thin — it translates an IPC
  call into a domain call or a command dispatch and back. No branching
  logic beyond input validation and error mapping lives here.
- **Domain Layer** is the only place a verdict is computed. It is
  deterministic: same inputs, same output, every time, with no I/O.
  *(MASTER_SPECIFICATION.md §4.4.)*
- **Event/Command Bus** is the only path by which a domain verdict is
  allowed to block a write or trigger a side effect. *(MASTER_SPECIFICATION.md
  §4.6.)*
- **AI Orchestration** is the only crate allowed to call an LLM. It
  never mutates state — synthesis is read-only. *(MASTER_SPECIFICATION.md
  §6.8.)*
- **Data Layer** is the only crate allowed to touch SQL. Every other
  crate that needs data goes through a typed repository call, never a
  raw query. *(MASTER_SPECIFICATION.md §4.5.)*
- **Ingestion** is deliberately isolated because external formats change
  outside Athena's control; isolating the blast radius here is the
  single highest-leverage boundary for 5-year survivability.
  *(MASTER_SPECIFICATION.md §4.5.)*

---

## 2. Data Flow

### 2.1 The Canonical Read Path (a screen loads)

```
Presentation requests screen data
   → typed Tauri query command (athena-app)
   → athena-data repository call(s), scoped to the current semester_id
   → typed rows returned up the stack, unmodified in shape
   → Presentation renders directly from the typed response
```

No transformation of domain meaning happens above `athena-data`. If a
screen needs a derived value (a trend slope, a "days until" figure), that
derivation lives in `athena-domain` or in a repository's query, never in
TypeScript. *(MASTER_SPECIFICATION.md §4.2 — "Frontend ... never domain
logic.")*

### 2.2 The Canonical Write Path (a user logs something)

```
Presentation issues a Command (e.g. LogGradeSnapshot, CommitScheduleItem)
   → athena-events dispatcher
   → Interceptor chain, fixed order: Deep Work Guard → Decision Challenge
     Layer → Divergence Check
   → each interceptor returns Clear or RequiresConfirmation{reasoning}
   → if any interceptor returns RequiresConfirmation, the command blocks
     (fails closed) and the UI shows the relevant blocking dialog
   → on Clear from all interceptors, athena-data commits the write
   → an Event is emitted (e.g. GradeLogged, ScheduleItemCommitted)
   → the Event is persisted to event_log unconditionally
   → subscribed handlers run async, fail-open per subscriber
```

*(MASTER_SPECIFICATION.md §4.6 — Commands vs. Events, and the Decision
Challenge Layer; failure semantics stated verbatim: "commands fail
closed... events fail open per-subscriber.")*

### 2.3 Snapshot Discipline

Every table that represents a value that changes over time
(`grade_snapshots`, `codeforces_snapshots`, `project_status_snapshots`,
`user_profile_history`) is **append-only from the write path's
perspective** — a new row is inserted, never an existing row updated in
place, except for tables that are explicitly current-state pointers
(`bottlenecks.status`, `decisions.final_outcome`) whose mutation is the
entire point of that table. *(MASTER_SPECIFICATION.md §7.1 Design Rule
1 — "Snapshots over overwrites.")*

### 2.4 Freshness Propagation

Every retrieval that feeds a recommendation or a screen carries a
`data_freshness_note` alongside the data itself — computed as "time
since this row's `recorded_at`" against a per-source staleness threshold
defined in `data_sources`. Staleness is a first-class value returned
from `athena-data`, not inferred later by the UI or the LLM.
*(MASTER_SPECIFICATION.md §4.7 — "Data durability... Cold-start
correctness"; §8 — "flagged stale, never silently treated as current.")*

---

## 3. Decision Flow (Priority Resolution → the Now screen)

### 3.1 Trigger Sources

Priority Resolution recomputes on:
1. **App foreground / screen focus** on `Now` — a lightweight
   recompute, not a full re-synthesis, if nothing has changed since last
   compute.
2. **Any Event that could change the ranked answer**: `GradeLogged`,
   `DeadlineCreated/Updated`, `DeepWorkSessionClosed`,
   `ScheduleDisruptionLogged`, `CodeforcesSynced`, `DriftDetected`,
   `BottleneckOpened/Resolved`.
3. **Explicit user "replan" action** — see `08_ADAPTIVE_PLANNER.md` §2.
4. **The daily timer pass** (`DriftScan`-adjacent daily check, §6.4).

### 3.2 The Verdict Pipeline, Concretely

```
1. Retrieval (athena-data, via athena-reasoning's orchestrator):
   open deadlines, current bottleneck (if any), active drift_signals,
   today's deep-work window state, semester context, recent
   deep_work_sessions — each row tagged with recorded_at / freshness.

2. Deterministic Scoring (athena-domain::priority, pure, zero I/O):
   score(candidate) = f(leverage_class, urgency, trajectory_weight,
   bottleneck_amplifier, drift_amplifier) → a single ranked verdict +
   confidence class + the exact evidence rows used.
   See 08_ADAPTIVE_PLANNER.md §3 for the scoring model in full.

3. Synthesis (athena-reasoning, LLM call):
   the verdict + evidence rows + freshness notes are handed to the LLM
   as a JSON-schema-constrained payload; the LLM's only output is prose
   that cites the supplied evidence IDs. It cannot introduce a new fact.

4. Grounding Check (athena-reasoning, deterministic):
   every cited evidence ID in the LLM's output is checked against the
   retrieval payload. Unverified claim → reject, retry once with a
   stricter prompt. Second failure → fall back to template-flattened,
   prose-free output (verdict + evidence, no LLM prose at all).

5. Output: a typed `recommendations` row — verdict, reasoning,
   confidence (never nullable), grounded_in (evidence IDs),
   data_freshness_note.
```

*(MASTER_SPECIFICATION.md §6.2 — Pipeline, reproduced here with the
concrete trigger and scoring detail the Master Spec left at prose
level.)*

### 3.3 The Decision Challenge Layer (a blocking decision)

```
User submits a Command that represents a decision (e.g. SubmitDecision
for "drop this elective," "skip tonight's deep-work block")
   → Decision Challenge Layer interceptor evaluates the decision
     hypothetically against current drift/bottleneck state
     (athena-domain, deterministic — same scoring primitives as §3.2
     step 2, run against the hypothetical post-decision state)
   → if the hypothetical trips a rule (a Signal Threshold graduation,
     §6.5, evaluated against the post-decision world), the single
     blocking ChallengeDialog fires — plain-language, cites the same
     evidence rows the hypothetical scoring used
   → user confirms / revises / cancels
   → recorded in decisions.final_outcome
   → never re-challenged for this specific decision instance
```

*(MASTER_SPECIFICATION.md §4.6, §1.3 — the one of two named
exceptions to "no modals.")*

---

## 4. LLM Flow

### 4.1 What Ever Leaves the Device

Only the narrow Stage-2 retrieval payload for the specific synthesis
call in progress — never a database dump, never raw identifiers beyond
what the phrasing requires. *(MASTER_SPECIFICATION.md §6.7.)*

### 4.2 Provider Topology

```
athena-reasoning::synthesis
   ├── primary: Anthropic Claude API (cloud) — quality path
   └── fallback: local model via Ollama or equivalent (localhost only,
       no egress) — offline / vendor-independence path
```

The fallback is triggered on: no network, primary API error, primary API
timeout past a defined budget. If the local model is also unavailable,
Stage 5's own fallback (template-flattened output) is the final floor —
**the UI never shows a broken or empty state for a missing LLM.**
*(MASTER_SPECIFICATION.md §6.2, §6.7, §8.1.)*

### 4.3 Provider Abstraction

Per `ROADMAP_REVIEW.md` §3.4 and §5.10 — flagged as a real 5-year risk
("Single-vendor, unabstracted LLM dependency at the center of the
product's differentiation") — the synthesis call sits behind a narrow
Rust trait (e.g. `SynthesisProvider: fn synthesize(payload) ->
Result<SynthesisOutput, ProviderError>`) implemented once for the
Anthropic client and once for the local-model client. This costs one
trait definition at the point the synthesis client is first written and
is the cited reason it is specified here rather than left implicit:
retrofitting it after multiple call sites couple to a concrete client is
the more expensive path, per `ROADMAP_REVIEW.md`'s own analysis. This is
an implementation-hygiene detail inside `athena-reasoning`, not an
architectural change — it does not alter the module map in
`MASTER_SPECIFICATION.md` §4.5.

### 4.4 What the LLM Is Structurally Prevented From Doing

- Cannot call any state-mutating tool or Command — synthesis is
  read-only. *(§6.8.)*
- Cannot introduce a fact, ranking, or severity absent from the Stage-2
  payload — enforced by Stage 5's grounding check, not by prompt
  discipline alone. *(§6.2, §6.8; `PROJECT_RULES.md` Immutable Rule #5.)*
- Cannot maintain persistent conversational memory as a primary
  interaction mode. A narrow "why?" follow-up surface may re-run Stage 4
  with the same payload plus the question, but the product's value never
  depends on it being used. *(§6.8, §10.)*
- Cannot be fine-tuned or retrained on user data. *(§6.8.)*
- Cannot infer psychological state or a "credibility" judgment of the
  user's character — if a pattern is real, it is a `drift_signals` or
  `bottlenecks` row with evidence, never a vibe. *(§6.8; this is the
  single rule `11_LONG_TERM_MEMORY.md` is written around.)*

### 4.5 Confidence Labeling, Concretely

| Class | When assigned | UI treatment |
|---|---|---|
| `confirmed` | Verdict follows directly from fresh (non-stale) retrieved rows | Shown plainly, no hedge language |
| `inferred` | Verdict follows from a trend/pattern read across multiple snapshots | Explicitly labeled a hypothesis in the UI copy |
| `insufficient_data` | Not enough rows exist yet (cold start, early semester) | Stated explicitly — never a generic filler answer |

*(MASTER_SPECIFICATION.md §6.3; confidence is never nullable on a
`recommendations` row — §6.2.)*

---

## 5. Integration Flow

### 5.1 Codeforces Sync

```
Scheduler fires a periodic poll (athena-app timer)
   → athena-ingestion::codeforces calls user.rating / user.status
     (read-only, public API)
   → normalizes response into a codeforces_snapshots row
   → athena-data persists it
   → on failure (network, API error, rate limit): the existing latest
     snapshot is kept, flagged stale via data_sources' staleness
     tracking — never silently treated as current
```

*(MASTER_SPECIFICATION.md §8, §8.1.)*

### 5.2 CSV / ICS Import (Semester Setup)

```
User selects a file in the Semester Setup wizard (see 03_ONBOARDING.md)
   → athena-ingestion::csv_import or ::ics_import parses locally,
     no network involved
   → parsed rows are shown to the user for confirmation before commit
     (this is a Command — CommitCourseImport / CommitDeadlineImport —
     and passes through the same interceptor chain as any other write)
   → athena-data persists courses / deadlines rows
```

This is explicitly **not a live sync**. It runs once at the start of a
term and is re-run manually each term — never a background job that
silently assumes the institute's data hasn't changed.
*(MASTER_SPECIFICATION.md §8 — "Deliberately manual, re-run every
semester (matches §3.1 non-negotiable §7).")*

### 5.3 OS Notifications / Tray

```
A typed Recommendation or Alert object is produced (never a bare string)
   → athena-app's notification dispatcher maps it to the native
     notification API for the current platform (Windows / macOS / Linux
     via Tauri)
   → notifications are batched, not a constant drip
     (MASTER_SPECIFICATION.md §5.1)
```

Cross-platform, not Windows-only — this was an explicit correction in
`MASTER_SPECIFICATION.md` §1.6 and is binding.

### 5.4 What Is Never Integrated

Cloud backup/sync as a first-class feature, third-party task-manager
sync, social/sharing integrations, analytics/telemetry SDKs, live
scraping of the institute portal. *(§8, §11 — these are Explicitly
Rejected, not merely deferred; a future session must not reintroduce
them without a dated written revision to the Master Spec, per
`PROJECT_RULES.md` §7.2.)*

---

## 6. Storage

### 6.1 Physical Shape

Single SQLite file, WAL mode, on local disk under the user's control. No
multi-tenancy dimension anywhere in the schema — enforced by absence of
a `user_id` column, not a `WHERE` clause convention.
*(MASTER_SPECIFICATION.md §7, §3.1 non-negotiable #8; `CHANGELOG.md`
S01.)*

### 6.2 Migration Discipline

`refinery`-managed, idempotent, additive-only. A column is deprecated,
never dropped or repurposed in place across a semester boundary — this
protects the multi-year trend data the entire product exists to
preserve. *(MASTER_SPECIFICATION.md §7.5; `PROJECT_RULES.md` Immutable
Rule #2.)*

### 6.3 Backup Story

Per `ROADMAP_REVIEW.md` §3.3 and §5.11 — the plan's own critical review
flagged that rolling local backups on the same drive is a materially
weaker guarantee than "never lose a semester's data" implies. This
document specifies the honest version: **local rolling timestamped
backups protect against file corruption and accidental in-app deletion,
not against hardware loss.** A documented, manual, user-initiated
off-machine export step (e.g., "export backup to a folder the user
points at their own sync tool") is the minimum bar for the durability
claim in `MASTER_SPECIFICATION.md` §4.7 to be honest — this does not
constitute Athena operating cloud infrastructure (which remains
rejected, §11) because the destination is entirely outside Athena's
awareness and control.

### 6.4 Audit Trail

`event_log` is append-only and persists every event, subscribed or not
— the system's behavior must be reconstructable years later.
*(MASTER_SPECIFICATION.md §4.6.)*

---

## 7. Future Scalability

### 7.1 What "Scale" Means Here

This is a single-user, single-machine, multi-*year* system. Scale is not
concurrent users or request throughput — it is **schema and reasoning
surviving five years of accumulated history without a rewrite.**
*(MASTER_SPECIFICATION.md §4.7.)*

### 7.2 What Is Explicitly Deferred, Not Built Now

Per `MASTER_SPECIFICATION.md` §10, kept exactly as scoped there, and
restated here so this architecture document is self-contained:

- **Deterministic credibility ledger** — an override-rate-per-decision-type
  computed by SQL over `decisions.final_outcome`. Only ever a
  transparent, inspectable computation, never LLM-graded.
- **Mood/energy logging** — only if wired to a real domain consequence
  (e.g. correlating with `deep_work_sessions.protected` rate), never as
  decoration. Needs its own schema justification before it is built.
- **Follow-up "why?" chat surface** — re-runs Stage 4 with the existing
  payload plus the question. Secondary, never load-bearing.
- **Cross-device sync** — only self-hosted/user-owned (the user's own
  sync tool, or an end-to-end-encrypted personal relay), never
  Athena-operated cloud infrastructure.
- **Institute portal integration** — only if the institute ever ships a
  public, documented API.

### 7.3 What Would Force an Architectural Revision (and How That Revision Happens)

Per `PROJECT_RULES.md` Immutable Rule #1 and §7.8: if a future session
believes one of the following has actually occurred, the correct
response is to **name it explicitly and propose a dated, written
revision to `MASTER_SPECIFICATION.md`** — not to route around it inside
a PR:

- A genuine need for multi-device concurrent write access (not just
  read replication) would strain SQLite's single-writer model.
- A genuine need for the domain layer to reason over a second user's
  data (e.g. sharing with an advisor) would strain the no-`user_id`
  single-tenancy assumption at its foundation.
- A genuine, sustained requirement for sub-second synthesis latency at a
  scale the current LLM providers can't meet would strain the
  cloud-primary/local-fallback topology.

None of these are anticipated. They are listed here only so a future
session recognizes the *shape* of a problem that would actually justify
revisiting §4.1's "modular monolith, not microservices" ruling, rather
than mistaking ordinary feature pressure for an architectural crisis.

### 7.4 What Explicitly Does Not Force a Revision

Adding a new domain sub-module inside `athena-domain` (e.g. a future
`leverage_calibration/` per `08_ADAPTIVE_PLANNER.md` §6), adding a new
table for a genuinely new concept (following Immutable Rule #7's
"schema change is its own reviewed deliverable" process), or adding a
new ingestion connector inside `athena-ingestion` are all *ordinary
growth within the existing shape* — not architectural changes, and do
not require the Immutable-Rule-#1 process above.

---

## 8. Cross-Reference Index

| Concept | Governing section here | Governing section in Master Spec |
|---|---|---|
| Crate boundaries | §1 | §4.5 |
| Read/write flow | §2 | §4.2, §4.6, §7.1 |
| Priority Resolution pipeline | §3.2 | §6.2 |
| Challenge Layer | §3.3 | §4.6, §1.3 |
| LLM provider topology | §4.2–4.3 | §6.7 |
| Confidence classes | §4.5 | §6.3 |
| Codeforces / CSV / ICS | §5 | §8 |
| Storage & backup | §6 | §7, §4.7 |
| Deferred features | §7.2 | §10 |
| Rejected features | §5.4 | §11 |
