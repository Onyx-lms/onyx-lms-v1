import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { ExamMark, Transcript } from '@/lib/onyx-campus';
import { CreatePanel } from '@/components/onyx-create';
import { Empty, ListRow, Pill, RowList, SectionHead } from '@/components/onyx-ui';

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
  // CMP-02c: issuing a transcript needs somebody to issue it to, and which
  // programme it covers. Both come from the institution, not from a text box.
  const [members, programs] = await Promise.all([
    staff ? onyxApiSafe<{ user_id: number; role: string; user: { name: string } | null }[]>(
      '/api/onyx/members') : null,
    staff ? onyxApiSafe<{ id: number; name: string }[]>('/api/onyx/programs') : null,
  ]);
  const learners = (members ?? []).filter((m) => m.role === 'student');

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
        {staff ? (
          <CreatePanel
            title="Issue a transcript" cta="Issue a transcript" icon="award" compact
            endpoint="transcripts"
            fields={[
              { name: 'user_id', label: 'Learner', type: 'select', required: true,
                numeric: true, wide: true,
                options: learners.map((m) => ({ value: String(m.user_id),
                  label: m.user?.name ?? 'User ' + m.user_id })) },
              { name: 'program_id', label: 'Programme', type: 'select', numeric: true, wide: true,
                options: [{ value: '', label: 'Everything on record' }].concat(
                  (programs ?? []).map((p) => ({ value: String(p.id), label: p.name }))),
                help: 'Published marks only. The document is sealed with a checksum '
                  + 'so it can be verified later without trusting the copy.' },
            ]}
          />
        ) : null}

        <section>
          <SectionHead title="Marks" />
          {/* The mark is the thing the page exists for, so it is the largest
              element on the row rather than the middle cell of three. */}
          <RowList label="Your published exam marks">
            {marks.map((m) => (
              <ListRow
                key={m.id}
                icon="award"
                tone="brand"
                title={'Exam #' + m.exam_id}
                meta={m.grade ? 'Grade ' + m.grade : 'No grade band was applied'}
                trailing={
                  <span className="text-[17px] font-extrabold tabular-nums">{m.final_marks}</span>
                }
              />
            ))}
            {marks.length === 0 ? (
              <li>
                <Empty icon="award">
                  No results have been published yet. A mark appears here only once the
                  examinations office releases it.
                </Empty>
              </li>
            ) : null}
          </RowList>
        </section>

        <section>
          <SectionHead title="Transcripts" />
          <RowList label="Your transcripts">
            {transcripts.map((t) => (
              <ListRow
                key={t.id}
                icon="flag"
                tone={t.revoked_at ? 'late' : 'good'}
                title={t.serial}
                chips={t.revoked_at ? <Pill tone="late">Revoked</Pill> : null}
                meta={
                  'Issued ' + new Date(t.issued_at).toLocaleDateString(undefined,
                    { day: 'numeric', month: 'short', year: 'numeric' })
                  + ' · ' + t.credits_earned + ' results'
                  + (t.gpa !== null ? ' · GPA ' + t.gpa : '')
                }
              />
            ))}
            {transcripts.length === 0 ? (
              <li><Empty icon="flag">None issued yet.</Empty></li>
            ) : null}
          </RowList>
        </section>
      </div>
    </OnyxShell>
  );
}
