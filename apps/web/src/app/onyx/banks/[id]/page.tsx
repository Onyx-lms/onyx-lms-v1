import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import { isExamsStaff } from '@/lib/onyx-assess';
import { AddQuestion } from '@/components/onyx-manage';
import { Card, SectionHead, Pill, Empty } from '@/components/onyx-ui';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Question bank' };

interface Question {
  id: number;
  type: 'single' | 'multiple' | 'truefalse' | 'short' | 'essay';
  prompt: string;
  options: { id: string; text: string }[] | null;
  points: number;
  difficulty: string;
  version: number;
  status: string;
}

const TYPE_LABELS: Record<string, string> = {
  single: 'One answer',
  multiple: 'Several answers',
  truefalse: 'True/false',
  short: 'Short answer',
  essay: 'Essay',
};

/**
 * ASS-01a -- one question bank.
 *
 * The answer key is deliberately not rendered. It arrives on this endpoint
 * because setting a paper needs it, but a bank is often open on a projector
 * in a staff room, and there is no reason for the page to put the key on
 * screen when nothing here edits it.
 */
export default async function OnyxBankPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxSession();
  const { id } = await params;
  const me = await onyxApi<Me>('/api/onyx/me');
  if (!isExamsStaff(me.role)) redirect('/onyx/denied');

  const [banks, questions] = await Promise.all([
    onyxApi<{ id: number; name: string; description: string | null }[]>('/api/onyx/banks'),
    onyxApi<Question[]>('/api/onyx/banks/' + id + '/questions'),
  ]);
  const bank = banks.find((b) => String(b.id) === id);
  const marks = questions.reduce((sum, q) => sum + Number(q.points), 0);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={bank?.name ?? 'Question bank'}
      subtitle={questions.length + ' question' + (questions.length === 1 ? '' : 's')
        + ', ' + marks + ' marks in total'}
    >
      <Link href="/onyx/assessments" className="text-sm text-muted hover:underline">
        &larr; Back to assessments
      </Link>

      <div className="mt-4">
        <AddQuestion bankId={Number(id)} />
      </div>

      <section className="mt-6">
        <SectionHead title="Questions" />
        {questions.length === 0 ? (
          <Empty icon="edit">
            Nothing here yet. A question added to this bank can be drawn into any paper.
          </Empty>
        ) : (
          <ul className="mt-3 space-y-3">
            {questions.map((q, i) => (
              <li key={q.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm text-ink">
                      <span className="mr-2 font-bold text-muted">{i + 1}.</span>
                      {q.prompt}
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <Pill>{TYPE_LABELS[q.type] ?? q.type}</Pill>
                      <Pill>{q.points} {q.points === 1 ? 'mark' : 'marks'}</Pill>
                    </div>
                  </div>
                  {q.options?.length ? (
                    <ol className="mt-2 space-y-1 text-[13px] text-muted">
                      {q.options.map((o) => (
                        <li key={o.id}>
                          <span className="font-bold uppercase">{o.id}</span>. {o.text}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {q.version > 1 ? (
                    <p className="mt-2 text-xs text-muted">
                      Version {q.version}. Earlier versions are kept, so a paper already sat
                      still marks against the wording it was sat with.
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </OnyxShell>
  );
}
