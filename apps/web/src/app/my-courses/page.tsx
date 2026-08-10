import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSession, apiAuthSafe } from '@/lib/session';
import { DashboardShell } from '@/components/dashboard-shell';
import { STUDENT_NAV } from '@/lib/nav';

export const metadata: Metadata = { title: 'My courses' };

interface EnrolledCourse {
  id: number; enrollment_id: number; title: string | null; slug: string | null;
  thumbnail: string | null; progress: number; completed: boolean;
  expired: boolean; expiry_date: string | null;
}

export default async function MyCoursesPage() {
  const session = await requireSession();
  const courses = (await apiAuthSafe<EnrolledCourse[]>('/api/me/courses')) ?? [];

  return (
    <DashboardShell role={session.app_role} email={session.email}
      nav={STUDENT_NAV} title="My courses">
      {courses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center">
          <p className="text-sm text-slate-600">You are not enrolled in any courses yet.</p>
          <Link href="/courses" className="btn-primary mt-4">Browse the catalogue</Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <article key={c.enrollment_id} className="card flex flex-col p-4">
              <h2 className="font-semibold leading-snug">{c.title}</h2>

              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-600"
                    style={{ width: `${Math.min(100, c.progress)}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{c.progress}% complete</p>
              </div>

              {c.expired && (
                <p className="mt-2 text-xs text-red-600">
                  Access expired. You need to buy it again.
                </p>
              )}

              <div className="mt-auto pt-4">
                <Link
                  href={c.expired ? `/course/${c.slug}` : `/play-course/${c.slug}`}
                  className={c.expired ? 'btn-ghost w-full' : 'btn-primary w-full'}
                >
                  {c.expired ? 'View course' : c.progress > 0 ? 'Continue' : 'Start learning'}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
