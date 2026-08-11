import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { AttendanceAnalytics, AttendanceSession, Course } from '@/lib/onyx-learn';
import { Card, Pill, StatTile, Empty } from '@/components/onyx-ui';
import { ThresholdForm } from '@/components/onyx-attendance';

export const metadata: Metadata = { title: 'Attendance' };

/**
 * LRN-03c -- attendance analytics and the export.
 *
 * The acceptance criterion is "per-learner and per-cohort attendance
 * percentages, shortfall flags and export", and until this page existed all
 * three were API-only: the figures a registrar has to act on could be computed
 * but not seen, and the export could not be run by the person who needs it.
 *
 * Shortfall is the point of the screen, so it is what the page opens on and
 * what it sorts by. A list ordered by name buries the four people the report
 * exists to find somewhere in the middle of ninety.
 */
export default async function OnyxCourseAttendancePage(
  { params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ threshold?: string }>;
  },
) {
  await requireOnyxPageRole('admin', 'faculty');
  const { id } = await params;
  const { threshold: raw } = await searchParams;

  // Clamped rather than trusted: the API defaults to 75 and a nonsense query
  // string should land on the default, not on a report of everybody failing.
  const asked = Number(raw);
  const threshold = Number.isFinite(asked) && asked >= 0 && asked <= 100 ? asked : 75;

  const [me, course, analytics, sessions, members] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Course>('/api/onyx/courses/' + id),
    onyxApiSafe<AttendanceAnalytics>(
      '/api/onyx/courses/' + id + '/attendance/analytics?threshold=' + threshold),
    onyxApiSafe<AttendanceSession[]>('/api/onyx/courses/' + id + '/attendance'),
    onyxApiSafe<{ user_id: number; user: { name: string; email: string } | null }[]>(
      '/api/onyx/members'),
  ]);

  const names = new Map((members ?? []).map((m) => [Number(m.user_id), m.user]));
  // Worst first. Within the same percentage, by name, so the order is stable
  // between loads rather than following whatever the roster query returned.
  const learners = [...(analytics?.learners ?? [])].sort((a, b) =>
    a.percent - b.percent
    || (names.get(a.user_id)?.name ?? '').localeCompare(names.get(b.user_id)?.name ?? ''));
  const short = learners.filter((l) => l.below_threshold);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Attendance"
      subtitle={course.code + ' · ' + course.title}
      action={
        <a
          href={'/api/proxy/onyx/courses/' + id + '/attendance/export.csv'}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-2xl bg-brand-600 px-4
                     text-sm font-semibold text-white hover:bg-brand-700"
          // One row per learner per session, so it opens in a spreadsheet as a
          // register rather than as a summary somebody has to re-derive.
          download
        >
          Export CSV
        </a>
      }
    >
      {!analytics || analytics.sessions === 0 ? (
        <Empty icon="calendar">
          No sessions have been held on this course yet, so there is nothing to report.{' '}
          <Link href={'/onyx/courses/' + id} className="font-medium text-brand-700 underline">
            Back to the course
          </Link>
        </Empty>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatTile label="Sessions held" value={analytics.sessions} />
            <StatTile label="Cohort attendance" value={analytics.cohort.percent + '%'}
              note={'across ' + learners.length + ' learners'} />
            <StatTile label="Below threshold" value={analytics.cohort.below}
              note={'under ' + analytics.threshold + '%'} />
          </div>

          <Card className="mb-6 p-4">
            <ThresholdForm courseId={Number(id)} threshold={threshold} />
          </Card>

          {short.length > 0 ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-bold">
                {short.length === 1
                  ? 'One learner is below the threshold'
                  : short.length + ' learners are below the threshold'}
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                Present and late both count as attended. An excused session leaves the
                denominator; a session nobody marked counts as an absence.
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Attendance per learner on {course.title}
              </caption>
              <thead className="border-b border-line bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[.06em] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Learner</th>
                  <th scope="col" className="px-4 py-3">Attended</th>
                  <th scope="col" className="px-4 py-3">Absent</th>
                  <th scope="col" className="px-4 py-3">Excused</th>
                  <th scope="col" className="px-4 py-3">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {learners.map((l) => (
                  <tr key={l.user_id} className={l.below_threshold ? 'bg-red-50/60' : undefined}>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {names.get(l.user_id)?.name ?? 'User ' + l.user_id}
                      </div>
                      <div className="text-xs text-muted">{names.get(l.user_id)?.email ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{l.attended} of {l.held}</td>
                    <td className="px-4 py-3 tabular-nums">{l.absent}</td>
                    <td className="px-4 py-3 tabular-nums">{l.excused}</td>
                    <td className="px-4 py-3">
                      <span className="tabular-nums font-semibold">{l.percent}%</span>
                      {l.below_threshold ? (
                        <span className="ml-2"><Pill tone="late">Shortfall</Pill></span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {learners.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted">
                      Nobody is enrolled in this course yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-muted">
            Sessions
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {(sessions ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <Link href={'/onyx/courses/' + id + '/attendance/' + s.id}
                  className="text-sm font-medium text-brand-700 underline">
                  {s.title}
                </Link>
                <span className="text-xs text-muted">
                  {new Date(s.scheduled_at).toLocaleString()} · {s.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </OnyxShell>
  );
}
