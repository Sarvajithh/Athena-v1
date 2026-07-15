# 06_AI_ENGINE.md — Project Athena
### The intelligence behind the four screens. Governs `athena-reasoning` and its interaction with `athena-domain`. Introduces no new tables (Immutable Rule #7), no new screens (§4.8), and no departure from "the LLM never decides, only phrases" (§6.1, Immutable Rule #5).

**Standing:** this document is the concrete specification of `MASTER_SPECIFICATION.md` §6 (AI Philosophy). Where a named capability below (Daily Briefing, Weekly Review, etc.) could be read as reintroducing something §1.1 or §11 rejected, the rejection wins and the capability is redefined to fit inside the settled pipeline — never the reverse.

---

## 1. The One Rule Everything Below Obeys

**Every fact, ranking, weakness, probability, and severity is computed by deterministic Rust before any LLM call happens.** The LLM receives an already-decided, already-cited verdict and turns it into one well-reasoned, well-formatted piece of prose. It never receives raw table dumps and never infers a pattern the retrieval payload didn't already contain as a typed field.

This means every "engine" named in this document — Daily Briefing, Weekly Review, Weakness Analysis, Masters Probability, Career Analysis — is **not a separate AI system**. They are all the same five-stage pipeline (§3 below), pointed at a different scheduled trigger and a different retrieval query. Naming them separately is a product-surface convenience; architecturally there is one pipeline.

