//! One module per Version 1 integration (07_INTEGRATIONS.md §1). Every
//! connector is independently usable — none imports another — so that
//! "the application must continue functioning when every external
//! service is disconnected" holds structurally, not just by
//! convention: nothing here can fail to compile or panic at import time
//! just because a sibling connector is unconfigured.
//!
//! Each connector exposes plain functions that return typed data or an
//! `IngestionError` — no connector here touches SQL or Tauri directly
//! (those live in `athena-data` and `athena-app` respectively, per the
//! dependency graph in `athena-ingestion`'s own Cargo.toml). This keeps
//! every connector unit-testable without a database or a running app.

pub mod calendar_ics;
pub mod codeforces;
pub mod csv_import;
pub mod github;
pub mod leetcode;
pub mod pdf_import;
