import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { isExamsStaff, type Assessment, type MyAttempt } from '@/lib/onyx-assess';
import type { Course } from '@/lib/onyx-learn';
import { CreatePanel } from '@/components/onyx-create';
import { BuildAssessment } from '@/components/onyx-manage';
import { Empty, ListRow, Pill, RowList, SectionHead } from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Assessments' };

/** ASS-01 / ASS-04 -- what is coming up, and what came back. */
export default async function OnyxAssessmentsPage() {
  await requireOnyxSession();
  const [me, assessments] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Assessment[]>('/api/onyx/assessments'),
  ]);
  const staff = isExamsStaff(me.role);
  const mine = staff ? null : await onyxApiSafe<MyAttempt[]>('/api/onyx/my/assessments');
  const now = Date.now();

  // ASS-01: a paper is drawn from banks, so setting one needs the banks and
  // the courses it can belong to. Learners are shown neither.
  const [banks, courses] = await Promise.all([
    staff ? onyxApiSafe<{ id: number; name: string; description: string | null }[]>(
      '/api/onyx/banks') : null,
    staff ? onyxApiSafe<Course[]>('/api/onyx/courses') : null,
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Assessments"
      subtitle={staff ? 'Papers set at this institution.' : 'Your tests, and your results.'}
    >
      {staff ? (
        <section className="mb-6">
          <div className="flex flex-wrap items-start gap-3">
            <BuildAssessment banks={banks ?? []}
              courses={(courses ?? []).map((c) => ({ id: c.id, title: c.title }))} />
            <CreatePanel
              title="New question bank" cta="New question bank" icon="edit" compact
              endpoint="banks"
              fields={[
                { name: 'name', label: 'Name', required: true, wide: true,
                  placeholder: 'Data structures — term 1' },
                { name: 'course_id', label: 'Course', type: 'select', numeric: true, wide: true,
                  options: [{ value: '', label: 'Not tied to a course' }].concat(
                    (courses ?? []).map((c) => ({ value: String(c.id), label: c.title }))) },
                { name: 'description', label: 'Description', type: 'textarea' },
              ]}
            />
          </div>

          {banks?.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {banks.map((b) => (
                <li key={b.id}>
                  <Link href={'/onyx/banks/' + b.id}
                    className="inline-flex rounded-xl border border-line bg-white px-3 py-2
                               text-[13px] font-semibold hover:bg-brand-50">
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">
              No question banks yet. A paper draws its questions from one, so build a bank first.
            </p>
          )}
        </section>
      ) : null}

      {/* A paper is something you sit, not a value you compare down a column,
          so it gets a row with its state and its action rather than four cells
          of grey text. "Open" is the whole point of the screen and it was the
          last column. */}
      <RowList label="Assessments">
        {assessments.map((a) => {
          const open = (!a.opens_at || Date.parse(a.opens_at) <= now)
            && (!a.closes_at || Date.parse(a.closes_at) >= now);
          const draft = a.status === 'draft';
          const out = Boolean(a.results_published_at);
          return (
            <ListRow
              key={a.id}
              icon={out ? 'award' : 'edit'}
              tone={draft ? 'neutral' : out ? 'good' : open ? 'brand' : 'neutral'}
              title={a.title}
              href={'/onyx/assessments/' + a.id}
              chips={
                <>
                  {draft ? <Pill tone="neutral">Draft</Pill>
                    : out ? <Pill tone="good">Results out</Pill>
                      : open ? <Pill tone="brand">Open</Pill>
                        : <Pill tone="neutral">Closed</Pill>}
                  {a.proctoring ? <Pill tone="soon">Monitored</Pill> : null}
                </>
              }
              meta={
                <span className="flex flex-wrap items-center gap-x-3">
                  <span className="tabular-nums">{a.duration_minutes} minutes</span>
                  <span>
                    {a.opens_at
                      ? 'Opens ' + new Date(a.opens_at).toLocaleDateString(undefined,
                        { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : 'Open any time'}
                  </span>
                </span>
              }
              action={open && !draft
                ? { href: '/onyx/assessments/' + a.id, label: 'Open' }
                : undefined}
            />
          );
        })}
        {assessments.length === 0 ? (
          <li>
            <Empty icon="edit">
              Nothing is scheduled. When a paper is set for one of your courses it appears here.
            </Empty>
          </li>
        ) : null}
      </RowList>

      {mine?.length ? (
        <section className="mt-8">
          <SectionHead title="Your papers" />
          <RowList label="Your attempts">
            {mine.map((a) => (
              <ListRow
                key={a.attempt_id}
                icon={a.results_published ? 'award' : 'clock'}
                tone={a.results_published ? (a.passed === false ? 'late' : 'good') : 'neutral'}
                title={a.title}
                meta={a.results_published
                  ? (a.passed === null ? 'Marked' : a.passed ? 'Passed' : 'Not passed')
                  : a.status === 'in_progress'
                    ? 'You have a paper open'
                    : 'Handed in — results are not out yet'}
                trailing={a.results_published ? (
                  <span className="text-[15px] font-extrabold tabular-nums">
                    {a.score}
                    <span className="text-[13px] font-semibold text-muted">/{a.max_score}</span>
                  </span>
                ) : null}
                chips={a.status === 'in_progress' ? <Pill tone="soon">In progress</Pill> : null}
              />
            ))}
          </RowList>
        </section>
      ) : null}
    </OnyxShell>
  );
}
