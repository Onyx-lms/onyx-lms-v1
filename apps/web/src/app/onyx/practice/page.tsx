import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { Empty, ListRow, Pill, RowList } from '@/components/onyx-ui';
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
      {/* Filters as pills, and the selected one carries the weight. The old
          set drew every option with the same border, so which filter was on
          was a question you answered by reading the URL. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Filter href="/onyx/practice" label="All" on={!q.difficulty && !q.topic} />
        {(['easy', 'medium', 'hard'] as const).map((d) => (
          <Filter key={d} href={'/onyx/practice?difficulty=' + d}
            label={d[0]!.toUpperCase() + d.slice(1)} on={q.difficulty === d} />
        ))}
        {topics.length ? <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" /> : null}
        {topics.map((t) => (
          <Filter key={t} href={'/onyx/practice?topic=' + encodeURIComponent(t)}
            label={t} on={q.topic === t} />
        ))}
      </div>

      <RowList label="Problems">
        {problems.map((p) => (
          <ListRow
            key={p.id}
            icon="code"
            tone="brand"
            title={p.title}
            href={'/onyx/practice/' + p.id}
            chips={
              <>
                {/* Difficulty is the thing a learner picks on, so it is a
                    coloured chip and not a lowercase word in a grey column. */}
                <Pill tone={p.difficulty === 'hard' ? 'late'
                  : p.difficulty === 'medium' ? 'soon' : 'good'}>
                  {p.difficulty[0]!.toUpperCase() + p.difficulty.slice(1)}
                </Pill>
                {p.status !== 'published' ? <Pill tone="neutral">Draft</Pill> : null}
              </>
            }
            meta={p.topic ?? 'No topic'}
            action={{ href: '/onyx/practice/' + p.id, label: 'Solve' }}
          />
        ))}
        {problems.length === 0 ? (
          <li>
            <Empty icon="code">
              {q.difficulty || q.topic
                ? 'No problems match that filter.'
                : 'No problems have been published yet.'}
            </Empty>
          </li>
        ) : null}
      </RowList>
    </OnyxShell>
  );
}

/** One filter pill. Selected is filled, not merely outlined differently. */
function Filter({ href, label, on }: { href: string; label: string; on: boolean }) {
  return (
    <Link href={href}
      className={'inline-flex min-h-[32px] items-center rounded-2xl px-3 text-[13px] font-semibold '
        + (on
          ? 'bg-brand-600 text-white'
          : 'border border-line bg-white text-slate-700 hover:bg-brand-50')}>
      {label}
    </Link>
  );
}
