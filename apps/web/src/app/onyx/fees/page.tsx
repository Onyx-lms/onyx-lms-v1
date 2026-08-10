import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import { money, type Invoice } from '@/lib/onyx-campus';

export const metadata: Metadata = { title: 'Fees' };

const STATUS_LABEL: Record<Invoice['status'], string> = {
  issued: 'Due', part_paid: 'Partly paid', paid: 'Paid', void: 'Void',
};

/** CMP-03 -- a learner's own invoices. Nothing about anyone else's fees. */
export default async function OnyxFeesPage() {
  await requireOnyxSession();
  const [me, invoices] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Invoice[]>('/api/onyx/invoices'),
  ]);

  const outstanding = invoices
    .filter((i) => i.status === 'issued' || i.status === 'part_paid')
    .reduce((sum, i) => sum + (i.total_minor - i.paid_minor), 0);

  return (
    <OnyxShell me={me} nav={navFor(me.role)} title="Fees"
      subtitle={outstanding > 0 ? money(outstanding) + ' outstanding' : 'Nothing outstanding.'}>
      <table className="w-full text-sm">
        <caption className="sr-only">Your invoices</caption>
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="py-1 pr-3">Invoice</th>
            <th scope="col" className="py-1 pr-3">Total</th>
            <th scope="col" className="py-1 pr-3">Paid</th>
            <th scope="col" className="py-1">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {invoices.map((i) => (
            <tr key={i.id}>
              <td className="py-2 pr-3">{i.number}</td>
              <td className="py-2 pr-3 tabular-nums">{money(i.total_minor, i.currency)}</td>
              <td className="py-2 pr-3 tabular-nums">{money(i.paid_minor, i.currency)}</td>
              <td className="py-2">{STATUS_LABEL[i.status]}</td>
            </tr>
          ))}
          {invoices.length === 0 ? (
            <tr><td colSpan={4} className="py-4 text-center text-muted">
              No invoices have been raised yet.
            </td></tr>
          ) : null}
        </tbody>
      </table>
    </OnyxShell>
  );
}
