import type { Metadata } from 'next';
import { requirePlatformSession, platformApi } from '@/lib/onyx-platform-session';
import {
  attempt, ago, SCROLLER, TenantBackLink, Unavailable, Workflow, type GradesPayload,
} from '@/lib/onyx-platform-tenant';
import { ExamMarkEditToggle, AssessmentGradeActions } from '@/components/onyx-platform-forms';
import { Banner, Card, DataTable, EmptyRow, Meter, Score } from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Grades' };

/**
 * Results, read from outside the institution -- CMP-02's "moderate, publish,
 * transcript" trail lands here. Reading this is audited on the API side
 * (see PlatformService.tenantGrades()), which is why the banner below says so.
 */
export default async function OnyxPlatformGradesPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePlatformSession();
  const { id } = await params;
  const tenantId = Number(id);
  const grades = await attempt<GradesPayload>(
    '/api/onyx/platform/tenants/' + encodeURIComponent(id) + '/grades?limit=200');
  const examMarks = grades?.exam_marks ?? [];
  const assessmentGrades = grades?.assessment_grades ?? [];
  const gradeCount = examMarks.length + assessmentGrades.length;
  const passRate = grades?.summary.exams.pass_rate ?? null;

  return (
    <div className="min-w-0 space-y-3">
      <TenantBackLink tenantId={tenantId} />
      {grades === null ? <Unavailable what="results" /> : (
        <>
          <Banner tone="info" icon="shield">
            Reading this institution&rsquo;s results is recorded in the platform audit log
            against {session.email}.
          </Banner>

          {grades.summary.exams.count > 0 ? (
            <Card className="p-4">
              <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
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
                  <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
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
                  <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
                    Pass rate
                  </p>
                  {passRate == null ? (
                    <p className="mt-1 text-[13px] text-muted">
                      No pass mark recorded, so there is no pass rate to give.
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-[22px] font-bold tabular-nums">
                        {passRate}<span className="text-[13px] font-semibold text-muted">%</span>
                      </p>
                      <div className="mt-1.5">
                        <Meter percent={passRate} tone="dark" label={'Pass rate ' + passRate + '%'} />
                      </div>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-3 text-[12.5px] text-muted">
                Computed over the {grades.summary.exams.count} most recent marks shown below, not
                the institution&rsquo;s whole history.
              </p>
            </Card>
          ) : null}

          <div tabIndex={0} role="region" aria-label="Recent grades" className={SCROLLER}>
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
                  <th scope="col">&nbsp;</th>
                </>
              }
            >
              {gradeCount === 0 ? (
                <EmptyRow colSpan={8} icon="trophy">
                  Nothing has been marked. Results appear once an exam has been sat and its
                  marks entered, or an assessment attempt has been scored.
                </EmptyRow>
              ) : (
                <>
                  {examMarks.map((m) => (
                    <tr key={'exam-' + m.id} className="align-top">
                      <td>
                        <div className="font-semibold">{m.student.name}</div>
                        <div className="break-all text-[12.5px] text-muted">{m.student.email}</div>
                      </td>
                      <td>
                        <div className="font-semibold">{m.exam?.title ?? 'Exam'}</div>
                        <div className="text-[12.5px] text-muted">Exam</div>
                      </td>
                      <td className="font-mono text-[12.5px]">
                        {m.course?.code ?? <span className="font-sans text-muted">—</span>}
                      </td>
                      <td><Score value={m.final_marks} outOf={m.max_marks ?? undefined} /></td>
                      <td className="font-semibold tabular-nums">
                        {m.grade ?? <span className="font-normal text-muted">—</span>}
                      </td>
                      <td><Workflow status={m.status} /></td>
                      <td className="whitespace-nowrap text-[12.5px] text-muted">
                        {ago(m.recorded_at)}
                      </td>
                      <td className="text-right">
                        <ExamMarkEditToggle tenantId={tenantId} markId={m.id}
                          rawMarks={m.raw_marks} finalMarks={m.final_marks} />
                      </td>
                    </tr>
                  ))}
                  {assessmentGrades.map((g) => (
                    <tr key={'attempt-' + g.id} className="align-top">
                      <td>
                        <div className="font-semibold">{g.student.name}</div>
                        <div className="break-all text-[12.5px] text-muted">{g.student.email}</div>
                      </td>
                      <td>
                        <div className="font-semibold">{g.assessment?.title ?? 'Assessment'}</div>
                        <div className="text-[12.5px] text-muted">Assessment</div>
                      </td>
                      <td className="font-mono text-[12.5px]">
                        {g.course?.code ?? <span className="font-sans text-muted">—</span>}
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
                      <td className="text-right">
                        <AssessmentGradeActions tenantId={tenantId} attemptId={g.id}
                          score={g.score} maxScore={g.max_score} />
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </DataTable>
          </div>
        </>
      )}
    </div>
  );
}
