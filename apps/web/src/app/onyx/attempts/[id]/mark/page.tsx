import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxMarker } from '@/components/onyx-marking';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import type { MarkerPaper } from '@/lib/onyx-assess';

export const metadata: Metadata = { title: 'Mark a paper' };

/** ASS-03a -- one paper to mark. */
export default async function OnyxMarkPaperPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxPageRole('admin', 'faculty', 'exams');
  const { id } = await params;
  const [me, paper] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<MarkerPaper>('/api/onyx/attempts/' + id + '/paper'),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Mark a paper"
      subtitle={paper.anonymous ? 'Anonymous' : 'Candidate ' + paper.user_id}
    >
      <Link href="/onyx/assessments" className="text-sm text-slate-600 hover:underline">
        &larr; Assessments
      </Link>
      <div className="mt-4"><OnyxMarker paper={paper} /></div>
    </OnyxShell>
  );
}
