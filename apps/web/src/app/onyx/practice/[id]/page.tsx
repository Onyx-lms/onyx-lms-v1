import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxCodeLab } from '@/components/onyx-codelab';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import { DIFFICULTY_LABELS, type ProblemDetail } from '@/lib/onyx-codelab';

export const metadata: Metadata = { title: 'Problem' };

/**
 * LAB-01 / LAB-03 / LAB-04 -- one problem, with the editor beside it.
 *
 * Everything conditional was decided by the API: hidden cases arrive without
 * input or expected output, unrevealed hints arrive with a null body, and the
 * worked solution is present only if the release rule has been met. This page
 * renders what it was given and has no branch that could reveal more.
 */
export default async function OnyxProblemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxSession();
  const { id } = await params;
  const [me, problem] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<ProblemDetail>('/api/onyx/problems/' + id),
  ]);

  const visible = problem.tests.filter((t) => !t.is_hidden);
  const hidden = problem.tests.length - visible.length;

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={problem.title}
      subtitle={(DIFFICULTY_LABELS[problem.difficulty] ?? problem.difficulty)
        + (problem.topic ? ', ' + problem.topic : '')
        + ', ' + problem.time_limit_ms + 'ms per case'}
    >
      <Link href="/onyx/practice" className="text-sm text-muted hover:underline">
        &larr; Back to practice
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          {problem.statement ? (
            <article className="whitespace-pre-wrap text-sm text-slate-700">
              {problem.statement}
            </article>
          ) : null}

          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Examples
            </h2>
            <ul className="mt-2 space-y-3">
              {visible.map((t) => (
                <li key={t.id}>
                  <div className="text-xs text-muted">{t.name}</div>
                  {t.stdin ? (
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs">
                      {t.stdin}
                    </pre>
                  ) : null}
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-100">
                    {t.expected_stdout}
                  </pre>
                </li>
              ))}
            </ul>
            {hidden ? (
              <p className="mt-3 text-xs text-muted">
                {hidden} further case{hidden === 1 ? ' is' : 's are'} hidden. Submitting
                checks those too.
              </p>
            ) : null}
          </section>

          {problem.attempts ? (
            <p className="text-xs text-muted">
              {problem.attempts} attempt{problem.attempts === 1 ? '' : 's'} so far
              {problem.solved ? ', solved' : ''}.
            </p>
          ) : null}
        </div>

        <OnyxCodeLab problem={problem} />
      </div>
    </OnyxShell>
  );
}
