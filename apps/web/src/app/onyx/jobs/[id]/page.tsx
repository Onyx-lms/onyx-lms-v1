import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxApplicants, OnyxApply } from '@/components/onyx-career';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { isPlacementStaff, type Application, type JobPost } from '@/lib/onyx-career';

export const metadata: Metadata = { title: 'Job' };

/** CAR-04b -- one post: the brief, and either applying or the pipeline. */
export default async function OnyxJobPage({ params }: { params: Promise<{ id: string }> }) {
  const claims = await requireOnyxSession();
  const { id } = await params;
  const [me, job] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<JobPost>('/api/onyx/jobs/' + id),
  ]);

  const canSeePipeline = claims.tenant_role === 'employer'
    || isPlacementStaff(claims.tenant_role);
  const [applicants, mine] = await Promise.all([
    canSeePipeline
      ? onyxApiSafe<Application[]>('/api/onyx/jobs/' + id + '/applicants')
      : null,
    claims.tenant_role === 'student'
      ? onyxApiSafe<Application[]>('/api/onyx/my/applications')
      : null,
  ]);

  // The names come with the applicants, not from the roster: an employer must
  // not be able to list the institution's people, only the ones who applied.
  const names = Object.fromEntries((applicants ?? [])
    .map((a) => [a.user_id, a.candidate?.name ?? ('User ' + a.user_id)]));
  const alreadyApplied = (mine ?? []).some((a) => a.job_id === Number(id));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={job.title}
      subtitle={[job.location, job.compensation].filter(Boolean).join(' · ') || undefined}
    >
      <Link href="/onyx/jobs" className="text-sm text-slate-600 hover:underline">
        &larr; All jobs
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {job.description ? (
            <article className="whitespace-pre-wrap text-sm text-slate-700">
              {job.description}
            </article>
          ) : null}

          {canSeePipeline ? (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Applicants
              </h2>
              <div className="mt-3">
                <OnyxApplicants
                  jobId={Number(id)}
                  applicants={(applicants ?? []).map((a) => ({
                    id: a.id, user_id: a.user_id, status: a.status,
                    created_at: a.created_at, readiness_at_apply: a.readiness_at_apply,
                  }))}
                  names={names}
                />
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          {claims.tenant_role === 'student' ? (
            <section className="rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Can you apply?
              </h2>
              <div className="mt-3">
                <OnyxApply job={job} eligibility={job.eligibility} applied={alreadyApplied} />
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 p-4 text-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">Requirements</div>
            <ul className="mt-2 space-y-1 text-slate-700">
              {job.min_readiness !== null
                ? <li>Readiness at least {job.min_readiness}</li> : null}
              {job.min_attendance !== null
                ? <li>Attendance at least {job.min_attendance}%</li> : null}
              {(job.required_skills ?? []).length
                ? <li>{job.required_skills.length} required skill
                  {job.required_skills.length === 1 ? '' : 's'}</li> : null}
              {job.closes_at
                ? <li>Closes {new Date(job.closes_at).toLocaleDateString()}</li> : null}
              {job.min_readiness === null && job.min_attendance === null
                && !(job.required_skills ?? []).length
                ? <li>Open to everyone at this institution.</li> : null}
            </ul>
          </section>
        </aside>
      </div>
    </OnyxShell>
  );
}
