# 12_VERSION_ROADMAP.md — Project Athena
### Product-version framing over `MASTER_SPECIFICATION.md` §9's five development phases. This document does not resequence or reopen §9 — it names shippable, dogfoodable milestones inside the existing phase plan, and lists what's deliberately not built yet, per §10/§11.

## 0. How Versions Map to Phases

`MASTER_SPECIFICATION.md` §9 already defines five independently-shippable phases; `ROADMAP_REVIEW.md` §2.1 correctly notes that Phases 0–2 (through "MVP") are really a v1, not a minimum-viable slice, and that's an honest label, not a problem to fix here. Versions below are a user-facing grouping of those phases — every feature named under a version is already scoped in §9; nothing here invents new sequencing.

| Version | Maps to | What it proves |
|---|---|---|
| **v1.0** | Phase 0 + Phase 1 | The core loop works with zero AI and zero integrations, and already changes the 8 PM–midnight decision. |
| **v1.1** | Phase 2 | The same loop, now with grounded LLM synthesis instead of template reasoning. |
| **v2.0** | Phase 3 + Phase 4 | Athena catches drift and challenges bad decisions before they commit, backed by real external data. |
| **v2.1** | Phase 5 | Feature-complete against the spec; durable enough to trust across semesters. |
| **Future** | §10 (deferred) + this document's own additions | Anything genuinely new, gated behind its own citation. |

---

## 1. Version 1.0 — The Core Loop

**Ships:** everything in Phase 0 and Phase 1 (§9) — the six-crate workspace, SQLite + migrations, Tauri shell, `Semester Setup`'s manual entry, `deadlines`/`grade_snapshots`/`dsa_practice_log` logging, the **Priority Resolution** algorithm at its full >90%-branch-coverage bar, the **Now** screen rendering a template-only (no-LLM) verdict, and the **Deep Work Guard** hard block.

**Deliberately not in v1.0:** any LLM call at all. The template reasoning string from Stage 2's typed verdict (`06_AI_ENGINE.md` §10) is not a placeholder to be replaced later — it's the honest v1.0 output, fully grounded by construction, since Stage 4 synthesis doesn't exist yet.

**What v1.0 proves:** the product's core thesis — that a ranked, evidenced verdict beats a to-do list — holds even before a single LLM token is spent. If it doesn't, no amount of AI polish in later phases fixes that, which is exactly why Phase 1's milestone (§9) is framed as "a full week on Athena with zero AI."

**Design-system state:** the full visual system (`02_DESIGN_SYSTEM.md`) ships in v1.0, including the Command Palette — it's a navigation/action layer over already-existing typed commands, not an AI feature, so there's no reason to gate it behind Phase 2.

---

## 2. Version 1.1 — Grounded Synthesis

**Ships:** Phase 2 (§9) — `athena-reasoning`'s full five-stage pipeline (`06_AI_ENGINE.md` §3), the **Now** screen's reasoning upgrading from template to LLM prose, and the local-model fallback path.

**Carried forward as a settled design decision, not a v1.1-only patch:** the LLM provider trait boundary (`06_AI_ENGINE.md` §9) ships as part of this version's first LLM integration, not retrofitted after — cheap now, expensive later, exactly per the reasoning already given there.

**What v1.1 proves:** the "writer, not decider" boundary holds under a real grounding-check regression suite (`PROJECT_RULES.md` §4) before anything downstream (Weakness Analysis, Masters Probability) is allowed to depend on the same pipeline.

---

## 3. Version 2.0 — Drift, Challenge, and External Grounding

**Ships:** Phase 3 + Phase 4 (§9) — `bottleneck/`, `drift/`, `divergence/` domain modules; the scheduled `DriftScan`; the Decision Challenge Layer interceptor and its blocking `ChallengeDialog`; the `Decision Log` screen; the Codeforces connector; `Trajectory`'s full multi-metric, three-zoom-level build-out; and end-to-end data-source staleness handling.

**Also ships in this version, as settled design (not deferred to a later phase, since it's scoped in this document's own AI/analytics/integration specs rather than requiring new architecture):**
- `06_AI_ENGINE.md`'s Weekly Digest, Semester Analysis, and Weakness Analysis capabilities — all downstream of drift/bottleneck detection, so they land naturally once Phase 3's domain modules exist.
- `07_INTEGRATIONS.md`'s LeetCode and GitHub connectors — same shape as the Codeforces connector already scoped for this phase, so they ship alongside it rather than waiting for a separate integration-focused version.
- `10_ANALYTICS.md`'s weakness-trend and study-analytics views, since they render the same drift/bottleneck data this version's domain modules produce.

**Explicitly deferred out of v2.0**, per `ROADMAP_REVIEW.md`'s own scope recommendations, which this document treats as already-settled rather than open questions:
- **Local-model (Ollama) fallback stays scoped to v1.1's template-fallback guarantee being sufficient** — a fully local inference runtime is real, non-trivial, multi-platform work whose only benefit over the existing template fallback is fluency, not correctness or safety. It is not required for v2.0 and is tracked as a Future item (§5) instead.

