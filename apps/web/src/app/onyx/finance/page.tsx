import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import { money } from '@/lib/onyx-campus';
import { CreatePanel } from '@/components/onyx-create';

export const metadata: Metadata = { title: 'Finance' };

interface Outstanding {
  total_minor: number;
  invoices: {
    id: number; number: string; name: string | null; currency: string;
    balance_minor: number; due_at: string | null; overdue: boolean;
  }[];
}

/** CMP-03 -- what is owed, institution-wide. Administrators only. */
export default async function OnyxFinancePage() {
  const claims = await requireOnyxPageRole('admin');
  void claims;
  const [me, outstanding] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Outstanding>('/api/onyx/finance/outstanding'),
  ]);

  return (
    <OnyxShell me={me} nav={navFor(me.role)} title="Finance"
      subtitle={money(outstanding.total_minor) + ' outstanding across '
        + outstanding.invoices.length + ' invoice'
        + (outstanding.invoices.length === 1 ? '' : 's')}>
      {/* CMP-03: "configure fee structures, generate invoices, process
          online payments, issue receipts and reconcile accounts". */}
      <div className="mb-6 grid gap-3 lg:grid-cols-2">
        <CreatePanel
          title="New fee head" cta="Add a fee head" icon="wallet" compact
          endpoint="fee-heads"
          fields={[
            { name: 'code', label: 'Code', required: true, placeholder: 'TUITION' },
            { name: 'name', label: 'Name', required: true, placeholder: 'Tuition' },
            { name: 'category', label: 'Category', type: 'select', fallback: 'tuition',
              options: ['tuition', 'exam', 'hostel', 'transport', 'library', 'misc']
                .map((c) => ({ value: c, label: c })) },
            { name: 'refundable', label: 'Refundable', type: 'checkbox' },
          ]}
        />
        <CreatePanel
          title="Record a payment" cta="Record a payment" icon="wallet" compact
          endpoint="payments"
          fields={[
            { name: 'invoice_id', label: 'Invoice id', type: 'number', required: true, min: 1 },
            { name: 'gateway', label: 'Gateway', required: true, fallback: 'manual',
              placeholder: 'manual' },
            { name: 'reference', label: 'Reference', required: true,
              help: 'Unique per gateway — a replayed webhook with the same reference never credits twice.' },
            { name: 'amount_minor', label: 'Amount (paise)', type: 'number', required: true, min: 1 },
          ]}
        />
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Outstanding invoices</caption>
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="py-1 pr-3">Invoice</th>
            <th scope="col" className="py-1 pr-3">Learner</th>
            <th scope="col" className="py-1 pr-3">Balance</th>
            <th scope="col" className="py-1">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {outstanding.invoices.map((i) => (
            <tr key={i.id}>
              <td className="py-2 pr-3">{i.number}</td>
              <td className="py-2 pr-3">{i.name ?? 'User'}</td>
              <td className="py-2 pr-3 tabular-nums">{money(i.balance_minor, i.currency)}</td>
              <td className={'py-2 ' + (i.overdue ? 'text-red-700' : '')}>
                {i.due_at ? new Date(i.due_at).toLocaleDateString() : 'no due date'}
                {i.overdue ? ' · overdue' : ''}
              </td>
            </tr>
          ))}
          {outstanding.invoices.length === 0 ? (
            <tr><td colSpan={4} className="py-4 text-center text-muted">
              Nothing outstanding.
            </td></tr>
          ) : null}
        </tbody>
      </table>
    </OnyxShell>
  );
}
