import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxIntegrityTimeline } from '@/components/onyx-marking';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import type { ProctorTimeline } from '@/lib/onyx-assess';

export const metadata: Metadata = { title: 'Integrity' };

/**
 * ASS-02b -- one attempt's integrity timeline, and the decisions on it.
 *
 * The subtitle is not decoration. A flag is what a browser noticed, not proof
 * of anything, and a screen that implies otherwise is how proctoring gets a
 * deserved bad name.
 */
export default async function OnyxIntegrityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxPageRole('admin', 'faculty', 'exams');
  const { id } = await params;
  const [me, timeline] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<ProctorTimeline>('/api/onyx/attempts/' + id + '/proctor'),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Integrity review"
      subtitle="A flag is evidence, not a verdict. Nothing here fails anybody on its own."
    >
      <Link href="/onyx/invigilate" className="text-sm text-muted hover:underline">
        &larr; Review queue
      </Link>
      <div className="mt-4"><OnyxIntegrityTimeline timeline={timeline} /></div>
    </OnyxShell>
  );
}
