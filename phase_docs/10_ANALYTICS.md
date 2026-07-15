# 10_ANALYTICS.md — Project Athena
### Every visualization Athena renders, and where it lives. Governs the **Trajectory** screen's content (§5.2) — introduces no fifth screen, no new tables without citation (Immutable Rule #7), and treats every chart as a rendering of data the schema (§7.2) already owns.

## 0. Governing Constraint

Analytics is not a separate product surface — it is **Trajectory**, one of the four screens (§4.8), at three zoom levels (week / month / semester, §5.2). Everything in this document is a view over already-typed data; nothing here computes a new fact that doesn't already exist as a Decision Engine output (`09_DECISION_ENGINE.md`) or a raw table row. And per §1.2's ruling, analytics is never suppressed for comfort — "patterns are shown factually, phrased without editorializing or shame, but never hidden." A chart that would make an ugly trend invisible is a bug, not a design choice.

---

## 1. Semester Analytics

- **CGPA trajectory** — a time series of `grade_snapshots` across the semester, rendered against the stated target line from `user_profile`/`user_profile_history` (§4.5's Semester Analysis comparison). The target line is always visible alongside the actual line — a trajectory chart with no target is just a log.
- **Course-by-course health** — each active course's current standing and slope, collapsed to the max-5-visible rule (§5.1 of `02_DESIGN_SYSTEM.md`) with a `+N more` expansion, sorted by how far each course is from its target, not alphabetically — the worst-diverging course is always the first thing visible.
- **Semester phase strip** — the "Big Picture" visual absorbed from the cut Semester View screen (§5.2): a simple horizontal marker of where in the term the user currently is, relative to major deadline clusters. Purely orientational, no scoring behind it.

## 2. Study Analytics

- **DSA practice trend** — `dsa_practice_log` problems/sessions over time, at week/month/semester zoom, alongside `codeforces_snapshots.rating` and (once §1.2 of `07_INTEGRATIONS.md` ships) LeetCode's equivalent — plotted together as one "competitive programming trajectory" section, since they're the same underlying trajectory metric from two sources.
- **Deep-work adherence** — `deep_work_sessions.protected` rate over time: how often the sacred 8 PM–midnight window (non-negotiable §3) was actually protected versus overridden. This is a proxy metric (session count/adherence), so it is **never** plotted on the same axis as a trajectory metric without being routed through Divergence Check (§7.4) first — a high adherence rate with a flat CGPA trend is exactly the divergence pattern the system exists to catch, and the two series are shown together specifically to make that catchable, not to celebrate the adherence number in isolation.
- **Bottleneck history** — a timeline of `bottlenecks` rows: what the single biggest constraint was, and for how long, across the semester. Rendered as the Decision Log's visual language (card/timeline, §5.2), reused here rather than reinvented.

## 3. Career Analytics

- **Portfolio strength trend** — `project_status_snapshots.portfolio_strength_score` over time, the one number Career Analysis (`06_AI_ENGINE.md` §4.5) is built from.
- **Opportunity pipeline** — `opportunities` with `apply_by` dates, rendered with real urgency (§1.2's corrected ruling — proximity is never suppressed for calm's sake). Muted color language (the amber/red dot, §2.3 of `02_DESIGN_SYSTEM.md`) is the *style* of honesty here, not a replacement for it.
- **Research/publication activity** — `research_activities` as a simple chronological list, feeding the same portfolio-strength computation, shown for evidence/audit purposes (§4.7 — every recommendation must be explainable after the fact, and this is where the user checks the receipts behind the Masters Probability number).

## 4. Weakness Trends

- **Drift signal history** — every `drift_signal` that has ever cleared the Signal Threshold (`06_AI_ENGINE.md` §5), plotted as a timeline with severity color (§2.3 of `02_DESIGN_SYSTEM.md`), and whether each was resolved by evidence or is still active (non-negotiable §6 — named plainly, kept named until resolved). A `drift_signal` never silently disappears from this view; it's either shown as active or shown as resolved-with-the-date-it-resolved, never simply gone.
- **What this view explicitly does not show:** anything that hasn't cleared the Signal Threshold. There is no "soft concerns" or "possible patterns" sub-section fed by anything other than already-surfaced, already-evidenced signals — a weakness trend chart populated by LLM guesses would be exactly the "blind spot" pattern §1.1/§11 reject, rendered as a chart instead of a sentence. The rejection applies regardless of presentation format.

## 5. Productivity Trends

Deliberately narrow, per non-negotiable §9 (no metric gaming): the only "productivity" surfaced here is deep-work adherence (§2) and study-history volume (§2), always presented adjacent to the trajectory metric they're meant to serve, never as a standalone "hours logged" vanity chart. There is no streak counter, no completion percentage badge, no leaderboard-shaped visual of any kind (§11's explicit rejection of gamification) — a productivity number that isn't visibly tied to a trajectory outcome doesn't get a chart in this document.

## 6. Prediction Graphs

- **CGPA trajectory projection** — a forward extrapolation of the current CGPA slope against the stated target, shown as a dotted continuation of the actual-data line, never a solid line indistinguishable from confirmed data. Confidence-labeled per §6 of `06_AI_ENGINE.md`: a projection is `inferred` by definition and is visually marked as such (dotted line, "projected" label) — it is never rendered with the same visual weight as `confirmed` history.
- **Masters Probability** — as specified in `06_AI_ENGINE.md` §4.6: one number, derived from the same trajectory metrics this document already charts (CGPA slope, CP trend, portfolio strength), shown inside the semester zoom level as one more trajectory metric, not a standalone headline screen or a gamified "readiness score" dial. It carries its confidence class visibly and is one click from the specific evidence rows that produced it (§4.7's auditability requirement) — never a bare percentage with no drill-down.
- **Internship/opportunity readiness** — not a separate score; it is the opportunity pipeline (§3) read alongside portfolio strength and CGPA — "readiness" for a specific opportunity is expressed as the same estimated-impact reasoning the Decision Engine already produces (`09_DECISION_ENGINE.md` §2.2) when that opportunity is the ranked verdict, reused here as a Trajectory-screen view rather than computed a second time by a separate model. Building a second, analytics-specific "readiness" scoring function would be exactly the duplication Immutable Rule #3 forbids — one canonical computation, viewed from two screens.

---

## 7. Zoom Levels (the one interaction model governing every chart above)

Kept exactly per §5.2 — week / month / semester, reusing the UI docs' pinch-to-zoom and swimlane visual language. Every chart in this document renders at all three zoom levels using the same underlying data at different aggregation granularity — there is no chart in this document that exists only at one zoom level, because a metric worth tracking is worth seeing at every horizon the user might reasonably ask "how's this going."

## 8. What This Document Deliberately Does Not Specify

No new table is introduced by anything above — every chart is a view over `grade_snapshots`, `dsa_practice_log`, `codeforces_snapshots`, `project_status_snapshots`, `research_activities`, `deep_work_sessions`, `bottlenecks`, `drift_signals`, or `opportunities` (§7.2), or a derived read from the Decision Engine's own outputs (`09_DECISION_ENGINE.md`). If a future analytics idea needs data outside this list, the schema change is its own reviewed deliverable before any chart referencing it is built (Guideline #9, Immutable Rule #7) — this document does not pre-authorize that step.
