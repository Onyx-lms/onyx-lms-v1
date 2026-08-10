import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import type { Drive, Employer, JobPost } from '@/lib/onyx-career';

export const metadata: Metadata = { title: 'Placement' };

/**
 * CAR-04 -- the placement office's view.
 *
 * Employers, their posts and the drives, in one place. Deliberately not
 * reachable by an employer: the list of every employer at an institution is the
 * institution's, not one company's.
 */
export default async function OnyxPlacementPage() {
  await requireOnyxPageRole('admin', 'placement');
  const [me, employers, jobs, drives] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Employer[]>('/api/onyx/employers'),
    onyxApi<JobPost[]>('/api/onyx/jobs'),
    onyxApi<Drive[]>('/api/onyx/drives'),
  ]);
  const byEmployer = new Map(employers.map((e) => [e.id, e]));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Placement"
      subtitle="Employers, posts and drives at this institution."
    >
      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Employers</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Portal access</th>
              </tr>
            </thead>
            <tbody>
              {employers.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{e.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.contact_name ?? '—'}
                    {e.contact_email
                      ? <span className="block text-xs">{e.contact_email}</span>
                      : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.user_id ? 'Has a login' : 'No login yet'}
                  </td>
                </tr>
              ))}
              {employers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                    No employers yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Posts</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-3 rounded-lg border
                                      border-slate-200 px-3 py-2">
              <Link href={'/onyx/jobs/' + j.id} className="flex-1 hover:underline">
                {j.title}
              </Link>
              <span className="text-xs text-slate-500">
                {byEmployer.get(j.employer_id)?.name ?? '—'}
              </span>
              <span className="text-xs capitalize text-slate-600">{j.status}</span>
            </li>
          ))}
          {jobs.length === 0 ? <li className="text-slate-500">No posts yet.</li> : null}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Drives</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {drives.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg border
                                      border-slate-200 px-3 py-2">
              <Link href={'/onyx/drives/' + d.id} className="flex-1 hover:underline">
                {d.title}
              </Link>
              <span className="text-xs text-slate-500">
                {byEmployer.get(d.employer_id)?.name ?? '—'}
              </span>
              <span className="text-xs text-slate-600">
                {d.scheduled_at ? new Date(d.scheduled_at).toLocaleDateString() : 'unscheduled'}
              </span>
            </li>
          ))}
          {drives.length === 0 ? <li className="text-slate-500">No drives yet.</li> : null}
        </ul>
      </section>
    </OnyxShell>
  );
}
