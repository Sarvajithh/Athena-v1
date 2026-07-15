# 11_LONG_TERM_MEMORY.md — Project Athena
### Long-Term Memory System (implementation-ready)
### Standing: this document does not define a new memory system. It defines how the existing schema (`04_DATA_MODEL.md`) functions as Athena's memory, per `MASTER_SPECIFICATION.md` §1.5: *"DATABASE_SCHEMA.md already has grade_snapshots, dsa_practice_log, codeforces_snapshots, deep_work_sessions, bottlenecks, drift_signals, decisions, and recommendations — this IS Athena's memory."* Building a second, LLM-native memory representation alongside it was evaluated and explicitly rejected (§1.1, §11). `PROJECT_RULES.md` §7 Rule 2 names this exact temptation directly and warns against it recurring "because the current task makes it tempting" — this document is the record that the temptation was recognized and declined, not acted on.

---

## 0. The One Rule This Entire Document Serves

**If a pattern is real, it shows up as a row with evidence. If it isn't
in a row, Athena doesn't remember it, and doesn't pretend to.**
*(`MASTER_SPECIFICATION.md` §6.8, final bullet.)* Every section below is
an application of this one rule to a specific category of thing your
prompt asked Athena to remember.

---

## 1. What "Memory" Means in This Architecture

Memory is not a subsystem. It is a **property of the database's write
discipline** — snapshot-over-overwrite (`04_DATA_MODEL.md` §0, §7.1
Design Rule 1) — combined with a **retrieval discipline** (Stage 2 of
the synthesis pipeline, `01_ARCHITECTURE.md` §3.2 step 1) that pulls the
relevant rows for a given moment, and a **surfacing discipline** (the
Signal Threshold, `MASTER_SPECIFICATION.md` §6.5) that decides what
graduates from "logged" to "shown." Three disciplines, zero additional
tables, zero additional models. This is the entire memory architecture.

---

## 2. Study Patterns

**Remembered via:** `deep_work_sessions` (planned vs. actual activity,
`leverage_class_at_time`, `protected` flag), `dsa_practice_log`
(problems attempted/solved, topics, difficulty band over time),
`schedule_disruptions` (`08_ADAPTIVE_PLANNER.md` §5 — what actually
interrupts study, how often, of what kind).

**How a "pattern" is recognized:** never by an LLM noticing something
qualitative. Only by SQL aggregation crossing the Signal Threshold
(recurrence >= 2-3 occurrences, `MASTER_SPECIFICATION.md` §6.5) — e.g.
"deep-work sessions tagged `dsa` are `protected: false` in 4 of the last
5 occurrences" is a real, queryable pattern that can graduate to a
`drift_signals` row (`signal_type: "dsa_session_protection_low"`). An
LLM is never asked "what patterns do you notice in this user's study
habits" — that question is structurally not askable in this pipeline,
because Stage 4 synthesis only ever receives already-computed verdicts,
never raw historical rows to editorialize over (`MASTER_SPECIFICATION.md`
§6.2, §6.8).

---

## 3. Mistakes

**Remembered via:** `decisions` (every challenged decision and its
`final_outcome`), `drift_signals` (a trend that was flagged), `bottlenecks`
(a constraint that recurred). A "mistake" in Athena's data model is
never a subjective judgment stored as such — it is the objective record
of a decision whose outcome later correlates with a negative trajectory
signal (e.g. a `decisions` row where `final_outcome: "overridden"`
against a Challenge Dialog's warning, followed within the tracking
window by a `drift_signals` row whose evidence includes the same
course/category).

**Explicitly not built:** a "mistakes log" the LLM writes to in its own
words. Every "mistake" is reconstructable purely from joining
`decisions.final_outcome` against subsequent snapshot data — this is
literally the deterministic "credibility ledger" pattern already
scoped as a Future Feature in `MASTER_SPECIFICATION.md` §10, and it is
never LLM-graded, per that section's own explicit constraint.

---

## 4. Goals

