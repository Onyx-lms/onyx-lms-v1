import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxStartAssessment } from '@/components/onyx-sit';
import { OnyxPublishResults } from '@/components/onyx-marking';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { isExamsStaff, type Assessment, type MyAttempt } from '@/lib/onyx-assess';

export const metadata: Metadata = { title: 'Assessment' };

/** ASS-01b -- the front of a paper: what it is, and the button to start it. */
export default async function OnyxAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const claims = await requireOnyxSession();
  const { id } = await params;
  const [me, assessment] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Assessment>('/api/onyx/assessments/' + id),
  ]);
  const staff = isExamsStaff(claims.tenant_role);
  const mine = staff ? null : await onyxApiSafe<MyAttempt[]>('/api/onyx/my/assessments');
  const attempts = (mine ?? []).filter((a) => a.assessment_id === Number(id));
  const live = attempts.find((a) => a.status === 'in_progress');
  const now = Date.now();
  const open = (!assessment.opens_at || Date.parse(assessment.opens_at) <= now)
    && (!assessment.closes_at || Date.parse(assessment.closes_at) >= now);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={assessment.title}
      subtitle={assessment.duration_minutes + ' minutes'
        + (assessment.pass_mark !== null ? ', pass mark ' + assessment.pass_mark : '')}
    >
      <Link href="/onyx/assessments" className="text-sm text-slate-600 hover:underline">
        &larr; All assessments
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {assessment.instructions ? (
            <article className="whitespace-pre-wrap text-sm text-slate-700">
              {assessment.instructions}
            </article>
          ) : null}

          {staff ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-3">
                <Link href={'/onyx/assessments/' + id + '/marking'}
                  className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50">
                  Marking
                </Link>
                <Link href={'/onyx/assessments/' + id + '/results'}
                  className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50">
                  Results and item analysis
                </Link>
              </div>
              <OnyxPublishResults
                assessmentId={Number(id)}
                published={Boolean(assessment.results_published_at)}
                moderationRequired={Boolean(assessment.moderation_required)}
              />
            </div>
          ) : live ? (
            <Link href={'/onyx/attempts/' + live.attempt_id}
              className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium
                         text-white hover:bg-slate-800">
              Carry on with your attempt
            </Link>
          ) : attempts.length >= assessment.attempts_allowed ? (
            <p className="text-sm text-slate-600">
              You have used all your attempts.
              {attempts.some((a) => a.results_published)
                ? ' Your result is on the assessments page.'
                : ' Results will appear once they are published.'}
            </p>
          ) : !open ? (
            <p className="text-sm text-slate-600">
              {assessment.opens_at && Date.parse(assessment.opens_at) > now
                ? 'This opens ' + new Date(assessment.opens_at).toLocaleString() + '.'
                : 'This assessment has closed.'}
            </p>
          ) : (
            <OnyxStartAssessment assessment={assessment} />
          )}
        </div>

        <aside className="space-y-4 text-sm">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Rules</div>
            <ul className="mt-2 space-y-1 text-slate-700">
              <li>{assessment.duration_minutes} minutes, timed by the server.</li>
              <li>{assessment.attempts_allowed} attempt{assessment.attempts_allowed === 1 ? '' : 's'}.</li>
              {assessment.proctoring ? <li>Monitored, with your consent.</li> : null}
              {assessment.anonymous_marking ? <li>Marked without your name attached.</li> : null}
              {assessment.moderation_required ? <li>Moderated before results are released.</li> : null}
            </ul>
          </div>
        </aside>
      </div>
    </OnyxShell>
  );
}
