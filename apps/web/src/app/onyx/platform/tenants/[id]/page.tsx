import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxPlatformShell } from '@/components/onyx-platform-shell';
import { SuspendToggle } from '@/components/onyx-platform-forms';
import { requirePlatformSession, platformApi } from '@/lib/onyx-platform-session';
import {
  Banner, Card, DataTable, Empty, EmptyRow, Icon, Meter, Pill, Score, SectionHead,
  Segmented, State, StatTile, StatusDot, relativeDue,
} from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Institution' };

// ---------------------------------------------------------------------------
// What the platform API returns. Mirrors PlatformService.tenant/tenantPeople/
// tenantAcademics/tenantGrades -- kept narrow on purpose: this page shows an
// operator the shape of somebody else's institution, not its contents in full.
// ---------------------------------------------------------------------------

interface TenantDetail {
  id: number; name: string; slug: string; status: number; plan: string | null;
  created_at: string; members_by_role: Record<string, number>; member_count: number;
  counts: {
    courses: number; assessments: number; assignments: number; enrollments: number;
    programmes: number; batches: number; exams: number; exam_marks: number;
    submissions: number; attempts: number;
  };
}

interface Person {
  user_id: number; name: string; email: string; role: string;
  membership_status: number; account_status: number; joined_at: string;
  batch: { id: number; name: string; code: string } | null;
  programme: { id: number; name: string; code: string } | null;
  enrollment_count: number; teaching_count: number;
}
interface PeoplePayload {
  limit: number; capped: boolean; total: number;
  counts_by_role: Record<string, number>; people: Person[];
}

interface CourseRow {
  id: number; code: string; title: string; credits: number; status: number;
  self_enroll: boolean; programme: string | null;
  enrollment_count: number; faculty_count: number;
}
interface AssignmentRow {
  id: number; title: string; course: { code: string; title: string } | null;
  due_at: string | null; total_points: number; status: string;
  submission_count: number; graded_count: number;
}
interface AssessmentRow {
  id: number; title: string; course: { code: string; title: string } | null;
  closes_at: string | null; status: string; pass_mark: number | null;
  duration_minutes: number; attempt_count: number; submitted_count: number;
}
interface AcademicsPayload {
  limit: number;
  capped: { courses: boolean; assignments: boolean; assessments: boolean };
  courses: CourseRow[]; assignments: AssignmentRow[]; assessments: AssessmentRow[];
}

interface Student { id: number; name: string; email: string }
interface ExamMark {
  id: number; student: Student; exam: { id: number; title: string } | null;
  course: { code: string; title: string } | null;
  final_marks: number; max_marks: number | null; pass_marks: number | null;
  grade: string | null; status: string; recorded_at: string;
}
interface AssessmentGrade {
  id: number; student: Student; assessment: { id: number; title: string } | null;
  course: { code: string; title: string } | null;
  score: number | null; max_score: number; pass_mark: number | null;
  status: string; submitted_at: string | null;
}
interface GradesPayload {
  limit: number; capped: { exam_marks: boolean; assessment_grades: boolean };
  exam_marks: ExamMark[]; assessment_grades: AssessmentGrade[];
  summary: {
    exams: {
      count: number; mean_percent: number | null; mean_marks: number | null;
      pass_rate: number | null; published: number;
    };
    assessments: { count: number; mean_percent: number | null; pass_rate: number | null };
  };
}

interface AdminRow {
  id: number; user_id: number; created_at: string;
  user: { id: number; name: string; email: string } | null;
}

/**
 * A section that failed to load should cost its own table, not the page. An
 * operator looking at a customer in trouble is the worst moment to replace
 * everything with a stack trace, so each read is caught and the section it
 * feeds says so in words.
 */
