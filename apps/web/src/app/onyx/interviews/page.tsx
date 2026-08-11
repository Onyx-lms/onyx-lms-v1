import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { Empty, ListRow, Pill, RowList, SectionHead } from '@/components/onyx-ui';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Interview } from '@/lib/onyx-career';

export const metadata: Metadata = { title: 'Mock interviews' };

/**
 * CAR-02 -- mock interviews.
 *
 * The list carries no feedback, released or not: the detail page is the one
 * place that is decided, and a second place would be a second place to get it
 * wrong.
 */
export default async function OnyxInterviewsPage() {
  const claims = await requireOnyxSession();
  const staff = ['admin', 'faculty', 'placement', 'employer'].includes(claims.tenant_role);
  const [me, mine, conducting] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Interview[]>('/api/onyx/my/interviews'),
    staff ? onyxApiSafe<Interview[]>('/api/onyx/interviews/mine') : null,
  ]);

  const list = (title: string, items: Interview[], hint: string) => (
    <section className="mt-6">
      <SectionHead title={title} />
      <RowList label={title}>
        {items.map((i) => (
          <ListRow
            key={i.id}
            icon="mic"
            tone={i.feedback_released ? 'good' : 'brand'}
            title={i.title}
            href={'/onyx/interviews/' + i.id}
            chips={i.feedback_released ? <Pill tone="good">Feedback ready</Pill> : null}
            meta={new Date(i.scheduled_at).toLocaleDateString(undefined,
              { weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit' })
              + ' \u00b7 ' + i.status}
            action={{ href: '/onyx/interviews/' + i.id,
              label: i.feedback_released ? 'Read feedback' : 'Open' }}
          />
        ))}
        {items.length === 0 ? <li><Empty icon="mic">{hint}</Empty></li> : null}
      </RowList>
    </section>
  );

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Mock interviews"
      subtitle="Practice, with structured feedback afterwards."
    >
      {list('Yours', mine, 'Nothing scheduled for you yet.')}
      {conducting ? list('You are interviewing', conducting, 'Nothing assigned to you.') : null}
    </OnyxShell>
  );
}
