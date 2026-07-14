# docs/decisions/ — Architecture Decision Records

This directory holds one dated file per non-cosmetic decision, ADR-style,
per `IMPLEMENTATION_PLAN.md` §3 and PROJECT_RULES.md §5 ("no new document
sprawl" — this is one of the standing locations that already earned its
place, not a new one).

## Convention

- One file per decision: `YYYY-MM-DD-short-slug.md`.
- Each file states: the decision, the date, what alternatives were
  considered, and which section of `MASTER_SPECIFICATION.md` or
  `PROJECT_RULES.md` it implements or, if it's a genuine revision,
  amends.
- A decision file is written *at the time the decision is made*, not
  reconstructed later from memory or git history.
- Speculative architectural experiments that don't merge within one
  sprint's timebox (per `PROJECT_RULES.md` §6) are recorded here as a
  written outcome even if the branch itself is deleted.

## Current entries

None yet. Sprint S01 (Foundation Scaffold) introduced no decision that
needed its own ADR beyond what is already justified inline in
`SPRINT1_SPEC.md`'s own citations — see `CHANGELOG.md`'s `S01` entry.
