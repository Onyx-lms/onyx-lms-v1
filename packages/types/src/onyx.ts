/**
 * Onyx database types.
 *
 * Hand-written rather than generated: the Onyx schema is designed here rather
 * than derived from a Laravel source, so there is nothing to generate FROM.
 * Keep it in step with supabase/onyx/migrations/.
 */

export type Role = 'student' | 'faculty' | 'exams' | 'placement' | 'admin';

export interface TenantRow {
  id: number;
  name: string;
  slug: string;
  status: number;
  plan: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnyxUserRow {
  id: number;
  email: string;
  name: string;
  password: string | null;
  phone: string | null;
  photo: string | null;
  status: number;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: number;
  tenant_id: number;
  user_id: number;
  role: Role;
  status: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: number;
  tenant_id: number;
  actor_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  created_at: string;
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

/**
 * Onyx tables share `public` with the Laravel port's 61 ported tables, kept
 * apart by the `onyx_` prefix. See docs/ADR-006-onyx-foundation.md.
 */
export interface OnyxDatabase {
  public: {
    Tables: {
      onyx_tenants: Table<TenantRow>;
      onyx_users: Table<OnyxUserRow>;
      onyx_memberships: Table<MembershipRow>;
      onyx_audit_logs: Table<AuditLogRow>;
      onyx_programs: Table<ProgramRow>;
      onyx_semesters: Table<SemesterRow>;
      onyx_batches: Table<BatchRow>;
      onyx_batch_members: Table<BatchMemberRow>;
      onyx_courses: Table<OnyxCourseRow>;
      onyx_course_faculty: Table<CourseFacultyRow>;
      onyx_enrollments: Table<OnyxEnrollmentRow>;
      onyx_modules: Table<ModuleRow>;
      onyx_lessons: Table<OnyxLessonRow>;
      onyx_lesson_progress: Table<LessonProgressRow>;
      onyx_resources: Table<ResourceRow>;
      onyx_attendance_sessions: Table<AttendanceSessionRow>;
      onyx_attendance_records: Table<AttendanceRecordRow>;
      onyx_assignments: Table<AssignmentRow>;
      onyx_rubric_criteria: Table<RubricCriterionRow>;
      onyx_assignment_submissions: Table<SubmissionRow>;
      onyx_submission_scores: Table<SubmissionScoreRow>;
      onyx_jobs: Table<JobRow>;
      onyx_problems: Table<ProblemRow>;
      onyx_problem_tests: Table<ProblemTestRow>;
      onyx_hints: Table<HintRow>;
      onyx_hint_reveals: Table<HintRevealRow>;
      onyx_code_submissions: Table<CodeSubmissionRow>;
      onyx_submission_cases: Table<SubmissionCaseRow>;
      onyx_workspaces: Table<WorkspaceRow>;
      onyx_workspace_files: Table<WorkspaceFileRow>;
      onyx_workspace_snapshots: Table<WorkspaceSnapshotRow>;
      onyx_workspace_comments: Table<WorkspaceCommentRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// ---------------------------------------------------------------------------
// O02 -- Onyx Learn
// ---------------------------------------------------------------------------

export type LessonType = 'video' | 'document' | 'text' | 'link';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type AttendanceMethod = 'manual' | 'qr';
export type LatePolicy = 'reject' | 'accept' | 'penalty';
export type SubmissionStatus = 'draft' | 'submitted' | 'graded' | 'returned';

export interface ProgramRow {
  id: number; tenant_id: number; name: string; code: string;
  description: string | null; duration_semesters: number; status: number;
  created_at: string; updated_at: string;
}

export interface SemesterRow {
  id: number; tenant_id: number; program_id: number; name: string; number: number;
  starts_on: string | null; ends_on: string | null; status: number;
  created_at: string; updated_at: string;
}

export interface BatchRow {
  id: number; tenant_id: number; program_id: number; name: string; code: string;
  year: number | null; status: number; created_at: string; updated_at: string;
}

export interface BatchMemberRow {
  id: number; tenant_id: number; batch_id: number; user_id: number; created_at: string;
}

export interface OnyxCourseRow {
  id: number; tenant_id: number; program_id: number | null; semester_id: number | null;
  code: string; title: string; slug: string; description: string | null;
  credits: number; self_enroll: number; status: number; created_by: number | null;
  created_at: string; updated_at: string;
}

export interface CourseFacultyRow {
  id: number; tenant_id: number; course_id: number; user_id: number; created_at: string;
}

export interface OnyxEnrollmentRow {
  id: number; tenant_id: number; course_id: number; user_id: number;
  batch_id: number | null; status: number; enrolled_by: number | null;
  created_at: string; updated_at: string;
}

export interface ModuleRow {
  id: number; tenant_id: number; course_id: number; title: string;
  summary: string | null; sort: number; created_at: string; updated_at: string;
}

export interface OnyxLessonRow {
  id: number; tenant_id: number; course_id: number; module_id: number;
  title: string; type: LessonType; path: string | null; body: string | null;
  duration_seconds: number; sort: number; is_preview: number;
  created_at: string; updated_at: string;
}

export interface LessonProgressRow {
  id: number; tenant_id: number; course_id: number; lesson_id: number; user_id: number;
  position_seconds: number; completed_at: string | null;
  created_at: string; updated_at: string;
}

export interface ResourceRow {
  id: number; tenant_id: number; course_id: number; lesson_id: number | null;
  title: string; path: string; mime: string | null; size_bytes: number | null;
  created_by: number | null; created_at: string;
}

export interface AttendanceSessionRow {
  id: number; tenant_id: number; course_id: number; title: string;
  scheduled_at: string; duration_minutes: number; status: string;
  qr_secret: string | null; qr_window_seconds: number;
  created_by: number | null; created_at: string; updated_at: string;
}

export interface AttendanceRecordRow {
  id: number; tenant_id: number; session_id: number; user_id: number;
  status: AttendanceStatus; method: AttendanceMethod; note: string | null;
  marked_by: number | null; marked_at: string;
}

export interface AssignmentRow {
  id: number; tenant_id: number; course_id: number; title: string;
  instructions: string | null; attachment_path: string | null; due_at: string | null;
  total_points: number; late_policy: LatePolicy; late_penalty_percent: number;
  allow_resubmission: number; status: string; created_by: number | null;
  created_at: string; updated_at: string;
}

export interface RubricCriterionRow {
  id: number; tenant_id: number; assignment_id: number; title: string;
  description: string | null; points: number; sort: number; created_at: string;
}

export interface SubmissionRow {
  id: number; tenant_id: number; assignment_id: number; user_id: number;
  body: string | null; file_path: string | null; status: SubmissionStatus;
  attempt: number; submitted_at: string | null; is_late: number;
  score: number | null; feedback: string | null; graded_by: number | null;
  graded_at: string | null; returned_at: string | null;
  created_at: string; updated_at: string;
}

export interface SubmissionScoreRow {
  id: number; tenant_id: number; submission_id: number; criterion_id: number;
  points: number; comment: string | null; created_at: string;
}

// ---------------------------------------------------------------------------
// O03 -- Onyx Code Lab
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type SubmissionMode = 'run' | 'submit';

export interface JobRow {
  id: number; tenant_id: number; kind: string; payload: unknown;
  status: JobStatus; attempts: number; max_attempts: number;
  run_after: string; locked_at: string | null; locked_by: string | null;
  last_error: string | null; created_at: string; updated_at: string;
}

export interface ProblemRow {
  id: number; tenant_id: number; course_id: number | null;
  title: string; slug: string; statement: string | null;
  difficulty: string; topic: string | null; tags: unknown; languages: unknown;
  starter_code: unknown; time_limit_ms: number; memory_limit_kb: number;
  solution: string | null; solution_rule: string;
  solution_after_attempts: number; solution_after: string | null;
  status: string; created_by: number | null;
  created_at: string; updated_at: string;
}

export interface ProblemTestRow {
  id: number; tenant_id: number; problem_id: number; name: string;
  stdin: string | null; expected_stdout: string | null;
  is_hidden: number; weight: number; sort: number; created_at: string;
}

export interface HintRow {
  id: number; tenant_id: number; problem_id: number; body: string;
  sort: number; penalty_percent: number; created_at: string;
}

export interface HintRevealRow {
  id: number; tenant_id: number; hint_id: number; problem_id: number;
  user_id: number; created_at: string;
}

export interface CodeSubmissionRow {
  id: number; tenant_id: number; problem_id: number; user_id: number;
  language: string; source: string; mode: SubmissionMode; status: JobStatus;
  score: number; max_score: number; passed: number; total: number;
  compile_output: string | null; error: string | null;
  runtime_ms: number | null; memory_kb: number | null;
  queued_at: string; graded_at: string | null;
}

export interface SubmissionCaseRow {
  id: number; tenant_id: number; submission_id: number; test_id: number | null;
  name: string; is_hidden: number; passed: number; weight: number;
  runtime_ms: number | null; memory_kb: number | null;
  stdout: string | null; error: string | null; created_at: string;
}

export interface WorkspaceRow {
  id: number; tenant_id: number; course_id: number | null; user_id: number;
  title: string; language: string; entry_path: string;
  created_at: string; updated_at: string;
}

export interface WorkspaceFileRow {
  id: number; tenant_id: number; workspace_id: number;
  path: string; content: string; updated_at: string;
}

export interface WorkspaceSnapshotRow {
  id: number; tenant_id: number; workspace_id: number; label: string;
  files: unknown; created_by: number | null; created_at: string;
}

export interface WorkspaceCommentRow {
  id: number; tenant_id: number; workspace_id: number;
  snapshot_id: number | null; file_path: string | null; line: number | null;
  body: string; author_id: number | null;
  resolved_at: string | null; created_at: string;
}
