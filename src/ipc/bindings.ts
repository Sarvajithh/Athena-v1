import { invoke } from "@tauri-apps/api/core";

/**
 * Mirrors the Rust `AppVersionInfo` struct returned by the
 * `get_app_version` command (crates/athena-app/src/commands/mod.rs).
 *
 * This is the one typed IPC binding S01 needs (SPRINT1_SPEC.md Objective
 * 3). The CI contract-check step (SPRINT1_SPEC.md §7) asserts this shape
 * stays in sync with the Rust command's signature.
 */
export interface AppVersionInfo {
  version: string;
}

/** Calls the one proof-of-life IPC command registered in S01. */
export async function getAppVersion(): Promise<AppVersionInfo> {
  return invoke<AppVersionInfo>("get_app_version");
}
