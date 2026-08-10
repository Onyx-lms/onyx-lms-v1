import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxPlayer, ResourceLink } from '@/components/onyx-player';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import type { LessonDetail } from '@/lib/onyx-learn';

export const metadata: Metadata = { title: 'Lesson' };

/** LRN-02a -- one lesson, resuming where the learner left off. */
export default async function OnyxLessonPage(
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  await requireOnyxSession();
  const { id, lessonId } = await params;
  const [me, lesson] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<LessonDetail>('/api/onyx/lessons/' + lessonId),
  ]);

  return (
    <OnyxShell me={me} nav={navFor(me.role)} title={lesson.title}>
      <Link href={'/onyx/courses/' + id} className="text-sm text-slate-600 hover:underline">
        &larr; Back to the course
      </Link>
      <div className="mt-4 space-y-6">
        <OnyxPlayer lesson={lesson} />
        {lesson.resources.length ? (
          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              For this lesson
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {lesson.resources.map((r) => (
                <li key={r.id}><ResourceLink resource={r} /></li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </OnyxShell>
  );
}
