import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import type { ExamMark, Transcript } from '@/lib/onyx-campus';

export const metadata: Metadata = { title: 'Results' };

const EXAM_STAFF = ['admin', 'exams'];

/**
 * CMP-02c -- your own marks and transcripts.
 *
 * Only published marks ever reach this page: the API enforces that for
 * anyone who is not running examinations, so there is no draft or moderated
 * figure here to be mistaken for a final one.
 */
export default async function OnyxResultsPage() {
  await requireOnyxSession();
  const me = await onyxApi<Me>('/api/onyx/me');
  const staff = EXAM_STAFF.includes(me.role);

  const [marks, transcripts] = await Promise.all([
    onyxApi<ExamMark[]>('/api/onyx/results'),
    onyxApi<Transcript[]>('/api/onyx/transcripts'),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Results"
      subtitle={staff ? 'Your own record.' : 'Published results only.'}
    >
      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Marks</h2>
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">Your published exam marks</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-1 pr-3">Exam</th>
                <th scope="col" className="py-1 pr-3">Mark</th>
                <th scope="col" className="py-1">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {marks.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-3">Exam #{m.exam_id}</td>
                  <td className="py-2 pr-3 tabular-nums">{m.final_marks}</td>
                  <td className="py-2">{m.grade ?? '--'}</td>
                </tr>
              ))}
              {marks.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-center text-muted">
                  No results have been published yet.
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Transcripts</h2>
          <ul className="mt-2 space-y-2">
            {transcripts.map((t) => (
              <li key={t.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="font-medium">{t.serial}</div>
                <div className="mt-0.5 text-xs text-muted">
                  issued {new Date(t.issued_at).toLocaleDateString()}
                  {t.gpa !== null ? ' · GPA ' + t.gpa : ''}
                  {' · '}{t.credits_earned} results
                  {t.revoked_at ? ' · revoked' : ''}
                </div>
              </li>
            ))}
            {transcripts.length === 0 ? (
              <li className="text-sm text-muted">None issued yet.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </OnyxShell>
  );
}
