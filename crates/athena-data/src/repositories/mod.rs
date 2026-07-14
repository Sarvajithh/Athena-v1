//! Repository interfaces live here, one per aggregate (Master Spec §4.5:
//! "one repository per aggregate; the only crate allowed to write SQL").
//!
//! S01 (Foundation Scaffold) reserves this location but adds no
//! repository yet — there is no domain table for a repository to query
//! against (SPRINT1_SPEC.md §0, "zero domain logic"). The first
//! repository is added in the sprint that introduces the first domain
//! table it serves, per PROJECT_RULES.md Immutable Rule #7.
