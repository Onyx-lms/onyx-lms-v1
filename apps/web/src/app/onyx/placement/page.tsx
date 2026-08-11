import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Drive, Employer, JobPost } from '@/lib/onyx-career';
import { CreatePanel } from '@/components/onyx-create';
import { BuildDrive } from '@/components/onyx-manage';

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

  // CAR-02: a skill on the passport is awarded by somebody, against a source.
  // Both lists come from the institution rather than being typed as ids.
  const [skills, members] = await Promise.all([
    onyxApiSafe<{ id: number; name: string }[]>('/api/onyx/skills'),
    onyxApiSafe<{ user_id: number; role: string; user: { name: string } | null }[]>(
      '/api/onyx/members'),
  ]);
  const learners = (members ?? []).filter((m) => m.role === 'student');

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Placement"
      subtitle="Employers, posts and drives at this institution."
    >
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <BuildDrive employers={employers.map((e) => ({ id: e.id, name: e.name }))}
          jobs={jobs.map((j) => ({ id: j.id, title: j.title }))} />
        <CreatePanel
          title="New skill" cta="Add a skill" icon="award" compact
          endpoint="skills"
          fields={[
            { name: 'name', label: 'Skill', required: true, wide: true,
              placeholder: 'SQL' },
            { name: 'category', label: 'Category', placeholder: 'Data' },
          ]}
        />
        <CreatePanel
          title="Award a skill" cta="Award a skill" icon="award" compact
          endpoint="skills/award"
          fields={[
            { name: 'user_id', label: 'Learner', type: 'select', required: true,
              numeric: true, wide: true,
              options: learners.map((m) => ({ value: String(m.user_id),
                label: m.user?.name ?? 'User ' + m.user_id })) },
            { name: 'skill_id', label: 'Skill', type: 'select', required: true,
              numeric: true, wide: true,
              options: (skills ?? []).map((s) => ({ value: String(s.id), label: s.name })) },
            { name: 'source_type', label: 'Earned through', type: 'select',
              fallback: 'course',
              options: ['course', 'assessment', 'problem', 'workspace', 'certificate', 'contest']
                .map((t) => ({ value: t, label: t })) },
            { name: 'strength', label: 'Strength', type: 'number', min: 0, max: 100,
              fallback: 60,
              help: 'What the passport shows, and what a job post checks against.' },
          ]}
        />
      </div>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Employers</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[.06em] text-muted">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Portal access</th>
              </tr>
            </thead>
            <tbody>
              {employers.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-4 py-3">{e.name}</td>
                  <td className="px-4 py-3 text-muted">
                    {e.contact_name ?? '—'}
                    {e.contact_email
                      ? <span className="block text-xs">{e.contact_email}</span>
                      : null}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {e.user_id ? 'Has a login' : 'No login yet'}
                  </td>
                </tr>
              ))}
              {employers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted">
                    No employers yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Posts</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-3 rounded-lg border
                                      border-line px-3 py-2">
              <Link href={'/onyx/jobs/' + j.id} className="flex-1 hover:underline">
                {j.title}
              </Link>
              <span className="text-xs text-muted">
                {byEmployer.get(j.employer_id)?.name ?? '—'}
              </span>
              <span className="text-xs capitalize text-muted">{j.status}</span>
            </li>
          ))}
          {jobs.length === 0 ? <li className="text-muted">No posts yet.</li> : null}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Drives</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {drives.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg border
                                      border-line px-3 py-2">
              <Link href={'/onyx/drives/' + d.id} className="flex-1 hover:underline">
                {d.title}
              </Link>
              <span className="text-xs text-muted">
                {byEmployer.get(d.employer_id)?.name ?? '—'}
              </span>
              <span className="text-xs text-muted">
                {d.scheduled_at ? new Date(d.scheduled_at).toLocaleDateString() : 'unscheduled'}
              </span>
            </li>
          ))}
          {drives.length === 0 ? <li className="text-muted">No drives yet.</li> : null}
        </ul>
      </section>
    </OnyxShell>
  );
}
