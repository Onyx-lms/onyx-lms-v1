import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { money, type Invoice, type PayableGateway } from '@/lib/onyx-campus';
import { PayInvoice } from '@/components/onyx-pay';
import { ConfirmPayment } from '@/components/onyx-pay-return';

export const metadata: Metadata = { title: 'Fees' };

const STATUS_LABEL: Record<Invoice['status'], string> = {
  issued: 'Due', part_paid: 'Partly paid', paid: 'Paid', void: 'Void',
};

/**
 * CMP-03 -- a learner's own invoices, and paying them.
 *
 * Nothing about anyone else's fees. The page was read-only until CMP-03b was
 * finished: it could state a debt and offered no way to settle it, which is the
 * one thing a fees page is for.
 */
export default async function OnyxFeesPage(
  { searchParams }: {
    searchParams: Promise<{ paid?: string; cancelled?: string; ref?: string }>;
  },
) {
  await requireOnyxSession();
  const { paid: paidInvoice, cancelled, ref } = await searchParams;

  const [me, invoices, gateways] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Invoice[]>('/api/onyx/invoices'),
    // Absent rather than fatal: an institution that has not set up a gateway
    // still has a fees page, it just has nothing to click.
    onyxApiSafe<PayableGateway[]>('/api/onyx/gateways'),
  ]);

  const outstanding = invoices
    .filter((i) => i.status === 'issued' || i.status === 'part_paid')
    .reduce((sum, i) => sum + (i.total_minor - i.paid_minor), 0);

  return (
    <OnyxShell me={me} nav={navFor(me.role)} title="Fees"
      subtitle={outstanding > 0 ? money(outstanding) + ' outstanding' : 'Nothing outstanding.'}>

      {/* The gateway sends the browser back here. What it says happened is not
          evidence -- the ledger below is, and it is read fresh on this render.
          So the banner reports where the payer has been, and the table reports
          what is true. */}
      {ref ? (
        <ConfirmPayment reference={ref} />
      ) : paidInvoice ? (
        <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          Thank you. If the invoice below still shows as due, the payment is still being
          confirmed by the bank — it usually takes a minute, and nothing has been lost.
        </p>
      ) : null}
      {cancelled ? (
        <p className="mb-4 rounded-2xl border border-line bg-slate-50 px-4 py-3 text-sm">
          That payment was cancelled. Nothing has been charged.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">Your invoices</caption>
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3">Invoice</th>
              <th scope="col" className="px-4 py-3">Total</th>
              <th scope="col" className="px-4 py-3">Paid</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3 text-right">
                <span className="sr-only">Pay</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {invoices.map((i) => {
              const due = i.total_minor - i.paid_minor;
              const payable = due > 0 && i.status !== 'void';
              return (
                <tr key={i.id}>
                  <td className="px-4 py-3">{i.number}</td>
                  <td className="px-4 py-3 tabular-nums">{money(i.total_minor, i.currency)}</td>
                  <td className="px-4 py-3 tabular-nums">{money(i.paid_minor, i.currency)}</td>
                  <td className="px-4 py-3">{STATUS_LABEL[i.status]}</td>
                  <td className="px-4 py-3 text-right">
                    {payable ? (
                      <PayInvoice
                        invoiceId={i.id}
                        gateways={gateways ?? []}
                        outstanding={money(due, i.currency)}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {invoices.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">
                No invoices have been raised yet.
              </td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </OnyxShell>
  );
}