---

## 4. Version 2.1 — Feature-Complete

**Ships:** Phase 5 (§9) — the `opportunities` table and its deterministic surfacing logic, rolling local backups, cross-platform notification/tray polish, and a full offline-first audit confirming every core function works with zero network access.

**Also ships in this version:**
- `06_AI_ENGINE.md`'s Career Analysis and Masters Probability capabilities — both depend on `opportunities` and a mature `project_status_snapshots`/`research_activities` trend, which this phase is where they become meaningful rather than sparse.
- `07_INTEGRATIONS.md`'s Resume/PDF import and remaining connectors.
- `10_ANALYTICS.md`'s career-analytics and prediction-graph views in full.

**Backup story upgraded per `ROADMAP_REVIEW.md` §3.3:** v2.1's "durable enough to trust with multiple semesters of history" milestone (§9) is only honestly claimed if the rolling backup includes at minimum a documented manual off-machine export step, not just same-drive rolling backups — this version's Definition of Done includes that export path, not just on-disk rotation, so the durability claim in §9's own milestone language is actually true rather than aspirational.

**What v2.1 proves:** the product specified across every document in this set is fully built, and the offline-first non-negotiable (§4.7) is verified, not assumed.

---

## 5. Future — Modules, AI, Integrations, and Automation Beyond v2.1

Everything below is a **deferred, not rejected** item (§10) or a natural extension this document adds in the same spirit — each one needs its own citation and, where it touches the schema, its own reviewed migration (Immutable Rule #7) before it's built. None of these are pre-approved by appearing on this list; the list exists so a future session knows where to look before proposing something adjacent from scratch.

### 5.1 Future Modules
- **Deterministic credibility ledger** — override-rate-per-decision-type, computed by SQL over `decisions.final_outcome`, surfaced as a calibration signal for how hard the Challenge Layer pushes in a given category. Only ever a transparent, inspectable computation — never LLM-graded (§10, §1.7).
- **Leverage-class feedback loop** — closing the gap `ROADMAP_REVIEW.md` §1.1 identified: a deterministic reconciliation between self-tagged `leverage_class` and actual outcomes over time, surfaced as a `drift_signal` under Contradiction (`09_DECISION_ENGINE.md` §6) rather than a silent correction. This is a natural, in-spec extension of the Signal Threshold mechanism already built for v2.0 — not a new architecture.
- **Mood/energy logging** — single-tap, no-text state log, only if wired to a real domain consequence (e.g., correlating logged state with `deep_work_sessions.protected` rate) rather than existing as decoration (§10). Needs its own schema design and its own non-negotiable justification before it's built.

### 5.2 Future AI
- **Reflection Engine / follow-up "why?" surface** (`06_AI_ENGINE.md` §4.7) — re-runs Stage 4 with the existing Stage 2/3 payload plus the user's question. Secondary interaction mode only, never load-bearing (§10).
- **A second synthesis persona pass** for any new capability added later must reuse the existing §6.6 persona constraint rather than defining a new tone per capability — stated here so a future addition doesn't quietly fragment the voice.

### 5.3 Future Integrations
- **Institute portal integration**, if the institute ever ships a public, documented API (§10). Live scraping of the current private portal remains permanently rejected, not just deferred.
- **Additional public read-only trajectory sources** (a second competitive-programming judge, a publication index), evaluated case-by-case against `07_INTEGRATIONS.md` §0's governing rule.
- **A narrowly-scoped Notion read-only import** (specific user-tagged pages as reference links on a `project_status_snapshots` row) — explicitly not the task-sync version rejected in `07_INTEGRATIONS.md` §2, and not scoped further than that here.

### 5.4 Future Automation
- **Cross-device sync**, self-hosted/user-owned only — never Athena-operated cloud infrastructure (§10, non-negotiable §8).
- **A second, always-on-top mini "Now" panel** for multi-monitor setups (`02_DESIGN_SYSTEM.md` §6) — a plausible convenience, not scoped until requested and justified on its own.
- **Automated CI-driven threshold tuning** for drift/bottleneck sensitivity, addressing `ROADMAP_REVIEW.md` §4.4's observation that these thresholds are documented-but-unvalidated and no phase currently revisits them against real usage — a concrete, dated review point (e.g., end of v2.0's first full semester of real data) should be set when this phase is actually reached, rather than left permanently open.

---

## 6. What This Document Deliberately Does Not Do

It does not resequence any phase in §9, does not add a new phase, and does not promote anything from §5 into a numbered version without a separate, explicit decision to do so. Its only job is to make the existing phase plan legible as shippable versions, and to keep the "deferred, not rejected" list in one place so nothing in it gets quietly rebuilt from scratch by a future session that didn't know it was already considered.
