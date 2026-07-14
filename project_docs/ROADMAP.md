# ROADMAP.md — Project Athena
### Engineering roadmap derived from MASTER_SPECIFICATION.md. No code in this document — sequencing, dependencies, and scope only.

## 0. How This Roadmap Relates to MASTER_SPECIFICATION.md

`MASTER_SPECIFICATION.md` §9 defines five product **Phases**. This
roadmap breaks those five phases into **29 engineering Sprints** (S0–S28,
detailed in `SPRINTS.md`), each sized to 1–3 days, each independently
testable, and each traceable back to a specific section of the spec. It
also makes one deliberate deviation from §9's phase ordering — see §3
below — justified per Engineering Guideline #6 ("every decision that
isn't purely cosmetic must cite what justifies it").

Optimization target, as instructed: **maintainability over speed.** Every
sprint boundary was chosen so that a single developer can stop after any
sprint, come back a month later, and re-orient from the sprint's
Definition of Done alone — not speed-run the shortest path to a demo.

## 1. Engineering Order, At a Glance

```
Foundation           Manual Core Loop         Grounded AI          Drift / Challenge      External Grounding    Hardening
(S0–S2)              (S3–S9)                  (S10–S14)            (S15–S20)              (S21–S24)             (S25–S28)
─────────────────    ─────────────────────    ─────────────────    ───────────────────    ───────────────────   ──────────────────
Workspace scaffold    Semester Setup           AI Retrieval          Bottleneck Detection    Codeforces sync       Opportunities
DB schema/migrations  Manual grade/DSA log     LLM Synthesis         Drift Scoring           CSV/ICS import        Backups*
IPC chokepoint        Local backups*           Grounding Check       Scheduler               Trajectory screen     Cross-platform tray
Screen shells         Priority Resolution      Local model fallback  Divergence Check         Staleness handling    Offline-first audit
                       Now screen v1             Now screen v2         Challenge Layer                               Release QA
                       Event bus                                       Decision Log
                       Deep Work Guard
        │                      │                        │                      │                       │                    │
        └──────────────────────┴────────────────────────┴──────────────────────┴───────────────────────┴────────────────────┘
                                              MILESTONE 1        MILESTONE 2          MILESTONE 3 (MVP)      MILESTONE 4    MILESTONE 5 (v1)
```
`*` Local backups is pulled forward from Phase 5 into the Manual Core
Loop block — see §3.

## 2. MVP Line

**MVP = S0 through S20 (Milestone 3).** This is the point at which every
one of the ten Non-Negotiables in `MASTER_SPECIFICATION.md` §3.1 is
mechanically enforceable, not just aspirational:

- §1–§2 (trajectory over comfort, never a bare reminder) — needs AI
  synthesis with a mandatory reasoning field → **S10–S14**.
- §3 (deep work sacred) — needs the Deep Work Guard → **S9**.
- §4 (no silent decisions) — needs the Decision Challenge Layer →
  **S19**.
- §5, §10 (grounded, fail loud) — needs the grounding check and
  confidence model → **S12**.
- §6 (weaknesses tracked honestly) — needs Bottleneck Detection with its
  evidence-only resolution rule → **S15**.
- §7 (adapts to semester) — needs Semester Setup → **S3**.
- §9 (no metric gaming) — needs the Divergence Check → **S18**.
- §8 (privacy/sole ownership) — true from S0 onward by construction
  (local SQLite, no multi-tenant schema).

Everything after S20 (Codeforces sync, full Trajectory screen,
Opportunities, cross-platform notification polish, offline-first audit)
is **real, planned, non-optional future work** — but it upgrades an
already-complete product rather than completing an unfinished one. See
`MILESTONES.md` for the exact acceptance bar at each checkpoint, and
`SPRINTS.md` for the MVP/Future tag on every individual feature.

## 3. One Deliberate Deviation From MASTER_SPECIFICATION.md §9

§9 places "rolling local backups" in Phase 5, after external grounding.
This roadmap moves it to **S5**, immediately after the first sprint that
can produce real, non-reconstructable user data (S3–S4: manual semester
setup, grades, DSA logs).

**Justification:** `MASTER_SPECIFICATION.md` §4.7 lists "data durability"
as a non-functional requirement satisfied by exactly this mechanism, and
§3.1 Non-Negotiable §8 treats the user's academic/performance data as
sole-owned and irreplaceable. From the first real grade snapshot onward,
an unbacked single SQLite file is a real, growing risk — waiting until
Phase 5 to protect it means roughly twenty sprints' worth of accumulated
real user data sits unbacked for no engineering reason (backups are a
small, self-contained sprint with no dependency on AI, drift, or
ingestion work). Moving it earlier costs nothing and removes a real risk
early. Per Engineering Guideline #6, this deviation is recorded here
rather than made silently.

