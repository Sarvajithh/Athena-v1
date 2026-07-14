# NEXT_TASK.md

**Sprint S01 (Foundation Scaffold) is complete and closed.** Per the
task instruction ("Do not begin Sprint 2. Stop after Sprint 1."), no
Sprint 2 work has been started or anticipated in this session.

## Next sprint

**S02**, per `ROADMAP.md`.

## Before starting S02, a future session should

1. Read `MASTER_SPECIFICATION.md`, `ROADMAP.md`, and `PROJECT_RULES.md`
   in full — per `PROJECT_RULES.md` §7 Rule 1, do not reconstruct scope
   from `CURRENT_CONTEXT.md` alone.
2. Obtain `SPRINT2_SPEC.md` (not present in this session's uploaded
   files) before writing or proposing any S02 implementation — per the
   task instruction's own constraint ("The ONLY information available to
   you is contained in the uploaded files... do not assume the
   existence of any implementation beyond what is explicitly
   described"), S02's scope cannot be inferred from `ROADMAP.md`'s
   phase summary alone; it needs its own sprint spec with the same
   level of citation-backed detail `SPRINT1_SPEC.md` had.
3. Re-check the three open items logged in `CURRENT_CONTEXT.md`
   ("Open questions / risks carried forward from S01") — CI behavior at
   scale, the IPC contract-check tool's fragility, and the placeholder
   app icons — before assuming S01's scaffold is production-safe as-is.

## Explicitly not started

No `athena-domain` submodule, no product screen, no repository beyond
the S01 placeholder, no `LlmProvider` trait, no outbound integration, no
event-bus interceptor logic — all per `SPRINT1_SPEC.md` §1's explicit
out-of-scope list and `PROJECT_RULES.md` Immutable Rule #7/#3.
