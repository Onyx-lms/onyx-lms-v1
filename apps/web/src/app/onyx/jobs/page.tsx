import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { Empty, ListRow, Pill, RowList, SectionHead } from '@/components/onyx-ui';
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
      {/* A job post is something you read and apply to, so the row leads with
          the role and ends with the action. "Applied" is the state that
          changes what a learner does next, so it is a chip, not grey text. */}
      <RowList label="Open roles">
        {jobs.map((j) => (
          <ListRow
            key={j.id}
            icon="briefcase"
            tone={applied.has(j.id) ? 'good' : 'brand'}
            title={j.title}
            href={'/onyx/jobs/' + j.id}
            chips={
              <>
                {applied.has(j.id) ? <Pill tone="good">Applied</Pill> : null}
                {j.status !== 'open' ? (
                  <Pill tone="neutral">{j.status[0]!.toUpperCase() + j.status.slice(1)}</Pill>
                ) : null}
              </>
            }
            meta={
              <span className="flex flex-wrap items-center gap-x-3">
                <span>{j.location ?? 'Location not stated'}</span>
                <span className="tabular-nums">
                  {j.openings} {j.openings === 1 ? 'opening' : 'openings'}
                </span>
              </span>
            }
            action={{ href: '/onyx/jobs/' + j.id,
              label: applied.has(j.id) ? 'View' : 'See the role' }}
          />
        ))}
        {jobs.length === 0 ? (
          <li>
            <Empty icon="briefcase">
              Nothing is open at the moment. Roles your institution shares appear here.
            </Empty>
          </li>
        ) : null}
      </RowList>

      {mine?.length ? (
        <section className="mt-8">
          <SectionHead title="Your applications" />
          <RowList label="Your applications">
            {mine.map((a) => (
              <ListRow
                key={a.id}
                icon={a.status === 'offered' ? 'award'
                  : a.status === 'rejected' ? 'flag' : 'briefcase'}
                tone={a.status === 'offered' ? 'good'
                  : a.status === 'rejected' ? 'late' : 'neutral'}
                title={a.job?.title ?? 'A role'}
                meta={APPLICATION_LABELS[a.status] ?? a.status}
                chips={a.status === 'offered' ? <Pill tone="good">Offer</Pill> : null}
              />
            ))}
          </RowList>
        </section>
      ) : null}
    </OnyxShell>
  );
}
