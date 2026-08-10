import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
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
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg border
                                    border-slate-200 px-3 py-2">
            <Link href={'/onyx/interviews/' + i.id} className="flex-1 hover:underline">
              {i.title}
            </Link>
            <span className="text-xs text-slate-500">
              {new Date(i.scheduled_at).toLocaleString()}
            </span>
            <span className="text-xs capitalize text-slate-600">{i.status}</span>
            {i.feedback_released
              ? <span className="text-xs text-emerald-700">feedback ready</span>
              : null}
          </li>
        ))}
        {items.length === 0 ? <li className="text-slate-500">{hint}</li> : null}
      </ul>
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
