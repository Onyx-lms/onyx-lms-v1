import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import { isStaff, type Course, type Program } from '@/lib/onyx-learn';

export const metadata: Metadata = { title: 'Courses' };

/** LRN-01b -- the catalog, and what this person is enrolled in. */
export default async function OnyxCoursesPage() {
  await requireOnyxSession();
  const [me, courses, mine, programs] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Course[]>('/api/onyx/courses'),
    onyxApi<Course[]>('/api/onyx/my/courses'),
    onyxApi<Program[]>('/api/onyx/programs'),
  ]);

  const byProgram = new Map(programs.map((p) => [p.id, p]));
  const enrolled = new Set(mine.map((c) => c.id));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Courses"
      subtitle={isStaff(me.role)
        ? 'Everything running at ' + me.tenant.name + '.'
        : 'What you are enrolled in, and what else is open.'}
    >
      {mine.length ? (
        <section className="mb-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Your courses
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {mine.map((c) => (
              <li key={c.id} className="rounded-2xl border border-line p-4">
                <Link href={'/onyx/courses/' + c.id} className="font-medium hover:underline">
                  {c.title}
                </Link>
                <div className="text-xs text-muted">
                  {c.code}
                  {c.program_id ? ' · ' + (byProgram.get(c.program_id)?.name ?? '') : ''}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Catalog</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Programme</th>
              <th className="px-4 py-3">Credits</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                <td className="px-4 py-3">
                  <Link href={'/onyx/courses/' + c.id} className="hover:underline">{c.title}</Link>
                  {enrolled.has(c.id)
                    ? <span className="ml-2 text-xs text-emerald-700">enrolled</span>
                    : null}
                  {c.self_enroll && !enrolled.has(c.id)
                    ? <span className="ml-2 text-xs text-muted">open to join</span>
                    : null}
                </td>
                <td className="px-4 py-3 text-muted">
                  {c.program_id ? byProgram.get(c.program_id)?.name ?? '—' : '—'}
                </td>
                <td className="px-4 py-3 tabular-nums">{c.credits}</td>
              </tr>
            ))}
            {courses.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No courses are published yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </OnyxShell>
  );
}
