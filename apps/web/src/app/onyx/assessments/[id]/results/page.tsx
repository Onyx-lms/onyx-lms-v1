import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import type { Assessment, ItemStat, ResultsReport } from '@/lib/onyx-assess';

export const metadata: Metadata = { title: 'Results' };

/**
 * ASS-04 -- the score report and the item analysis.
 *
 * Facility and discrimination are shown with the sample size beside them,
 * because a discrimination index from six papers is a number rather than a
 * finding, and hiding that is how a good item gets thrown away.
 */
export default async function OnyxResultsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxPageRole('admin', 'faculty', 'exams');
  const { id } = await params;
  const [me, assessment, report, items] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Assessment>('/api/onyx/assessments/' + id),
    onyxApi<ResultsReport>('/api/onyx/assessments/' + id + '/results'),
    onyxApi<{ sat: number; items: ItemStat[] }>('/api/onyx/assessments/' + id + '/items'),
  ]);

  const stat = (label: string, value: string | number) => (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={'Results: ' + assessment.title}
      subtitle={report.published
        ? 'Published to candidates.'
        : 'Not published — candidates cannot see any of this yet.'}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link href={'/onyx/assessments/' + id} className="text-sm text-slate-600 hover:underline">
          &larr; Back to the assessment
        </Link>
        <a
          href={'/api/proxy/onyx/assessments/' + id + '/results.csv'}
          className="ml-auto rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Export CSV
        </a>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Cohort</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stat('Sat', report.cohort.sat)}
          {stat('Mean', report.cohort.mean + ' / ' + report.cohort.max_score)}
          {stat('Median', report.cohort.median)}
          {stat('Spread', report.cohort.stdev)}
          {report.cohort.pass_rate !== null ? stat('Pass rate', report.cohort.pass_rate + '%') : null}
          {stat('Highest', report.cohort.highest)}
          {stat('Lowest', report.cohort.lowest)}
          {stat('Flagged', report.cohort.flagged)}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Item analysis
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Facility is the proportion who got it right. Discrimination compares the strongest
          and weakest 27% &mdash; a negative value usually means the answer key is wrong,
          not that the question was hard.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Question</th>
                <th className="px-4 py-3">Answered</th>
                <th className="px-4 py-3">Correct</th>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Discrimination</th>
              </tr>
            </thead>
            <tbody>
              {items.items.map((i) => (
                <tr key={i.question_id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">
                    <span className="line-clamp-2">{i.prompt}</span>
                    {i.suspect_key ? (
                      <span className="mt-1 block text-xs text-rose-700">
                        Weaker candidates did better &mdash; check the key.
                      </span>
                    ) : null}
                    {i.uninformative ? (
                      <span className="mt-1 block text-xs text-amber-700">
                        {i.facility === 1 ? 'Everybody' : 'Nobody'} got this right.
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{i.responses}</td>
                  <td className="px-4 py-3 tabular-nums">{i.correct}</td>
                  <td className="px-4 py-3 tabular-nums">{i.facility}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {i.discrimination === null
                      ? <span className="text-slate-400">too few papers</span>
                      : i.discrimination}
                  </td>
                </tr>
              ))}
              {items.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No objective questions have been answered yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Candidates</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Attempt</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Percent</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Integrity</th>
              </tr>
            </thead>
            <tbody>
              {report.candidates.map((c) => (
                <tr key={c.attempt_id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link href={'/onyx/attempts/' + c.attempt_id + '/mark'}
                      className="hover:underline">
                      {c.attempt_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.score} / {c.max_score}</td>
                  <td className="px-4 py-3 tabular-nums">{c.percent}%</td>
                  <td className="px-4 py-3">
                    {c.passed === null ? '-' : (
                      <span className={c.passed ? 'text-emerald-700' : 'text-rose-700'}>
                        {c.passed ? 'passed' : 'not passed'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600">
                    {c.integrity_flags > 0 ? c.integrity_status : 'clean'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </OnyxShell>
  );
}
