import type { Metadata } from 'next';
import { OnyxPlatformShell } from '@/components/onyx-platform-shell';
import { GrantAdminForm, RevokeAdminButton } from '@/components/onyx-platform-forms';
import { requirePlatformSession, platformApi } from '@/lib/onyx-platform-session';

export const metadata: Metadata = { title: 'Platform admins' };

interface AdminRow {
  id: number; user_id: number; created_at: string;
  user: { id: number; name: string; email: string } | null;
}

/** Who else can do everything this page can. */
export default async function OnyxPlatformAdminsPage() {
  const session = await requirePlatformSession();
  const admins = await platformApi<AdminRow[]>('/api/onyx/platform/admins');

  return (
    <OnyxPlatformShell
      email={session.email}
      title="Platform admins"
      subtitle="Grant an existing account, or create a new one. The last admin cannot be revoked."
    >
      <div className="space-y-6">
        <GrantAdminForm />

        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium">{a.user?.name ?? 'User #' + a.user_id}</div>
                <div className="text-xs text-slate-500">
                  {a.user?.email} · granted {new Date(a.created_at).toLocaleDateString()}
                </div>
              </div>
              {admins.length > 1 ? <RevokeAdminButton id={a.id} /> : null}
            </li>
          ))}
          {admins.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-slate-500">None yet.</li>
          ) : null}
        </ul>
      </div>
    </OnyxPlatformShell>
  );
}
