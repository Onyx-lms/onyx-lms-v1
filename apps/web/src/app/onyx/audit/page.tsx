import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';

export const metadata: Metadata = { title: 'Audit log' };

interface Entry {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
  actor: { id: number; name: string; email: string } | null;
}

const summarise = (e: Entry): string => {
  const before = e.before ? JSON.stringify(e.before) : null;
  const after = e.after ? JSON.stringify(e.after) : null;
  if (before && after) return before + ' → ' + after;
  return after ?? before ?? '—';
};

/**
 * F-05 -- who changed what.
 *
 * Administrators only, and only ever this institution's log: the rows have RLS
 * with no select policy, so the API is the sole way to read them.
 */
export default async function OnyxAuditPage() {
  await requireOnyxPageRole('admin');
  const [me, entries] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Entry[]>('/api/onyx/audit?limit=200'),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Audit log"
      subtitle="Sensitive actions across this institution, newest first."
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Who</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">{e.actor?.name ?? 'System'}</td>
                <td className="px-4 py-3 font-mono text-xs">{e.action}</td>
                <td className="px-4 py-3 text-slate-600">
                  {e.entity_type}{e.entity_id ? ' #' + e.entity_id : ''}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{summarise(e)}</td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Nothing recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </OnyxShell>
  );
}
