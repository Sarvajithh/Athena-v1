# 03_ONBOARDING.md — Project Athena
### Onboarding & Semester Setup Wizard (implementation-ready)
### Standing: this document specifies the **first-run state of the existing `Semester Setup` screen**, plus the one-time Profile creation step that precedes it. It does not add a fifth screen. *(Justified by `MASTER_SPECIFICATION.md` §4.8 — "Four screens, no more" — and §5.2's definition of `Semester Setup` as "the re-derivation wizard run at the start of each term"; `PROJECT_RULES.md` Immutable Rule #1 — architecture is not rewritten as a side effect of designing onboarding.)*

---

## 0. Framing

Two things happen the first time Athena is ever opened, and they are
different in kind:

1. **Profile creation** — a one-time event that only happens once, ever,
   per install (unless the user later does a full re-onboarding, see
   §8). This produces the initial `user_profile` row.
2. **Semester Setup** — the recurring wizard that also runs on first
   launch, immediately after Profile creation, to establish the first
   semester's courses, deadlines, and timetable.

On first launch, these two run back-to-back as one continuous flow with
no visible seam — the user experiences "onboarding" as a single wizard.
On every subsequent semester boundary, only Semester Setup runs again
(§7). This document therefore specifies both, in the order the first-run
user actually experiences them.

---

## 1. First-Launch Detection

On app boot, `athena-app` checks whether a `user_profile` row exists.

- **No row exists** → the app opens directly into the onboarding flow
  (§2 onward). The `Now`, `Trajectory`, and `Decision Log` screens are
  not reachable until onboarding completes — there is nothing grounded
  to show yet, and showing them empty would violate the cold-start
  correctness requirement's spirit (`MASTER_SPECIFICATION.md` §4.7 —
  "at the start of a semester with mostly empty data, the system says
  'insufficient data,' never guesses" — extended here to mean it doesn't
  show an empty shell pretending to be a working product either).
- **A row exists** → the app opens directly into `Now`, per normal
  operation.

There is no "skip onboarding" option. Priority Resolution and every
other domain module require, at minimum, a profile and a semester with
at least one course or deadline to produce anything beyond
`insufficient_data`. Skipping onboarding would only defer the same
required questions to the first time the user opens `Now` and finds it
empty — worse UX, not better, so it is not offered.

---

## 2. Screen-by-Screen: Profile Creation (first launch only)

A five-step linear wizard. No step is skippable; every field maps
directly to a `user_profile` column (`04_DATA_MODEL.md` §1) — nothing is
collected that isn't stored, and nothing is stored that wasn't
collected here or in Semester Setup.

### Step 1 — Identity

**Question:** "What should Athena call you?" (name, free text, required)
**Question:** "Institute and program" (two free-text fields, required —
pre-filled placeholder "IIT Hyderabad" / "B.Tech, AI" since that's the
known context, but editable)

**Validation:** name non-empty, ≤ 80 characters. Institute/program
non-empty, ≤ 120 characters each. No format validation beyond
non-empty — these are display strings, not identifiers anything keys
off of.

**Why this exists:** `user_profile.name`, `.institute`, `.program` are
real columns (`04_DATA_MODEL.md` §1); nothing here is decorative.

### Step 2 — Trajectory Targets

**Question:** "What CGPA are you aiming for?" (numeric input, 0.0–10.0,
step 0.01, required, default suggestion 8.8 shown as placeholder only —
the user must actively confirm or change it, not just tab through)

**Question:** "What's the career target?" (free text, required,
placeholder example shown: "ML / Data Science internship, then
Quant/ML full-time")

**Question:** "What's the masters target, if any?" (free text, optional
— leaving it blank is valid; not everyone has a target this specific)

**Validation:** CGPA target must be > current CGPA if current CGPA is
also known (see Step 3) — if the user enters a target lower than or
equal to a CGPA they're about to report, Athena shows an inline,
non-blocking note: *"That's at or below what you just told me your
current CGPA is — is that intentional?"* This is advisory copy, not a
blocking validation error; the user can proceed either way. This is the
correct level of friction per Non-Negotiable #4 (no decision made
silently) without violating the "no modals except two named exceptions"
rule (`MASTER_SPECIFICATION.md` §1.3) — an inline note is not a modal.

