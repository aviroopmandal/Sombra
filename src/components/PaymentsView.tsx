import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Customer, Invoice, Payment } from '../types.ts';
import { formatCurrency, formatDateTime, getDaysBetween } from '../utils/format.ts';

interface PaymentsViewProps {
  payments: Payment[];
  invoices: Invoice[];
  customers: Customer[];
  onRecordPayment: () => void;
  onViewInvoice: (invoiceId: string) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  payments,
  invoices,
  customers,
  onRecordPayment,
  onViewInvoice,
}) => {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'payment_link' | 'manual'>('all');

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );
  const invoiceMap = useMemo(
    () => new Map(invoices.map((i) => [i.id, i])),
    [invoices]
  );

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...payments]
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
      .filter((pay) => {
        if (sourceFilter !== 'all' && pay.source !== sourceFilter) return false;
        if (!q) return true;
        const cust = customerMap.get(pay.customerId);
        const inv = invoiceMap.get(pay.invoiceId);
        return (
          pay.reference.toLowerCase().includes(q) ||
          pay.method.toLowerCase().includes(q) ||
          (cust?.company.toLowerCase().includes(q) ?? false) ||
          (cust?.name.toLowerCase().includes(q) ?? false) ||
          (inv?.invoiceNumber.toLowerCase().includes(q) ?? false)
        );
      });
  }, [payments, search, sourceFilter, customerMap, invoiceMap]);

  const metrics = useMemo(() => {
    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const linkAmount = payments
      .filter((p) => p.source === 'payment_link')
      .reduce((sum, p) => sum + p.amount, 0);
    const linkShare = totalAmount > 0 ? Math.round((linkAmount / totalAmount) * 100) : 0;

    let totalDays = 0;
    let counted = 0;
    for (const p of payments) {
      const inv = invoiceMap.get(p.invoiceId);
      if (inv) {
        totalDays += getDaysBetween(inv.issueDate, p.paidAt);
        counted += 1;
      }
    }
    const avgCollection = counted > 0 ? Math.round((totalDays / counted) * 10) / 10 : 0;
    return { totalAmount, linkShare, avgCollection };
  }, [payments, invoiceMap]);

  return (
    <div className="space-y-5">
      {/* Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Total Payments Collected</div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-emerald-700 tabular-nums">
            {formatCurrency(metrics.totalAmount)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Across {payments.length} transactions
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Paid via Payment Links</div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {metrics.linkShare}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Share of revenue collected via hosted checkout
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Avg. Time to Payment</div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {metrics.avgCollection} days
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Average elapsed days from invoice issue
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setSourceFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              sourceFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Payments
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter('payment_link')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              sourceFilter === 'payment_link'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Payment Links
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter('manual')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              sourceFilter === 'manual'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Manual Entry
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ref, invoice, customer..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={onRecordPayment}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* Payment Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No matching payments found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 pl-6 pr-3">Payment Date</th>
                  <th className="py-3 px-3">Reference</th>
                  <th className="py-3 px-3">Invoice</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Method & Channel</th>
                  <th className="py-3 px-3 text-right">Collection Time</th>
                  <th className="py-3 pl-3 pr-6 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredPayments.map((pay) => {
                  const cust = customerMap.get(pay.customerId);
                  const inv = invoiceMap.get(pay.invoiceId);
                  const days = inv ? getDaysBetween(inv.issueDate, pay.paidAt) : null;

                  return (
                    <tr key={pay.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 pl-6 pr-3 text-xs font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateTime(pay.paidAt)}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {pay.reference}
                      </td>
                      <td className="py-3 px-3">
                        {inv ? (
                          <button
                            type="button"
                            onClick={() => onViewInvoice(inv.id)}
                            className="font-mono text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
                          >
                            {inv.invoiceNumber}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-900 truncate max-w-[200px]">
                          {cust?.company || 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">
                          {cust?.name}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                        {pay.method} ·{' '}
                        <span className="text-slate-500">
                          {pay.source === 'payment_link' ? 'Payment Link' : 'Manual'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {days !== null ? `${days}d` : '—'}
                      </td>
                      <td className="py-3 pl-3 pr-6 text-right font-mono text-xs font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                        +{formatCurrency(pay.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
