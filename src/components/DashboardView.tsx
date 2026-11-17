import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Copy, ExternalLink, Mail, Send } from 'lucide-react';
import type { Customer, Invoice, Payment } from '../types.ts';
import {
  computeInvoiceBalance,
  computeInvoiceTotal,
  deriveInvoiceStatus,
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  getDaysBetween,
  getDaysFromDue,
} from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface DashboardViewProps {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  onViewInvoice: (invoiceId: string) => void;
  onSendReminder: (invoiceId: string) => void;
  onCopyPaymentLink: (token: string) => void;
  onOpenPaymentPortal: (token: string) => void;
  onNavigateTab: (tab: 'invoices' | 'payments' | 'reminders') => void;
  onRunSweep: () => Promise<void>;
  sweeping: boolean;
}

interface MonthBucket {
  key: string;
  label: string;
  invoiced: number;
  collected: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  customers,
  invoices,
  payments,
  onViewInvoice,
  onSendReminder,
  onCopyPaymentLink,
  onOpenPaymentPortal,
  onNavigateTab,
  onRunSweep,
  sweeping,
}) => {
  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );

  const metrics = useMemo(() => {
    const activeInvoices = invoices.filter((inv) => deriveInvoiceStatus(inv) !== 'draft');

    const totalRevenueInvoiced = activeInvoices.reduce(
      (sum, inv) => sum + computeInvoiceTotal(inv),
      0
    );

    const totalPaymentsReceived = payments.reduce((sum, pay) => sum + pay.amount, 0);

    const outstandingPayments = activeInvoices.reduce(
      (sum, inv) => sum + computeInvoiceBalance(inv),
      0
    );

    const overdueInvoices = activeInvoices.filter(
      (inv) => deriveInvoiceStatus(inv) === 'overdue'
    );
    const overdueCount = overdueInvoices.length;
    const overdueAmount = overdueInvoices.reduce(
      (sum, inv) => sum + computeInvoiceBalance(inv),
      0
    );

    const settledInvoices = activeInvoices.filter(
      (inv) => deriveInvoiceStatus(inv) === 'paid' && inv.paidAt
    );
    const avgCollectionDays =
      settledInvoices.length > 0
        ? Math.round(
            (settledInvoices.reduce(
              (sum, inv) => sum + getDaysBetween(inv.issueDate, inv.paidAt!),
              0
            ) /
              settledInvoices.length) *
              10
          ) / 10
        : 0;

    return {
      totalRevenueInvoiced,
      totalPaymentsReceived,
      outstandingPayments,
      overdueCount,
      overdueAmount,
      avgCollectionDays,
      settledCount: settledInvoices.length,
      collectionRate:
        totalRevenueInvoiced > 0
          ? Math.round((totalPaymentsReceived / totalRevenueInvoiced) * 100)
          : 0,
    };
  }, [invoices, payments]);

  const monthlySeries = useMemo<MonthBucket[]>(() => {
    const now = new Date();
    const buckets: MonthBucket[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        timeZone: 'UTC',
      }).format(d);
      buckets.push({ key, label, invoiced: 0, collected: 0 });
    }
    const bucketMap = new Map(buckets.map((b) => [b.key, b]));

    for (const inv of invoices) {
      if (deriveInvoiceStatus(inv) === 'draft') continue;
      const monthKey = inv.issueDate.slice(0, 7);
      const bucket = bucketMap.get(monthKey);
      if (bucket) {
        bucket.invoiced += computeInvoiceTotal(inv);
      }
    }

    for (const pay of payments) {
      const monthKey = pay.paidAt.slice(0, 7);
      const bucket = bucketMap.get(monthKey);
      if (bucket) {
        bucket.collected += pay.amount;
      }
    }

    return buckets;
  }, [invoices, payments]);

  const maxMonthlyValue = useMemo(() => {
    const max = Math.max(
      1000,
      ...monthlySeries.map((m) => Math.max(m.invoiced, m.collected))
    );
    return max * 1.12;
  }, [monthlySeries]);

  const agingBuckets = useMemo(() => {
    const buckets = [
      { label: 'Current (Not yet due)', count: 0, amount: 0, tone: 'bg-blue-600' },
      { label: '1 – 15 days overdue', count: 0, amount: 0, tone: 'bg-amber-500' },
      { label: '16 – 30 days overdue', count: 0, amount: 0, tone: 'bg-orange-600' },
      { label: '31+ days overdue', count: 0, amount: 0, tone: 'bg-red-600' },
    ];

    let totalOpen = 0;
    for (const inv of invoices) {
      const status = deriveInvoiceStatus(inv);
      if (status === 'draft' || status === 'paid') continue;
      const balance = computeInvoiceBalance(inv);
      if (balance <= 0.01) continue;
      totalOpen += balance;
      const daysPast = getDaysFromDue(inv.dueDate);
      if (daysPast <= 0) {
        buckets[0].count += 1;
        buckets[0].amount += balance;
      } else if (daysPast <= 15) {
        buckets[1].count += 1;
        buckets[1].amount += balance;
      } else if (daysPast <= 30) {
        buckets[2].count += 1;
        buckets[2].amount += balance;
      } else {
        buckets[3].count += 1;
        buckets[3].amount += balance;
      }
    }

    return { buckets, totalOpen };
  }, [invoices]);

  const attentionQueue = useMemo(() => {
    return invoices
      .filter((inv) => {
        const status = deriveInvoiceStatus(inv);
        return status !== 'draft' && status !== 'paid' && computeInvoiceBalance(inv) > 0.01;
      })
      .sort((a, b) => getDaysFromDue(b.dueDate) - getDaysFromDue(a.dueDate))
      .slice(0, 6);
  }, [invoices]);

  const recentPayments = useMemo(() => {
    return [...payments]
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
      .slice(0, 5);
  }, [payments]);

  const invoiceMap = useMemo(
    () => new Map(invoices.map((i) => [i.id, i])),
    [invoices]
  );

  const activeMonth =
    monthlySeries.find((m) => m.key === hoveredMonthKey) ||
    monthlySeries[monthlySeries.length - 1];

  return (
    <div className="space-y-6">
      {/* 5-Metric Primary KPI Strip */}
      <section
        aria-label="Key financial metrics"
        className="bg-white border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
      >
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Total Revenue Invoiced</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
            {formatCurrency(metrics.totalRevenueInvoiced)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {invoices.filter((i) => deriveInvoiceStatus(i) !== 'draft').length} issued invoices
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Total Payments Received</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums tracking-tight">
            {formatCurrency(metrics.totalPaymentsReceived)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {metrics.collectionRate}% collection rate
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Outstanding Payments</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
            {formatCurrency(metrics.outstandingPayments)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            Across open receivables
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Overdue Invoices</div>
          <div className="mt-2 text-2xl font-bold text-red-600 font-mono tabular-nums tracking-tight">
            {formatCurrency(metrics.overdueAmount)}
          </div>
          <div className="mt-1.5 text-xs text-red-600 font-medium tabular-nums">
            {metrics.overdueCount} {metrics.overdueCount === 1 ? 'invoice' : 'invoices'} past due
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Avg. Collection Time</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
            {metrics.avgCollectionDays} days
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            From {metrics.settledCount} settled invoices
          </div>
        </div>
      </section>

      {/* Analytics Row: Monthly Invoiced vs Collected + Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Revenue Invoiced vs. Payments Collected
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                6-month billing and settlement performance
              </p>
            </div>
            {activeMonth && (
              <div className="flex items-center gap-5 text-xs">
                <div>
                  <span className="text-slate-500">{activeMonth.label} Invoiced: </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(activeMonth.invoiced)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Collected: </span>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    {formatCurrency(activeMonth.collected)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6">
            <div className="grid grid-cols-6 gap-3 sm:gap-5 items-end h-56 pt-4">
              {monthlySeries.map((month) => {
                const invPct = Math.round((month.invoiced / maxMonthlyValue) * 100);
                const colPct = Math.round((month.collected / maxMonthlyValue) * 100);
                const isSelected = activeMonth?.key === month.key;

                return (
                  <div
                    key={month.key}
                    onMouseEnter={() => setHoveredMonthKey(month.key)}
                    onMouseLeave={() => setHoveredMonthKey(null)}
                    className={`flex flex-col items-center h-full justify-end rounded-lg px-1.5 py-2 transition-colors cursor-default ${
                      isSelected ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="text-[11px] font-mono text-slate-500 tabular-nums mb-2">
                      {month.invoiced > 0 ? formatCompactCurrency(month.invoiced) : '$0'}
                    </div>
                    <div className="w-full flex items-end justify-center gap-1.5 h-36">
                      <div
                        className="w-4 sm:w-5 bg-slate-800 rounded-t-sm transition-all duration-200"
                        style={{ height: `${Math.max(month.invoiced > 0 ? 6 : 2, invPct)}%` }}
                        title={`${month.label} Invoiced: ${formatCurrency(month.invoiced)}`}
                      />
                      <div
                        className="w-4 sm:w-5 bg-emerald-600 rounded-t-sm transition-all duration-200"
                        style={{ height: `${Math.max(month.collected > 0 ? 6 : 2, colPct)}%` }}
                        title={`${month.label} Collected: ${formatCurrency(month.collected)}`}
                      />
                    </div>
                    <div className="mt-2.5 text-xs font-medium text-slate-600">{month.label}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-5">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-slate-800 rounded-xs inline-block" />
                  Invoiced
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-emerald-600 rounded-xs inline-block" />
                  Collected
                </span>
              </div>
              <span className="tabular-nums">Hover a month to inspect totals</span>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="pb-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Receivables Aging</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Unpaid balances grouped by days past due
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {agingBuckets.buckets.map((bucket) => {
                const widthPct =
                  agingBuckets.totalOpen > 0
                    ? Math.round((bucket.amount / agingBuckets.totalOpen) * 100)
                    : 0;
                return (
                  <div key={bucket.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{bucket.label}</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(bucket.amount)}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${bucket.tone} transition-all duration-200`}
                        style={{ width: `${bucket.amount > 0 ? Math.max(4, widthPct) : 0}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      {bucket.count} {bucket.count === 1 ? 'invoice' : 'invoices'} · {widthPct}% of open balance
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500">Automated email sweep</div>
            <button
              type="button"
              onClick={onRunSweep}
              disabled={sweeping}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sweeping ? 'Running...' : 'Run Sweep Now'}</span>
            </button>
          </div>
        </section>
      </div>

      {/* Bottom Row: Priority Collection Queue + Recent Payments */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Open & Overdue Follow-Up Queue
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Prioritized by days past due — send reminders or copy payment links
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('invoices')}
              className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
            >
              <span>All Invoices</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {attentionQueue.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              All issued invoices are paid in full.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/60">
                    <th className="py-3 pl-6 pr-3">Invoice</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Due Date</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Balance Due</th>
                    <th className="py-3 pl-3 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {attentionQueue.map((inv) => {
                    const cust = customerMap.get(inv.customerId);
                    const balance = computeInvoiceBalance(inv);
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 pl-6 pr-3">
                          <button
                            type="button"
                            onClick={() => onViewInvoice(inv.id)}
                            className="font-mono text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
                          >
                            {inv.invoiceNumber}
                          </button>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-900 truncate max-w-[180px]">
                            {cust?.company || 'Unknown'}
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-[180px]">
                            {cust?.name}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap">
                          {formatDate(inv.dueDate)}
                        </td>
                        <td className="py-3 px-3">
                          <StatusText invoice={inv} />
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(balance)}
                        </td>
                        <td className="py-3 pl-3 pr-6">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSendReminder(inv.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap"
                              title="Send email reminder"
                            >
                              <Mail className="w-3.5 h-3.5 text-slate-500" />
                              <span>Remind</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onCopyPaymentLink(inv.paymentToken)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-md"
                              title="Copy payment link"
                              aria-label="Copy payment link"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenPaymentPortal(inv.paymentToken)}
                              className="p-1.5 text-slate-500 hover:text-blue-700 border border-slate-200 hover:bg-slate-50 rounded-md"
                              title="Open customer payment link"
                              aria-label="Open customer payment link"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recent Payments</h2>
              <p className="text-xs text-slate-500 mt-0.5">Latest customer settlements</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('payments')}
              className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
            >
              <span>History</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {recentPayments.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No payments recorded yet.
              </div>
            ) : (
              recentPayments.map((pay) => {
                const cust = customerMap.get(pay.customerId);
                const inv = invoiceMap.get(pay.invoiceId);
                return (
                  <button
                    key={pay.id}
                    type="button"
                    onClick={() => inv && onViewInvoice(inv.id)}
                    className="w-full text-left px-6 py-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {cust?.company || 'Customer'}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {inv?.invoiceNumber || 'Invoice'} · {pay.method} · {formatDate(pay.paidAt)}
                      </div>
                    </div>
                    <div className="text-sm font-mono font-semibold text-emerald-700 tabular-nums shrink-0">
                      +{formatCurrency(pay.amount)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
