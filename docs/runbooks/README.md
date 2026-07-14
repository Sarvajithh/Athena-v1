# docs/runbooks/ — Operational Runbooks

This directory holds "what to do when X breaks" documents, written as
features ship, not retrofitted (`IMPLEMENTATION_PLAN.md` §3).

## Convention

- One file per operational scenario a future session (human or Claude)
  might need to diagnose without re-reading source: e.g. "migration
  failed on startup," "log directory filling disk," "corrupted SQLite
  file on launch."
- Each runbook states: symptoms, likely causes, the concrete steps to
  diagnose and resolve, and a pointer to the relevant code/tests.
- Runbooks are added alongside the feature whose failure mode they
  describe — per `PROJECT_RULES.md` §5, documentation updates land in
  the same PR as the code, not a follow-up task.

## Current entries

None yet. Sprint S01 (Foundation Scaffold) has no user-facing feature
with an operational failure mode complex enough to warrant a runbook —
the known risks for this sprint are tracked in `SPRINT1_SPEC.md` §9
instead.