No other phase-level reordering was made. Everything else follows §9
exactly, because §9's own ordering logic (each phase ships something
independently useful; Priority Resolution — the single load-bearing
algorithm — comes before any AI, drift, or ingestion work depends on it)
is sound and is preserved.

## 4. Technical Dependency Graph

This is the actual build-order constraint set — not every sprint depends
on the one immediately before it, but nothing may be reordered across
these edges without breaking a downstream sprint.

```
S0 (workspace/crates)
 └─▶ S1 (DB schema/migrations)
      └─▶ S2 (IPC chokepoint + screen shells)
           └─▶ S3 (Semester Setup: semesters/courses/deadlines)
                ├─▶ S4 (manual grade/DSA logging)
                │    └─▶ S5 (local backups)
                ├─▶ S6 (Priority Resolution — depends on S3's deadline data existing)
                │    └─▶ S7 (Now screen v1, template-only)
                └─▶ S8 (Event bus / command dispatcher)
                     └─▶ S9 (Deep Work Guard — first registered interceptor)
                          │
                          ▼
                    ── MILESTONE 1 ──
                          │
S9 ─▶ S10 (AI retrieval — needs real tables from S1/S3/S4 to retrieve from)
       └─▶ S11 (LLM synthesis — needs S10's retrieval payload shape)
            └─▶ S12 (grounding check — needs S11's raw LLM output to validate)
                 └─▶ S13 (local model fallback — reuses S11/S12's contract)
                      └─▶ S14 (Now screen v2 — replaces S7's template output)
                           │
                           ▼
                     ── MILESTONE 2 ──
                           │
S6 + S1 ─▶ S15 (Bottleneck Detection — reads grade/DSA/project trend tables)
S6 + S1 ─▶ S16 (Drift Scoring — reads the same snapshot tables, independent of S15)
S15,S16 ─▶ S17 (Scheduler — fires DriftScan, which calls S15+S16's rules)
S1      ─▶ S18 (Divergence Check — reads proxy vs. trajectory columns, independent)
S8 + S15,S16,S18 ─▶ S19 (Decision Challenge Layer — the second registered
                          interceptor; needs S15/S16/S18's rules to evaluate against,
                          and S11/S12's synthesis to phrase the challenge)
S19 ─▶ S20 (Decision Log screen — renders S19's output history)
       │
       ▼
 ── MILESTONE 3 / MVP COMPLETE ──
       │
S1 ─▶ S21 (Codeforces connector — independent of S10–S20, only needs S1's schema)
S3 ─▶ S22 (CSV/ICS import — extends S3's Semester Setup)
S14,S16,S21 ─▶ S23 (Trajectory screen — needs synthesis, drift, and live Codeforces data)
S21,S22 ─▶ S24 (staleness handling end-to-end — needs real external connectors to have staleness)
       │
       ▼
 ── MILESTONE 4 ──
       │
S1 ─▶ S25 (Opportunities — independent, only needs schema)
S5 ─▶ S26 (cross-platform notification/tray — extends the OS integration touched in S5's backup scheduling)
ALL ─▶ S27 (offline-first audit — must run after every network-touching sprint exists: S10–S13, S21, S22)
ALL ─▶ S28 (release QA / documentation — last sprint, by definition)
       │
       ▼
 ── MILESTONE 5 / v1 COMPLETE ──
```

## 5. Sprint Sizing Discipline

Every sprint in `SPRINTS.md` is sized 1–3 days by construction: if a unit
of work in §9's phases would have taken longer than 3 days as a single
sprint, it was split (e.g., Phase 2's AI pipeline became five sprints —
S10 through S14 — one per pipeline stage, matching the stage boundaries
`MASTER_SPECIFICATION.md` §6.2 already defines, rather than one large
"build the AI pipeline" sprint that would be untestable as a single
unit). If a unit of work would have taken less than a day on its own, it
was merged into an adjacent sprint with a shared testable outcome (e.g.,
S1 covers both schema definition and the migration runner, since neither
is independently useful without the other).

## 6. What This Roadmap Deliberately Does Not Do

- It does not estimate calendar dates. Sprint *sizes* (1–3 days) are
  given; sprint *counts per week* depend on how much time the single
  developer — a full-time student — can realistically give this project
  per week, which this document has no basis to assume.
- It does not include code, file contents, or API signatures. Per the
  brief, this is a planning document only.
- It does not re-litigate any decision already made in
  `MASTER_SPECIFICATION.md` §1 (the review/ruling section). Every sprint
  below builds toward the spec as ruled, not toward any of the four
  original, superseded documents.
