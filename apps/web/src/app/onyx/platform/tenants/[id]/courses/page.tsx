import type { Metadata } from 'next';
import { requirePlatformSession } from '@/lib/onyx-platform-session';
import { attempt, SCROLLER, Unavailable, type AcademicsPayload } from '@/lib/onyx-platform-tenant';
import { CreateCourseForm, CourseEditToggle } from '@/components/onyx-platform-forms';
import { DataTable, EmptyRow, State } from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Courses' };

export default async function OnyxPlatformCoursesPage(
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePlatformSession();
  const { id } = await params;
  const tenantId = Number(id);
  const academics = await attempt<AcademicsPayload>(
    '/api/onyx/platform/tenants/' + encodeURIComponent(id) + '/academics?limit=200');
  const courses = academics?.courses ?? [];

  return (
    <div className="min-w-0 space-y-4">
      <CreateCourseForm tenantId={tenantId} />

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
                <th scope="col">&nbsp;</th>
              </>
            }
          >
            {courses.length === 0 ? (
              <EmptyRow colSpan={7} icon="book">
                No courses. This institution has been created but nothing has been
                set up to teach yet.
              </EmptyRow>
            ) : courses.map((c) => (
              <tr key={c.id} className="align-top">
                <td>
                  <div className="font-mono text-[12.5px] font-semibold text-brand-700">{c.code}</div>
                  <div className="font-semibold">{c.title}</div>
                </td>
                <td className="text-[13px]">{c.programme ?? <span className="text-muted">—</span>}</td>
                <td className="tabular-nums">{c.credits}</td>
                <td className="tabular-nums">{c.enrollment_count}</td>
                <td className="tabular-nums">{c.faculty_count}</td>
                <td>
                  {c.status === 1 ? <State tone="on">Open</State> : <State tone="idle">Draft</State>}
                </td>
                <td className="text-right"><CourseEditToggle tenantId={tenantId} course={c} /></td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
    </div>
  );
}
