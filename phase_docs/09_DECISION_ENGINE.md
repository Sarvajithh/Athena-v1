# 09_DECISION_ENGINE.md — Project Athena
### The specification of `athena-domain::priority` — the single load-bearing algorithm in the product (§4.5, >90% branch-coverage bar, Immutable Rule #10). Pure, deterministic, zero I/O (Immutable Rule #4). No implementation — inputs, outputs, and the reasoning that connects them, only.

## 0. What This Engine Is

The Decision Engine answers one question, continuously: ***what is the single highest-leverage thing to do right now, and why.*** It is not a scheduler (it doesn't try to fill every hour), not a to-do list (it doesn't rank arbitrary tasks), and not a scorer of everything at once (§3.2.9 — present options only when genuinely, closely ambiguous; otherwise decide and say so). It produces one verdict, backed by evidence, at a confidence the system is honest about.

Per §4.3, this is the architectural center of the whole project: deterministic Rust produces the verdict; the event/command system enforces where it's allowed to intervene; the LLM (`06_AI_ENGINE.md`) only phrases what this engine already decided. Nothing in this document is negotiable by a synthesis prompt.

---

## 1. Inputs

Every input below is a typed read from `athena-data` — the engine itself has zero dependency on SQLite, Tauri, the network, or the LLM (Immutable Rule #4). Inputs are grouped by what they represent, not by which table backs them, since several inputs join multiple tables.

### 1.1 Deadlines
`deadlines` rows: due date, course/context link, stated `leverage_class` (self-tagged at creation, per the existing schema — see §6 for how its confidence is handled), status. The rawest, most concrete input — most verdicts are ultimately anchored to a specific deadline.

### 1.2 Courses
`courses` + `grade_snapshots` — current standing, trend, and how far a course is from the semester's stated target, per-course. Feeds both the priority calculation directly (a course in real jeopardy raises the leverage of anything tied to it) and Divergence Check (§7.4) indirectly.

### 1.3 Goals
`user_profile` / `user_profile_history` — the explicitly stated, semester-affirmed goals from Semester Setup (§4 of `06_AI_ENGINE.md`'s Semester Analysis). The engine never infers a goal the user hasn't stated or confirmed; goals are read, not guessed.

### 1.4 Career
`opportunities` (with `apply_by` dates) and `project_status_snapshots` / `research_activities` trend — the deterministic Opportunity Engine query (§1.1's correction), not an LLM scan. An opportunity's proximity and stated relevance to the user's goals is a first-class input alongside academic deadlines, not a secondary concern folded in later.

### 1.5 Study History
`dsa_practice_log` and `deep_work_sessions` (including `deep_work_sessions.protected` / `actual_activity` where the user has optionally logged it, per §6.4) — what has actually happened, as opposed to what was planned. Used to detect when a stated intention (e.g., "high leverage") isn't being followed through, which is one of the four Signal Threshold conditions (`06_AI_ENGINE.md` §5) that can surface a `drift_signal`.

### 1.6 Interruptions
Deep Work Guard override events and any recorded interruption to a `deep_work_sessions` block. This is not a mood/energy input (see §1.7) — it's a structural fact: did the sacred 8 PM–midnight window (non-negotiable §3) get used as intended, or overridden, and how often. Repeated overrides are themselves a candidate `drift_signal` under the Recurrence condition.

### 1.7 Energy — deferred, not a v1 input
Mood/energy self-report was explicitly cut from core scope (§5.3, §11, §7.3 — no `mood_log`/`energy_log` table exists). It is listed here only to state plainly that the Decision Engine does **not** take a subjective energy input in v1: it reasons entirely from structural facts (deadlines, deadlines' leverage, actual session history), not from how the user says he feels. If this changes, it is a Future Feature (§10) requiring its own schema design and its own justification against a non-negotiable, per that section's own instruction — not an implicit addition here.

### 1.8 AI Insights
`drift_signals` and `bottlenecks` — but critically, these are **not fresh LLM inference fed into the engine**. They are prior deterministic outputs of this same domain layer (drift scoring, bottleneck detection), already stored as typed rows with evidence, that the priority calculation consumes as one more structured input. This is not circular: Stage 2 of the AI pipeline (`06_AI_ENGINE.md` §3) never runs before the Decision Engine — the Decision Engine's own scoring functions (bottleneck detection, drift scoring) produce these rows *before* any synthesis happens. "AI insights" as an input to priority ranking means "this system's own prior deterministic verdicts," never "what the LLM thinks."

**This closes a specific gap `ROADMAP_REVIEW.md` §1.2 identified and this document settles as intended, wired behavior, not a future fix:** the current bottleneck and any active `urgent`-or-`flag` drift signal are scoring inputs to the priority ranking function itself, not merely a separately-rendered banner on **Now**. A screen that shows "your #1 ranked item" and "your #1 bottleneck" as two independently computed, potentially contradictory facts would violate non-negotiable §5's grounding guarantee by implication (two "true" verdicts that disagree can't both be fully grounded in the same reality) — so the ranking function weights against the active bottleneck and any surfaced drift signal directly, and the banner is a display of *part of* the same computation the ranked verdict already used, not a second opinion running in parallel.

---

## 2. Outputs

Every output is part of a typed `Recommendation` object (Engineering Guideline #3) — there is no code path that returns a bare ranked list without the fields below.

### 2.1 Highest Priority
The single ranked item — a specific `deadline`, `opportunity`, or deep-work allocation — that the engine has determined is the highest-leverage use of attention right now. Per §3.2.9, this is a single answer, not a list, unless the closeness threshold (§4 below) is genuinely tripped.

### 2.2 Estimated Impact
A structured statement of *why this outranks the alternatives* — expressed in terms of the input facts that produced it (grade weight, deadline proximity, `apply_by` window, drift severity), never a vague "this feels important." This is the raw material Stage 4 (`06_AI_ENGINE.md`) turns into the one-sentence reasoning shown on **Now** — the engine produces the structured "why," the LLM only phrases it (§6.1).

### 2.3 Recommended Action
The concrete next step tied to the ranked item — not "work on X" in the abstract, but the specific unit of action the schema already models (a deep-work allocation to a specific deadline/project, a specific opportunity's next required step). Reduces the decision, per §3.2.1, rather than handing back raw options.

### 2.4 Confidence
One of the three classes from `06_AI_ENGINE.md` §6 — `confirmed`, `inferred`, `insufficient_data` — computed by the same rules everywhere else in the system uses them. A verdict with `insufficient_data` confidence is still a real output (typically at semester start), never suppressed in favor of a guess (§4.7's cold-start correctness).

### 2.5 Recovery Plan
When the ranked verdict reflects a course or metric already diverging from target (a drift signal or a bottleneck feeding into §1.8's inputs), the output includes a structured recovery plan: what changed, what the corrective allocation looks like, and over what horizon it should show measurable effect before being re-evaluated. This is what makes a "you're behind" verdict actionable rather than just an alarm — consistent with non-negotiable §6 ("weaknesses tracked honestly, never softened... named plainly and kept named until resolved by evidence").

### 2.6 Time Allocation
The concrete assignment of the 8 PM–midnight deep-work window (non-negotiable §3) to the single highest-expected-return activity available that evening (§3.2.4 — "protect deep work like capital"). This is the engine's most consequential single output, since it's the one thing Milestone 1 stands or falls on (`ROADMAP_REVIEW.md` §0) — it must be produced with the same rigor and coverage bar as the ranking itself, not treated as a lightweight downstream formatting step.

---

## 3. The Scoring Model (shape, not implementation)

The engine is a pure function: `(deadlines, courses, goals, opportunities, study_history, interruptions, prior_signals) → Recommendation`. Its internal shape:

1. **Candidate generation** — enumerate everything that could plausibly be "the thing right now": open deadlines within a relevant horizon, active opportunities, and the evening's deep-work allocation slot.
2. **Leverage scoring per candidate** — a function of stakes (grade/portfolio weight), proximity (how soon it's due or closes), and `leverage_class` (self-tagged, weighted by its own confidence — see §6).
3. **Bottleneck/drift weighting** — candidates connected to an active bottleneck or a surfaced drift signal (§1.8) are weighted up, not shown as a separate, unweighted fact.
4. **Divergence check** — before finalizing, the candidate is checked against Divergence Check (§7.4): does pursuing this candidate risk optimizing a proxy metric at the expense of a trajectory metric? If so, that tension is itself part of the estimated-impact reasoning (§2.2), never silently resolved in either direction.
5. **Closeness threshold** — if the top two candidates' scores are within a defined margin of each other, the engine surfaces both as a short, explicitly-ambiguous choice (§3.2.9) rather than picking one arbitrarily; this is the same Signal Threshold mechanism (`06_AI_ENGINE.md` §5) applied to ranking itself, not a separate algorithm.
6. **Verdict + confidence + evidence assembly** — the winning candidate (or the short ambiguous list) is packaged with its confidence class and the specific evidence rows that justify it, ready for Stage 3 prompt construction.

None of the above is an LLM step. All six stages run in `athena-domain`, unit-testable with fixture data and no infrastructure, per §4.4's layering.

---

## 4. The Closeness Threshold (single answer vs. list)

Per §3.2.9 and §6.5, the engine defaults to a single ranked answer. It only presents more than one candidate when the top candidates are genuinely, closely tied on the leverage score — using the same 2-of-4 Signal Threshold logic (recurrence, stakes, reversibility, contradiction) already governing `drift_signals.severity`, applied here to decide "is this actually ambiguous, or am I just being asked to hand back a list because ranking is hard." This is deliberately the same mechanism everywhere it appears in the system (§6.5's explicit merging of what were two independently-designed systems) — the Decision Engine does not get its own bespoke ambiguity rule.

---

## 5. Confirmation and the Challenge Layer Boundary

The Decision Engine only recommends — it never commits anything. Any user action that would act on its recommendation (e.g., committing tonight's deep-work allocation) goes through `CommitScheduleItem`, a Command, which is subject to the registered interceptor chain: **Deep Work Guard → Decision Challenge Layer → Divergence Check** (§4.6). If the engine's own recommendation would itself trip the Challenge Layer's rules against the user's current drift/bottleneck state — a real possibility, since the engine and the Challenge Layer read overlapping inputs — the Challenge Dialog still fires. The Decision Engine producing a recommendation is never treated as pre-approval that bypasses the interceptor chain; recommending and committing remain fully separate steps (non-negotiable §4).

---

## 6. Leverage Class: An Honest Note on Its Own Confidence

`leverage_class` is self-tagged by the user at deadline/project creation — it is not independently derived by the engine from anything else. `ROADMAP_REVIEW.md` §1.1 correctly identifies that a self-assessed field with no feedback loop is exactly the kind of value a stressed user can game without the system noticing. This document does not invent a classifier to replace it (that would be exactly the "LLM inferring a fact about the user" pattern §1.1/§11 rejects), but it does specify how the engine treats it honestly:

- `leverage_class` is read as an `inferred`-strength input, not a `confirmed` one, regardless of how confidently the user stated it at entry time — the engine's own confidence output (§2.4) reflects this; a verdict resting heavily on a single self-tagged `leverage_class` with no corroborating evidence (a grade weight, an `apply_by` proximity) is `inferred`, not `confirmed`.
- If `study_history` (§1.5) shows a pattern of high-`leverage_class` items receiving disproportionately little actual deep-work time relative to their stated leverage, that pattern is itself a candidate for the Signal Threshold (§4) under Contradiction — surfaced as a `drift_signal` ("stated leverage and actual allocation have diverged"), not silently corrected. The system names the tension; it does not adjudicate the user's own self-assessment for him, which would violate non-negotiable §4.

---

## 7. What This Engine Deliberately Does Not Do

- Does not schedule every hour of the day — it names the single highest-leverage thing, not a full agenda (non-negotiable §11, "not a passive event log... not a scheduling optimizer that treats all tasks as equally worthy").
- Does not take a subjective energy/mood input in v1 (§1.7).
- Does not let a bottleneck or drift signal silently override the ranked verdict without that weighting being visible in the estimated-impact reasoning (§2.2) — the user can always see *why* the current verdict is what it is, never just *that* it changed.
- Does not commit anything itself — every output is a recommendation, subject to the Challenge Layer boundary (§5), never a unilateral action (non-negotiable §4).
