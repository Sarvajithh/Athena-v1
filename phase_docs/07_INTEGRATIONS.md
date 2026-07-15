# 07_INTEGRATIONS.md — Project Athena
### Every external data source Athena touches, and the shape it's allowed to take. Governs `athena-ingestion`. Introduces no new tables without a cited schema change (Immutable Rule #7), and every entry below is judged against the one governing question `MASTER_SPECIFICATION.md` §8 already established.

## 0. Governing Rule (§8, kept verbatim)

**Does this make the system's facts more grounded, or does it just add convenience at the cost of fragility/privacy? Convenience alone never justifies a new outbound dependency.**

Every integration below is scored against this before anything else. Two structural constraints follow directly from it and apply to *every* entry in this document without exception:

1. **No institute credentials, ever.** Storing another party's system's login for the user is a security liability disproportionate to the value, regardless of which "other party's system" it is (§8's ruling on the institute portal generalizes to any credential-gated system that isn't the user's own account on a public, documented API).
2. **Read-only, or it doesn't ship.** Nothing in this document writes to an external system. Athena consumes; it never posts, edits, or syncs outward.

---

## 1. Shipped Integrations (grounded, low-fragility, cited)

### 1.1 Codeforces (as specified, unchanged)

- **Shape:** read-only polling of the public API (`user.rating`, `user.status`).
- **Auth:** none required — public data.
- **Refresh:** periodic timer (`athena-app` scheduler), same cadence class as `DriftScan`.
- **Degrade path:** on failure, `codeforces_snapshots` data is flagged stale via `data_sources.last_synced_at`, never silently treated as current (§8).
- **Feeds:** `codeforces_snapshots` (trajectory metric), consumed by Divergence Check (§7.4) and Career Analysis (`06_AI_ENGINE.md` §4.5).

### 1.2 LeetCode

- **Shape:** identical to Codeforces — read-only polling of the public profile/submission-stats surface. No account linking beyond the username the user supplies in Semester Setup.
- **Why it clears the governing rule:** it's the same shape as an already-approved integration, adding a second DSA-trajectory data point rather than a new category of risk.
- **Feeds:** a supplementary trajectory-metric column alongside `codeforces_snapshots` — **cited schema change required before this ships** (Immutable Rule #7): a `dsa_practice_log`/`codeforces_snapshots`-adjacent table extension is its own reviewed deliverable, not an implicit side effect of adding this connector.
- **Degrade path:** same staleness-flagging pattern as §1.1.

### 1.3 GitHub

- **Shape:** read-only polling of the public API — commit activity, repo metadata, PR/issue counts on repos the user explicitly links in Semester Setup. Never a full account scan; the user names specific repos.
- **Auth:** a personal access token (read-only scope), stored in the OS keychain, never in SQLite or a config file (§8.1's network-access discipline extended to credential storage).
- **Feeds:** `project_status_snapshots` / `research_activities` — real commit cadence as one input to portfolio-strength scoring, replacing what would otherwise be manually-logged project status alone.
- **Why it clears the governing rule:** commit history is a harder, more grounded signal for "is this project actually progressing" than a self-reported status field — it makes an existing trajectory metric more honest rather than adding a new category of convenience feature.

### 1.4 Calendar Import (Google Calendar and any other .ics source)

- **Shape:** unchanged from §8 — **local file parse, one-time per semester, through Semester Setup.** The user exports their Google Calendar (or any calendar) to `.ics` and imports it; Athena never holds a Google OAuth token or polls Google's API on a standing basis.
- **Why not a live OAuth sync:** §8 is explicit that calendar integration has no OAuth, no standing dependency, precisely because a live sync is a permanent outbound relationship with a third party for a convenience (not having to re-export once a semester) that isn't worth the credential surface and the "is this actually current" ambiguity it introduces. Nothing about the source being Google specifically changes that calculus.
- **Feeds:** `deadlines` (import path only — see `athena-domain`'s existing ICS parser).

### 1.5 Resume / Transcript / PDF Import

- **Shape:** local-only file parse (no network call at all) of a user-supplied PDF — resume, transcript, or similar document — through Semester Setup or a manual "log an achievement" entry point.
- **What it extracts:** structured facts the user confirms before commit — a project, a publication, a certification — mapped directly onto existing typed entities (`project_status_snapshots`, `research_activities`). It never free-text-dumps parsed PDF content into the database; extraction always ends in a confirmation step against a typed schema field, the same discipline CSV import already uses.
- **Why it clears the governing rule:** zero outbound dependency, zero fragility risk (parsing is local), and it grounds portfolio-strength scoring in the same document the user would eventually submit to an actual application — about as directly relevant as a data source gets.

### 1.6 CSV Import (as specified, unchanged)

- **Shape:** institute grade/timetable exports, or any other structured export, parsed locally through Semester Setup. No live sync, no credentials, re-run manually every semester (§8, non-negotiable §7 — "the system adapts to the semester, not the reverse").
- **Note carried forward from `ROADMAP_REVIEW.md`:** the real institute CSV export format should be obtained and tested against the parser during early schema work, not discovered late — this is a sequencing note for `IMPLEMENTATION_PLAN.md`, not a change to this document's scope.

### 1.7 Manual Import (as specified, unchanged)

- **Shape:** direct entry through Semester Setup or the Now/Trajectory screens' existing typed forms — courses, deadlines, grades, DSA sessions. The always-available fallback when no structured source exists. Every other integration in this document is a way to reduce how often manual entry is needed, never a replacement for its availability.

---

## 2. Explicitly Deferred / Not Built in v1

Listed here, with reasoning, so a future session doesn't have to re-litigate the same calculus from scratch (Rule for Future Sessions #2) — and so the request for these sources is answered honestly rather than silently dropped.

- **Gmail (inbox scanning for deadlines/opportunities).** Fails the governing rule on both axes: it requires a standing OAuth relationship with full mailbox read access — a far larger and more sensitive credential surface than anything else in this document — for a benefit (catching a deadline mentioned in an email) that CSV/manual import and the existing `deadlines` table already cover for anything structured. This is closer in shape to the rejected institute-portal live-scraping pattern than to the Codeforces/GitHub pattern: broad access to a private, unversioned surface (an inbox's actual contents vary infinitely) for a use case with a narrower, already-served alternative. Not proposed as a future feature either, unless a narrower, explicitly-scoped version (e.g., forwarding one specific email to a local parser, not standing inbox access) is separately justified against §8 later.
- **Google Classroom (live OAuth sync).** Same reasoning as calendar (§1.4): a live, standing OAuth dependency for institute-adjacent data is the exact shape §8 already ruled out for the institute portal itself, regardless of which vendor's API sits behind it. If Classroom is used at all, it's through the same manual-export-then-CSV/ICS-import path as any other institute data source (§1.4, §1.6) — not a connector of its own.
- **Notion (task/note sync).** Rejected on two independent grounds already established in `MASTER_SPECIFICATION.md`: §11 explicitly rejects third-party task-manager sync by name ("nothing to serve, since general task management is out of scope"), and §7.3 confirms there is no `tasks` table for it to write into even if the sync direction were read-only. A narrower future version — read-only import of specific, user-tagged Notion pages as reference links attached to a `project_status_snapshots` row — is not ruled out in principle, but it isn't specified here because it isn't needed by anything currently in scope; it would need its own citation and its own schema review before being built, per Immutable Rule #7.

---

## 3. Future Integrations (per §10, revisit once the core loop is proven — not started early)

- **Institute portal integration**, only if the institute ever ships a public, documented API. Live scraping of the current private, unversioned portal remains rejected (§8, §11).
- **Cross-device sync**, self-hosted/user-owned only (the user's own sync tool over the SQLite file, or an end-to-end-encrypted personal relay) — only if the single-machine constraint becomes real friction, and never as Athena-operated cloud infrastructure (non-negotiable §8).
- **Additional public read-only trajectory sources** (e.g., a second competitive-programming judge, a publication index) — evaluated case-by-case against §0's governing rule, following the exact shape §1.2/§1.3 establish: public API, read-only, feeds an existing trajectory metric, degrades to stale-flagged rather than silently current.

---

## 4. Authentication (all shipped integrations)

- **Public, keyless APIs (Codeforces):** no credential stored at all.
- **Token-based APIs (GitHub, LeetCode if it requires one):** a read-only-scoped personal access token, stored exclusively in the OS-native keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux) via Tauri's keychain plugin — never in SQLite, never in a plaintext config file, never logged.
- **No integration in this document uses OAuth.** Every shipped connector either needs no credential (public API) or a narrow, user-generated, revocable token the user creates themselves on the provider's site and pastes in once during Semester Setup. This sidesteps building and maintaining an OAuth flow (real, ongoing engineering surface for a single-developer project) for sources where a static token is sufficient, and it means every credential Athena holds is one the user can revoke unilaterally on the provider's side without needing Athena to cooperate.

---

## 5. Refresh Strategy

- Every polling integration (Codeforces, LeetCode, GitHub) runs on the same scheduler primitive as `DriftScan` — a dumb timer in `athena-app` that fires an event; the actual fetch/parse logic lives in `athena-ingestion`, testable without a real clock (§4.5's scheduler design, generalized to all connectors, not just Codeforces).
- **Staleness is a first-class, visible state**, not a silent failure. Every polled table's freshness is tracked in `data_sources`, and any screen surfacing that data renders the freshness note (§11 of `06_AI_ENGINE.md`) rather than presenting a six-day-old number as if it were fetched a minute ago.
- Import-based sources (Calendar, CSV, PDF, Manual) have no refresh cadence by definition — they are point-in-time snapshots, re-run by the user at natural boundaries (a new semester, a new resume version), consistent with non-negotiable §7's rejection of any fixed schedule being assumed to still be valid.

---

## 6. Privacy

- **Sole ownership, unconditionally (non-negotiable §8).** Every byte any integration in this document retrieves lands in the user's local SQLite file. Nothing is proxied through, logged by, or retained on any Athena-operated server, because no such server exists.
- **Narrow payloads only.** The only thing that ever leaves the device, for any reason, is the narrow Stage 3 synthesis payload described in `06_AI_ENGINE.md` §9 — never a database dump, never a bulk export, never telemetry. This applies identically regardless of which integration produced the data being synthesized about.
- **No analytics/telemetry SDK of any kind** (§8, explicit) — this document does not reopen that; none of the connectors above report usage, errors, or presence to anyone but the local log file.
- **Token minimization:** every stored API token is requested with the narrowest scope the provider offers (read-only where available) and the user is shown exactly what scope they're granting during Semester Setup's connector step, before the token is saved.

---

## 7. Local Caching

- Raw provider responses (not just the parsed/typed result) are cached locally for a short rolling window (e.g., last 3 polls) purely to make staleness diagnosis and connector debugging possible without re-hitting a rate-limited API — this cache is operational, not a second copy of product data, and is not surfaced anywhere in the UI.
- Parsed, typed data (the actual `codeforces_snapshots` row, the actual `project_status_snapshots` row) is the only thing that's part of the durable schema and the only thing any other module is allowed to read — nothing downstream of ingestion ever reaches into the raw-response cache directly, keeping the typed-boundary discipline (`PROJECT_RULES.md` §2) intact across the ingestion crate too.
