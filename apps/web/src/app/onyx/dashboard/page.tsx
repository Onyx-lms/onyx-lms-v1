import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor, ROLE_LABELS } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { isStaff, type Assignment, type Course } from '@/lib/onyx-learn';

export const metadata: Metadata = { title: 'Dashboard' };

interface AttendanceLine {
  course_id: number; held: number; attended: number; percent: number; below_threshold: boolean;
}

/**
 * F-07 / LRN-01b -- what someone sees when they arrive.
 *
 * The proposal's claim for Onyx Learn is that "every learner always knows what
 * to do next", so for a learner this page is that list: what is due, and where
 * attendance has slipped. For staff it is the shape of the institution.
 *
 * Everything comes from /api/onyx/*, which reads the tenant from the token.
 * There is no institution id in the URL to change.
 */
export default async function OnyxDashboard() {
  await requireOnyxSession();
  const me = await onyxApi<Me>('/api/onyx/me');
  const staff = isStaff(me.role);

  const [courses, attendance, roster] = await Promise.all([
    onyxApiSafe<Course[]>('/api/onyx/my/courses'),
    staff ? null : onyxApiSafe<AttendanceLine[]>('/api/onyx/my/attendance'),
    staff ? onyxApiSafe<{ role: string }[]>('/api/onyx/members') : null,
  ]);
  const mine = courses ?? [];

  // Only a learner's own courses are searched for deadlines, so this is the
  // work they have actually been set rather than everything in the catalog.
  const assignmentLists = await Promise.all(mine.map((c) =>
    onyxApiSafe<Assignment[]>('/api/onyx/courses/' + c.id + '/assignments')
      .then((list) => (list ?? []).map((a) => ({ ...a, course: c })))));

  const now = Date.now();
  const due = assignmentLists.flat()
    .filter((a) => a.status === 'published' && a.due_at && Date.parse(a.due_at) > now)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))
    .slice(0, 6);

  const counts = (roster ?? []).reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1;
    return acc;
  }, {});
  const shortfall = (attendance ?? []).filter((a) => a.below_threshold);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={me.tenant.name}
      subtitle={'Signed in as ' + ROLE_LABELS[me.role].toLowerCase() + '.'}
    >
      <div className="space-y-8">
        {staff ? (
          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">People</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(['student', 'faculty', 'exams', 'placement', 'employer', 'admin'] as const).map((role) => (
                <div key={role} className="rounded-xl border border-slate-200 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {ROLE_LABELS[role]}
                  </div>
                  <div className="mt-1 text-2xl font-semibold">{counts[role] ?? 0}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            {staff ? 'Your courses' : 'What you are taking'}
          </h2>
          {mine.length ? (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {mine.map((c) => (
                <li key={c.id} className="rounded-xl border border-slate-200 p-4">
                  <Link href={'/onyx/courses/' + c.id} className="font-medium hover:underline">
                    {c.title}
                  </Link>
                  <div className="text-xs text-slate-500">{c.code}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              Nothing yet.{' '}
              <Link href="/onyx/courses" className="text-brand-600 hover:underline">
                Look at the catalog
              </Link>.
            </p>
          )}
        </section>

        {due.length ? (
          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              What is due next
            </h2>
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {due.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex-1">
                    <Link href={'/onyx/assignments/' + a.id} className="hover:underline">
                      {a.title}
                    </Link>
                    <span className="block text-xs text-slate-500">{a.course.title}</span>
                  </span>
                  <span className="text-xs text-slate-600">
                    {new Date(a.due_at!).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {shortfall.length ? (
          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Attendance
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {shortfall.map((a) => {
                const course = mine.find((c) => c.id === a.course_id);
                return (
                  <li key={a.course_id} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                    {course?.title ?? 'A course'}: {a.percent}% ({a.attended} of {a.held})
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {me.memberships.length > 1 ? (
          <p className="text-sm text-slate-600">
            You belong to {me.memberships.length} institutions. Use the switcher to move
            between them &mdash; each one shows only its own people and records.
          </p>
        ) : null}
      </div>
    </OnyxShell>
  );
}
