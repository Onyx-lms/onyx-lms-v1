import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxReadiness, OnyxSkills } from '@/components/onyx-career';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Profile } from '@/lib/onyx-career';
import type { GuardianLink } from '@/lib/onyx-campus';
import { GuardianConsent } from '@/components/onyx-manage';

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

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Your profile"
      subtitle="What you have done here, and what it adds up to."
    >
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <OnyxReadiness readiness={profile.readiness} />

          {me.role === 'student' ? (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                Who follows your progress
              </h2>
              <div className="mt-3">
                <GuardianConsent links={guardians ?? []} />
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Credentials
            </h2>
            {profile.certificates.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {profile.certificates.map((c) => (
                  <li key={c.credential_id} className="rounded-2xl border border-line p-3">
                    <div className="font-medium">{c.title}</div>
                    <div className="text-xs text-muted">
                      {new Date(c.issued_at).toLocaleDateString()}
                    </div>
                    {/* The share link is the whole feature: it works for
                        somebody with no account here. */}
                    <Link href={'/onyx/verify/' + c.credential_id}
                      className="mt-1 block break-all font-mono text-xs text-brand-600
                                 hover:underline">
                      {c.credential_id}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Nothing issued yet.</p>
            )}
          </section>
        </div>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Skills passport
          </h2>
          <p className="mt-1 text-xs text-muted">
            Each skill opens onto the evidence that produced it. Nothing here is typed in
            by hand.
          </p>
          <div className="mt-3">
            <OnyxSkills skills={profile.skills} />
          </div>
        </section>
      </div>
    </OnyxShell>
  );
}
