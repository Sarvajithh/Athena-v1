# 05_OS_HOME.md — Project Athena
### Athena as an Operating System: the Home Experience (implementation-ready)
### Standing: this document specifies the content and behavior of the existing **`Now`** screen. It does not add a fifth screen. *(`MASTER_SPECIFICATION.md` §4.8 — "Four screens, no more"; §5.2 — `Now` is "the default screen... the dominant element is... the Priority Resolution engine's ranked answer"; §1.4's ruling that a standalone "Dashboard" is explicitly rejected. Every section below is a content/behavior specification, not a visual design — colors, spacing, and motion remain governed by `MASTER_SPECIFICATION.md` §5.1's UI Philosophy, unchanged here.)*

---

## 0. What "Operating System" Means Here

You asked to "completely redesign the dashboard into an Operating
System." There is no dashboard to redesign — `MASTER_SPECIFICATION.md`
§1.4 and §5.3 explicitly killed the standalone Dashboard concept
(*"its individual cards are redistributed into Now... and Trajectory"*)
because a card-grid dashboard is exactly the "sprawling surface, low
signal" shape the whole product exists to avoid. So this document does
something different, and arguably closer to what "Operating System"
actually means: it specifies `Now` as the **single point of contact**
between the user and every subsystem in `01_ARCHITECTURE.md` — the
place where Priority Resolution, Bottleneck Detection, Drift Scoring,
the Deep Work Guard, the Opportunity Engine, and Trajectory's headline
numbers all surface through **one ranked, hierarchical view**, not a
grid of equal-weight widgets. An OS doesn't show you every process at
once with equal size — it shows you what's running, what needs
attention, and gets out of the way. That is the actual design target.

---

## 1. The Governing Test

Unchanged from `MASTER_SPECIFICATION.md` §5.1: *"If I glance at this for
one second while overwhelmed, do I know what to do next?"* Every
section below is ordered by how much visual and cognitive weight it
earns against that test — not by how interesting it is to build.

---

## 2. Structural Hierarchy (top to bottom, by weight)

```
┌─────────────────────────────────────────────┐
│ 0. Mission strip (persistent, minimal)        │  ← always visible, lowest weight
├─────────────────────────────────────────────┤
│ 1. Recommended Action (dominant element)      │  ← Priority Resolution verdict
│    — confidence badge, one-sentence reasoning │
├─────────────────────────────────────────────┤
│ 2. Weakness Snapshot                          │  ← bottleneck banner + drift banner
│    (only rendered if something is active)     │
├─────────────────────────────────────────────┤
│ 3. Today's Intelligence                       │  ← daily-cadence freshness note
│    (only rendered if something changed)       │
├─────────────────────────────────────────────┤
│ 4. Health Strip: Semester · Career · Masters  │  ← three compact teasers, one row
├─────────────────────────────────────────────┤
│ 5. Opportunity Feed                           │  ← 0–3 items, collapsible
├─────────────────────────────────────────────┤
│ 6. Quick Launch                               │  ← low-emphasis, bottom of screen
└─────────────────────────────────────────────┘
```

Sections 2, 3, and 5 are **conditionally rendered** — they take zero
vertical space when there's nothing real to show, per the "max 5 visible
items before collapse" and "muted ≠ hidden, but nothing fake fills a
gap" instincts in `MASTER_SPECIFICATION.md` §5.1. An empty bottleneck
section is not shown as "no bottlenecks! 🎉" — it simply isn't there,
because manufacturing positive-feeling content out of an absence of data
is its own small version of the false-confidence problem Non-Negotiable
#10 forbids.

---

## 3. Section 0 — Mission Strip

A single, small, persistent line at the very top of the screen, never
competing with the Recommended Action for visual weight:

> `CGPA 7.94 → 8.8 · ML/DS Internship · MSc Mathematics — Oxford/Imperial`