**Athena does not behave like ChatGPT because it is not a conversational system.** There is no persistent chat thread the user must maintain, no "ask me anything" box on the default screen, and no requirement to type anything for the system to function (§6.4, Immutable Rule #9's non-negotiables §1/§4/§9 taken together). Every capability below is *pushed*, read passively, and requires zero typed input from the user unless the user opts into optional structured logging.

---

## 2. Context Engine (Stage 1 — Retrieval)

The context engine is a set of typed, parameterized queries in `athena-data`, one per capability, each returning a fixed-shape payload — never an ORM-style "give me everything about the user."

- Every retrieval carries a **freshness stamp** per source (`data_sources.last_synced_at` or equivalent) so Stage 4 can honestly say "as of X" rather than imply live data it doesn't have.
- Retrieval payloads are **narrow by construction**: a Weakness Analysis retrieval pulls `drift_signals`, `bottlenecks`, and the specific `grade_snapshots`/`dsa_practice_log` rows that produced them — not the user's entire history. This is what makes the Stage 5 grounding check tractable: a smaller payload means every claim in the output is checkable against a small, enumerable set of IDs.
- The context engine never queries proxy and trajectory metrics into the same result set without the caller being `DivergenceCheck` specifically (§7.4) — this rule is enforced in the query layer itself, not left to prompt discipline, so a careless new capability can't accidentally blend the two.

**There is no separate "memory system."** The context engine's job is entirely satisfied by the existing schema — `grade_snapshots`, `drift_signals`, `bottlenecks`, `decisions`, `recommendations`, `user_profile_history` — because that schema already is Athena's memory, typed and queryable (§1.5, §7.3's explicit rejection of `episodic_memory`/`semantic_memory`/`habit_memory`/`tension_flags`/`credibility_ledger`). Nothing in this document requires or gestures toward a second, LLM-native memory representation.

---

## 3. The Pipeline (Stages 2–5)

```
Trigger (scheduled or event-driven)
  → Stage 1: Retrieval (context engine, §2 — typed, narrow, freshness-stamped)
  → Stage 2: Deterministic Scoring (athena-domain: priority / bottleneck /
    drift / divergence / the capability's specific scoring function —
    pure Rust, no LLM, produces a typed verdict + confidence class +
    evidence row IDs)
  → Stage 3: Prompt Construction (athena-reasoning — assembles the Stage 2
    verdict + evidence into a JSON-schema-constrained prompt; the prompt
    never contains raw unretrieved data)
  → Stage 4: Synthesis (LLM call — turns the verdict into prose, citing
    the stable evidence IDs it was given, nothing else)
  → Stage 5: Grounding Check (every cited ID and every factual claim in
    the output is verified against the Stage 1 payload; an unverified
    claim → reject and retry once with a stricter prompt; a second
    failure → template-flattened, prose-free output built directly from
    the Stage 2 verdict)
  → Output: a typed `Recommendation` or `Alert` row — verdict, reasoning,
    confidence, grounded_in (evidence IDs), data_freshness_note
```

The worst-case failure mode is a flat, fact-only template — never a fluent hallucination (§6.2). This is true for every capability in this document without exception; nothing named below gets a bespoke failure mode.

---

## 4. Capabilities

Each capability is described as: **trigger**, **Stage 1 query shape**, **Stage 2 scoring function**, **where it surfaces**, and **what it explicitly is not**.

### 4.1 Daily Pass (requested as "Daily Briefing")

- **Trigger:** daily timer (`athena-app` scheduler), not a user action.
- **Retrieval:** anything ingested since the last pass — new grade snapshot, new Codeforces sync, a deadline crossing a proximity threshold.
- **Scoring:** re-runs Priority Resolution; if the ranked verdict on **Now** changed, a new `recommendations` row is written.
- **Surfaces:** silently updates **Now**. No push notification unless severity crosses `flag`/`urgent` (§2.3 of the design system) or the Deep Work Guard has something to say about tonight's window.
- **Explicitly not:** a "morning briefing" the user must open and read, and never a chat exchange requiring a reply. §11 rejects mandatory conversational daily check-ins by name; this pass is the re-grounded, non-conversational version §6.4 specifies. There is no text generated that says "Good morning" — there is a verdict, updated or not.

### 4.2 Weekly Digest (requested as "Weekly Review")

- **Trigger:** `DriftScan`'s weekly accumulation window (§6.4), not a scheduled meeting.
- **Retrieval:** the week's `drift_signals`, `bottlenecks`, and trend deltas across `grade_snapshots`/`codeforces_snapshots`/`dsa_practice_log`.
- **Scoring:** Signal Threshold (§5 below) evaluated per candidate pattern; only patterns clearing 2-of-4 graduate to a surfaced `drift_signal`.
- **Surfaces:** an update to **Trajectory**'s week zoom level — reviewed whenever the user opens the screen, on his own schedule.
- **Explicitly not:** a 10–15 minute mandatory conversational review. §11 rejects this by name. There is no requirement that the user "complete" the weekly digest — it is a state of the Trajectory screen, not an event the user must attend.

### 4.3 Semester Analysis

- **Trigger:** the **Semester Setup** wizard, run at term boundaries (§6.4, §5.2).
- **Retrieval:** the closing semester's full `user_profile_history`, `bottlenecks`, `drift_signals`, and trajectory-metric trend, compared against the goals stated at the semester's start.
- **Scoring:** a structured comparison function (stated goal vs. actual trend), producing a typed verdict per goal: on-track / diverged / insufficient-data — never a single vague "how'd the semester go" paragraph.
- **Surfaces:** as a step inside the Semester Setup wizard itself — goals are re-affirmed or explicitly revised against evidence, not silently rolled over (Immutable Rule #6, non-negotiable §7).
- **Explicitly not:** a facilitated conversation (the rejected `SEMESTER_AGENT.md` framing per §6.4) — it is a structured wizard step with typed inputs and typed outputs.

### 4.4 Weakness Analysis

- **Trigger:** subsumed into the Weekly Digest and Semester Analysis passes — not a standalone fifth cadence.
- **Retrieval:** `drift_signals` and `bottlenecks` rows that have already cleared the Signal Threshold (§5) — i.e., patterns that are *already real, evidenced, and recurring* in the database.
- **Scoring:** none beyond what produced the `drift_signals`/`bottlenecks` rows in the first place — Weakness Analysis is a *presentation* of already-computed signals, not a new inference step.
- **Surfaces:** Trajectory, as the honest-but-not-editorializing framing from §5.2 ("patterns are shown factually, phrased without editorializing or shame, but never hidden").
- **Explicitly not — this is the load-bearing constraint of this entire document:** an LLM noticing a psychological pattern the user hasn't evidenced in structured data ("blind spot" detection). §1.1 and §11 reject this outright as a guess presented as fact, specifically because it has no schema-level grounding check. Every weakness Athena names must already be a row in `drift_signals` or `bottlenecks`, produced by deterministic Rust, before Stage 4 ever runs. If a pattern hasn't cleared the Signal Threshold, it does not get named — not "named gently," not named at all.

### 4.5 Career Analysis

- **Trigger:** part of the Trajectory screen's live render, not a separate scheduled job — the career thread (§5.2) reads the same `trajectory_metrics`/`opportunities` state continuously.
- **Retrieval:** `project_status_snapshots`, `research_activities`, `opportunities` with `apply_by` proximity, and portfolio-strength trend.
- **Scoring:** the Opportunity Engine's deterministic query (§1.1's correction — a query over `opportunities` + `trajectory_metrics`, not an LLM "scanning memory for passing mentions") plus real urgency rendering per §1.2.
- **Surfaces:** Trajectory's career section, one section among several — not a separate screen (§1.4 already rejected a standalone Career View).

### 4.6 Masters Probability

This is the highest-stakes capability in this document to get wrong, because a number framed as a probability is the easiest thing in the whole system to accidentally let the LLM "decide."

- **What it is:** a deterministic score computed entirely in `athena-domain` from typed trajectory metrics — CGPA trajectory and slope (`grade_snapshots`), competitive-programming trend (`codeforces_snapshots`), portfolio/research strength (`project_status_snapshots`, `research_activities`) — weighted against a stated target profile (comparable admitted-candidate benchmarks the user has explicitly configured or confirmed, not scraped or assumed).
- **What it is not:** an LLM's holistic judgment of "how competitive is this application." The LLM's only role, per §6.1, is Stage 4 phrasing of a number Stage 2 already produced. If the underlying scoring model or its weights are uncertain (they usually are, especially early in a program), the confidence class is `inferred`, and the UI-facing copy Stage 4 generates must say so explicitly, per §6.3 — a probability is never presented as `confirmed` unless it's a mechanical function of fully-fresh, fully-populated trajectory data.
- **At semester start, with mostly empty data:** the honest output is `insufficient_data`, per §4.7's cold-start correctness requirement — never a placeholder guess dressed up as a percentage.
- **Surfaces:** Trajectory's semester zoom level, as one number among the trajectory metrics it's derived from — never a standalone headline number divorced from the evidence that produced it. Every render of this number is a click away from the evidence rows and weights that produced it (auditable reasoning, §4.7).

### 4.7 Reflection Engine

- **What it maps to:** the "Follow-up chat surface" already scoped in §10 as a Future Feature — a narrow "why?" mode that re-runs Stage 4 with the *same* Stage 2/3 payload plus the user's question, never a new retrieval or a new inference path.
- **Governing constraint:** secondary and optional, never load-bearing (§6.8, §10). The product's value must never depend on the user initiating this. It exists only as a way to ask "why does the Now verdict say this" and get the same grounded reasoning, elaborated — not as a general-purpose chat window.
- **Explicitly not:** persistent conversational memory, a chat history the system "remembers" across sessions, or a surface where the user can ask Athena to infer something new about them. Every answer in this mode is still bound by Stage 5's grounding check against the original payload.
- **v1 status:** deferred per §10 — specified here so a future session builds it correctly when it's prioritized, not so it ships in v1.

---

## 5. Signal Threshold (the one mechanism behind every "should this surface" decision)

Kept exactly as §6.5 specifies — a candidate observation graduates from "logged silently" to "surfaced" only if at least two of four hold, computed deterministically:

1. **Recurrence** — appeared 2–3+ times across the relevant window.
2. **Stakes** — evidenced cost (grade impact, deadline proximity, portfolio relevance) crosses a defined threshold.
3. **Reversibility** — the window to act is closing (`apply_by`, a deadline).
4. **Contradiction** — conflicts with a decision or goal the user explicitly committed to.

This single mechanism governs `drift_signals.severity`, the Priority Resolution single-answer-vs-list behavior, and every capability in §4 that decides whether something is worth a user's attention. There is exactly one implementation of this logic, in `athena-domain`, called by every capability — not a per-capability judgment call and never an LLM judgment call.

---

## 6. Confidence Model

Three classes, applied identically across every capability above — no capability gets its own confidence scale:

- **`confirmed`** — follows directly from fresh, retrieved data.
- **`inferred`** — follows from a trend/pattern read; explicitly labeled a hypothesis in the UI (§2.4 of the design system).
- **`insufficient_data`** — a first-class, expected state, especially early in a semester; never papered over with a generic answer (§4.7's cold-start correctness).

`confidence` is never nullable on a `recommendations` row (§6.2). A capability that can't compute a confidence class hasn't finished Stage 2 and does not proceed to Stage 4.

---

## 7. Prompt Generation

Every Stage 4 prompt is assembled from a small, fixed set of components, never freeform string concatenation of arbitrary retrieved text:

1. **System/persona block** — the tone constraint from §6.6 (§8 below), identical across all capabilities.
2. **Verdict block** — the Stage 2 typed output, serialized as structured JSON, not prose.
3. **Evidence block** — the specific rows (IDs, values, timestamps) Stage 2 cited, and nothing outside that set.
4. **Output schema** — a JSON schema the model must satisfy (verdict restatement, reasoning sentence(s), citations by ID). Constrained output is what makes Stage 5's grounding check mechanical rather than a fuzzy text-matching problem.

No prompt ever includes an instruction like "use your judgment about what else might be relevant" — that phrase is exactly the seam through which an ungrounded claim enters, and it is banned from every prompt template as a matter of design review (Immutable Rule #5, Rule for Future Sessions #5).

---

## 8. Persona (Stage 4 tone constraint, §6.6)

Direct, economical, respects the user's time. No performed enthusiasm, no hedging a disagreement into mush. Athena says "I think this is a mistake, here's why" once, with evidence, then respects the decision unless the same failure recurs. Never moralizes, never nags, never softens a negative verdict for comfort (non-negotiable §1). This is a prompt-level tone constraint applied identically to every capability's Stage 4 call — it is not a separate reasoning system, and it never overrides what Stage 2 already decided.

---

## 9. LLM Provider Abstraction

- **Shape:** a trait boundary (`LlmProvider` or equivalent) in `athena-reasoning`, implemented by a cloud client (Anthropic Claude, primary, §6.7) and a local client (Ollama or equivalent, first-class fallback, not an afterthought). Both implementations satisfy the same JSON-schema-constrained call interface, so Stage 3/5 code is provider-agnostic.
- **Why a trait boundary, not a concrete client:** a single-vendor, unabstracted client hard-coded into the synthesis module is a real 5-year risk — pricing, deprecation, or availability changes in one vendor directly threaten the product's core differentiation. The trait costs one interface definition now and is materially more expensive to retrofit once multiple call sites have coupled to a concrete client. This is the cheap, correct default for a 5-year single-developer project (§4.7's maintainability requirement), not scope creep — it adds no new capability, only an interface around the one already specified in §6.7.
- **What never leaves the device:** only the narrow Stage 3 prompt for a given call — never a database dump, never raw identifiers beyond what phrasing requires (§6.7).

---

## 10. Offline Fallback

Two degrade steps, both already fully specified, neither optional:

1. **Local model fallback** — if the cloud provider is unreachable, the same trait-bounded call goes to the local model. Output still passes through Stage 5's grounding check unchanged; a local model's synthesis is held to the identical grounding bar as the cloud model's.
2. **Template fallback** — if no LLM (cloud or local) is available at all, or if Stage 5 rejects twice, Stage 2's typed verdict is rendered directly as a template sentence with zero LLM involvement. This is not a degraded experience in the sense of being *wrong* — it is fully grounded, just less fluent. §4.7's offline-first requirement means priority resolution, logging, and trajectory viewing all function with zero network access; only the fluency of the sentence, never its correctness, depends on connectivity.

---

## 11. Response Formatting

Every user-facing surfaced item, from every capability in §4, is a typed `Recommendation` or `Alert` object with a mandatory `reasoning` field (Engineering Guideline #3). There is no code path anywhere in `athena-reasoning` that constructs a bare string and hands it to the UI or to a notification. Concretely, every output carries:

- `verdict` — the Stage 2 typed decision.
- `reasoning` — the Stage 4 sentence(s), grounded and cited.
- `confidence` — one of the three classes (§6), never null.
- `grounded_in` — the evidence row IDs the reasoning cites, checkable against Stage 1's payload.
- `data_freshness_note` — an explicit statement of how current the underlying data is, so a stale-but-still-displayed number is never silently presented as live.

---

## 12. What This Engine Deliberately Does Not Do

Carried forward verbatim from §6.8, because every capability named in this document is a specific instance of the same pipeline and none of them is exempt:

- Does not let the LLM call any state-mutating tool — synthesis is read-only, all writes go through Commands (§4.6).
- Does not maintain open-ended conversational memory as the primary mode — the Reflection Engine (§4.7) is a narrow, secondary exception, never load-bearing.
- Does not fine-tune or retrain on the user's data.
- Does not infer psychological state, diagnose patterns the user hasn't evidenced in structured data, or maintain a subjective "credibility" judgment of the user's decision-making character. If a pattern is real, it shows up in `drift_signals` or `bottlenecks` with evidence rows — never as a vibe, and never as a Masters Probability number nudged by anything other than the typed trajectory metrics that fed it.
