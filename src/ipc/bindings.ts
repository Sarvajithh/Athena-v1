import { invoke } from "@tauri-apps/api/core";

/**
 * Mirrors the Rust `AppVersionInfo` struct returned by the
 * `get_app_version` command (crates/athena-app/src/commands/mod.rs).
 */
export interface AppVersionInfo {
  version: string;
}

/** Calls the one proof-of-life IPC command registered in S01. */
export async function getAppVersion(): Promise<AppVersionInfo> {
  return invoke<AppVersionInfo>("get_app_version");
}

// ---------------------------------------------------------------------
// Onboarding + bootstrap — mirrors
// crates/athena-app/src/commands/{bootstrap,onboarding}.rs and the
// underlying athena-data repository row shapes (04_DATA_MODEL.md).
// Every interface below is a 1:1 mirror of a Rust struct's public
// fields; no reshaping happens on this side (01_ARCHITECTURE.md §2.1).
// ---------------------------------------------------------------------

export type LeverageClass = "high" | "medium" | "low";
export type DeadlineCategory = "academic" | "career" | "research" | "dsa" | "other";
export type DeadlineStatus = "open" | "done" | "missed";
export type CourseStatus = "active" | "completed" | "dropped";
export type Confidence = "confirmed" | "inferred" | "insufficient_data";

export interface MeetingSlot {
  day: string;
  start: string;
  end: string;
}

export interface ProfileRow {
  id: number;
  name: string;
  institute: string;
  program: string;
  current_semester_id: number | null;
  target_cgpa: number;
  current_cgpa: number | null;
  career_target: string;
  masters_target: string | null;
  codeforces_handle: string | null;
  deep_work_window_start: string;
  deep_work_window_end: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface SemesterRow {
  id: number;
  label: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
  created_at: string;
}

export interface CourseRow {
  id: number;
  semester_id: number;
  code: string;
  title: string;
  credits: number;
  leverage_class: LeverageClass;
  instructor: string | null;
  target_grade: string | null;
  meeting_pattern: MeetingSlot[];
  status: CourseStatus;
  created_at: string;
}

export interface DeadlineRow {
  id: number;
  semester_id: number;
  course_id: number | null;
  title: string;
  category: DeadlineCategory;
  due_at: string;
  leverage_class: LeverageClass;
  status: DeadlineStatus;
  created_at: string;
  notes: string | null;
}

export interface DecisionRow {
  id: number;
  semester_id: number;
  decision_type: string;
  description: string;
  challenge_fired: boolean;
  challenge_reasoning: string | null;
  final_outcome: "kept" | "reversed" | "overridden" | null;
  decided_at: string;
}

export interface VerdictDto {
  headline: string;
  reasoning: string;
  confidence: Confidence;
  grounded_in_deadline_id: number | null;
}

export interface BootstrapState {
  has_profile: boolean;
  profile: ProfileRow | null;
  current_semester: SemesterRow | null;
  courses: CourseRow[];
  deadlines: DeadlineRow[];
  career_deadlines: DeadlineRow[];
  decisions: DecisionRow[];
  verdict: VerdictDto;
}

/** The one read command every screen boots from (01_ARCHITECTURE.md §2.1). */
export async function getBootstrapState(): Promise<BootstrapState> {
  return invoke<BootstrapState>("get_bootstrap_state");
}

export interface CreateProfileInput {
  name: string;
  institute: string;
  program: string;
  target_cgpa: number;
  current_cgpa: number | null;
  career_target: string;
  masters_target: string | null;
  codeforces_handle: string | null;
  deep_work_window_start: string;
  deep_work_window_end: string;
  timezone: string;
}

/** Commits Profile Creation (03_ONBOARDING.md §2, Step 5). Returns the new `user_profile.id`. */
export async function createProfile(input: CreateProfileInput): Promise<number> {
  return invoke<number>("create_profile", { input });
}

export interface CourseInput {
  code: string;
  title: string;
  credits: number;
  leverage_class: LeverageClass;
  instructor: string | null;
  target_grade: string | null;
  meeting_pattern: MeetingSlot[];
}

export interface DeadlineInput {
  course_index: number | null;
  title: string;
  category: DeadlineCategory;
  due_at: string;
  leverage_class: LeverageClass;
  notes: string | null;
}

export interface CommitSemesterSetupInput {
  label: string;
  starts_on: string;
  ends_on: string;
  courses: CourseInput[];
  deadlines: DeadlineInput[];
  is_first_run: boolean;
}

/** Commits Semester Setup (03_ONBOARDING.md §3, Step 5). Returns the new `semesters.id`. */
export async function commitSemesterSetup(input: CommitSemesterSetupInput): Promise<number> {
  return invoke<number>("commit_semester_setup", { input });
}