**Source:** `user_profile.current_cgpa`, `.target_cgpa`,
`.career_target`, `.masters_target` (`04_DATA_MODEL.md` §1). Rendered
verbatim from stored fields — no synthesis, no LLM involvement. This is
the one place the user's own stated mission is always visible, so
"what am I optimizing for" is never more than a glance away, without
needing its own screen or its own emphasis.

**Interaction:** tapping it opens Profile editing (`03_ONBOARDING.md`
§6) — the same entry point specified there, not a new one.

---

## 4. Section 1 — Recommended Action (dominant element)

The single largest element on the screen, per `MASTER_SPECIFICATION.md`
§5.2's instruction that this — not the next chronological calendar item
— is what dominates.

**Content, directly from the latest `recommendations` row
(`04_DATA_MODEL.md` §13):**
- **Verdict**, largest text on the screen (`MASTER_SPECIFICATION.md`
  §5.1 — "numbers as the largest thing on any screen" extends naturally
  to "the one verdict that matters is the largest thing").
- **Reasoning**, one sentence, directly beneath.
- **Confidence badge** — `confirmed` / `inferred` / `insufficient_data`,
  rendered as the muted-severity visual language already specified
  (`MASTER_SPECIFICATION.md` §5.1's amber-dot vocabulary), never as an
  alarming or celebratory color regardless of which class it is.
- **Data freshness note**, small, secondary — e.g. "Grounded in
  today's deadlines and last night's deep-work log."

**Tonight's deep-work allocation** is shown as part of this same
section, not a separate card — per §5.2's explicit instruction that this
"replaces" the cut Quick Wins card as *the* actual highest-leverage
evening prompt:

> `Tonight's deep-work block (8 PM–12 AM): Company X application`

If the Deep Work Guard has already recorded an override or a disruption
for today (`08_ADAPTIVE_PLANNER.md` §5), this line reflects the
*current* recomputed allocation, not the original plan — `Now` always
shows the live answer, never a stale morning plan sitting unrecomputed
through a day of change.

**No secondary ranked list is shown by default.** Per Principle
§3.2.9 ("present options only when genuinely, closely ambiguous;
otherwise decide and say so"), a ranked runner-up list only appears if
the Signal Threshold's closeness check (`MASTER_SPECIFICATION.md` §6.5)
determines the top two candidates are genuinely close — in which case up
to 2 additional ranked items render beneath the primary verdict, each
with its own one-line reasoning, never more than 3 items total before a
"+N more, see Trajectory" collapse (the kept "+N more" interaction
pattern, §1.7).

---

## 5. Section 2 — Weakness Snapshot

Two independent, conditionally-rendered banners:

**Bottleneck banner** (if an `open` `bottlenecks` row exists for the
current semester):
> `Bottleneck: CS5590 assignment turnaround is consistently constraining your deep-work allocation.`

**Drift banner** (if an `active` `drift_signals` row exists at
`severity: flag` or `urgent` — `watch`-severity drift accumulates
silently into Trajectory without surfacing here, per the Signal
Threshold's graduation rule, `MASTER_SPECIFICATION.md` §6.5):
> `Drift: three consecutive assessments trending down in CS5590.`

Both use the severity dot vocabulary (`watch`/`flag`/`urgent` always
visually distinguishable, never suppressed for calmness —
`MASTER_SPECIFICATION.md` §1.2's binding correction). If both a
bottleneck and drift signal are active simultaneously, both render,
stacked, never merged into one vaguer statement — precision over
brevity when the two are genuinely different findings.

**Why "Weakness Snapshot" rather than an achievements panel:** this is
addressed at the philosophy level in `12_ATHENA_PHILOSOPHY.md` §16, but
concretely here: this section has no positive-framing counterpart on
`Now` by design. Achievements are visible on `Trajectory` as the
naturally positive slope of a trend line the user can go look at — they
are not manufactured into a congratulatory card on the home screen,
because a system that has to balance every honest weakness with a
compensating pat on the back is optimizing for the user's mood in the
moment, which Non-Negotiable #1 rules out directly.

---

## 6. Section 3 — Today's Intelligence

A single, small, non-blocking line reflecting the outcome of the daily
lightweight check (`MASTER_SPECIFICATION.md` §6.4): *"does the Now
screen's recommendation still hold given anything ingested since
yesterday?"*

- If nothing changed since yesterday's last recompute: **this section
  does not render at all.** Silence is the expected steady state, not a
  reassuring "all good" message — consistent with §2's "nothing fake
  fills a gap" rule.
- If something changed and the verdict is unchanged: *"A Codeforces sync
  came in overnight — doesn't change tonight's recommendation."*
- If something changed and the verdict changed as a result: the change
  itself is folded directly into Section 1's reasoning (*"...updated
  after this morning's grade entry"*), and this section shows only the
  trigger: *"Recommendation updated after this morning's grade entry."*

This section is never a place for a second, competing verdict — it only
ever explains *why* Section 1 looks the way it does today, if that's not
otherwise obvious.

---

## 7. Section 4 — Health Strip: Semester · Career · Masters

Three compact, equal-weight teaser rows, each a single line of derived
signal plus a small trend indicator (up/flat/down arrow, muted color,
never red/green traffic-lighting per the kept "no urgency-for-its-own-
sake" UI instinct) — **not** the full charts. Each row deep-links
directly into the relevant section of `Trajectory`. This is the
"compact-summary-that-links-to-the-real-screen" pattern explicitly
permitted by the "+N more" and swipe-density interaction patterns kept
from the cut screens (`MASTER_SPECIFICATION.md` §1.7) — it does not
duplicate Trajectory's content, it teases it, the same way a
notification teases an app.

```
Semester   CGPA 7.94, trending flat this term → view Trajectory
Career     2 open applications, next apply-by in 4 days → view Trajectory
Masters    Portfolio strength 6/10, research activity logged this week → view Trajectory
```

**Sources, per row:**
- **Semester** — `grade_snapshots` trend for `current_semester_id`
  (`04_DATA_MODEL.md` §4).
- **Career** — `deadlines WHERE category='career' AND status='open'`
  count + soonest `due_at`, plus `opportunities WHERE status='open'`
  (`04_DATA_MODEL.md` §5).
- **Masters** — `project_status_snapshots.portfolio_strength_score`
  latest value + `research_activities` recency
  (`04_DATA_MODEL.md` §6).

No row here is itself a `recommendations` row or passes through LLM
synthesis — these are direct derived-query renders, deliberately kept
outside the grounding pipeline entirely, because they're factual
summaries, not verdicts, and giving them LLM prose would be a synthesis
call with no actual decision behind it to justify the cost or the
attack surface for ungrounded phrasing.

---

## 8. Section 5 — Opportunity Feed

0–3 rows, each one open `opportunities` row (`04_DATA_MODEL.md` §5),
ranked by `apply_by` proximity, with the same severity-dot treatment as
Section 2 once an opportunity's `apply_by` crosses into "watch"/"flag"
territory (mirrors `drift_signals.severity` thresholds, computed the
same deterministic way per the merged Signal Threshold model,
`MASTER_SPECIFICATION.md` §6.5).

```
○ Summer Research Fellowship — Institute Y — apply by Aug 20 (37 days)
```

**This is a deterministic query result, not an LLM "scan," per §1.1's
explicit correction of the Opportunity Engine concept.** If more than 3
opportunities are open, the section shows 3 plus a "+N more, see
Trajectory" link, using the kept collapse pattern rather than growing
the home screen indefinitely.

If zero opportunities are open, this section does not render — same
rule as Sections 2 and 3.

---

## 9. Section 6 — Quick Launch

The bottom of the screen, deliberately the lowest-emphasis section —
small text links, not buttons, not icons in a toolbar. This is **not** a
freeform capture box; `Quick Capture` was explicitly cut
(`MASTER_SPECIFICATION.md` §5.3, §11) because an "AI will sort it out
later" ungrounded input has no safe home in a pipeline where the LLM
never decides. Every Quick Launch entry below creates one existing typed
entity directly, or navigates to an existing screen — nothing more:

```
Log a grade  ·  Log DSA practice  ·  Log deep-work outcome  ·
Add a deadline  ·  Open Semester Setup  ·  Open Decision Log
```

- **Log a grade** → opens a minimal typed form that writes one
  `grade_snapshots` row directly (`04_DATA_MODEL.md` §4). Course
  selected from a dropdown of this semester's existing `courses` —
  never a free-text course field, since that would let a log entry
  silently create an ungrounded, unlinked course.
- **Log DSA practice** → writes one `dsa_practice_log` row directly.
- **Log deep-work outcome** → the one-tap selection described in
  `MASTER_SPECIFICATION.md` §6.4 ("what did you actually work on
  tonight," selected from open deadlines/bottlenecks, not a text box) —
  writes `deep_work_sessions.actual_activity_ref` on today's session
  row. Optional; never required for the pipeline (§6.4).
- **Add a deadline** → writes one `deadlines` row directly, same typed
  form pattern as Semester Setup's Step 2 (`03_ONBOARDING.md` §3).
- **Open Semester Setup / Decision Log** → plain navigation, no data
  created.

Every one of these six actions is a Command through the interceptor
chain (`01_ARCHITECTURE.md` §2.2) like any other write — Quick Launch
is a navigation and entry-point convenience, not a bypass of the
architecture.

---

## 10. What Is Deliberately Not on This Screen

- **No task list, no checklist, no "today's items" grid.** The
  Recommended Action is singular by design (§4) — a list of everything
  open would just be the rejected Dashboard/Daily-Planner pattern
  wearing a new name (`MASTER_SPECIFICATION.md` §1.4, §5.3).
- **No streaks, badges, or completion percentages presented as
  gamification.** `project_status_snapshots.completion_pct` is shown
  factually in Section 4 as a trajectory figure, never as a progress-bar-
  style "almost there!" mechanic (`MASTER_SPECIFICATION.md` §11).
- **No conversational input box.** Nothing on this screen invites the
  user to type a question to Athena as the primary mode of getting a
  recommendation — the recommendation is already there when the screen
  opens, unprompted, per the "Athena pushes, you don't have to pull"
  vision statement (`MASTER_SPECIFICATION.md` §2).
- **No settings icon.** Per §10 of `04_DATA_MODEL.md`, there is nothing
  to navigate to.

---

## 11. Render-Time Data Contract (summary)

| Section | Data source(s) | Conditional? | Passes through LLM synthesis? |
|---|---|---|---|
| 0. Mission | `user_profile` | No, always shown | No |
| 1. Recommended Action | `recommendations` (latest) | No, always shown | Yes — Stage 4 synthesis |
| 2. Weakness Snapshot | `bottlenecks`, `drift_signals` | Yes, only if active | No — factual banner text is templated from the row, not LLM-phrased, to keep this section fast and always-available even if the LLM path is degraded |
| 3. Today's Intelligence | daily check output | Yes, only if something changed | No — templated |
| 4. Health Strip | `grade_snapshots`, `deadlines`, `opportunities`, `project_status_snapshots`, `research_activities` | No, always shown (rows may be empty → "insufficient data" text per row) | No |
| 5. Opportunity Feed | `opportunities` | Yes, only if any open | No |
| 6. Quick Launch | none (navigation only) | No, always shown | No |

Note that only Section 1 ever calls the LLM. Every other section is a
direct, fast, offline-safe render straight from `athena-data` — this
keeps `Now`'s cold-open latency low and keeps the screen fully
functional per the offline-first non-functional requirement
(`MASTER_SPECIFICATION.md` §4.7) even when the LLM path (cloud or local)
is entirely unavailable: Section 1 degrades to the template-flattened
Stage 5 fallback (`01_ARCHITECTURE.md` §3.2 step 4), and every other
section is unaffected.
