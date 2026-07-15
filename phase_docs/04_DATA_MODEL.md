# 04_DATA_MODEL.md — Project Athena
### Complete Data Model (implementation-ready)
### Standing: subordinate to `MASTER_SPECIFICATION.md` §7 (Database). Every table named here either already appears in §7.2's core table list or is flagged, individually, as a proposed addition under `PROJECT_RULES.md` Immutable Rule #7 ("no feature ships with an implicit new table... the schema change is its own reviewed deliverable").

---

## 0. How This Document Is Organized

You asked for models grouped by product concept (Profile, Courses,
Goals, Career, etc.). The Master Specification organizes storage by
table, not by product concept, and is explicit that this **is** Athena's
memory system in full — no second, concept-shaped shadow schema exists
alongside it (`MASTER_SPECIFICATION.md` §1.5, §7.3). So each section
below states the product concept, then maps it onto the exact table(s)
that already own it. Where no existing table cleanly owns a requested
concept, that is stated explicitly and flagged rather than silently
invented — per Immutable Rule #7, three such flags appear in this
document (§5.2, §7.2, §9), each with its justification, and none of them
should be built without being reviewed as its own deliverable first.

**Snapshot discipline governs every table below**: anywhere a value
changes over time, the table is a time series (`recorded_at` or
equivalent), never an overwritten column. *(§7.1 Design Rule 1.)*
**Semester threading governs every table below**: `semester_id` is a
foreign key wherever the row is semester-scoped. *(§7.1 Design Rule 2.)*

---

## 1. Profile

**Concept → Tables:** `user_profile` (current state) +
`user_profile_history` (append-only snapshots, written whenever the
profile is revised — principally at Semester Setup, see
`03_ONBOARDING.md` §6).

```json
// user_profile (single row, current state)
{
  "id": 1,
  "name": "string",
  "institute": "IIT Hyderabad",
  "program": "B.Tech, AI",
  "current_semester_id": 7,
  "target_cgpa": 8.8,
  "current_cgpa": 7.94,
  "career_target": "ML / Data Science internship, then Quant/ML full-time",
  "masters_target": "MSc Mathematics, Oxford or Imperial",
  "deep_work_window_start": "20:00",
  "deep_work_window_end": "00:00",
  "timezone": "Asia/Kolkata",
  "created_at": "2025-07-01T10:00:00+05:30",
  "updated_at": "2026-07-01T09:12:00+05:30"
}
```

```json
// user_profile_history (one row per revision, append-only)
{
  "id": 14,
  "user_profile_id": 1,
  "semester_id": 7,
  "recorded_at": "2026-07-01T09:12:00+05:30",
  "reason": "semester_rollover",
  "snapshot": {
    "target_cgpa": 8.8,
    "current_cgpa": 7.94,
    "career_target": "ML / Data Science internship, then Quant/ML full-time",
    "masters_target": "MSc Mathematics, Oxford or Imperial",
    "deep_work_window_start": "20:00",
    "deep_work_window_end": "00:00"
  },
  "changed_fields": ["current_cgpa", "career_target"]
}
```

`reason` is an enum: `semester_rollover` | `manual_edit` | `onboarding`.

Why goals live here and not in a separate `goals` table: `target_cgpa`,
`career_target`, and `masters_target` are exactly the "goals explicitly
re-affirmed or revised" language in §6.4's Semester cadence description
— they are attributes of the profile that get compared against
`grade_snapshots` / `codeforces_snapshots` trend at each Semester Setup,
not a separate tracked entity with its own lifecycle. Introducing a
`goals` table would duplicate this without adding a distinct concern,
which Immutable Rule #3 (no duplicate functionality) rules out directly.

---

## 2. Courses

**Concept → Table:** `courses`, scoped to `semester_id`.

