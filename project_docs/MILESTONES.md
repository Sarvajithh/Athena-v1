# MILESTONES.md — Project Athena
### Five checkpoints, each mapped to a sprint range from SPRINTS.md. A milestone is "done" only when every acceptance item below is independently verifiable — not when the sprints feel finished.

## How to Use This Document

Each milestone below states three things: **what sprints feed it**, **what
the user can actually do once it's reached**, and **the acceptance
criteria that must all be true** before moving on. A milestone is not a
ceremony — it's a gate. If an acceptance item fails, the next phase does
not start, even if it's tempting to push forward "just this once."

---

## Milestone 1 — Manual Core Loop Works

**Sprints:** S0–S9
**Phase:** Foundation + Manual Core Loop

### What the user can do at this point
Run a full week on Athena with zero AI and zero external integrations,
and have it already change what he works on in the 8 PM–midnight window.
Set up a semester, log deadlines/grades/DSA practice by hand, see a
ranked "what's the one thing right now" answer on `Now`, and be blocked
from quietly filling the deep-work window with low-leverage work.

### Acceptance Criteria
- [ ] A new semester with real courses and deadlines can be created and
      survives an app restart (S3).
- [ ] Grade snapshots and DSA log entries can be recorded manually and
      are correctly source-tagged as `manual_entry` (S4).
- [ ] The SQLite database is backed up automatically and prunable backups
      exist on disk with a documented restore path (S5).
- [ ] `athena-domain::priority` passes its full test suite at >90% branch
      coverage and produces correct, deterministic output for at least
      three distinct scenario classes (S6).
- [ ] `Now` shows a real ranked recommendation, sourced from live data,
      with a non-empty reasoning string (S7).
- [ ] The Command/Event bus correctly blocks, unblocks, and logs every
      command and event exercised in testing, including
      fail-open-per-subscriber behavior (S8).
- [ ] Attempting to schedule a low-leverage item into 20:00–00:00 without
      explicit override is blocked, and the override path is auditable
      (S9).
- [ ] **Zero AI calls occur anywhere in this milestone's code paths** —
      confirmed by running the full app with no API key configured and
      observing correct (template-based) behavior throughout.
- [ ] All four screens exist; no fifth screen exists anywhere in the
      codebase (S2, carried through).

### Why This Gate Matters
This is the point where Athena is already better than a to-do list, using
only the load-bearing algorithm (Priority Resolution) and one hard
guard (Deep Work). If this milestone is weak, every later milestone
inherits a shaky foundation — no amount of AI polish in Milestone 2 fixes
a wrong ranking in Milestone 1.

---

## Milestone 2 — Grounded AI Synthesis Works

**Sprints:** S10–S14
**Phase:** Grounded AI Synthesis

### What the user can do at this point
See recommendations that read like a Chief of Staff wrote them — clear,
direct, well-reasoned prose — while every claim in that prose is
checkably grounded in real retrieved data, with an honest confidence
label attached, and the whole thing keeps working with no internet
connection.

### Acceptance Criteria
- [ ] `Now`'s reasoning text is LLM-synthesized, not template text, under
      normal (networked) operation (S11, S14).
- [ ] A synthesis response citing a fabricated evidence ID is
      programmatically rejected and triggers the documented retry/fallback
      path — proven with an injected bad response, not just described
      (S12).
- [ ] Every `recommendations` row has a non-null `confidence` value; the
      three confidence classes (`confirmed`/`inferred`/`insufficient_data`)
      are all independently exercised in tests (S12).
- [ ] With network access fully disabled, `Now` still produces a
      recommendation via the local-model or template fallback — never a
      broken screen (S13).
- [ ] A manual review confirms the synthesis output's tone matches §6.6's
      persona guidance (direct, no hedging, no performed enthusiasm) on
      at least five representative sample outputs.
- [ ] Cold-start (a semester with almost no data yet) produces an honest
      `insufficient_data` result, never a fabricated-sounding answer.

### Why This Gate Matters
This is where the single largest rejected design (§1.1 of
`MASTER_SPECIFICATION.md`) gets its positive proof: it is possible to get
genuinely good, natural-sounding advice out of an LLM without letting it
decide anything or invent a fact. If the grounding check can be bypassed
in practice, the entire architectural ruling in the spec was wrong in
implementation even if right on paper — this milestone is the test of
that.

---

## Milestone 3 — MVP Complete

**Sprints:** S15–S20
**Phase:** Drift, Bottlenecks, and the Challenge Layer

### What the user can do at this point
Have Athena actively name his single biggest current bottleneck, catch a
slipping subject or a stalled habit as an early trend rather than a
post-mortem, and — most importantly — have Athena say "I think this is a
mistake, here's why" before a bad decision commits, with the full
history of that browsable in a real Decision Log.

### Acceptance Criteria
- [ ] Given synthetic trend data, Bottleneck Detection correctly opens a
      `bottlenecks` row with a valid category and real evidence
      reference, and no code path can resolve it by inactivity — only by
      evidence (S15).
- [ ] Drift Scoring correctly flags a sustained (3+ point) decline and
      correctly does NOT flag a single bad data point — both proven with
      tests, not just the positive case (S16).
- [ ] `DriftScan` fires on a daily schedule, independent of any specific
      user action, verified with a mockable clock (S17).
- [ ] Divergence Check correctly flags proxy-vs-trajectory divergence and
      correctly does not flag aligned movement — both proven (S18).
