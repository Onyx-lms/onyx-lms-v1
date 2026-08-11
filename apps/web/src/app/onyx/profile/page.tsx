import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxReadiness, OnyxSkills } from '@/components/onyx-career';
import { navFor, ROLE_LABELS } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Profile } from '@/lib/onyx-career';
import type { GuardianLink } from '@/lib/onyx-campus';
import { GuardianConsent } from '@/components/onyx-manage';
import {
  Card, CardGrid, Icon, Pill, SectionHead, StatTile,
} from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Employability profile' };

/** CAR-05 -- the skills passport, the readiness score and the credentials. */
export default async function OnyxProfilePage() {
  await requireOnyxSession();
  const [me, profile] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Profile>('/api/onyx/my/profile'),
  ]);
  // CMP-04: the learner is the one who accepts a guardian and decides what
  // each of them may see, so the controls belong on the learner's own page.
  const guardians = me.role === 'student'
    ? await onyxApiSafe<GuardianLink[]>('/api/onyx/guardians')
    : null;

  const initials = (me.email ?? '?').slice(0, 2).toUpperCase();
  const evidence = profile.skills.reduce((n, s) => n + s.evidence_count, 0);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Your profile"
      subtitle="What you have done here, and what it adds up to."
    >
      {/* Identity first, and it is the institution's record of you rather than
          a profile you fill in. Only what the session actually holds is shown:
          a programme or a batch printed from nothing would be the one place a
          learner most needs to be able to trust. */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3.5">
          <span aria-hidden="true"
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full
                       bg-gradient-to-br from-brand-500 to-brand-700 text-[18px] font-bold
                       text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-all text-[17px] font-extrabold leading-snug">{me.email}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {ROLE_LABELS[me.role]} · {me.tenant.name}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Pill tone="brand">{ROLE_LABELS[me.role]}</Pill>
              <Pill tone="neutral">{me.tenant.name}</Pill>
              {me.memberships.length > 1 ? (
                <Pill tone="neutral">{me.memberships.length} institutions</Pill>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {/* The figures that gate things -- a placement application, a resit, a
          scholarship -- as numbers rather than buried in a report. */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Readiness" value={profile.readiness.score} note="of 100" />
        <StatTile label="Skills" value={profile.skills.length}
          note="on the passport" />
        <StatTile label="Evidence" value={evidence}
          note={evidence === 1 ? 'piece, all derived' : 'pieces, all derived'} />
        <StatTile label="Credentials" value={profile.certificates.length}
          note="issued to you" />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-8">
          <section>
            <SectionHead title="Skills passport" />
            <p className="-mt-1 mb-3 text-[12.5px] text-muted">
              Derived from evidence, never self-declared. Each skill opens onto the evidence
              that produced it &mdash; nothing here is typed in by hand, which is the only
              reason an employer should believe any of it.
            </p>
            <OnyxSkills skills={profile.skills} />
          </section>

          {/* A certificate is a thing you hand to somebody, so the two actions
              that matter -- a link they can check and a file they can attach to
              an application -- are both on the card rather than behind it. */}
          <section>
            <SectionHead title="Credentials" />
            {profile.certificates.length ? (
              <CardGrid min="18rem">
                {profile.certificates.map((c) => (
                  <Card key={c.credential_id} className="flex min-w-0 flex-col gap-2.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl
                                       bg-brand-50 text-brand-700">
                        <Icon name="award" className="h-[18px] w-[18px]" />
                      </span>
                      {c.kind ? <Pill tone="neutral">{c.kind}</Pill> : null}
                    </div>

                    <div className="min-w-0">
                      <div className="text-[15px] font-bold leading-snug">{c.title}</div>
                      <div className="mt-0.5 text-[12.5px] text-muted">
                        Issued {new Date(c.issued_at).toLocaleDateString(undefined,
                          { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>

                    <div className="truncate font-mono text-[12px] text-muted"
                      title={c.credential_id}>
                      {c.credential_id}
                    </div>

                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {c.id ? (
                        <a
                          href={'/api/proxy/onyx/certificates/' + c.id + '/document.pdf'}
                          download
                          className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5
                                     rounded-2xl bg-brand-600 px-3.5 text-[13px] font-bold
                                     text-white hover:bg-brand-700"
                        >
                          <Icon name="download" className="h-3.5 w-3.5" />
                          Download
                        </a>
                      ) : null}
                      <Link href={'/onyx/verify/' + c.credential_id}
                        className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5
                                   rounded-2xl border border-line px-3.5 text-[13px] font-bold
                                   text-slate-700 hover:bg-brand-50">
                        <Icon name="external" className="h-3.5 w-3.5" />
                        Verify
                      </Link>
                    </div>
                  </Card>
                ))}
              </CardGrid>
            ) : (
              <Card className="p-4">
                <p className="text-sm text-muted">
                  Nothing issued yet. Credentials appear here as you finish courses,
                  assessments and contests.
                </p>
              </Card>
            )}
          </section>
        </div>

        {/* ---------------- rail ---------------- */}
        <aside className="min-w-0 space-y-8">
          {/* Readiness decides whether a job post will even accept an
              application, so it is shown with its arithmetic open. A score
              whose components are hidden is one a learner can only argue with,
              never improve. */}
          <section>
            <SectionHead title="Placement readiness" />
            <OnyxReadiness readiness={profile.readiness} />
          </section>

          {me.role === 'student' ? (
            <section>
              <SectionHead title="Who follows your progress" />
              {/* Consent that cannot be withdrawn from the screen it was
                  granted on is not consent. */}
              <GuardianConsent links={guardians ?? []} />
            </section>
          ) : null}
        </aside>
      </div>
    </OnyxShell>
  );
}