```json
{
  "id": 41,
  "semester_id": 7,
  "code": "CS5590",
  "title": "Statistical Machine Learning",
  "credits": 4,
  "leverage_class": "high",
  "instructor": "string",
  "target_grade": "A",
  "meeting_pattern": [
    { "day": "MON", "start": "10:00", "end": "11:00" },
    { "day": "WED", "start": "10:00", "end": "11:00" },
    { "day": "FRI", "start": "10:00", "end": "11:00" }
  ],
  "status": "active",
  "created_at": "2026-07-01T09:00:00+05:30"
}
```

`leverage_class` is an enum: `high` | `medium` | `low` — self-tagged at
creation (see `08_ADAPTIVE_PLANNER.md` §6 for the calibration mechanism
against it). `status` is an enum: `active` | `completed` | `dropped`.

`meeting_pattern` carries the class timetable directly on `courses`
rather than in a separate `class_schedule` table — this is a deliberate
choice to avoid an implicit new table for a concept (weekly meeting
times) that is a fixed attribute of the course, not a time series that
needs snapshotting. If a future need arises to track ad hoc
cancellations or one-off reschedulings as their own auditable events
(distinct from the fixed pattern), that is a genuinely new concept and
must be proposed as its own reviewed schema addition per Immutable Rule
#7 — it is not designed here because no current requirement calls for it
yet.

---

## 3. Semester

**Concept → Table:** `semesters`.

```json
{
  "id": 7,
  "label": "Monsoon 2026",
  "starts_on": "2026-07-15",
  "ends_on": "2026-11-30",
  "is_current": true,
  "created_at": "2026-07-01T09:00:00+05:30"
}
```

Every semester-scoped table (`courses`, `deadlines`, `grade_snapshots`,
`dsa_practice_log`, `deep_work_sessions`, `bottlenecks`,
`drift_signals`, `decisions`, `recommendations`) carries `semester_id`
as a foreign key. *(§7.1 Design Rule 2 — "no table encodes a fixed
weekly structure as global truth"; a course's `meeting_pattern` in §2 is
scoped by being a child of a semester-scoped `courses` row, not a global
weekly template — this is the distinction that keeps §2 compliant with
Rejected Table `weekly_template`, §7.3.)*

---

## 4. Grades and Academic History

**Concept → Table:** `grade_snapshots`, one row per graded assessment
event per course.

```json
{
  "id": 902,
  "course_id": 41,
  "semester_id": 7,
  "assessment_label": "Midsem",
  "score": 78,
  "max_score": 100,
  "weight_pct": 30,
  "recorded_at": "2026-09-02T18:40:00+05:30",
  "source": "manual_entry"
}
```

`source` is an enum: `manual_entry` | `csv_import`.

CGPA itself is never stored as a mutable field anywhere — it is always
**derived** at read time from `grade_snapshots` joined against each
course's `credits`, so it can never drift out of sync with its own
evidence. `user_profile.current_cgpa` in §1 is a cached convenience
value refreshed on every new `grade_snapshots` write, never the source
of truth.

---

## 5. Deadlines and Career

**Concept → Tables:** `deadlines` (single canonical table covering
academic deadlines, internship/application deadlines, and any other
dated commitment) + `opportunities` (time-bound external opportunities
not yet committed to).

```json
// deadlines
{
  "id": 553,
  "semester_id": 7,
  "course_id": 41,
  "title": "ML internship application — Company X",
  "category": "career",
  "due_at": "2026-08-10T23:59:00+05:30",
  "leverage_class": "high",
  "status": "open",
  "created_at": "2026-07-05T11:00:00+05:30",
  "notes": "string, optional"
}
```

`course_id` is nullable (null for career deadlines). `category` is an
enum: `academic` | `career` | `research` | `dsa` | `other`. `status` is
an enum: `open` | `done` | `missed`.

```json
// opportunities
{
  "id": 77,
  "title": "Summer Research Fellowship — Institute Y",
  "category": "research",
  "apply_by": "2026-08-20",
  "source_url": "https://...",
  "relevance_note": "Matches masters_target: MSc Mathematics research track",
  "status": "open",
  "surfaced_at": "2026-07-10T08:00:00+05:30",
  "created_at": "2026-07-10T08:00:00+05:30"
}
```

