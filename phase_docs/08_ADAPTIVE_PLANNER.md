# 08_ADAPTIVE_PLANNER.md — Project Athena
### Adaptive Scheduling Engine (implementation-ready)
### Standing: extends `athena-domain::priority` and `athena-domain::deep_work`. Introduces one new table, `schedule_disruptions`, flagged and justified per `PROJECT_RULES.md` Immutable Rule #7 (§5 below). Directly closes the gap identified in `ROADMAP_REVIEW.md` §1.2 ("bottleneck and drift signals are surfaced but never fed back into Priority Resolution") and addresses §1.1's `leverage_class` calibration risk (§6 below).

---

## 0. What Problem This Solves

`MASTER_SPECIFICATION.md` §3.2 Principle 5 states semester context is "a
first-class, frequently-refreshed input" and Non-Negotiable #7 states
"the system adapts to the semester, not the reverse." Neither of these,
as written, fully specifies what happens at the scale of *a single
evening* — a friend interrupts, a professor cancels class, sickness
takes the whole day. `ROADMAP_REVIEW.md` §1.2 independently flagged that
even the planned architecture never wires bottleneck/drift signals back
into the ranking function itself, leaving `Now` able to show two
independently-computed, potentially contradictory signals. This document
is the missing piece: it specifies exactly how `athena-domain::priority`
recomputes when reality diverges from plan, using only deterministic
Rust, never an LLM judgment call, per the LLM-never-decides rule
(`MASTER_SPECIFICATION.md` §6.1) which is binding on this document as
much as on any other.

---

## 1. Design Constraints (restated, binding)

