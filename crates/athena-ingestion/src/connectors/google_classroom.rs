//! Google Classroom connector (07_INTEGRATIONS.md §1.9, OAuth
//! amendment). Read-only sync of courses, coursework (assignments + due
//! dates), announcements, and course materials for courses the
//! authenticated user is already enrolled in/teaches — never a
//! domain-wide roster scan, never a grade write, never a submission
//! action. Materials come from three places, not just Classroom's
//! dedicated `courseWorkMaterials` resource: a teacher can also attach
//! files/links directly to an assignment or an announcement instead of
//! posting them separately, so `fetch_coursework`/`fetch_announcements`
//! extract those attachments too (`materials_from_attachments`).
//! Scopes: `.../auth/classroom.courses.readonly`,
//! `.../auth/classroom.coursework.me.readonly`,
//! `.../auth/classroom.courseworkmaterials.readonly`,
//! `.../auth/classroom.announcements.readonly`.

use serde::Deserialize;

use crate::error::IngestionError;

pub const AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
/// NOTE: `classroom.courseworkmaterials.readonly` was added for
/// `fetch_coursework_materials` (materials aren't covered by
/// `classroom.coursework.me.readonly` — that scope is for coursework
/// specifically, materials are Classroom's own separate resource with
/// its own scope). Same caveat as `google_calendar::SCOPE`'s doc
/// comment: anyone who connected Classroom before this change needs to
/// disconnect and reconnect once — a previously issued token doesn't
/// retroactively gain scope.
pub const SCOPE: &str = "https://www.googleapis.com/auth/classroom.courses.readonly \
https://www.googleapis.com/auth/classroom.coursework.me.readonly \
https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly \
https://www.googleapis.com/auth/classroom.announcements.readonly";

