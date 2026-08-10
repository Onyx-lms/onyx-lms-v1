import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import type { Exam } from '@/lib/onyx-campus';

export const metadata: Metadata = { title: 'Examinations' };

/** CMP-02a -- the calendar. */
export default async function OnyxExamsPage() {
  await requireOnyxSession();
  const [me, exams] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Exam[]>('/api/onyx/exams'),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Examinations"
      subtitle="No learner is ever scheduled for two papers at once -- the calendar refuses that before it happens."
    >
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {exams.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <Link href={'/onyx/exams/' + e.id} className="font-medium hover:underline">
                {e.title}
              </Link>
              <div className="text-xs text-muted">
                {new Date(e.starts_at).toLocaleString()} · {e.duration_minutes} minutes
                · out of {e.max_marks}
              </div>
            </div>
            <span className="text-xs text-muted">{e.status}</span>
          </li>
        ))}
        {exams.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted">Nothing scheduled.</li>
        ) : null}
      </ul>
    </OnyxShell>
  );
}