1. **The LLM never decides, only phrases** — every reprioritization
   below is pure Rust. The LLM's only role after a replan is turning the
   new verdict into a sentence, exactly as in the normal pipeline
   (`01_ARCHITECTURE.md` §3.2). *(Non-Negotiable #2, #5; Engineering
   Guideline #2.)*
2. **No decision made silently** — a disruption that would eat into the
   protected deep-work window still routes through the Deep Work Guard
   interceptor; the Guard is never bypassed just because a disruption
   was logged. *(Non-Negotiable #4.)*
3. **Grounded, never guessed** — a replanned verdict cites the same kind
   of evidence rows as any other recommendation; "the plan changed
   because you told me it changed" is itself grounding, not an
   exception to it. *(Non-Negotiable #5.)*
4. **No fixed weekly template is ever assumed valid** — a disruption is
   not an exception to a rigid schedule, because Athena has no rigid
   schedule to begin with; it is simply new input to the same scoring
   function that runs on any other trigger. *(Non-Negotiable #7.)*
5. **No metric gaming** — a disruption log must never become a
   loophole for silently lowering the bar (e.g. "I was interrupted" used
   to justify skipping high-leverage work in favor of low-leverage work
   with no real constraint). §4 and §6 specify how this is guarded
   against structurally, not just by trusting good faith.

---

## 2. Recomputation Triggers

Priority Resolution already recomputes on the four trigger classes
listed in `01_ARCHITECTURE.md` §3.1. This document adds a fifth, the
one this whole document is about:

5. **A `ScheduleDisruption` is logged** (§4) — either by explicit user
   action ("log an interruption") or by the Deep Work Guard's own
   close-out process detecting a mismatch between planned and actual
   activity at end-of-window (§7).

Every trigger, disruption or otherwise, runs the identical scoring
function in §3 — a disruption is not special-cased logic bolted onto
the side of Priority Resolution, it is one more shape of input the same
function already has to handle.

---

## 3. The Priority Scoring Model

### 3.1 Inputs (all retrieved, none inferred)

For each open candidate (a `deadlines` row, or a `courses` row implying
ongoing coursework load):

- `leverage_class` — `high` | `medium` | `low`, self-tagged
  (`04_DATA_MODEL.md` §2, §5).
- `urgency` — derived deterministically from `due_at` proximity: a
  fixed, documented curve (e.g. `urgency = 1 / max(hours_until_due, 1)`,
  clipped and banded, not a magic unexplained float) — the exact curve
  shape is an implementation detail, but it must be a **pure function of
  `due_at` and "now,"** nothing else, so it is trivially unit-testable
  to the >90% branch-coverage bar (`PROJECT_RULES.md` Immutable Rule
  #10).
- `trajectory_weight` — a fixed weight per `category`
  (`academic`/`career`/`research`/`dsa`/`other`), configured once,
  documented in code with a citation (`PROJECT_RULES.md` §2 — "Explain
  architectural decisions in code... with a citation"), not tunable at
  runtime by the LLM or by any implicit mechanism.
- `bottleneck_amplifier` — **1.0 by default; boosted only if this
  specific candidate is named in an `open` `bottlenecks.evidence_row_refs`
  for the current semester.** This is the literal fix for
  `ROADMAP_REVIEW.md` §1.2: the ranking function now reads
  `bottlenecks` directly, not just a UI banner reading it separately.
- `drift_amplifier` — same mechanism as `bottleneck_amplifier`, reading
  `active` `drift_signals.evidence_row_refs` at `severity: flag` or
  `urgent` (not `watch` — a `watch`-level signal doesn't yet meet the
  Signal Threshold bar to influence ranking, consistent with §6.5's
  graduation rule).
- `available_minutes_tonight` — normally the full deep-work window
  length; reduced by any logged `schedule_disruptions` row for today
  (§4), or increased if the user logs an early finish freeing up
  additional time (§4.1's `early_finish` disruption type, which is a
  *positive* disruption).

### 3.2 Scoring Function

Illustrative form (exact constants are an implementation detail subject
to the same >90% coverage bar as any other `athena-domain::priority`
code, not fixed by this document):

```
score(candidate) =
    base_weight[candidate.leverage_class]
  x urgency(candidate.due_at, now)
  x trajectory_weight[candidate.category]
  x bottleneck_amplifier(candidate, open_bottlenecks)
  x drift_amplifier(candidate, active_drift_signals)
```

The ranked verdict is the highest-scoring candidate that **fits within
`available_minutes_tonight`.** If the highest-scoring candidate does not
fit (e.g. it's a large deliverable and tonight only has 45 minutes left
after a disruption), Priority Resolution does not silently pick the next
candidate without saying so — the verdict's reasoning explicitly states
the substitution: *"Normally X would rank first, but tonight's reduced
window means Y is the highest-leverage thing that actually fits."* This
is the concrete mechanism by which Non-Negotiable #5 (grounded, never
guessed) applies to a disrupted evening, not just a normal one.

### 3.3 The Closeness Check (unchanged, reused)

If the top two scores are within the same closeness threshold already
governing `Now`'s optional runner-up list (`05_OS_HOME.md` §4), both are
surfaced. A disruption does not change this threshold — it is the same
mechanism, fed different input.

---

## 4. Disruption Types and Recovery Behavior

Every disruption is logged as one `schedule_disruptions` row (schema in
§5) with a `disruption_type`. Each type below states what changes in
§3.1's inputs and what the resulting `recommendations.reasoning` says,
in plain terms, so the recovery is always explainable — never a silent
recalculation the user has to take on faith.

### 4.1 `external_interrupt` (e.g. "a friend visits for an hour")

**User action:** logs a disruption with a duration (e.g. 60 minutes) and
optionally a note.

**Effect:** `available_minutes_tonight` reduced by the logged duration.
Scoring reruns per §3.2 against the reduced window.

**Reasoning example:** *"With 60 fewer minutes tonight, the Company X
application (45 min remaining) still fits and remains highest-leverage —
plan unchanged."* or, if it no longer fits: *"...the Company X
application no longer fits in the remaining time; recommend the DSA
practice log instead, and finishing the application first thing
tomorrow."*

**Deep Work Guard interaction:** if the interrupt falls *inside* the
deep-work window itself (not just reducing total minutes but literally
splitting the window), the Guard's override-confirmation prompt (§7)
still fires — logging a disruption does not pre-authorize stepping away
from the protected window; it explains the recovery *after* the user has
made that call through the Guard's normal path.

### 4.2 `surprise_workload` (e.g. "professor announces a surprise quiz")

**User action:** logs the disruption, optionally directly creating a new
`deadlines` row in the same flow (a genuinely new, real deadline — this
is not a loophole, it's the correct typed entity for a real new
obligation).

**Effect:** the new deadline enters scoring as any other candidate would
— no special-casing. If it's tomorrow, its `urgency` will likely make it
rank first on its own merits.

**Reasoning example:** *"A new deadline (quiz tomorrow) now ranks
highest given its proximity — recommend shifting tonight's window to
quiz prep."*

### 4.3 `cancelled_class` (a positive-duration disruption)

**User action:** logs the disruption with the freed duration.

**Effect:** if the cancellation falls before the deep-work window,
`available_minutes_tonight` is unaffected (deep-work window itself
didn't change) — but Priority Resolution may still recompute if the
freed time changes what's realistic to attempt *before* the window
(e.g. now there's time to also log DSA practice before deep work
starts). This is surfaced as a secondary, non-blocking suggestion, never
as a second competing "Recommended Action" (`05_OS_HOME.md` §4's
single-verdict rule holds even here).

### 4.4 `unexpected_opportunity` (e.g. "surprise hackathon")

**User action:** logs the disruption as `unexpected_opportunity` with a
duration and, if applicable, links it to a new or existing
`opportunities` row.

**Effect:** this is the one disruption type that can trigger the
**Decision Challenge Layer**, not just a replan — because committing a
full evening (or the whole deep-work window) to something newly
discovered is exactly the shape of decision the Challenge Layer exists
to evaluate (`01_ARCHITECTURE.md` §3.3). If the hypothetical "skip
tonight's planned high-leverage deadline for this hackathon" trips the
Signal Threshold against current bottleneck/drift state, the blocking
`ChallengeDialog` fires with the specific reasoning (e.g. "you have an
open urgent-severity drift signal on CS5590 and this would be the third
night in a row deep work went to something other than your ranked #1
item"). If it doesn't trip the threshold, the replan proceeds as a
normal recompute.

### 4.5 `illness`

**User action:** logs the disruption, optionally for a duration spanning
the full day or multiple days (a `date_range` variant, §5).

**Effect:** `available_minutes_tonight` (and, for multi-day illness,
every affected day's window) is set to zero or a reduced value the user
specifies. Priority Resolution for an illness day does not attempt to
force-fit a "highest leverage thing that fits in zero minutes" — instead
`Now`'s Recommended Action explicitly states rest is the correct call:
*"Logged as unavailable today. No deep-work allocation recommended —
recover; nothing here is worth pushing through illness for."* This is
the one case where the verdict is explicitly *not* a work item, and it
is treated as a first-class, fully valid verdict shape, not a fallback
or an empty state. *(This connects directly to
`12_ATHENA_PHILOSOPHY.md` §9's treatment of rest as a legitimate
trajectory-preserving recommendation, not a failure to produce a work
item.)*

**Multi-day illness and drift:** an illness-caused gap in
`deep_work_sessions` rows is tagged (via the disruption link, §5) so
that `DriftScan` does not mistake an illness-caused gap for a genuine
behavioral drift pattern — a gap with a linked `illness` disruption is
excluded from `drift_signals` recurrence counting for that window. This
is the concrete mechanism that keeps Non-Negotiable #6 (weaknesses
tracked honestly) from misfiring: it is honest to *not* flag illness as
a discipline problem.

### 4.6 `early_finish` (positive disruption — finished planned work early)

**User action:** logs remaining free minutes tonight, or the system
infers it directly from a `deep_work_sessions` close-out that happens
well before `window_end` (§7) — either path produces the same disruption
row.

**Effect:** `available_minutes_tonight` effectively **increases**
(remaining time is re-offered to scoring). Priority Resolution reruns
and may surface a second, lower-scoring-but-still-positive candidate for
the remaining time — rendered on `Now` as an updated Recommended Action,
not a separate "bonus tasks" list (no gamification-flavored surface,
`MASTER_SPECIFICATION.md` §11).

**Reasoning example:** *"Finished early — 50 minutes left tonight. Next
highest-leverage fit: DSA practice (Codeforces rating is your most
stagnant trajectory metric this month)."*

---

## 5. New Table: `schedule_disruptions`

**Immutable Rule #7 justification:** this is a genuinely new concept —
an auditable, typed log of *why* a plan changed — not representable by
any existing table. `deep_work_sessions` records planned vs. actual
outcome but has no room for the *reason* a deviation happened, and
`bottlenecks`/`drift_signals` represent recurring patterns, not discrete
one-off events. Building this satisfies Non-Negotiable #2 ("every
surfaced item carries a recommendation, a reason, or a trade-off — never
a bare notification") applied to disruption handling specifically, and
directly implements the fix `ROADMAP_REVIEW.md` §1.2 called for. This
table addition should be reviewed and merged as its own deliverable,
before any UI referencing it is built, per Immutable Rule #7's process.

```json
{
  "id": 301,
  "semester_id": 7,
  "date": "2026-07-14",
  "disruption_type": "external_interrupt",
  "duration_minutes": 60,
  "affects_deep_work_window": true,
  "linked_deadline_id": null,
  "linked_opportunity_id": null,
  "note": "Friend visiting unexpectedly",
  "logged_at": "2026-07-14T19:10:00+05:30",
  "recompute_triggered": true,
  "recommendation_id_after": 5502
}
```

`disruption_type` enum: `external_interrupt` | `surprise_workload` |
`cancelled_class` | `unexpected_opportunity` | `illness` |
`early_finish`. `linked_deadline_id` / `linked_opportunity_id` populated
only for the types that create or reference one (§4.2, §4.4).
`recommendation_id_after` links to the `recommendations` row produced by
the resulting recompute, so the causal chain (disruption → new verdict)
is itself queryable and auditable — this is what makes "how should it
explain the recovery plan" (your prompt's question) a structural
guarantee rather than a hope about prompt quality.

---

## 6. Learning Over Time — What This Explicitly Does and Does Not Mean

Your prompt asks "how should it learn over time?" This section answers
that within the binding constraint restated in §1.1: **no LLM-inferred
psychological or behavioral pattern is ever built** — this is not a
stylistic preference, it is the explicit rejection in
`MASTER_SPECIFICATION.md` §1.1 and §11 ("LLM-inferred habit, weakness,
and 'blind spot' detection... is a guess presented as fact, which §3.1
non-negotiable #5 forbids outright"). "Learning" here means exactly one
thing: **accumulated evidence in existing tables, surfaced through the
same deterministic Signal Threshold mechanism that already governs
everything else** — never a new model, a new score with no formula, or
an LLM noticing a "pattern" on its own initiative.

### 6.1 Closing the `leverage_class` Calibration Gap

`ROADMAP_REVIEW.md` §1.1 named this precisely: a self-tagged
`leverage_class` with no feedback loop is gameable, and nothing in the
original plan ever revisited it. The deterministic fix:

- Every `deep_work_sessions` row already carries
  `leverage_class_at_time` (`04_DATA_MODEL.md` §7) — the leverage class
  the candidate had *when it was worked on*.
- A scheduled pass (piggybacking on the existing `DriftScan` daily
  timer, not a new scheduler — `MASTER_SPECIFICATION.md` §4.6) computes,
  per course/category, **how often a `high`-leverage-tagged candidate
  was actually followed by measurable trajectory movement** (a
  `grade_snapshots` improvement, a `codeforces_snapshots` rating
  increase, a `project_status_snapshots.portfolio_strength_score`
  increase) within a defined window after the session.
- This is a **pure SQL aggregation over existing tables** — override
  rate, in spirit identical to the already-specified Future Feature
  "deterministic credibility ledger" (`MASTER_SPECIFICATION.md` §10),
  narrowly applied to `leverage_class` instead of `decisions`. Because
  it is explicitly named as a Future Feature pattern in the Master Spec
  and only ever computed by SQL, never LLM-graded, this document
  proposes it as an extension of that already-approved pattern, not a
  new category of thing.
- If the aggregation shows a course or category's `high` tag
  consistently does **not** precede measurable movement across enough
  occurrences to meet the Signal Threshold (recurrence >= 2-3, per
  §6.5), this graduates into a `drift_signals` row like any other
  finding — e.g. `signal_type: "leverage_miscalibration"` — surfaced
  exactly the way any other drift signal is, with evidence rows
  attached. **The system never silently downgrades a candidate's
  leverage_class itself** — that would be the domain layer overriding a
  user's explicit input, which is a different (and much larger)
  decision than surfacing evidence that the tagging might be off. The
  user sees the evidence and can choose to re-tag going forward; Athena
  names the pattern, it does not act on it unilaterally (Non-Negotiable
  #4).

### 6.2 What "Learning" Never Means Here

- Athena never adjusts scoring weights (`base_weight`, `trajectory_weight`
  in §3.2) automatically based on observed behavior. Those are fixed,
  documented constants; changing them is a deliberate, cited code change
  by the developer, not a runtime adaptation (`PROJECT_RULES.md` §2 —
  "no hidden state... no 'convenient' shared caches that aren't part of
  the typed contract").
- Athena never builds a per-user "model" of anything — no embeddings, no
  fine-tuning, no vector store of past behavior feeding future ranking.
  *(`MASTER_SPECIFICATION.md` §6.8.)*
- "Learning" is entirely legible: a future session (or the user) can
  read the exact SQL behind any drift signal this mechanism produces and
  verify it by hand. Opacity is the thing this whole design exists to
  avoid.

---

## 7. Deep Work Guard Interaction, End to End

```
Window opens (20:00, per user_profile.deep_work_window_start)
   -> Now shows the current Recommended Action for tonight's window
   -> user works, or a disruption is logged mid-window (Section 4)
   -> if a disruption reduces or ends the window, the Deep Work Guard's
      override-confirmation prompt is the mechanism that captures it --
      NOT a silent auto-recompute. The Guard fires (the second of the
      two named modal exceptions, MASTER_SPECIFICATION.md 1.3),
      the user confirms the override with a reason, which becomes the
      schedule_disruptions row (Section 5) directly -- the Guard's
      confirmation dialog and the disruption log are the same user
      action, not two separate steps
   -> Priority Resolution reruns per Section 3, producing an updated
      recommendation
   -> at window_end (00:00, or earlier if fully disrupted), a close-out
      step prompts the optional one-tap "what did you actually work on"
      (MASTER_SPECIFICATION.md 6.4) -- writes deep_work_sessions.actual_
      activity_ref and leverage_class_at_time, closing the loop that
      Section 6.1 depends on
```

Nothing in this flow allows a disruption to be logged *after the fact*
as a way to retroactively excuse a low-leverage evening without it
showing up honestly in the data — the `deep_work_sessions` row for that
night still records what actually happened; the disruption log explains
*why*, it does not overwrite *what*. This is the structural answer to
the Non-Negotiable #9 risk (no metric gaming) named in §1.5: a
disruption is additive context, never a substitute for the actual
outcome record.

---

## 8. Cross-Reference Index

| Your prompt's scenario | Handled by | Section |
|---|---|---|
| Friend interrupts for an hour | `external_interrupt` | §4.1 |
| Surprise quiz announced | `surprise_workload` | §4.2 |
| Lecture cancelled | `cancelled_class` | §4.3 |
| Unexpected hackathon | `unexpected_opportunity` (+ possible Challenge Layer) | §4.4 |
| Sickness | `illness` | §4.5 |
| Finished work early | `early_finish` | §4.6 |
| "How should it compute priorities?" | §3 scoring model | §3 |
| "How should it explain the recovery plan?" | §5's `recommendation_id_after` link + reasoning examples throughout §4 | §4, §5 |
| "How should it learn over time?" | §6, strictly deterministic | §6 |