#[derive(Debug, Clone, PartialEq)]
pub struct ClassroomCourse {
    pub course_id: String,
    pub name: String,
    pub section: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ClassroomCoursework {
    pub course_id: String,
    pub coursework_id: String,
    pub title: String,
    pub due_at: Option<String>,
    pub state: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ClassroomAnnouncement {
    pub course_id: String,
    pub announcement_id: String,
    pub text: Option<String>,
    pub posted_at: Option<String>,
}

/// One item from Classroom's `courseWorkMaterials` resource — reference
/// content (slides, readings, links, files) a teacher posts that isn't
/// an assignment (no due date, nothing to submit) and isn't a feed-style
/// announcement. `material_type` is a best-effort label taken from
/// whichever attachment kind Classroom's `materials[]` array reports
/// first (`driveFile`, `link`, `youTubeVideo`, `form`) — informational
/// only, never parsed further.
#[derive(Debug, Clone, PartialEq)]
pub struct ClassroomMaterial {
    pub course_id: String,
    pub material_id: String,
    pub title: String,
    pub material_type: Option<String>,
    pub posted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CoursesResponse {
    courses: Option<Vec<CourseDto>>,
}
#[derive(Debug, Deserialize)]
struct CourseDto {
    id: String,
    name: String,
    section: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CourseWorkResponse {
    #[serde(rename = "courseWork")]
    course_work: Option<Vec<CourseWorkDto>>,
}
#[derive(Debug, Deserialize)]
struct CourseWorkDto {
    id: String,
    title: String,
    #[serde(rename = "dueDate")]
    due_date: Option<DueDate>,
    #[serde(rename = "dueTime")]
    due_time: Option<DueTime>,
    state: Option<String>,
    #[serde(rename = "creationTime")]
    creation_time: Option<String>,
    materials: Option<Vec<MaterialAttachmentDto>>,
}
#[derive(Debug, Deserialize)]
struct DueDate {
    year: i64,
    month: i64,
    day: i64,
}
#[derive(Debug, Deserialize)]
struct DueTime {
    hours: Option<i64>,
    minutes: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct AnnouncementsResponse {
    announcements: Option<Vec<AnnouncementDto>>,
}
#[derive(Debug, Deserialize)]
struct AnnouncementDto {
    id: String,
    text: Option<String>,
    #[serde(rename = "creationTime")]
    creation_time: Option<String>,
    materials: Option<Vec<MaterialAttachmentDto>>,
}

#[derive(Debug, Deserialize)]
struct CourseWorkMaterialsResponse {
    #[serde(rename = "courseWorkMaterial")]
    course_work_material: Option<Vec<CourseWorkMaterialDto>>,
}
#[derive(Debug, Deserialize)]
struct CourseWorkMaterialDto {
    id: String,
    title: String,
    #[serde(rename = "creationTime")]
    creation_time: Option<String>,
    materials: Option<Vec<MaterialAttachmentDto>>,
}
/// Only the attachment *kind* is read (for `material_type`) — never
/// the file/link contents themselves, matching this connector's
/// read-only, metadata-only discipline throughout. Each variant is a
/// distinct JSON key Classroom sets depending on what was attached;
/// `#[serde(default)]` on every field means an unrecognized/future
/// attachment shape just parses to "no kind identified" rather than
/// failing the whole response.
#[derive(Debug, Deserialize)]
struct MaterialAttachmentDto {
    #[serde(rename = "driveFile", default)]
    drive_file: Option<serde_json::Value>,
    #[serde(rename = "youTubeVideo", default)]
    you_tube_video: Option<serde_json::Value>,
    #[serde(default)]
    link: Option<serde_json::Value>,
    #[serde(default)]
    form: Option<serde_json::Value>,
}

impl MaterialAttachmentDto {
    fn kind(&self) -> Option<&'static str> {
        if self.drive_file.is_some() {
            Some("drive_file")
        } else if self.you_tube_video.is_some() {
            Some("youtube")
        } else if self.link.is_some() {
            Some("link")
        } else if self.form.is_some() {
            Some("form")
        } else {
            None
        }
    }

    /// Best-effort per-attachment display name. For `link`/`youTubeVideo`/
    /// `form`, Classroom puts `title` directly on that attachment's own
    /// object. `driveFile` is the odd one out: Classroom wraps the actual
    /// file info one level deeper — `{ "driveFile": { "driveFile": { "id",
    /// "title", ... }, "shareMode": ... } }` — so reading `title` straight
    /// off the outer `driveFile` object (as an earlier version of this
    /// function did) always misses, silently falling back to the parent
    /// coursework/announcement's own title/text instead of the actual
    /// attached file's name. Since most real Classroom materials *are*
    /// Drive files, that fallback was the main cause of materials showing
    /// up with a generic or truncated announcement-text title instead of
    /// their real one. Kept loose the same way `kind()` is: an
    /// unrecognized/future shape just yields `None` (caller falls back to
    /// the parent item's own title) instead of failing the whole response.
    fn title(&self) -> Option<String> {
        if let Some(drive_file) = &self.drive_file {
            return drive_file
                .get("driveFile")
                .and_then(|inner| inner.get("title"))
                .and_then(|v| v.as_str())
                .map(str::to_string);
        }
        let value = self.you_tube_video.as_ref().or(self.link.as_ref()).or(self.form.as_ref())?;
        value.get("title").and_then(|v| v.as_str()).map(str::to_string)
    }
}

/// Turns one coursework/announcement item's `materials[]` attachments
/// into standalone `ClassroomMaterial` rows — this is the "materials
/// aren't only in the dedicated courseWorkMaterials section" fix:
/// a teacher who attaches a reading directly to an assignment or an
/// announcement, instead of posting it as separate course material,
/// still has that reading show up in the Materials list.
///
/// Attachments don't carry their own global ID the way `courseWork`/
/// `courseWorkMaterial`/`announcements` items do, so `material_id` is
/// synthesized as `{parent_kind}:{parent_id}:{index}` — stable across
/// re-syncs as long as Classroom doesn't reorder a given item's
/// attachment list (if it ever does, the practical effect is one
/// upsert landing as a new row instead of updating in place, which
/// just means that attachment's `seen`/`studied` state resets — not
/// data loss, and not expected to happen in practice).
/// Turns one coursework/announcement item's `materials[]` attachments
/// into standalone `ClassroomMaterial` rows — this is the "materials
/// aren't only in the dedicated courseWorkMaterials section" fix:
/// a teacher who attaches a reading directly to an assignment or an
/// announcement, instead of posting it as separate course material,
/// still has that reading show up in the Materials list.
///
/// Attachments don't carry their own global ID the way `courseWork`/
/// `courseWorkMaterial`/`announcements` items do, so `material_id` is
/// synthesized as `{course_id}:{parent_kind}:{parent_id}:{index}` —
/// `course_id` is included specifically so that two attachments in two
/// different courses can never collide even in the (rare, but not
/// impossible — some Classroom test/sandbox tenants issue small,
/// non-globally-unique resource ids) case their `parent_id`s happen to
/// coincide; a same-primary-key collision in `classroom_materials`
/// (`material_id TEXT PRIMARY KEY`) silently overwrites one material
/// with another on upsert, which is exactly the "fewer materials show
/// up than were pulled" symptom this guards against. Otherwise stable
/// across re-syncs as long as Classroom doesn't reorder a given item's
/// attachment list (if it ever does, the practical effect is one
/// upsert landing as a new row instead of updating in place, which
/// just means that attachment's `seen`/`studied` state resets — not
/// data loss, and not expected to happen in practice).
fn materials_from_attachments(
    course_id: &str,
    parent_kind: &str,
    parent_id: &str,
    parent_title: &str,
    posted_at: &Option<String>,
    attachments: &Option<Vec<MaterialAttachmentDto>>,
) -> Vec<ClassroomMaterial> {
    attachments
        .as_ref()
        .map(|list| {
            list.iter()
                .enumerate()
                .map(|(index, attachment)| ClassroomMaterial {
                    course_id: course_id.to_string(),
                    material_id: format!("{course_id}:{parent_kind}:{parent_id}:{index}"),
                    title: attachment.title().unwrap_or_else(|| parent_title.to_string()),
                    material_type: attachment.kind().map(str::to_string),
                    posted_at: posted_at.clone(),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn build_client(access_token: &str) -> Result<reqwest::Client, IngestionError> {
    use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};

    let mut headers = HeaderMap::new();
    let value = HeaderValue::from_str(&format!("Bearer {access_token}"))
        .map_err(|e| IngestionError::Parse(format!("classroom auth header: {e}")))?;
    headers.insert(AUTHORIZATION, value);

    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| IngestionError::Network(format!("classroom client build: {e}")))
}

/// Combines Classroom's separate `dueDate`/`dueTime` objects (time is
/// optional — an assignment can be date-only) into one ISO-8601 instant,
/// matching every other timestamp field in this codebase.
fn format_due(due_date: &Option<DueDate>, due_time: &Option<DueTime>) -> Option<String> {
    let d = due_date.as_ref()?;
    let hour = due_time.as_ref().and_then(|t| t.hours).unwrap_or(0);
    let minute = due_time.as_ref().and_then(|t| t.minutes).unwrap_or(0);
    Some(format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:00Z",
        d.year, d.month, d.day, hour, minute
    ))
}

/// Active courses the authenticated user is enrolled in/teaches —
/// `courseStates=ACTIVE` narrows this to what's actually current, the
/// same "never a full account scan" discipline §1.3 already establishes
/// for GitHub, applied to Classroom's own shape (the scope itself
/// already limits this to the user's own courses, not a domain-wide
/// roster).
pub async fn fetch_courses(access_token: &str) -> Result<Vec<ClassroomCourse>, IngestionError> {
    let client = build_client(access_token)?;
    let url = "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=50";
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| IngestionError::Network(format!("classroom courses: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(IngestionError::AuthExpired("classroom access token rejected".into()));
    }
    if !resp.status().is_success() {
        return Err(IngestionError::Network(format!(
            "classroom courses returned {}",
            resp.status()
        )));
    }

    let parsed: CoursesResponse = resp
        .json()
        .await
        .map_err(|e| IngestionError::Parse(format!("classroom courses payload: {e}")))?;
    Ok(parsed
        .courses
        .unwrap_or_default()
        .into_iter()
        .map(|c| ClassroomCourse {
            course_id: c.id,
            name: c.name,
            section: c.section,
        })
        .collect())
}

/// Assignments + due dates for one course (§1.9's "Assignments, Due
/// dates"), plus any materials attached directly to those assignments
/// (see `materials_from_attachments`'s doc comment — materials aren't
/// only posted through the dedicated courseWorkMaterials resource).
/// The caller (`athena-app`) iterates every course from `fetch_courses`
/// independently — one course's coursework failing does not abort
/// sibling courses, same per-item degrade-path precedent as GitHub's
/// per-repo sync (§1.3/§5).
pub async fn fetch_coursework(
    access_token: &str,
    course_id: &str,
) -> Result<(Vec<ClassroomCoursework>, Vec<ClassroomMaterial>), IngestionError> {
    let client = build_client(access_token)?;
    let url = format!("https://classroom.googleapis.com/v1/courses/{course_id}/courseWork?pageSize=50");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| IngestionError::Network(format!("classroom coursework: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(IngestionError::AuthExpired("classroom access token rejected".into()));
    }
    if !resp.status().is_success() {
        return Err(IngestionError::Network(format!(
            "classroom coursework returned {}",
            resp.status()
        )));
    }

    let parsed: CourseWorkResponse = resp
        .json()
        .await
        .map_err(|e| IngestionError::Parse(format!("classroom coursework payload: {e}")))?;
    let items = parsed.course_work.unwrap_or_default();

    let mut materials = Vec::new();
    for c in &items {
        materials.extend(materials_from_attachments(
            course_id,
            "coursework",
            &c.id,
            &c.title,
            &c.creation_time,
            &c.materials,
        ));
    }

    let coursework = items
        .into_iter()
        .map(|c| ClassroomCoursework {
            course_id: course_id.to_string(),
            coursework_id: c.id,
            title: c.title,
            due_at: format_due(&c.due_date, &c.due_time),
            state: c.state,
        })
        .collect();

    Ok((coursework, materials))
}

/// Announcements for one course (§1.9's "Announcements"), plus any
/// materials attached directly to those announcements (same reasoning
/// as `fetch_coursework`'s doc comment).
pub async fn fetch_announcements(
    access_token: &str,
    course_id: &str,
) -> Result<(Vec<ClassroomAnnouncement>, Vec<ClassroomMaterial>), IngestionError> {
    let client = build_client(access_token)?;
    let url = format!("https://classroom.googleapis.com/v1/courses/{course_id}/announcements?pageSize=50");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| IngestionError::Network(format!("classroom announcements: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(IngestionError::AuthExpired("classroom access token rejected".into()));
    }
    if !resp.status().is_success() {
        return Err(IngestionError::Network(format!(
            "classroom announcements returned {}",
            resp.status()
        )));
    }

    let parsed: AnnouncementsResponse = resp
        .json()
        .await
        .map_err(|e| IngestionError::Parse(format!("classroom announcements payload: {e}")))?;
    let items = parsed.announcements.unwrap_or_default();

    let mut materials = Vec::new();
    for a in &items {
        // Announcements have no `title`, only free-text `text` — fall
        // back to a generic label rather than an empty string when an
        // attachment itself has no title to borrow either.
        let fallback_title = a
            .text
            .as_deref()
            .map(|t| t.chars().take(60).collect::<String>())
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "Announcement attachment".to_string());
        materials.extend(materials_from_attachments(
            course_id,
            "announcement",
            &a.id,
            &fallback_title,
            &a.creation_time,
            &a.materials,
        ));
    }

    let announcements = items
        .into_iter()
        .map(|a| ClassroomAnnouncement {
            course_id: course_id.to_string(),
            announcement_id: a.id,
            text: a.text,
            posted_at: a.creation_time,
        })
        .collect();

    Ok((announcements, materials))
}

/// Reference materials for one course (slides, readings, links, files
/// posted outside of an assignment — Classroom's `courseWorkMaterials`
/// resource, distinct from `courseWork`/announcements). Same per-course,
/// per-item degrade-path precedent as `fetch_coursework`/
/// `fetch_announcements` — the caller iterates every course
/// independently, one course's materials failing doesn't abort others.
pub async fn fetch_coursework_materials(
    access_token: &str,
    course_id: &str,
) -> Result<Vec<ClassroomMaterial>, IngestionError> {
    let client = build_client(access_token)?;
    let url =
        format!("https://classroom.googleapis.com/v1/courses/{course_id}/courseWorkMaterials?pageSize=50");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| IngestionError::Network(format!("classroom materials: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(IngestionError::AuthExpired("classroom access token rejected".into()));
    }
    if !resp.status().is_success() {
        return Err(IngestionError::Network(format!(
            "classroom materials returned {}",
            resp.status()
        )));
    }

    let parsed: CourseWorkMaterialsResponse = resp
        .json()
        .await
        .map_err(|e| IngestionError::Parse(format!("classroom materials payload: {e}")))?;
    Ok(parsed
        .course_work_material
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let material_type = m
                .materials
                .as_ref()
                .and_then(|list| list.iter().find_map(MaterialAttachmentDto::kind))
                .map(str::to_string);
            ClassroomMaterial {
                course_id: course_id.to_string(),
                // Prefixed with `course_id` for the same reason
                // `materials_from_attachments` prefixes its synthesized
                // ids — see that function's doc comment. Classroom's own
                // `courseWorkMaterial.id` is expected to be unique on its
                // own, but this makes the guarantee unconditional rather
                // than assumed.
                material_id: format!("{course_id}:material:{}", m.id),
                title: m.title,
                material_type,
                posted_at: m.creation_time,
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_due_combines_date_and_time() {
        let due_date = Some(DueDate { year: 2026, month: 9, day: 1 });
        let due_time = Some(DueTime { hours: Some(23), minutes: Some(59) });
        assert_eq!(format_due(&due_date, &due_time).as_deref(), Some("2026-09-01T23:59:00Z"));
    }

    #[test]
    fn format_due_defaults_missing_time_to_midnight() {
        let due_date = Some(DueDate { year: 2026, month: 12, day: 25 });
        assert_eq!(format_due(&due_date, &None).as_deref(), Some("2026-12-25T00:00:00Z"));
    }

    #[test]
    fn format_due_is_none_without_a_due_date() {
        assert_eq!(format_due(&None, &None), None);
    }
}
