import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSession, apiAuthSafe } from '@/lib/session';
import { apiSafe, type SiteSettings } from '@/lib/api';
import { DashboardShell } from '@/components/dashboard-shell';
import { STUDENT_NAV, INSTRUCTOR_NAV, ADMIN_NAV } from '@/lib/nav';
import { StatTile } from '@/components/stat-tile';
import { currency } from '@/lib/format';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

interface Purchase {
  kind: 'course' | 'bootcamp' | 'team_package' | 'tuition';
  id: number; reference: number; amount: number;
  invoice: string | null; created_at: string | null;
}
interface Summary {
  counts: { courses: number; certificates: number; purchases: number };
  spent: number;
  recent_purchases: Purchase[];
}
interface Enrolled {
  id: number; title: string | null; slug: string | null; progress?: number;
}

const LABEL: Record<Purchase['kind'], string> = {
  course: 'Course', bootcamp: 'Workshop',
  team_package: 'Classroom package', tuition: 'Tuition session',
};

const navFor = (role: string) =>
  role === 'admin' ? ADMIN_NAV : role === 'instructor' ? INSTRUCTOR_NAV : STUDENT_NAV;

/** REV-08 -- the learner's home: what I own, what I finished, what I spent. */
export default async function StudentDashboard() {
  const session = await requireSession();
  const [summary, courses, settings] = await Promise.all([
    apiAuthSafe<Summary>('/api/me/dashboard'),
    apiAuthSafe<Enrolled[]>('/api/me/courses'),
    apiSafe<SiteSettings>('/api/settings'),
  ]);
  const position = settings?.currency_position ?? 'left';
  const enrolled = courses ?? [];

  return (
    <DashboardShell role={session.app_role} email={session.email}
      nav={navFor(session.app_role)} title="Dashboard">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="My courses" value={summary?.counts.courses ?? 0} />
        <StatTile label="Certificates" value={summary?.counts.certificates ?? 0} />
        <StatTile label="Purchases" value={summary?.counts.purchases ?? 0} />
        <StatTile label="Spent" value={currency(summary?.spent ?? 0, position)} />
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Continue learning</h2>
          <Link href="/my-courses" className="text-sm text-brand-600 hover:underline">
            All my courses
          </Link>
        </div>
        {enrolled.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            You are not enrolled in anything yet.{' '}
            <Link href="/courses" className="text-brand-700 underline">Browse courses</Link>
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enrolled.slice(0, 6).map((c) => (
              <li key={c.id} className="card p-4">
                <h3 className="font-medium leading-snug">{c.title}</h3>
                {typeof c.progress === 'number' && (
                  <>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-brand-600"
                        style={{ width: Math.min(100, Math.max(0, c.progress)) + '%' }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{c.progress}% complete</p>
                  </>
                )}
                <Link href={'/play-course/' + c.slug} className="btn-primary mt-3 inline-block text-sm">
                  Continue
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(summary?.recent_purchases.length ?? 0) > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent purchases</h2>
            <Link href="/purchase-history" className="text-sm text-brand-600 hover:underline">
              All purchases
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {summary!.recent_purchases.map((p) => (
              <li key={p.kind + p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{LABEL[p.kind]}</div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.invoice}
                    {p.created_at ? ' - ' + new Date(p.created_at).toLocaleDateString() : ''}
                  </p>
                </div>
                <span className="font-medium">{currency(p.amount, position)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </DashboardShell>
  );
}