**Remembered via:** `user_profile` (current) + `user_profile_history`
(every past revision, append-only, `04_DATA_MODEL.md` §1). A goal is
never inferred from conversation or behavior — it exists only because
the user explicitly stated it, at onboarding (`03_ONBOARDING.md` §2) or
at a semester rollover's Trajectory Comparison step
(`03_ONBOARDING.md` §7.2). Athena can show *how a goal has changed over
time* (a query over `user_profile_history`), which is itself a
legitimate, grounded form of memory your prompt is asking for — "you
said X last semester, you're saying Y now" is a factual, citable
observation, not an inference.

---

## 5. Failures and Achievements

**Remembered via:** the same trajectory tables as everything else —
`grade_snapshots`, `codeforces_snapshots`, `project_status_snapshots`,
`dsa_practice_log`. A "failure" is a negative-slope trend in a
trajectory metric; an "achievement" is a positive one. Neither is a
distinct table or a distinct concept in storage — they are two
directions of the same read.

**Why achievements are not specially remembered or surfaced:** this is
a philosophy-level choice, fully justified in `12_ATHENA_PHILOSOPHY.md`
§16, and stated here only as it bears on memory specifically —
`Trajectory`'s upward-sloping line already *is* the record of an
achievement; no separate "achievements" table or celebratory surfacing
mechanism is built, because a system with two different memory
treatments for good news and bad news is a system biased toward telling
the user what they want to hear, which is the exact failure mode
Non-Negotiable #1 exists to prevent.

---

## 6. Preferences

**Remembered via:** `user_profile` (`deep_work_window_start/end`,
explicitly chosen at onboarding, `03_ONBOARDING.md` §2 Step 4) and
nothing else. Per `04_DATA_MODEL.md` §10 and `MASTER_SPECIFICATION.md`
§4.8, there is no general-purpose preferences table, and this document
does not propose one. "Preference" in the sense of "Athena learns what
kind of recommendations I respond well to" is explicitly out of scope —
that would require exactly the LLM-inferred behavioral modeling §1.1
rejected. The only preferences Athena remembers are the ones the user
explicitly typed into a form.

---

## 7. Behavior

**Remembered via:** `event_log` (every event, unconditionally,
append-only — the literal, complete behavioral record,
`01_ARCHITECTURE.md` §6.4), plus the domain-specific tables already
listed above. This is the most complete "memory" in the system by
volume, and it is also the one explicitly **not** surfaced directly to
the user or the LLM as a narrative — it exists for auditability
(*"the system's behavior must be reconstructable years later,"*
`MASTER_SPECIFICATION.md` §4.6), not as an input to reasoning. Stage 2
retrieval never pulls raw `event_log` rows into a synthesis payload; it
pulls the structured, purpose-built tables (`grade_snapshots`,
`bottlenecks`, etc.) that already represent the meaningful subset of
that behavior. `event_log` is Athena's memory of *itself*, not a second
copy of its memory of the user.

---

## 8. What Athena Never Remembers (by design)

Directly restating `MASTER_SPECIFICATION.md` §6.8 and §11, because this
is the section a future session is most likely to feel tempted to
violate under time pressure (`PROJECT_RULES.md` §7 Rule 2):

- **No inferred psychological state.** Athena does not store "user
  seems stressed" or "user avoids hard problems" anywhere. If stress
  shows up as a measurable pattern (e.g. `deep_work_sessions.protected`
  rate declining alongside `drift_signals`), *that* pattern is
  remembered — the psychological label is not.
- **No open-ended conversational history as a primary memory store.**
  A narrow "why?" follow-up (`MASTER_SPECIFICATION.md` §10) re-runs
  synthesis with the same grounded payload; it does not accumulate a
  persistent chat transcript that later syntheses draw on.
- **No confidence/credibility score about the user's judgment**, beyond
  the explicitly-scoped, SQL-only, non-LLM-graded Future Feature named
  in §10 of the Master Spec.
- **No fine-tuning or embedding of user data.** *(§6.8.)*

---

## 9. What Is Never Deleted, and What Is Never Surfaced Again

These are two different questions, and conflating them is exactly the
mistake a bespoke "forgetting" mechanism would make.