- [ ] The Decision Challenge Layer blocks a decision that hypothetically
      worsens an active bottleneck/drift signal, shows a single grounded
      `ChallengeDialog`, and does not re-challenge the same resolved
      decision on resubmission (S19).
- [ ] A decision that trips no rule commits cleanly with `challenged =
      false` — the "endorse, don't just challenge" path is exercised,
      not just the challenge path (S19).
- [ ] `Decision Log` shows the full real history of decisions and
      outcomes, filterable by challenged status (S20).
- [ ] **Every one of the ten Non-Negotiables in `MASTER_SPECIFICATION.md`
      §3.1 is mechanically true at this point**, not just aspirational —
      this is checked explicitly, non-negotiable by non-negotiable, as
      part of closing this milestone (see the mapping in
      `ROADMAP.md` §2).

### Why This Gate Matters — This Is the MVP Line
Everything through this milestone is what makes Athena *Athena* rather
than a nice-looking dashboard with an LLM attached. Every phase after
this one makes an already-complete product better; no phase after this
one is required for the product to honestly claim it does what
`MASTER_SPECIFICATION.md` §2 says it does. If the project had to stop
after this milestone for any reason, it would still be a shippable,
useful, honest v0 — that is a deliberate property of where this line was
drawn, not an accident of sprint numbering.

---

## Milestone 4 — Externally Grounded

**Sprints:** S21–S24
**Phase:** External Grounding

### What the user can do at this point
Trust that DSA/competitive-programming trajectory reflects real,
independently-verifiable performance (Codeforces), set up a semester in
bulk from institute exports instead of one row at a time, see the full
multi-metric `Trajectory` screen in its final form, and always be able to
tell, at a glance, when any piece of data on screen is stale.

### Acceptance Criteria
- [ ] Codeforces sync populates `codeforces_snapshots` from a real
      account (or recorded fixture) and degrades gracefully — without
      crashing or silently treating stale data as current — on API
      failure (S21).
- [ ] CSV and ICS import correctly populate the same repositories manual
      entry uses, with no parallel/duplicate data path, and fail loudly
      (not partially) on malformed input (S22).
- [ ] `Trajectory` renders all three metric families as real time series
      at all three zoom levels, with `urgent` severity items visually
      distinguishable from `watch` severity ones (S23).
- [ ] Disabling any external sync for longer than its staleness threshold
      produces a visible staleness indicator everywhere that data is
      used — Now, Trajectory, and any grounded recommendation (S24).

### Why This Gate Matters
This is where Athena stops being solely dependent on the user's own
self-reporting for its trajectory claims. It doesn't unlock any new
non-negotiable (those were all closed at Milestone 3) — it makes the
existing, already-complete product's claims independently checkable,
which matters over a 3-year horizon where self-logging discipline will
naturally have gaps.

---

## Milestone 5 — v1 Complete

**Sprints:** S25–S28
**Phase:** Opportunity Surfacing and Hardening

### What the user can do at this point
Have real, relevant opportunities (internships, research positions,
competitions) surface — sparingly, only when genuinely relevant — trust
that a hardware failure won't lose a semester's worth of data, use the
app identically well regardless of which OS it's running on, and rely on
the whole system working with zero network access whenever that happens
to be true. A future maintainer can also pick up the codebase cold.

### Acceptance Criteria
- [ ] A manually-entered, genuinely relevant, time-sensitive opportunity
      surfaces on `Now`; an irrelevant or non-urgent one does not, and at
      most one surfaces at a time (S25).
- [ ] Native notifications and tray integration are manually verified on
      at least two of the three target platforms, and no notification
      anywhere in the codebase is built from a raw string (S26).
- [ ] The full core loop (setup, logging, priority resolution, trajectory
      viewing, decision log) passes a CI job with network access fully
      disabled (S27).
- [ ] A written offline-first audit checklist, one line per
      screen-by-feature combination, is complete with no unresolved
      failures (S27).
- [ ] `README.md` allows a developer unfamiliar with the project to clone
      and run it without asking a question (S28).
- [ ] The §12 Engineering Guidelines checklist from `MASTER_SPECIFICATION.md`
      is walked item-by-item against the real codebase, with every item
      either satisfied or explicitly, justifiably excepted in writing
      (S28).

### Why This Gate Matters
This milestone closes the loop the whole project opened with: a
single-developer, 5-year-maintainability product needs to survive its own
developer forgetting the details. Everything in this milestone is about
durability and honesty of the *finished* system, not new user-facing
capability — which is exactly why it's last.

---

## Milestone Summary Table

| Milestone | Sprints | Non-Negotiables Closed | MVP? |
|---|---|---|---|
| M1 — Manual Core Loop | S0–S9 | §3 (deep work), §7 (semester adapts), §8 (privacy, by construction) | Foundation for MVP |
| M2 — Grounded AI Synthesis | S10–S14 | §2 (never a bare reminder), §5 (grounded), §10 (fail loud) | Foundation for MVP |
| **M3 — MVP Complete** | **S15–S20** | **§1, §4, §6, §9 (all remaining)** | **✅ MVP line** |
| M4 — Externally Grounded | S21–S24 | *(none new — strengthens existing guarantees)* | Future upgrade |
| M5 — v1 Complete | S25–S28 | *(none new — durability/maintainability)* | Future upgrade |

By Milestone 3, all ten Non-Negotiables from `MASTER_SPECIFICATION.md`
§3.1 are closed. Milestones 4 and 5 make an already-complete, already-
honest product more capable and more durable — they are not required to
call the product "Athena" in the sense the Vision document defines it.
