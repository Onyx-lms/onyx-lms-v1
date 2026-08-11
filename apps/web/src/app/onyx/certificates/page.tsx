import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Certificate } from '@/lib/onyx-career';
import type { Course } from '@/lib/onyx-learn';
import { CreatePanel } from '@/components/onyx-create';
import { RevokeCertificate } from '@/components/onyx-career';
import { Pill, Empty } from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Certificates' };

/**
 * CAR-03 -- the institution's register of credentials.
 *
 * "Verifiable, shareable skill certificates." Issuing one was a staff endpoint
 * with no caller anywhere in the product, so the only way to give a learner a
 * credential was to POST it by hand -- and because nothing listed what had been
 * issued, revoking one meant already knowing the row. Both halves live here.
 *
 * Revoked rows stay in the list rather than disappearing. Somebody out there is
 * holding the credential, and the register is the thing that has to explain
 * what happened to it.
 */
export default async function OnyxCertificatesPage() {
  const claims = await requireOnyxPageRole('admin', 'exams', 'placement');

  const [me, certificates, members, courses] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Certificate[]>('/api/onyx/certificates'),
    onyxApiSafe<{ user_id: number; role: string; user: { name: string; email: string } | null }[]>(
      '/api/onyx/members'),
    onyxApiSafe<Course[]>('/api/onyx/courses'),
  ]);

  const learners = (members ?? []).filter((m) => m.role === 'student');
  const names = new Map((members ?? []).map((m) => [Number(m.user_id), m.user]));
  const live = certificates.filter((c) => !c.revoked_at).length;

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Certificates"
      subtitle={
        certificates.length === 0
          ? 'Nothing has been issued yet.'
          : live + ' in force of ' + certificates.length + ' issued'
      }
      action={
        <CreatePanel
          title="Issue a certificate" cta="Issue a certificate" icon="award"
          endpoint="certificates"
          fields={[
            { name: 'user_id', label: 'Holder', type: 'select', required: true,
              numeric: true, wide: true,
              options: learners.map((m) => ({
                value: String(m.user_id),
                label: (m.user?.name ?? 'User ' + m.user_id) + (m.user?.email ? ' — ' + m.user.email : ''),
              })) },
            { name: 'title', label: 'What it certifies', required: true, wide: true,
              placeholder: 'Introduction to Programming',
              help: 'This appears on the public verification page, so write it for a stranger.' },
            { name: 'kind', label: 'Kind', type: 'select', fallback: 'course',
              options: ['course', 'assessment', 'contest', 'program']
                .map((k) => ({ value: k, label: k })) },
            { name: 'course_id', label: 'Course', type: 'select', numeric: true,
              options: (courses ?? []).map((c) => ({
                value: String(c.id), label: c.code + ' — ' + c.title,
              })),
              help: 'Optional. Ties the credential to a course on the register.' },
            { name: 'expires_at', label: 'Expires', type: 'date',
              help: 'Leave blank for a credential that does not expire.' },
          ]}
        />
      }
    >
      {certificates.length === 0 ? (
        <Empty icon="award">
          No credentials have been issued by this institution yet. Issuing one gives the
          holder a 32-character credential id and a public page anyone can check without
          an account.
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Certificates issued by this institution</caption>
            <thead className="border-b border-line bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[.06em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Holder</th>
                <th scope="col" className="px-4 py-3">Certifies</th>
                <th scope="col" className="px-4 py-3">Credential</th>
                <th scope="col" className="px-4 py-3">Issued</th>
                <th scope="col" className="px-4 py-3">State</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {certificates.map((c) => {
                const who = c.user_id ? names.get(c.user_id) : null;
                const expired = Boolean(c.expires_at) && Date.parse(c.expires_at!) < Date.now();
                return (
                  <tr key={c.id} className={c.revoked_at ? 'bg-slate-50' : undefined}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{who?.name ?? 'User ' + c.user_id}</div>
                      <div className="text-xs text-muted">{who?.email ?? ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{c.title}</div>
                      <div className="text-xs text-muted">{c.kind}</div>
                    </td>
                    <td className="px-4 py-3">
                      {/* The verification page is the deliverable, so the id is
                          a link to it rather than a string to copy by hand. */}
                      <Link
                        href={'/onyx/verify/' + c.credential_id}
                        className="font-mono text-xs text-brand-700 underline"
                      >
                        {c.credential_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {new Date(c.issued_at).toLocaleDateString()}
                      {c.expires_at
                        ? ' · expires ' + new Date(c.expires_at).toLocaleDateString()
                        : ''}
                    </td>
                    <td className="px-4 py-3">
                      {c.revoked_at
                        ? <Pill tone="late">Revoked</Pill>
                        : expired
                          ? <Pill tone="neutral">Expired</Pill>
                          : <Pill tone="good">In force</Pill>}
                      {c.revoked_reason
                        ? <div className="mt-1 text-xs text-muted">{c.revoked_reason}</div>
                        : null}
                    </td>
                    <td className="px-4 py-3">
                      {c.revoked_at ? null : <RevokeCertificate certificateId={c.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 max-w-[70ch] text-xs text-muted">
        A credential is never deleted. Revoking records who did it and why, and the public
        page keeps answering — it says the credential was revoked rather than that it was
        never issued, which is the only answer useful to whoever is holding it.
        {claims.tenant_role === 'admin'
          ? ' Both issuing and revoking are written to the audit log.'
          : ''}
      </p>
    </OnyxShell>
  );
}