### 9.1 Deletion

**Nothing is ever deleted.** Migrations are additive-only
(`04_DATA_MODEL.md` §9; `MASTER_SPECIFICATION.md` §7.5). A `bottlenecks`
row, once opened, is never quietly dropped — it can only move to
`status: "resolved"` with `resolution_evidence` populated, **never**
`resolved_by_inactivity` (`04_DATA_MODEL.md` §13, restating the explicit
prohibition in `MASTER_SPECIFICATION.md` §7.2). A bottleneck that the
user simply stops mentioning stays open, honestly, until real evidence
closes it — this is Non-Negotiable #6 ("weaknesses tracked honestly,
never softened... kept named until resolved by evidence") applied to
storage directly.

### 9.2 Surfacing Decay

What *does* fade is what gets **shown** on `Now` or in a synthesized
recommendation — governed entirely by the Signal Threshold's recurrence
window (`MASTER_SPECIFICATION.md` §6.5). A `drift_signals` row whose
`last_observed_at` falls outside the relevant recurrence window
naturally stops contributing to `drift_amplifier` in
`08_ADAPTIVE_PLANNER.md` §3.1, without the row itself being touched. The
full history remains queryable on `Trajectory` regardless. This is the
correct, honest answer to "what should Athena intentionally forget":
**nothing, in storage — but not everything old stays load-bearing in
today's verdict, and that distinction is handled by a threshold
function, not a deletion.**

---

## 10. Retrieval: How Memory Actually Gets Used

Every synthesis call's Stage 2 retrieval (`01_ARCHITECTURE.md` §3.2
step 1) is a **narrow, purpose-scoped query**, not a dump of everything
Athena has ever stored. For a `Now` screen recompute, retrieval pulls:
open `deadlines` for the current semester, the current `bottlenecks`
(if any), `active` `drift_signals` at `flag`/`urgent` severity, today's
`deep_work_sessions` state, and any `schedule_disruptions` logged today.
It does **not** pull three semesters of `grade_snapshots` history into
every `Now` recompute — that data is retrieved by `Trajectory`'s own
queries when the user opens that screen. This scoping is itself a
memory-integrity property: the smaller and more purpose-built each
retrieval is, the easier the grounding check (`01_ARCHITECTURE.md` §3.2
step 4) can verify that nothing in a synthesized sentence traces to data
outside what was actually retrieved for that call.

---

## 11. Confidence as the Memory/Present Boundary

The three confidence classes (`confirmed` / `inferred` /
`insufficient_data`, `MASTER_SPECIFICATION.md` §6.3) are, functionally,
Athena's way of being honest about *how much memory actually backs a
given verdict*:

- `confirmed` — directly grounded in fresh, current rows. Memory is not
  really load-bearing here; the present data speaks for itself.
- `inferred` — grounded in a *trend read across multiple historical
  snapshots*. This is memory doing real work, and it is labeled as a
  hypothesis specifically because reasoning from history is inherently
  less certain than reasoning from today's data — Athena says so, every
  time, rather than presenting a memory-derived inference with the same
  confidence as a fresh fact.
- `insufficient_data` — memory doesn't yet exist for this question (a
  new semester, a new course, a new goal). Athena says this plainly
  rather than reaching backward for a weaker signal and presenting it as
  sufficient.

---

## 12. Cross-Reference Index

| Your prompt's category | Table(s) | Section |
|---|---|---|
| Study patterns | `deep_work_sessions`, `dsa_practice_log`, `schedule_disruptions` | §2 |
| Mistakes | `decisions`, `drift_signals`, `bottlenecks` | §3 |
| Goals | `user_profile`, `user_profile_history` | §4 |
| Failures | trajectory tables, negative slope | §5 |
| Achievements | trajectory tables, positive slope | §5 |
| Preferences | `user_profile` (deep-work window only) | §6 |
| Behaviour | `event_log` + domain tables | §7 |
| What's never remembered | — | §8 |
| What's never deleted vs. never resurfaced | all tables / Signal Threshold | §9 |
