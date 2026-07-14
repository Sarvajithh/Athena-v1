#!/usr/bin/env python3
"""
IPC contract-check tool (SPRINT1_SPEC.md §7, Objective 3/7).

Deliberately minimal for S01: exactly one Tauri command exists
(`get_app_version`), returning exactly one struct (`AppVersionInfo`).
This script asserts:

  1. Every command registered in `tauri::generate_handler![...]` in
     `crates/athena-app/src/main.rs` has a matching `invoke("...")` call
     in `src/ipc/bindings.ts`, and vice versa (no drift either direction).
  2. The Rust `AppVersionInfo` struct's public field names exactly match
     the TypeScript `AppVersionInfo` interface's field names.

This is intentionally a regex-based check, not a real bindings generator
(e.g. `tauri-specta`) — SPRINT1_SPEC.md §9 flags this explicitly as a
known risk to re-validate once a command with a non-trivial payload
shape exists (S02+). For S01's single trivial command, this is
sufficient to make the CI gate real rather than aspirational.

Exit code 0 = contract holds. Exit code 1 = drift detected (fails CI).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MAIN_RS = REPO_ROOT / "crates" / "athena-app" / "src" / "main.rs"
COMMANDS_RS = REPO_ROOT / "crates" / "athena-app" / "src" / "commands" / "mod.rs"
BINDINGS_TS = REPO_ROOT / "src" / "ipc" / "bindings.ts"


def fail(message: str) -> None:
    print(f"IPC CONTRACT CHECK FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def extract_registered_commands(main_rs_text: str) -> set[str]:
    match = re.search(r"generate_handler!\[(.*?)\]", main_rs_text, re.DOTALL)
    if not match:
        fail("could not find `tauri::generate_handler![...]` in main.rs")
    names = set()
    for raw in match.group(1).split(","):
        raw = raw.strip()
        if not raw:
            continue
        # e.g. "commands::get_app_version" -> "get_app_version"
        names.add(raw.split("::")[-1])
    return names


def extract_invoked_commands(bindings_ts_text: str) -> set[str]:
    return set(re.findall(r'invoke(?:<[^>]*>)?\(\s*["\']([a-zA-Z0-9_]+)["\']', bindings_ts_text))


def extract_rust_struct_fields(commands_rs_text: str, struct_name: str) -> set[str]:
    match = re.search(
        rf"pub struct {struct_name}\s*\{{(.*?)\}}", commands_rs_text, re.DOTALL
    )
    if not match:
        fail(f"could not find `pub struct {struct_name}` in commands/mod.rs")
    fields = set()
    for line in match.group(1).splitlines():
        line = line.strip().rstrip(",")
        if not line or line.startswith("//"):
            continue
        field_match = re.match(r"pub\s+([a-zA-Z0-9_]+)\s*:", line)
        if field_match:
            fields.add(field_match.group(1))
    return fields


def extract_ts_interface_fields(bindings_ts_text: str, interface_name: str) -> set[str]:
    match = re.search(
        rf"interface {interface_name}\s*\{{(.*?)\}}", bindings_ts_text, re.DOTALL
    )
    if not match:
        fail(f"could not find `interface {interface_name}` in bindings.ts")
    fields = set()
    for line in match.group(1).splitlines():
        line = line.strip().rstrip(";")
        if not line or line.startswith("//"):
            continue
        field_match = re.match(r"([a-zA-Z0-9_]+)\??\s*:", line)
        if field_match:
            fields.add(field_match.group(1))
    return fields


def main() -> None:
    main_rs_text = MAIN_RS.read_text()
    commands_rs_text = COMMANDS_RS.read_text()
    bindings_ts_text = BINDINGS_TS.read_text()

    registered = extract_registered_commands(main_rs_text)
    invoked = extract_invoked_commands(bindings_ts_text)

    if registered != invoked:
        fail(
            "command set mismatch between main.rs and bindings.ts: "
            f"registered={sorted(registered)} invoked={sorted(invoked)}"
        )

    rust_fields = extract_rust_struct_fields(commands_rs_text, "AppVersionInfo")
    ts_fields = extract_ts_interface_fields(bindings_ts_text, "AppVersionInfo")

    if rust_fields != ts_fields:
        fail(
            "AppVersionInfo field mismatch: "
            f"rust={sorted(rust_fields)} ts={sorted(ts_fields)}"
        )

    print("IPC contract check passed: commands and payload shapes match.")


if __name__ == "__main__":
    main()
