import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { APPLICATION_LABELS, type Application, type JobPost } from '@/lib/onyx-career';
import { CreatePanel } from '@/components/onyx-create';

export const metadata: Metadata = { title: 'Jobs' };

/**
 * CAR-04b -- the job board.
 *
 * The list itself is scoped by the API: an employer gets their own posts, a
 * learner gets the open ones, placement gets everything. This page renders
 * whichever it was given.
 */
export default async function OnyxJobsPage() {
  const claims = await requireOnyxSession();
  const [me, jobs] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<JobPost[]>('/api/onyx/jobs'),
  ]);
  // CAR-04: a post belongs to an employer, and there was no way to record one.
  // Only the placement office may read employer contacts, so this is fetched
  // for them and quietly skipped for everybody else.
  const canPost = me.role === 'placement' || me.role === 'admin' || me.role === 'employer';
  const employers = canPost
    ? await onyxApiSafe<{ id: number; name: string }[]>('/api/onyx/employers')
    : null;
  const mine = claims.tenant_role === 'student'
    ? await onyxApiSafe<Application[]>('/api/onyx/my/applications')
    : null;
  const applied = new Set((mine ?? []).map((a) => a.job_id));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Jobs"
      subtitle={me.role === 'employer'
        ? 'Your posts at ' + me.tenant.name + '.'
        : 'Openings shared with this institution.'}
    >
      {/* CAR-04: "employers must post jobs". The placement office keeps the
          employer records, so both can open a post. */}
      {canPost ? (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          <CreatePanel
            title="New employer" cta="Add an employer" icon="building" compact
            endpoint="employers"
            fields={[
              { name: 'name', label: 'Company', required: true, wide: true,
                placeholder: 'Acme Corp' },
              { name: 'contact_name', label: 'Contact' },
              { name: 'contact_email', label: 'Contact email' },
              { name: 'website', label: 'Website', placeholder: 'https://acme.example' },
            ]}
          />
          {/* A post is created as a draft, and a draft is invisible to the
              learners it is for. Opening it is the point of posting it, so it
              happens in the same action rather than as a second step nobody
              knew about. */}
          <CreatePanel
            title="New opening" cta="Post a job" icon="briefcase" compact
            endpoint="jobs" thenPost="jobs/:id/publish"
            fields={[
              { name: 'employer_id', label: 'Employer', type: 'select', required: true,
                numeric: true, wide: true,
                options: (employers ?? []).map((e) => ({ value: String(e.id), label: e.name })) },
              { name: 'title', label: 'Role', required: true, wide: true,
                placeholder: 'Junior Developer' },
              { name: 'description', label: 'Description', type: 'textarea', rows: 3 },
              { name: 'location', label: 'Location', placeholder: 'Bengaluru' },
              { name: 'openings', label: 'Openings', type: 'number', min: 1, max: 1000,
                fallback: 1 },
              { name: 'closes_at', label: 'Closes', type: 'datetime' },
            ]}
          />
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Where</th>
              <th className="px-4 py-3">Openings</th>
              <th className="px-4 py-3">State</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={'/onyx/jobs/' + j.id} className="hover:underline">{j.title}</Link>
                  {applied.has(j.id)
                    ? <span className="ml-2 text-xs text-emerald-700">applied</span>
                    : null}
                </td>
                <td className="px-4 py-3 text-muted">{j.location ?? '—'}</td>
                <td className="px-4 py-3 tabular-nums">{j.openings}</td>
                <td className="px-4 py-3 capitalize text-muted">{j.status}</td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Nothing open at the moment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {mine?.length ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Your applications
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {mine.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg border
                                        border-line px-3 py-2">
                <span className="flex-1">{a.job?.title ?? 'A role'}</span>
                <span className="text-muted">
                  {APPLICATION_LABELS[a.status] ?? a.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </OnyxShell>
  );
}
