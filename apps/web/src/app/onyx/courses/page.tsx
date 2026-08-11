import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { isStaff, type Course, type Outline, type Program } from '@/lib/onyx-learn';
import { CreatePanel, ActionButton } from '@/components/onyx-create';
import {
  Card, CardGrid, Empty, Icon, Meter, Pill, SectionHead,
} from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Courses' };

/**
 * LRN-01b -- the catalog, and what this person is enrolled in.
 *
 * Rebuilt around the two different questions this page answers. "Where was I"
 * is a learner resuming work, and it wants progress and one button; "what else
 * is there" is browsing, and it wants a card you can read the shape of a course
 * from. The previous version answered both with a four-column table, which is
 * the right shape for comparing values down a column and the wrong shape for
 * picking one thing to open -- and a table cannot show a progress bar at all,
 * which is the single most useful thing a learner's own list can carry.
 */
export default async function OnyxCoursesPage() {
  await requireOnyxSession();
  const [me, courses, mine, programs] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Course[]>('/api/onyx/courses'),
    onyxApi<Course[]>('/api/onyx/my/courses'),
    onyxApi<Program[]>('/api/onyx/programs'),
  ]);

  // Progress lives on the outline, not on the course row, so a learner's own
  // list costs one request per course. Bounded by how many courses one person
  // takes, and worth it: a list of titles with no progress is the thing this
  // page was already doing badly.
  const outlines = await Promise.all(mine.map((c) =>
    onyxApiSafe<Outline>('/api/onyx/courses/' + c.id + '/outline')));
  const progressFor = new Map(mine.map((c, i) => [c.id, outlines[i]?.progress ?? null]));

  const byProgram = new Map(programs.map((p) => [p.id, p]));
  const enrolled = new Set(mine.map((c) => c.id));
  const staff = isStaff(me.role);
  // What a learner has not joined. Staff see the whole register either way, so
  // for them the catalogue is the list and there is nothing to subtract.
  const rest = staff ? courses : courses.filter((c) => !enrolled.has(c.id));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Courses"
      subtitle={staff
        ? courses.length + (courses.length === 1 ? ' course' : ' courses') + ' at ' + me.tenant.name
        : mine.length
          ? 'You are taking ' + mine.length + (mine.length === 1 ? ' course' : ' courses')
          : 'Nothing yet — the catalogue is below.'}
      action={staff ? (
        /* LRN-01: "enroll themselves or be enrolled by administrators" --
           which first requires a course to exist. */
        <CreatePanel
          title="New course" cta="Create a course" icon="book"
          endpoint="courses"
          fields={[
            { name: 'code', label: 'Course code', required: true, placeholder: 'CS101' },
            { name: 'title', label: 'Title', required: true, placeholder: 'Introduction to Programming' },
            { name: 'credits', label: 'Credits', type: 'number', min: 0, max: 60, fallback: 0 },
            { name: 'program_id', label: 'Programme', type: 'select', numeric: true,
              options: [{ value: '', label: 'Not part of a programme' },
                ...programs.map((pr) => ({ value: String(pr.id), label: pr.name }))] },
            { name: 'description', label: 'Description', type: 'textarea',
              placeholder: 'What this course covers.' },
            { name: 'self_enroll', label: 'Learners may enrol themselves', type: 'checkbox' },
          ]}
          // Created as a draft, then opened -- a course nobody can see is not
          // much use, and publishing is a separate right the API checks.
          thenPost="courses/:id/publish"
        />
      ) : undefined}
    >
      {mine.length ? (
        <section className="mb-9">
          <SectionHead title={staff ? 'Courses you teach' : 'Continue'} />
          <CardGrid min="20rem">
            {mine.map((c) => {
              const p = progressFor.get(c.id);
              const done = p ? p.completed >= p.total && p.total > 0 : false;
              return (
                <Card key={c.id} as="li" className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={'/onyx/courses/' + c.id}
                        className="block text-[16px] font-bold leading-snug hover:underline">
                        {c.title}
                      </Link>
                      <div className="mt-0.5 text-[13px] text-muted">
                        {c.code}
                        {c.program_id ? ' · ' + (byProgram.get(c.program_id)?.name ?? '') : ''}
                      </div>
                    </div>
                    {done ? <Pill tone="good">Complete</Pill> : null}
                  </div>

                  {p && p.total > 0 ? (
                    <div>
                      <Meter percent={p.percent} label={c.title + ' progress'} />
                      <div className="mt-1.5 flex items-baseline justify-between text-[12.5px]">
                        <span className="font-bold tabular-nums">{p.percent}%</span>
                        <span className="text-muted tabular-nums">
                          {p.completed} of {p.total} lessons
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted">
                      No lessons have been published on this course yet.
                    </p>
                  )}

                  <Link
                    href={'/onyx/courses/' + c.id}
                    className="mt-auto inline-flex min-h-[38px] items-center justify-center gap-1.5
                               rounded-2xl bg-brand-600 px-3.5 text-[13px] font-bold text-white
                               hover:bg-brand-700"
                  >
                    <Icon name="play" className="h-3.5 w-3.5" />
                    {p && p.completed > 0 ? 'Resume' : 'Start'}
                  </Link>
                </Card>
              );
            })}
          </CardGrid>
        </section>
      ) : null}

      <section>
        <SectionHead title={staff ? 'Every course' : 'Catalogue'} />
        {rest.length === 0 ? (
          <Card className="p-2">
            <Empty icon="book">
              {courses.length === 0
                ? 'No courses have been published yet.'
                : 'You are enrolled in everything the catalogue currently offers.'}
            </Empty>
          </Card>
        ) : (
          <CardGrid>
            {rest.map((c) => (
              <Card key={c.id} as="li" className="flex flex-col gap-2.5 p-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-bold text-muted">{c.code}</span>
                  {enrolled.has(c.id) ? <Pill tone="good">Enrolled</Pill> : null}
                  {c.self_enroll && !enrolled.has(c.id)
                    ? <Pill tone="brand">Open to join</Pill> : null}
                </div>

                <Link href={'/onyx/courses/' + c.id}
                  className="text-[15.5px] font-bold leading-snug hover:underline">
                  {c.title}
                </Link>

                {c.description ? (
                  // Two lines, then it stops. A card whose height follows its
                  // description makes a grid of them look broken.
                  <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">
                    {c.description}
                  </p>
                ) : null}

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1
                                text-[12.5px] text-muted">
                  {c.program_id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="building" className="h-3.5 w-3.5" />
                      {byProgram.get(c.program_id)?.name ?? '—'}
                    </span>
                  ) : null}
                  {c.credits ? (
                    <span className="tabular-nums">{c.credits} credits</span>
                  ) : null}
                </div>

                {/* LRN-01: "enroll themselves". The catalogue used to say a
                    course was open to join and offer nothing to join it with. */}
                {c.self_enroll && !enrolled.has(c.id) && me.role === 'student' ? (
                  <ActionButton endpoint={'courses/' + c.id + '/enroll'} label="Join this course" />
                ) : null}
              </Card>
            ))}
          </CardGrid>
        )}
      </section>
    </OnyxShell>
  );
}
