import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Batch, Course, Semester } from '@/lib/onyx-learn';
import type { FacultyAllocation, WorkloadRow } from '@/lib/onyx-campus';
import { CreatePanel } from '@/components/onyx-create';
import { SemesterPicker } from '@/components/onyx-manage';
import { StatTile, Empty, Pill } from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Teaching allocation' };

const KIND_LABEL: Record<string, string> = {
  lead: 'Lead', assistant: 'Assistant', lab: 'Lab',
};

/**
 * CMP-01a -- faculty allocation and teaching load.
 *
 * "Programs, batches, faculty allocation and the institutional console that
 * ties them together", against an acceptance criterion of "an institution can
 * run a term without touching the database". Allocation was the one part of
 * that sentence with no screen: the endpoints existed and nothing called them,
 * so assigning a lecturer to a course meant a POST by hand.
 *
 * The page is built around the question a head of department actually asks --
 * who is carrying twenty hours and who is carrying four -- so the workload roll
 * up comes first and the allocation list second. A term is chosen rather than
 * assumed: allocation is always "for this semester", never in general.
 */
export default async function OnyxAllocationsPage(
  { searchParams }: { searchParams: Promise<{ semester?: string }> },
) {
  await requireOnyxPageRole('admin', 'faculty');
  const { semester: asked } = await searchParams;

  const [me, semesters, courses, batches, members] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Semester[]>('/api/onyx/semesters'),
    onyxApiSafe<Course[]>('/api/onyx/courses'),
    onyxApiSafe<Batch[]>('/api/onyx/batches'),
    onyxApiSafe<{ user_id: number; role: string; user: { name: string; email: string } | null }[]>(
      '/api/onyx/members'),
  ]);

  // The asked-for term, if it is one of this institution's; otherwise the
  // newest. Falling back rather than erroring keeps a stale bookmark useful.
  const chosen = semesters.find((s) => String(s.id) === asked)
    ?? [...semesters].sort((a, b) => b.id - a.id)[0];

  const [allocations, workload] = chosen
    ? await Promise.all([
      onyxApiSafe<FacultyAllocation[]>('/api/onyx/allocations?semester_id=' + chosen.id),
      onyxApiSafe<WorkloadRow[]>('/api/onyx/semesters/' + chosen.id + '/workload'),
    ])
    : [null, null];

  const teachers = (members ?? []).filter((m) => m.role === 'faculty' || m.role === 'admin');
  const names = new Map((members ?? []).map((m) => [Number(m.user_id), m.user]));
  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));
  const batchById = new Map((batches ?? []).map((b) => [b.id, b]));

  const rows = workload ?? [];
  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
  // Nobody allocated anything is not the same as nobody teaching zero hours,
  // so an unallocated faculty member is listed rather than left out.
  const unallocated = teachers.filter((t) => !rows.some((r) => r.user_id === Number(t.user_id)));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Teaching allocation"
      subtitle={chosen ? chosen.name : 'No semesters have been defined yet.'}
      action={chosen ? (
        <CreatePanel
          title="Allocate teaching" cta="Allocate teaching" icon="users"
          endpoint="allocations"
          fields={[
            { name: 'semester_id', label: 'Semester', type: 'select', required: true,
              numeric: true, wide: true, fallback: chosen.id,
              options: semesters.map((s) => ({ value: String(s.id), label: s.name })) },
            { name: 'course_id', label: 'Course', type: 'select', required: true,
              numeric: true, wide: true,
              options: (courses ?? []).map((c) => ({
                value: String(c.id), label: c.code + ' — ' + c.title,
              })) },
            { name: 'user_id', label: 'Who teaches it', type: 'select', required: true,
              numeric: true, wide: true,
              options: teachers.map((m) => ({
                value: String(m.user_id), label: m.user?.name ?? 'User ' + m.user_id,
              })) },
            { name: 'batch_id', label: 'Batch', type: 'select', numeric: true,
              options: (batches ?? []).map((b) => ({ value: String(b.id), label: b.name })),
              help: 'Optional. Leave blank when the whole cohort is taught together.' },
            { name: 'kind', label: 'Role', type: 'select', fallback: 'lead',
              options: ['lead', 'assistant', 'lab']
                .map((k) => ({ value: k, label: KIND_LABEL[k] ?? k })) },
            { name: 'hours_per_week', label: 'Hours per week', type: 'number',
              min: 0, max: 60, fallback: 3,
              help: 'What the workload figures add up.' },
          ]}
        />
      ) : undefined}
    >
      {semesters.length === 0 ? (
        <Empty icon="calendar">
          A term has to exist before anyone can be allocated to it.{' '}
          <Link href="/onyx/programs" className="font-medium text-brand-700 underline">
            Add a semester
          </Link>
        </Empty>
      ) : (
        <>
          <div className="mb-6">
            <SemesterPicker
              semesters={semesters.map((s) => ({ id: s.id, name: s.name }))}
              selected={chosen!.id}
            />
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatTile label="Allocations" value={allocations?.length ?? 0}
              note={'in ' + chosen!.name} />
            <StatTile label="Hours allocated" value={totalHours} note="per week, all staff" />
            <StatTile label="Nobody allocated" value={unallocated.length}
              note="faculty with no teaching this term" />
          </div>

          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Teaching load
          </h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Teaching load per person for {chosen!.name}</caption>
              <thead className="border-b border-line bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[.06em] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Who</th>
                  <th scope="col" className="px-4 py-3">Courses</th>
                  <th scope="col" className="px-4 py-3">Hours per week</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.user_id}>
                    <td className="px-4 py-3 font-medium">
                      {r.name ?? names.get(r.user_id)?.name ?? 'User ' + r.user_id}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.courses}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{r.hours}</td>
                  </tr>
                ))}
                {unallocated.map((t) => (
                  <tr key={'none-' + t.user_id} className="text-muted">
                    <td className="px-4 py-3">{t.user?.name ?? 'User ' + t.user_id}</td>
                    <td className="px-4 py-3 tabular-nums">0</td>
                    <td className="px-4 py-3 tabular-nums">0</td>
                  </tr>
                ))}
                {rows.length === 0 && unallocated.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted">
                      Nobody at this institution holds a teaching role yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-muted">
            Allocations
          </h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Every allocation in {chosen!.name}</caption>
              <thead className="border-b border-line bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[.06em] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Course</th>
                  <th scope="col" className="px-4 py-3">Who</th>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Batch</th>
                  <th scope="col" className="px-4 py-3">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(allocations ?? []).map((a) => {
                  const course = courseById.get(a.course_id);
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-3">
                        {course ? (
                          <Link href={'/onyx/courses/' + a.course_id}
                            className="font-medium text-brand-700 hover:underline">
                            {course.code} — {course.title}
                          </Link>
                        ) : ('Course ' + a.course_id)}
                      </td>
                      <td className="px-4 py-3">
                        {names.get(a.user_id)?.name ?? 'User ' + a.user_id}
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={a.kind === 'lead' ? 'brand' : 'neutral'}>
                          {KIND_LABEL[a.kind] ?? a.kind}
                        </Pill>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {a.batch_id ? (batchById.get(a.batch_id)?.name ?? 'Batch ' + a.batch_id) : 'All'}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{a.hours_per_week}</td>
                    </tr>
                  );
                })}
                {(allocations ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted">
                      Nothing has been allocated for {chosen!.name} yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </OnyxShell>
  );
}