**Why this exists:** these three fields are the "goals" the whole system
optimizes toward (`04_DATA_MODEL.md` §1's justification for why goals
live on `user_profile` rather than a separate table). Nothing downstream
— Priority Resolution, Divergence Check, Trajectory's target lines — can
function without them.

### Step 3 — Current Standing

**Question:** "What's your current CGPA?" (numeric, 0.0–10.0, optional —
"I'm just starting, no CGPA yet" is a valid answer for a genuinely new
student, in which case this is left null and Trajectory correctly shows
`insufficient_data` until the first `grade_snapshots` row exists)

**Question:** "Current Codeforces handle, if you have one" (free text,
optional — if provided, this seeds the first `codeforces_snapshots` sync
attempt at the end of onboarding, see §5)

**Validation:** CGPA numeric range only. Codeforces handle: no format
validation blocks submission — if the handle doesn't resolve during the
sync attempt in §5, that failure is surfaced there, not here, since
validating a handle requires the network call Athena is explicitly
allowed to defer or fail gracefully on (`MASTER_SPECIFICATION.md` §8.1).

### Step 4 — Deep Work Window

**Question:** "Athena protects one block of time every day as
uninterruptible deep work. Default is 8 PM – midnight — keep it, or set
your own?" (two time pickers, pre-filled 20:00 / 00:00, editable)

**Validation:** window must be ≥ 60 minutes, must not cross into a
second calendar day by more than 6 hours (a sanity bound, not a product
rule — prevents a fat-fingered "20:00 to 20:00" from silently producing
a 24-hour "protected" block that would make the Deep Work Guard
meaningless).