async function attempt<T>(path: string): Promise<T | null> {
  try {
    return await platformApi<T>(path);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Local presentation. Composed here rather than added to onyx-ui: none of this
// is general enough to belong to every page, and that file is not ours.
// ---------------------------------------------------------------------------

/** A past date in words. relativeDue() answers "when is this due"; this is the other direction. */
function ago(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'Unknown';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 0) return relativeDue(iso).text;
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return days + ' days ago';
  if (days < 365) {
    const months = Math.round(days / 30);
    return months === 1 ? 'A month ago' : months + ' months ago';
  }
  const years = Math.round(days / 365);
  return years === 1 ? 'A year ago' : years + ' years ago';
}

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/** Never colour alone: the dot has a word beside it and the word carries the meaning. */
function AccountState({ status }: { status: number }) {
  return status === 1
    ? <State tone="on">Active</State>
    : <State tone="off">Disabled</State>;
}

const WORKFLOW: Record<string, { label: string; tone: 'neutral' | 'good' | 'soon' | 'late' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'good' },
  closed: { label: 'Closed', tone: 'neutral' },
  entered: { label: 'Entered', tone: 'soon' },
  moderated: { label: 'Moderated', tone: 'soon' },
  cancelled: { label: 'Cancelled', tone: 'late' },
  completed: { label: 'Completed', tone: 'good' },
  scheduled: { label: 'Scheduled', tone: 'neutral' },
};
function Workflow({ status }: { status: string }) {
  const s = WORKFLOW[status] ?? { label: status, tone: 'neutral' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

function DueCell({ at }: { at: string | null }) {
  const due = relativeDue(at);
  return <Pill tone={due.tone}>{due.text}</Pill>;
}

/** A fact in the right rail. Label above, value below, never wider than the rail. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px]">{children}</dd>
    </div>
  );
}

/** One table failed while the rest of the page did not. Say which, and why it is empty. */
function Unavailable({ what }: { what: string }) {
  return (
    <Banner tone="warn" icon="alert">
      The {what} for this institution could not be loaded just now. Nothing has been
      changed — reload the page to try again.
    </Banner>
  );
}

const SCROLLER = 'min-w-0';

// ---------------------------------------------------------------------------

/** One institution's shape, as an operator sees it -- not as a member of it. */
export default async function OnyxPlatformTenantPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePlatformSession();
  const { id } = await params;
  const base = '/api/onyx/platform/tenants/' + encodeURIComponent(id);

  // The tenant read is the page: if it 404s there is nothing to draw, so it is
  // the one that is allowed to throw. Everything else degrades to its own
  // "could not load" strip.
  const tenant = await platformApi<TenantDetail>(base);
  const [people, academics, grades, admins] = await Promise.all([
    attempt<PeoplePayload>(base + '/people'),
    attempt<AcademicsPayload>(base + '/academics'),
    attempt<GradesPayload>(base + '/grades'),
    attempt<AdminRow[]>('/api/onyx/platform/admins'),
  ]);

  const roster = people?.people ?? [];
  const students = roster.filter((p) => p.role === 'student');
  const faculty = roster.filter((p) => p.role === 'faculty');
  const staff = roster.filter((p) => !['student', 'faculty'].includes(p.role));
  const courses = academics?.courses ?? [];
  const assignments = academics?.assignments ?? [];
  const assessments = academics?.assessments ?? [];
  const examMarks = grades?.exam_marks ?? [];
  const assessmentGrades = grades?.assessment_grades ?? [];
  const gradeCount = examMarks.length + assessmentGrades.length;

  const live = tenant.status === 1;
  const capped = [
    people?.capped ? 'people' : null,
    academics?.capped.courses ? 'courses' : null,
    academics?.capped.assignments ? 'assignments' : null,
    academics?.capped.assessments ? 'assessments' : null,
    grades?.capped.exam_marks ? 'exam marks' : null,
    grades?.capped.assessment_grades ? 'assessment grades' : null,
  ].filter(Boolean) as string[];

  const studentCount = tenant.members_by_role.student ?? 0;
  const facultyCount = tenant.members_by_role.faculty ?? 0;
  const passRate = grades?.summary.exams.pass_rate ?? null;

  return (
    <OnyxPlatformShell
      email={session.email}
      title={tenant.name}
      subtitle={plural(tenant.member_count, 'member') + ' · '
        + plural(tenant.counts.courses, 'course')}
    >
      <div className="min-w-0 space-y-6">
        <Link href="/onyx/platform"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted
                     hover:text-brand-700 hover:underline">
          &larr; Every institution
        </Link>

        {/* Identity. Who this is, where they live, whether they can sign in --
            and the one destructive control, next to the state it changes
            rather than parked at the bottom of the page. */}
        <Card className={'p-4 ' + (live ? '' : 'border-red-300 bg-red-50/60')}>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Icon name="building" className="h-5 w-5 text-brand-600" />
                <h2 className="min-w-0 break-words text-[17px] font-bold leading-tight">
                  {tenant.name}
                </h2>
                <StatusDot on={live} />
              </div>
              <p className="mt-1.5 break-all font-mono text-[12.5px] text-muted">
                {tenant.slug} &middot; #{tenant.id}
              </p>
              <p className="mt-1.5 max-w-prose text-[13px] text-muted">
                {live
                  ? 'Everyone at this institution can sign in.'
                  : 'Nobody at this institution can sign in. Their data is untouched.'}
              </p>
            </div>
            <div className="shrink-0">
              <SuspendToggle tenantId={tenant.id} suspended={!live} />
            </div>
          </div>
        </Card>

        {capped.length > 0 ? (
          <Banner tone="info" icon="list">
            This institution is larger than one page. Showing the first{' '}
            {people?.limit ?? 200} rows of {capped.join(', ')} — the counts above are the
            true totals, the tables below are a window onto them.
          </Banner>
        ) : null}

        {/* The headline four. Everything else on the page is these numbers
            with names attached. */}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Students" value={studentCount}
            note={plural(tenant.counts.enrollments, 'enrolment')} />
          <StatTile label="Faculty" value={facultyCount}
            note={plural(tenant.counts.programmes, 'programme')} />
          <StatTile label="Courses" value={tenant.counts.courses}
            note={plural(tenant.counts.batches, 'batch', 'batches')} />
          <StatTile label="Assessments" value={tenant.counts.assessments}
            note={plural(tenant.counts.assignments, 'assignment')} />
        </div>

        <Segmented items={[
          { label: 'Students', href: '#students', count: students.length },
          { label: 'Faculty', href: '#faculty', count: faculty.length },
          { label: 'Courses', href: '#courses', count: courses.length },
          { label: 'Assignments', href: '#assignments', count: assignments.length },
          { label: 'Grades', href: '#grades', count: gradeCount },
        ]} />

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          {/* ---------------------------------------------------------------
              The drill-in itself: one stacked section per thing an operator
              might have opened this institution to look at.
              --------------------------------------------------------------- */}
          <div className="min-w-0 space-y-6">
            <section className="min-w-0">
              <SectionHead id="students" title={'Students · ' + students.length} />
              {people === null ? <Unavailable what="roll" /> : (
                <div tabIndex={0} role="region" aria-label="Students" className={SCROLLER}>
                  <DataTable
                    caption="Students at this institution, with their batch and how much they are enrolled in."
                    head={
                      <>
                        <th scope="col">Student</th>
                        <th scope="col">Batch</th>
                        <th scope="col">Programme</th>
                        <th scope="col">Enrolments</th>
                        <th scope="col">Account</th>
                        <th scope="col">Joined</th>
                      </>
                    }
                  >
                    {students.length === 0 ? (
                      <EmptyRow colSpan={6} icon="users">
                        No students yet. A new institution starts with its administrator and
                        nobody else — students arrive once someone invites or imports them.
                      </EmptyRow>
                    ) : students.map((p) => (
                      <tr key={p.user_id} className="align-top">
                        <td>
                          <div className="font-semibold">{p.name}</div>
                          <div className="break-all text-[12.5px] text-muted">{p.email}</div>
                        </td>
                        <td>{p.batch
                          ? <Pill tone="brand">{p.batch.code}</Pill>
                          : <span className="text-[12.5px] text-muted">Unassigned</span>}
                        </td>
                        <td className="text-[13px]">
                          {p.programme?.name ?? <span className="text-muted">—</span>}
                        </td>
                        <td className="tabular-nums">{p.enrollment_count}</td>
                        <td><AccountState status={p.account_status} /></td>
                        <td className="whitespace-nowrap text-[12.5px] text-muted">
                          {ago(p.joined_at)}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              )}
            </section>

            <section className="min-w-0">
              <SectionHead id="faculty" title={'Faculty · ' + faculty.length} />
              {people === null ? <Unavailable what="staff list" /> : (
                <div tabIndex={0} role="region" aria-label="Faculty" className={SCROLLER}>
                  <DataTable
                    caption="Teaching staff at this institution and how many courses each one is attached to."
                    head={
                      <>
                        <th scope="col">Member</th>
                        <th scope="col">Role</th>
                        <th scope="col">Courses</th>
                        <th scope="col">Account</th>
                        <th scope="col">Joined</th>
                      </>
                    }
                  >
                    {faculty.length === 0 ? (
                      <EmptyRow colSpan={5} icon="user">
                        Nobody teaches here yet. Courses can exist without faculty, but
                        nothing on them will be marked until somebody is attached.
                      </EmptyRow>
                    ) : faculty.map((p) => (
                      <tr key={p.user_id} className="align-top">
                        <td>
                          <div className="font-semibold">{p.name}</div>
                          <div className="break-all text-[12.5px] text-muted">{p.email}</div>
                        </td>
                        <td><Pill tone="brand">{p.role}</Pill></td>
                        <td className="tabular-nums">{p.teaching_count}</td>
                        <td><AccountState status={p.account_status} /></td>
                        <td className="whitespace-nowrap text-[12.5px] text-muted">
                          {ago(p.joined_at)}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              )}
            </section>

            <section className="min-w-0">
              <SectionHead id="courses" title={'Courses · ' + courses.length} />
              {academics === null ? <Unavailable what="course list" /> : (
                <div tabIndex={0} role="region" aria-label="Courses" className={SCROLLER}>
                  <DataTable
                    caption="Courses this institution runs, with credits and how many people are on each."
                    head={
                      <>
                        <th scope="col">Course</th>
                        <th scope="col">Programme</th>
                        <th scope="col">Credits</th>
                        <th scope="col">Enrolled</th>
                        <th scope="col">Faculty</th>
                        <th scope="col">Status</th>
                      </>
                    }
                  >
                    {courses.length === 0 ? (
                      <EmptyRow colSpan={6} icon="book">
                        No courses. This institution has been created but nothing has been
                        set up to teach yet.
                      </EmptyRow>
                    ) : courses.map((c) => (
                      <tr key={c.id} className="align-top">
                        <td>
                          <div className="font-mono text-[12.5px] font-semibold text-brand-700">
                            {c.code}
                          </div>
                          <div className="font-semibold">{c.title}</div>
                        </td>
                        <td className="text-[13px]">
                          {c.programme ?? <span className="text-muted">—</span>}
                        </td>
                        <td className="tabular-nums">{c.credits}</td>
                        <td className="tabular-nums">{c.enrollment_count}</td>
                        <td className="tabular-nums">{c.faculty_count}</td>
                        <td>
                          {c.status === 1
                            ? <State tone="on">Open</State>
                            : <State tone="idle">Draft</State>}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              )}
            </section>

            <section className="min-w-0">
              <SectionHead id="assignments"
                title={'Assignments · ' + assignments.length} />
              {academics === null ? <Unavailable what="assignment list" /> : (
                <div tabIndex={0} role="region" aria-label="Assignments" className={SCROLLER}>
                  <DataTable
                    caption="Assignments set at this institution, when they are due and how much has come back."
                    head={
                      <>
                        <th scope="col">Assignment</th>
                        <th scope="col">Course</th>
                        <th scope="col">Due</th>
                        <th scope="col">Out of</th>
                        <th scope="col">Submitted</th>
                        <th scope="col">Status</th>
                      </>
                    }
                  >
                    {assignments.length === 0 ? (
                      <EmptyRow colSpan={6} icon="edit">
                        Nothing has been set. Assignments belong to a course, so this stays
                        empty until this institution has one with work on it.
                      </EmptyRow>
                    ) : assignments.map((a) => (
                      <tr key={a.id} className="align-top">
                        <td className="font-semibold">{a.title}</td>
                        <td className="font-mono text-[12.5px]">
                          {a.course?.code ?? <span className="font-sans text-muted">—</span>}
                        </td>
                        <td><DueCell at={a.due_at} /></td>
                        <td className="tabular-nums">{a.total_points}</td>
                        <td className="whitespace-nowrap tabular-nums">
                          {a.submission_count}
                          <span className="text-[12.5px] text-muted">
                            {' '}({a.graded_count} graded)
                          </span>
                        </td>
                        <td><Workflow status={a.status} /></td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              )}
            </section>

            <section className="min-w-0">
              <SectionHead id="assessments"
                title={'Assessments · ' + assessments.length} />
              {academics === null ? <Unavailable what="assessment list" /> : (
                <div tabIndex={0} role="region" aria-label="Assessments" className={SCROLLER}>
                  <DataTable
                    caption="Assessments at this institution, when they close and how many attempts have been sat."
                    head={
                      <>
                        <th scope="col">Assessment</th>
                        <th scope="col">Course</th>
                        <th scope="col">Closes</th>
                        <th scope="col">Attempts</th>
                        <th scope="col">Status</th>
                      </>
                    }
                  >
                    {assessments.length === 0 ? (
                      <EmptyRow colSpan={5} icon="award">
                        No assessments. Nothing here has been put in front of a candidate yet.
                      </EmptyRow>
                    ) : assessments.map((a) => (
                      <tr key={a.id} className="align-top">
                        <td>
                          <div className="font-semibold">{a.title}</div>
                          <div className="text-[12.5px] text-muted">
                            {a.duration_minutes} min
                            {a.pass_mark == null ? '' : ' · pass ' + a.pass_mark}
                          </div>
                        </td>
                        <td className="font-mono text-[12.5px]">
                          {a.course?.code ?? <span className="font-sans text-muted">—</span>}
                        </td>
                        <td><DueCell at={a.closes_at} /></td>
                        <td className="whitespace-nowrap tabular-nums">
                          {a.attempt_count}
                          <span className="text-[12.5px] text-muted">
                            {' '}({a.submitted_count} sat)
                          </span>
                        </td>
                        <td><Workflow status={a.status} /></td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              )}
            </section>

            {/* Results. Reading these is audited on the API side -- the page
                says so, because an operator should know that looking at
                somebody else's marks leaves a trace with their name on it. */}
            <section className="min-w-0">
              <SectionHead id="grades" title={'Recent grades · ' + gradeCount} />
              {grades === null ? <Unavailable what="results" /> : (
                <div className="min-w-0 space-y-3">
                  <Banner tone="info" icon="shield">
                    Reading this institution&rsquo;s results is recorded in the platform
                    audit log against {session.email}.
                  </Banner>

                  {grades.summary.exams.count > 0 ? (
                    <Card className="p-4">
                      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[.08em]
                                        text-muted">
                            Cohort mean
                          </p>
                          <p className="mt-1 text-[22px] font-bold tabular-nums">
                            {grades.summary.exams.mean_percent ?? '—'}
                            <span className="text-[13px] font-semibold text-muted">%</span>
                          </p>
                          <p className="text-[12.5px] text-muted">
                            {grades.summary.exams.mean_marks ?? '—'} marks average
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[.08em]
                                        text-muted">
                            Marks counted
                          </p>
                          <p className="mt-1 text-[22px] font-bold tabular-nums">
                            {grades.summary.exams.count}
                          </p>
                          <p className="text-[12.5px] text-muted">
                            {grades.summary.exams.published} published
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[.08em]
                                        text-muted">
                            Pass rate
                          </p>
                          {passRate == null ? (
                            <p className="mt-1 text-[13px] text-muted">
                              No pass mark recorded, so there is no pass rate to give.
                            </p>
                          ) : (
                            <>
                              {/* The number is the answer; the bar only makes it
                                  quicker to compare. Never the bar alone. */}
                              <p className="mt-1 text-[22px] font-bold tabular-nums">
                                {passRate}
                                <span className="text-[13px] font-semibold text-muted">%</span>
                              </p>
                              <div className="mt-1.5">
                                <Meter percent={passRate} tone="dark"
                                  label={'Pass rate ' + passRate + '%'} />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 text-[12.5px] text-muted">
                        Computed over the {grades.summary.exams.count} most recent marks
                        shown below, not the institution&rsquo;s whole history.
                      </p>
                    </Card>
                  ) : null}

                  <div tabIndex={0} role="region" aria-label="Recent grades"
                    className={SCROLLER}>
                    <DataTable
                      caption="The most recent marks recorded at this institution, with the student, what it was for and the grade."
                      head={
                        <>
                          <th scope="col">Student</th>
                          <th scope="col">For</th>
                          <th scope="col">Course</th>
                          <th scope="col">Mark</th>
                          <th scope="col">Grade</th>
                          <th scope="col">Status</th>
                          <th scope="col">Recorded</th>
                        </>
                      }
                    >
                      {gradeCount === 0 ? (
                        <EmptyRow colSpan={7} icon="trophy">
                          Nothing has been marked. Results appear once an exam has been sat
                          and its marks entered, or an assessment attempt has been scored.
                        </EmptyRow>
                      ) : (
                        <>
                          {examMarks.map((m) => (
                            <tr key={'exam-' + m.id} className="align-top">
                              <td>
                                <div className="font-semibold">{m.student.name}</div>
                                <div className="break-all text-[12.5px] text-muted">
                                  {m.student.email}
                                </div>
                              </td>
                              <td>
                                <div className="font-semibold">
                                  {m.exam?.title ?? 'Exam'}
                                </div>
                                <div className="text-[12.5px] text-muted">Exam</div>
                              </td>
                              <td className="font-mono text-[12.5px]">
                                {m.course?.code
                                  ?? <span className="font-sans text-muted">—</span>}
                              </td>
                              <td>
                                <Score value={m.final_marks} outOf={m.max_marks ?? undefined} />
                              </td>
                              <td className="font-semibold tabular-nums">
                                {m.grade ?? <span className="font-normal text-muted">—</span>}
                              </td>
                              <td><Workflow status={m.status} /></td>
                              <td className="whitespace-nowrap text-[12.5px] text-muted">
                                {ago(m.recorded_at)}
                              </td>
                            </tr>
                          ))}
                          {assessmentGrades.map((g) => (
                            <tr key={'attempt-' + g.id} className="align-top">
                              <td>
                                <div className="font-semibold">{g.student.name}</div>
                                <div className="break-all text-[12.5px] text-muted">
                                  {g.student.email}
                                </div>
                              </td>
                              <td>
                                <div className="font-semibold">
                                  {g.assessment?.title ?? 'Assessment'}
                                </div>
                                <div className="text-[12.5px] text-muted">Assessment</div>
                              </td>
                              <td className="font-mono text-[12.5px]">
                                {g.course?.code
                                  ?? <span className="font-sans text-muted">—</span>}
                              </td>
                              <td>
                                {g.score == null
                                  ? <span className="text-[12.5px] text-muted">Unmarked</span>
                                  : <Score value={g.score} outOf={g.max_score || undefined} />}
                              </td>
                              <td className="text-muted">—</td>
                              <td><Workflow status={g.status} /></td>
                              <td className="whitespace-nowrap text-[12.5px] text-muted">
                                {ago(g.submitted_at)}
                              </td>
                            </tr>
                          ))}
                        </>
                      )}
                    </DataTable>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* -----------------------------------------------------------------
              The right rail: the facts about the customer that do not belong
              in any one table -- who they are on the platform, what they hold,
              and who on our side can reach them.
              ----------------------------------------------------------------- */}
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-[76px] lg:self-start">
            <Card className="p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
                Institution
              </h2>
              <dl className="mt-3 space-y-3">
                <Fact label="Id"><span className="font-mono">#{tenant.id}</span></Fact>
                <Fact label="Address"><span className="font-mono">{tenant.slug}</span></Fact>
                <Fact label="Plan">{tenant.plan ?? 'None recorded'}</Fact>
                <Fact label="Created">{ago(tenant.created_at)}</Fact>
                <Fact label="Status">
                  {live ? <State tone="on">Active</State> : <State tone="off">Suspended</State>}
                </Fact>
              </dl>
            </Card>

            <Card className="p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
                Members &middot; {tenant.member_count}
              </h2>
              {tenant.member_count === 0 ? (
                <div className="mt-2">
                  <Empty icon="users">Nobody has joined yet.</Empty>
                </div>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {Object.entries(tenant.members_by_role)
                    .sort((a, b) => b[1] - a[1])
                    .map(([role, count]) => (
                      <li key={role}
                        className="flex min-w-0 items-center justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate capitalize">{role}</span>
                        <span className="shrink-0 font-semibold tabular-nums">{count}</span>
                      </li>
                    ))}
                </ul>
              )}
              {staff.length > 0 ? (
                <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted">
                  Includes {plural(staff.length, 'non-teaching account')}:{' '}
                  {[...new Set(staff.map((p) => p.role))].sort().join(', ')}.
                </p>
              ) : null}
            </Card>

            <Card className="p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
                Records
              </h2>
              <dl className="mt-3 space-y-3">
                <Fact label="Enrolments">{tenant.counts.enrollments}</Fact>
                <Fact label="Submissions">{tenant.counts.submissions}</Fact>
                <Fact label="Exams">
                  {tenant.counts.exams} scheduled &middot; {tenant.counts.exam_marks} marks
                </Fact>
                <Fact label="Attempts">{tenant.counts.attempts}</Fact>
              </dl>
            </Card>

            <Card className="p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
                Platform admins
              </h2>
              {admins === null || admins.length === 0 ? (
                <div className="mt-2">
                  <Empty icon="shield">Not reachable from here.</Empty>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {admins.map((a) => (
                    <li key={a.id} className="min-w-0 text-[13px]">
                      <div className="truncate font-semibold">
                        {a.user?.name ?? 'Account #' + a.user_id}
                      </div>
                      <div className="break-all text-[12.5px] text-muted">
                        {a.user?.email ?? '—'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted">
                Everyone listed can read this institution and suspend it.
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </OnyxPlatformShell>
  );
}