`category` is an enum: `research` | `internship` | `competition` |
`scholarship`. `status` is an enum: `open` | `applied` | `expired` |
`dismissed`.

**§5.2 Flag (Immutable Rule #7):** the Master Specification does not
list a distinct "career" table beyond `deadlines` and `opportunities` —
Career health as shown on `Trajectory` (and summarized on `Now`, see
`05_OS_HOME.md` §5) is a **derived view** over `deadlines WHERE category
= 'career'`, `opportunities`, and `project_status_snapshots`
(`portfolio_strength_score`), not a new table. This document treats
"Career" as a read model, consistent with §7.4's proxy-vs-trajectory
separation, and flags — rather than builds — the only case where a new
table might eventually be justified: if career deadlines need
richer structured state than `deadlines` currently carries (e.g.
multi-stage application pipelines: applied → OA → interview → offer).
That is out of scope for this document; it would need its own reviewed
proposal citing which non-negotiable or principle it serves before being
added.

---

## 6. Projects and Research

**Concept → Tables:** `projects` + `project_status_snapshots`, and
`research_activities`.

```json
// projects
{
  "id": 12,
  "title": "Grounded LLM Recommendation Engine (Athena itself)",
  "category": "personal",
  "started_on": "2026-01-01",
  "target_completion": "2026-12-31",
  "status": "active",
  "repo_url": "string, optional"
}
```

`category` is an enum: `personal` | `coursework` | `research` |
`competition`. `status` is an enum: `active` | `paused` | `completed` |
`abandoned`.

```json
// project_status_snapshots
{
  "id": 340,
  "project_id": 12,
  "recorded_at": "2026-07-10T21:00:00+05:30",
  "completion_pct": 35,
  "portfolio_strength_score": 6,
  "note": "Phase 1 core loop shipped"
}
```

`portfolio_strength_score` is a trajectory metric (§7.4) — it must be
justified by concrete evidence recorded alongside it (`note`, and
ideally a reference to what changed), never a bare self-assigned number
floating with no evidence trail, to stay consistent with Non-Negotiable
#5 (grounded in reality, never guessed).

```json
// research_activities
{
  "id": 5,
  "semester_id": 7,
  "title": "Literature review — grounded retrieval for personal agents",
  "type": "reading",
  "recorded_at": "2026-07-08T22:10:00+05:30",
  "note": "string"
}
```

`type` is an enum: `reading` | `writing` | `experiment` |
`correspondence`.

---

## 7. Schedule / Deep Work

**Concept → Table:** `deep_work_sessions` (the sacred 8 PM–midnight
block, §3.1 non-negotiable #3) and `deadlines` for anything else dated.

```json
{
  "id": 1188,
  "semester_id": 7,
  "date": "2026-07-14",
  "window_start": "20:00",
  "window_end": "00:00",
  "planned_activity_ref": { "type": "deadline", "id": 553 },
  "planned_activity_label": "ML internship application — Company X",
  "actual_activity_ref": { "type": "deadline", "id": 553 },
  "actual_activity_label": "ML internship application — Company X",
  "protected": true,
  "override_reason": null,
  "disruption_id": null,
  "leverage_class_at_time": "high",
  "outcome_logged_at": "2026-07-15T00:05:00+05:30"
}
```

`protected` is false only if the Deep Work Guard was overridden;
`override_reason` is populated only in that case.

**§7.2 Flag (Immutable Rule #7):** `disruption_id` above references a
`schedule_disruptions` table that is a genuinely new concept — logged
interruptions (a friend visiting, a surprise quiz, illness) that the
Adaptive Planner needs to reason about. This is not part of
`MASTER_SPECIFICATION.md` §7.2's table list. It is proposed and fully
specified as its own reviewed addition in `08_ADAPTIVE_PLANNER.md` §5,
citing the justification there (`ROADMAP_REVIEW.md` §1.2's identified
gap). It is referenced here only so `deep_work_sessions`' shape is
complete; the authoritative definition lives in that document, not this
one, per the "schema change is its own reviewed deliverable" rule.

---

## 8. Study Sessions (DSA / Competitive Programming)

**Concept → Tables:** `dsa_practice_log` + `codeforces_snapshots`.

```json
// dsa_practice_log
{
  "id": 2201,
  "semester_id": 7,
  "recorded_at": "2026-07-14T22:30:00+05:30",
  "problems_attempted": 3,
  "problems_solved": 2,
  "topics": ["dp", "graphs"],
  "difficulty_band": "1800-2000",
  "source": "manual_entry"
}
```

`source` is an enum: `manual_entry` | `codeforces_sync`.

```json
// codeforces_snapshots
{
  "id": 88,
  "recorded_at": "2026-07-14T06:00:00+05:30",
  "rating": 1642,
  "max_rating": 1701,
  "rank": "specialist",
  "contests_count": 19,
  "problems_solved_total": 340,
  "source": "codeforces_sync",
  "is_stale": false
}
```

`problems_attempted` / `problems_solved` in `dsa_practice_log` are
**proxy metrics**; `codeforces_snapshots.rating` is the corresponding
**trajectory metric**. They are joined only by `DivergenceCheck`
(`athena-domain::divergence`), never casually in a display query.
*(§7.4.)*

---

## 9. History (Cross-Cutting)

There is no single "history" table — history is the *property* of every
snapshot table above, plus two dedicated audit tables:

```json
// decisions
{
  "id": 61,
  "semester_id": 7,
  "decision_type": "drop_course",
  "description": "Considering dropping CS5590",
  "challenge_fired": true,
  "challenge_reasoning": "This course is tagged high-leverage and is your only ML theory course this term; grade_snapshots show no academic distress signal justifying a drop.",
  "final_outcome": "kept",
  "decided_at": "2026-09-05T21:15:00+05:30"
}
```

`final_outcome` is an enum: `kept` | `reversed` | `overridden`.

```json
// event_log (append-only, every event whether subscribed or not)
{
  "id": 90441,
  "event_type": "DriftDetected",
  "payload": { "drift_signal_id": 14 },
  "occurred_at": "2026-07-14T06:05:00+05:30"
}
```

**§9 Flag (Immutable Rule #7):** none. `decisions` and `event_log`
already fully cover the audit/history concept per §7.2 — no addition is
proposed here.

---

## 10. Settings

Deliberately minimal. `MASTER_SPECIFICATION.md` §4.8 states outright:
*"no settings sprawl, no notification-preference matrix, no dashboard
builder."* The only settings that exist are already fields on
`user_profile` (§1): `deep_work_window_start/end`, `timezone`. There is
**no separate `settings` table.** A density toggle (Calm / Detail) is
UI-local state per screen, not a persisted preference, per §5.1's
description of it as a per-screen toggle rather than a global setting.

---

## 11. AI Memory

There is no `ai_memory` table, and this document does not propose one.
This section exists only to state that explicitly, in the place a
reader would look for it, and to point to the document that treats the
question in full: **`11_LONG_TERM_MEMORY.md`**, which maps "what Athena
remembers" onto exactly the tables already listed in this document
(principally `grade_snapshots`, `codeforces_snapshots`,
`project_status_snapshots`, `deep_work_sessions`, `bottlenecks`,
`drift_signals`, `decisions`, `recommendations`, `event_log`,
`user_profile_history`). Building a second, LLM-native memory
representation alongside these tables was explicitly evaluated and
rejected. *(`MASTER_SPECIFICATION.md` §1.1, §1.5, §7.3;
`PROJECT_RULES.md` §7 Rule 2.)*

---

## 12. Analytics

No `analytics` table. Every figure the `Trajectory` screen shows —
CGPA trend, DSA/Codeforces trend, portfolio strength trend — is a
**read-time query** over §4, §6, §8's tables, computed at three zoom
levels (week / month / semester) as specified in
`MASTER_SPECIFICATION.md` §5.2. Representative query shapes (not
schema, illustrative only):

```sql
-- CGPA trend (week zoom)
SELECT recorded_at, score, max_score, weight_pct, course_id
FROM grade_snapshots
WHERE semester_id = :current_semester
ORDER BY recorded_at;

-- Codeforces trend (semester zoom)
SELECT recorded_at, rating
FROM codeforces_snapshots
WHERE recorded_at >= :semester_start
ORDER BY recorded_at;
```

Analytics has no persisted state of its own, which keeps it consistent
with its own source tables by construction — a stale analytics cache is
a bug class this design eliminates rather than manages.

---

## 13. Supporting Tables (for completeness, per §7.2)

```json
// data_sources
{
  "id": 3,
  "source_name": "codeforces_api",
  "last_synced_at": "2026-07-14T06:00:00+05:30",
  "staleness_threshold_hours": 26,
  "is_currently_stale": false
}
```

```json
// bottlenecks
{
  "id": 9,
  "semester_id": 7,
  "description": "CS5590 assignment turnaround is consistently the constraint on deep-work allocation",
  "opened_at": "2026-08-01T00:00:00+05:30",
  "status": "open",
  "resolved_at": null,
  "resolution_evidence": null,
  "evidence_row_refs": [{ "type": "deep_work_sessions", "ids": [1188, 1190, 1193] }]
}
```

`status` is an enum: `open` | `resolved` — **never**
`resolved_by_inactivity` (§7.2). A bottleneck only closes on positive
evidence of resolution, never by simply not being mentioned for a while.

```json
// drift_signals
{
  "id": 22,
  "semester_id": 7,
  "signal_type": "grade_trend_declining",
  "severity": "watch",
  "recurrence_count": 3,
  "first_observed_at": "2026-08-01T00:00:00+05:30",
  "last_observed_at": "2026-09-02T18:40:00+05:30",
  "evidence_row_refs": [{ "type": "grade_snapshots", "ids": [880, 891, 902] }],
  "status": "active"
}
```

`severity` is an enum: `watch` | `flag` | `urgent`. `status` is an
enum: `active` | `resolved`.

```json
// recommendations
{
  "id": 5501,
  "semester_id": 7,
  "verdict": "Work on the Company X application tonight.",
  "reasoning": "It is the highest-leverage, closest-deadline open item, and your only open bottleneck (CS5590 turnaround) does not compete for tonight's window.",
  "confidence": "confirmed",
  "grounded_in": [{ "type": "deadlines", "id": 553 }, { "type": "bottlenecks", "id": 9 }],
  "data_freshness_note": "All evidence current as of today.",
  "generated_at": "2026-07-14T18:00:00+05:30"
}
```

`confidence` is an enum: `confirmed` | `inferred` | `insufficient_data`
— never nullable.

---

## 14. Explicitly Rejected Tables (restated for this document's completeness)

Per `MASTER_SPECIFICATION.md` §7.3, and binding on this document: no
`tasks` table, no `streaks`/`badges`/`points` tables, no
`weekly_template` table, no `shared_with`/`collaborators` columns
anywhere, no memory-system tables (`episodic_memory`, `semantic_memory`,
`habit_memory`, `tension_flags`, `credibility_ledger`), no
`mood_log`/`energy_log` table in v1.

---

## 15. Cross-Reference Index

| Product concept (your prompt) | Table(s) | Section |
|---|---|---|
| Profile | `user_profile`, `user_profile_history` | §1 |
| Courses | `courses` | §2 |
| Semester | `semesters` | §3 |
| Goals | fields on `user_profile` | §1 |
| Career | `deadlines` (category=career), `opportunities`, `project_status_snapshots` (derived view) | §5 |
| Projects | `projects`, `project_status_snapshots` | §6 |
| Schedule | `deep_work_sessions`, `deadlines` | §7 |
| Study sessions | `dsa_practice_log`, `codeforces_snapshots` | §8 |
| History | every snapshot table + `decisions`, `event_log` | §9 |
| Settings | fields on `user_profile` only | §10 |
| AI memory | none — see `11_LONG_TERM_MEMORY.md` | §11 |
| Analytics | derived queries, no table | §12 |