**Why this exists:** `user_profile.deep_work_window_start/end`
(`04_DATA_MODEL.md` §1), directly enforced by the Deep Work Guard
interceptor (`MASTER_SPECIFICATION.md` §3.1 non-negotiable #3). This is
asked explicitly, not assumed as a hardcoded global constant, because
the non-negotiable protects *a* sacred window, not necessarily *the*
literal 8 PM–midnight window for every user — the Master Spec's default
is a strong recommendation, not a hardcoded value the wizard should
silently impose.

### Step 5 — Confirmation

A single read-only summary screen showing every value entered in Steps
1–4, with an "Edit" link back to each step (not a re-run of the whole
wizard — direct jump-back, per the UI's general "undo everywhere,
minimal friction" instinct, `MASTER_SPECIFICATION.md` §5.1). A single
"Create Profile" button commits.

**Generated on commit:**
- One `user_profile` row (`04_DATA_MODEL.md` §1).
- One `user_profile_history` row, `reason: "onboarding"`, snapshotting
  the same values — so the very first profile state is itself part of
  the auditable history from day one, not an implicit "row 1 has no
  history entry" special case.

Immediately after commit, the flow proceeds to Semester Setup (§3) with
no separate navigation step — the user does not have to find a button
to "start" semester setup; it simply continues.

---

## 3. Screen-by-Screen: Semester Setup Wizard

Five steps, run identically whether this is the first-ever run
(continuing directly from Profile creation) or a later semester
rollover (§7). The only difference between first-run and rollover is
Step 0's presence and Step 4's comparison content (§7.2).

### Step 0 — New Semester Basics (both first-run and rollover)

**Question:** "What's this semester called?" (free text, e.g. "Monsoon
2026," required)
**Question:** "Start and end dates" (two date pickers, required)

**Validation:** end date after start date; a soft warning (inline, not
blocking) if the range is outside 8–20 weeks, since that's an unusual
semester length for the institute context and is more likely a typo
than an intentional short/long term.

**Generates:** one `semesters` row, `is_current: true` (and, on
rollover, flips the previous semester's `is_current` to `false` in the
same transaction — see §7.1).

### Step 1 — Courses

A repeating card form, one card per course, "+ Add another course"
below. Each card:

**Fields:** course code (required, free text), title (required, free
text), credits (required, integer 1–6), leverage class (required,
single-select: High / Medium / Low — see §3.1 below for how this
question is framed), instructor (optional), target grade (optional,
free text — "A," "A+," a specific percentage, whatever the user's
institute uses), meeting pattern (optional at this step — can be filled
via CSV/ICS import in Step 1b instead of by hand).

**Validation:** at least one course required to proceed (Athena cannot
produce a meaningful `Now` recommendation with zero courses and zero
deadlines — see §1's cold-start reasoning). Course code non-empty and
unique within this semester's set (a soft check — duplicate codes across
different actual course offerings are legitimate in rare cases, so this
is a warning, not a hard block).

#### Step 1a — How Leverage Class Is Asked

This field feeds `leverage_class` directly into Priority Resolution and
the Deep Work Guard (`04_DATA_MODEL.md` §2; `08_ADAPTIVE_PLANNER.md`
§3). Per `ROADMAP_REVIEW.md` §1.1, self-tagged leverage with no
feedback loop is a known, named risk ("exactly the kind of thing a
stressed student games in week 3"). This wizard cannot fix that
structurally — the calibration mechanism lives in
`08_ADAPTIVE_PLANNER.md` §6 — but it can avoid making the risk worse at
the point of entry by **not** asking a bare "High/Medium/Low?" dropdown
with no anchor. Instead, the question is framed with a fixed rubric
shown inline, always visible while answering:

> *"High-leverage: this course is load-bearing for your CGPA target, a
> masters application requirement, or a stated career target. Low-leverage:
> this course could underperform without materially changing your
> trajectory. Most courses are Medium."*

This is copy-level scaffolding, not a new domain rule — the rubric text
lives in the wizard's UI layer, not in `athena-domain`, and does not
change what `leverage_class` means downstream.

#### Step 1b — CSV / ICS Import (optional, either step)

**Affordance:** "Import from file" button, accepts `.csv` or `.ics`.

**Behavior:** file is parsed locally (`athena-ingestion::csv_import` /
`::ics_import`, `01_ARCHITECTURE.md` §5.2) into candidate course/deadline
rows, shown in an editable preview table **before** anything commits.
The user can edit, delete, or accept each parsed row individually — the
import never silently commits. If parsing fails or produces zero rows,
Athena states that plainly ("Couldn't find any recognizable courses in
that file — check the format or add manually below") rather than
failing silently or guessing at a malformed row's meaning
(`MASTER_SPECIFICATION.md` §3.1 non-negotiable #5).

**Why import is optional, not required:** the institute has no public
API (`MASTER_SPECIFICATION.md` §8), so any CSV/ICS export is a manual
download the user has to go get themselves; the wizard must fully
function with zero imported data, entered by hand, per Phase 1's own
scoping (`MASTER_SPECIFICATION.md` §9 Phase 1: "manual course/deadline
entry (CSV/ICS import can land later in this phase)").

### Step 2 — Deadlines

A repeating card form, same pattern as Step 1, one card per known
deadline. Fields: title (required), category (required, single-select:
Academic / Career / Research / DSA / Other), linked course (optional
dropdown of courses just entered in Step 1, only shown for `academic`
category), due date+time (required), leverage class (required, same
rubric as §3.1).

**Validation:** zero deadlines is allowed at this step *only if* at
least one course was entered in Step 1 (the cold-start floor is "at
least one grounded thing exists," not "at least one deadline
specifically").

**Import affordance:** same CSV/ICS import as Step 1b, can populate this
step instead of or in addition to courses.

### Step 3 — Timetable Confirmation

If any course in Step 1 has a `meeting_pattern` populated (whether typed
by hand or from import), this step shows a simple weekly grid
(read-only visualization, not an editable calendar — editing happens by
going back to a specific course card in Step 1) so the user can visually
confirm nothing overlaps incorrectly before committing. If no course has
a meeting pattern yet, this step is skipped entirely (not shown as an
empty screen) — meeting patterns are optional per `04_DATA_MODEL.md`
§2, and Athena does not force a UI step for data the user hasn't chosen
to provide.

### Step 4 — Deep Work Window Confirmation

Shows the current `user_profile.deep_work_window_start/end` (from
Profile creation or a prior semester) against the newly-confirmed
timetable from Step 3, flagging — inline, non-blocking — any direct
overlap between a class meeting time and the deep-work window (this
would be unusual but not impossible with an evening class). The user
can accept as-is or jump back to Step 3/edit the window via a link to
the Profile edit surface (§8) — Semester Setup does not duplicate the
deep-work-window editing UI; it only surfaces the conflict.

### Step 5 — Review and Commit

A single summary screen: semester basics, course count, deadline count,
timetable conflicts (if any, still shown, not resolved-or-blocked —
per Non-Negotiable #6, a real conflict is named plainly, not hidden,
even in a review screen). One "Start Semester" button commits
everything as a single transaction.

**Generated on commit:**
- One `semesters` row (`is_current: true`).
- One `courses` row per course entered.
- One `deadlines` row per deadline entered.
- One `user_profile_history` row, `reason: "semester_rollover"` (or
  `"onboarding"` if this is the very first run), snapshotting the
  profile state at this moment — even though Semester Setup itself
  doesn't necessarily change profile fields, this preserves a clean
  "profile as of the start of every semester" audit trail
  (`04_DATA_MODEL.md` §1).
- One `event_log` entry, `SemesterRolledOver` (or `SemesterCreated` on
  first run), per `MASTER_SPECIFICATION.md` §4.6's requirement that
  every event is persisted unconditionally.

Immediately after commit, the app navigates to `Now`. On first-ever
run, `Now` will show its first real (if `insufficient_data`-flagged in
places) recommendation — this is the first moment the product is fully
"live."

---

## 4. Validation Summary Table

| Field | Required? | Validation | Blocking? |
|---|---|---|---|
| Name | Yes | non-empty, ≤80 chars | Yes |
| Institute / Program | Yes | non-empty, ≤120 chars | Yes |
| Target CGPA | Yes | 0.0–10.0 | Yes |
| Career target | Yes | non-empty | Yes |
| Masters target | No | — | — |
| Current CGPA | No | 0.0–10.0 if provided | Yes (if provided, out of range) |
| Target < current CGPA | — | advisory only | No (inline note) |
| Codeforces handle | No | resolved async post-commit | No |
| Deep work window | Yes | ≥60 min, ≤6hr cross-midnight | Yes |
| Semester label | Yes | non-empty | Yes |
| Semester dates | Yes | end > start; 8–20wk soft check | Hard: order. Soft: length |
| ≥1 course | Yes (Step 1) | count ≥ 1 | Yes |
| Course code | Yes | non-empty; unique (soft) | Hard: non-empty. Soft: uniqueness |
| Deadlines | Conditional | ≥1 if zero courses somehow bypassed | Yes, per §3 Step 2 |
| CSV/ICS import row | — | previewed, user-confirmed per row | Yes (nothing auto-commits) |

---

## 5. First-Launch-Only Behavior

Beyond the wizard steps themselves, first launch triggers exactly two
background actions immediately after Step 5 of Semester Setup commits,
neither of which blocks navigation to `Now`:

1. **Codeforces handle resolution** (if provided in Profile Step 3): a
   single sync attempt (`01_ARCHITECTURE.md` §5.1). On success, seeds
   the first `codeforces_snapshots` row. On failure (bad handle, network
   down), the handle is kept on the profile but no snapshot is created —
   `Trajectory`'s Codeforces section shows `insufficient_data`
   honestly rather than a failed-looking error state, and the user can
   retry later without re-running onboarding.
2. **Empty-state priming**: `athena-domain::priority` runs once against
   the freshly-created data so `Now`'s first paint already has a real
   (even if `insufficient_data`-labeled) verdict rather than a loading
   spinner with nothing behind it.

Nothing else happens automatically on first launch — no sample data, no
tutorial overlay, no tour. The product's own real data, however sparse,
is the onboarding experience from the second screen onward. A synthetic
tutorial would itself be an ungrounded thing shown to the user, which
sits uneasily against Non-Negotiable #5's spirit even though it's a UI
concern rather than a data one — better to just be honestly sparse than
to fake fullness.

---

## 6. Editing Profile Later

Profile fields are not locked after onboarding. An "Edit Profile"
affordance is reachable from `Now` (a small, low-emphasis entry point,
per the "minimal surface" principle — not a prominent settings icon,
since there is no settings sprawl to navigate to, `04_DATA_MODEL.md`
§10) and reopens Steps 1–4 of the Profile wizard (§2) pre-filled with
current values, skipping the "Create Profile" framing for "Update
Profile." Any change:

- Writes new values to `user_profile` (update in place — this is the
  one table where "current state" is genuinely mutable, per
  `01_ARCHITECTURE.md` §2.3's exception for current-state pointer
  tables).
- Writes a new `user_profile_history` row, `reason: "manual_edit"`,
  with `changed_fields` populated precisely.

A manual profile edit does **not** trigger Semester Setup — the two are
independent. A user can update their career target mid-semester without
re-entering courses, and can start a new semester without necessarily
changing profile targets.

---

## 7. Semester Rollover

### 7.1 Trigger

Semester rollover is **never automatic on a date**. It is a
user-initiated action — a "Start New Semester" affordance, reachable
from `Now` once the current semester's `ends_on` date has passed (shown
proactively but not forced: a dismissible banner, not a blocking modal,
consistent with the two-named-exceptions rule for modals,
`MASTER_SPECIFICATION.md` §1.3). This matches Non-Negotiable #7 directly
— "the system adapts to the semester, not the reverse... no fixed weekly
template is ever assumed to still be valid" — a silent auto-rollover
would be exactly the kind of assumption that non-negotiable forbids.

### 7.2 What's Different From First-Run

Rollover runs the identical five-step Semester Setup wizard (§3), with
one addition: **Step 0 is preceded by a Trajectory Comparison screen**,
shown once, before Step 0:

> A read-only summary comparing the closing semester's stated
> `target_cgpa` against its actual `grade_snapshots`-derived final CGPA,
> `codeforces_snapshots` rating delta over the term, and any
> `drift_signals`/`bottlenecks` that remained open at close. This is the
> "re-founding" moment specified in `MASTER_SPECIFICATION.md` §6.4: goals
> are "explicitly re-affirmed or revised... against the closing
> semester's actual... trend," executed as a structured wizard step, not
> a conversation.

The user then proceeds into Profile Step 2 (Trajectory Targets, §2) with
the option to revise `target_cgpa`/`career_target`/`masters_target`
directly inline on this comparison screen, before Step 0 of Semester
Setup proper begins — this is the only point in the whole flow where
Profile editing and Semester Setup are stitched together deliberately,
because the Master Spec explicitly calls for goal revision to happen
*in light of* the closing semester's evidence, not as an isolated
Profile edit.

### 7.3 What Carries Over, What Doesn't

- **Carries over automatically:** `user_profile` (unless revised per
  §7.2), the user's deep-work window, all historical data (nothing is
  ever deleted, per additive-only migrations, `04_DATA_MODEL.md` §9).
- **Does not carry over automatically:** courses, deadlines, meeting
  patterns. Every semester's courses are entered fresh (by hand or
  import) — a stale carry-over of last semester's course list would
  violate the "never a stale live-sync silently carrying over last
  semester's structure" rule stated explicitly in
  `MASTER_SPECIFICATION.md` §5.2's description of Semester Setup.
- **Open items at rollover:** any `deadlines` row still `status: 'open'`
  past the closing semester's `ends_on`, and any `bottlenecks`/
  `drift_signals` still `status: 'active'`/`'open'`, are shown on the
  Trajectory Comparison screen (§7.2) but are **not** auto-carried into
  the new semester as new rows — they remain attached to the old
  `semester_id` as an honest historical record of what didn't get
  resolved. If genuinely still relevant, the user re-creates them in the
  new semester's Step 1/2, which is a deliberate re-affirmation, not a
  silent copy.

---

## 8. Full Re-Onboarding (rare path)

If a user wants to discard all history and start over entirely (new
install, or a deliberate reset), this is **not** a wizard feature — it
is a destructive action outside the scope of Semester Setup or Profile
editing, and per `MASTER_SPECIFICATION.md` §11's rejection of any
casual-feeling destructive affordance and §3.1 non-negotiable #4 ("no
decision made silently... irreversible actions require confirmation"),
this document deliberately does **not** design a one-click "reset
Athena" button inside onboarding. If this capability is needed, it
belongs at the data/backup layer (`01_ARCHITECTURE.md` §6.3 — delete the
SQLite file directly, outside the app), not as a product feature, so
that it is never one accidental tap away from the onboarding flow a
returning user sees.
