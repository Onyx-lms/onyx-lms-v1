import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import { isStaff } from '@/lib/onyx-learn';
import { CreatePanel } from '@/components/onyx-create';
import type { Problem } from '@/lib/onyx-codelab';

export const metadata: Metadata = { title: 'Practice' };

/** LAB-04 -- the problem bank, by topic and difficulty. */
export default async function OnyxPracticePage({ searchParams }: {
  searchParams: Promise<{ difficulty?: string; topic?: string }>;
}) {
  await requireOnyxSession();
  const q = await searchParams;
  const query = new URLSearchParams();
  if (q.difficulty) query.set('difficulty', q.difficulty);
  if (q.topic) query.set('topic', q.topic);

  const [me, problems] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Problem[]>('/api/onyx/problems' + (query.size ? '?' + query : '')),
  ]);

  const topics = [...new Set(problems.map((p) => p.topic).filter(Boolean))] as string[];

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Practice"
      subtitle={isStaff(me.role)
        ? 'The problem bank, drafts included.'
        : 'Work through problems and get graded instantly.'}
    >
      {/* LAB-04: "curated problems organised by topic and difficulty".
          Left as a draft on creation -- the API refuses to publish a problem
          with no test cases, and at least one of them has to be visible. */}
      {isStaff(me.role) ? (
        <div className="mb-6">
          <CreatePanel
            title="New problem" cta="Add a problem" icon="code"
            endpoint="problems"
            fields={[
              { name: 'title', label: 'Problem', required: true, wide: true,
                placeholder: 'Two Sum' },
              { name: 'statement', label: 'Statement', type: 'textarea', rows: 4,
                required: true },
              { name: 'difficulty', label: 'Difficulty', type: 'select', fallback: 'easy',
                options: ['easy', 'medium', 'hard'].map((d) => ({ value: d, label: d })) },
            ]}
          />
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/onyx/practice"
          className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-50">All</Link>
        {(['easy', 'medium', 'hard'] as const).map((d) => (
          <Link key={d} href={'/onyx/practice?difficulty=' + d}
            className={'rounded-lg border px-3 py-1 capitalize hover:bg-slate-50 '
              + (q.difficulty === d ? 'border-slate-900 bg-brand-600 text-white' : 'border-slate-300')}>
            {d}
          </Link>
        ))}
        {topics.map((t) => (
          <Link key={t} href={'/onyx/practice?topic=' + encodeURIComponent(t)}
            className={'rounded-lg border px-3 py-1 hover:bg-slate-50 '
              + (q.topic === t ? 'border-slate-900 bg-brand-600 text-white' : 'border-slate-300')}>
            {t}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Problem</th>
              <th className="px-4 py-3">Topic</th>
              <th className="px-4 py-3">Difficulty</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={'/onyx/practice/' + p.id} className="hover:underline">{p.title}</Link>
                  {p.status !== 'published'
                    ? <span className="ml-2 text-xs text-amber-700">draft</span>
                    : null}
                </td>
                <td className="px-4 py-3 text-muted">{p.topic ?? '-'}</td>
                <td className="px-4 py-3 capitalize text-muted">{p.difficulty}</td>
              </tr>
            ))}
            {problems.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted">
                  No problems here yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </OnyxShell>
  );
}
