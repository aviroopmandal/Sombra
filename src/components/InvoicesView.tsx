import React, { useMemo, useState } from 'react';
import {
  Copy,
  CreditCard,
  ExternalLink,
  Mail,
  Plus,
  Search,
  Send,
} from 'lucide-react';
import type { Customer, Invoice, InvoiceStatus } from '../types.ts';
import {
  computeInvoiceBalance,
  computeInvoiceTotal,
  deriveInvoiceStatus,
  formatCurrency,
  formatDate,
} from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface InvoicesViewProps {
  invoices: Invoice[];
  customers: Customer[];
  onNewInvoice: () => void;
  onViewInvoice: (invoiceId: string) => void;
  onSendInvoice: (invoiceId: string) => Promise<void>;
  onSendReminder: (invoiceId: string) => void;
  onRecordPayment: (invoiceId: string) => void;
  onCopyPaymentLink: (token: string) => void;
  onOpenPaymentPortal: (token: string) => void;
}

type FilterValue = 'all' | InvoiceStatus;

const FILTER_OPTIONS: Array<{ value: FilterValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'sent', label: 'Sent' },
  { value: 'partial', label: 'Partial' },
  { value: 'draft', label: 'Drafts' },
  { value: 'paid', label: 'Paid' },
];

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  invoices,
  customers,
  onNewInvoice,
  onViewInvoice,
  onSendInvoice,
  onSendReminder,
  onRecordPayment,
  onCopyPaymentLink,
  onOpenPaymentPortal,
}) => {
  const [filter, setFilter] = useState<FilterValue>('all');
  const [search, setSearch] = useState('');

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );

  const countsByStatus = useMemo(() => {
    const counts: Record<FilterValue, number> = {
      all: invoices.length,
      overdue: 0,
      sent: 0,
      partial: 0,
      draft: 0,
      paid: 0,
    };
    for (const inv of invoices) {
      const st = deriveInvoiceStatus(inv);
      counts[st] += 1;
    }
    return counts;
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      const st = deriveInvoiceStatus(inv);
      if (filter !== 'all' && st !== filter) return false;
      if (!q) return true;
      const cust = customerMap.get(inv.customerId);
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (cust?.company.toLowerCase().includes(q) ?? false) ||
        (cust?.name.toLowerCase().includes(q) ?? false) ||
        (cust?.email.toLowerCase().includes(q) ?? false)
      );
    });
  }, [invoices, filter, search, customerMap]);

  const summary = useMemo(() => {
    let total = 0;
    let paid = 0;
    let outstanding = 0;
    for (const inv of filteredInvoices) {
      const st = deriveInvoiceStatus(inv);
      if (st === 'draft') continue;
      total += computeInvoiceTotal(inv);
      paid += inv.amountPaid;
      outstanding += computeInvoiceBalance(inv);
    }
    return { total, paid, outstanding };
  }, [filteredInvoices]);

  return (
    <div className="space-y-5">
      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}{' '}
                <span className="font-mono text-[11px] text-slate-400 tabular-nums ml-1">
                  {countsByStatus[opt.value]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice # or customer..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={onNewInvoice}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* Ledger Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="text-slate-500">
          Showing <span className="font-semibold text-slate-900 tabular-nums">{filteredInvoices.length}</span>{' '}
          {filteredInvoices.length === 1 ? 'invoice' : 'invoices'}
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-slate-500">Invoiced: </span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.total)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Collected: </span>
            <span className="font-mono font-semibold text-emerald-700 tabular-nums">
              {formatCurrency(summary.paid)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Outstanding: </span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {formatCurrency(summary.outstanding)}
            </span>
          </div>
        </div>
      </div>

      {/* High-Density Invoice Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-sm font-medium text-slate-900">No invoices match your filter</div>
            <p className="text-xs text-slate-500 mt-1">
              Try clearing your search or create a new invoice to get started.
            </p>
            <button
              type="button"
              onClick={onNewInvoice}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Invoice</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 pl-6 pr-3">Invoice #</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Issued</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-3 text-right">Paid</th>
                  <th className="py-3 px-3 text-right">Balance Due</th>
                  <th className="py-3 pl-3 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredInvoices.map((inv) => {
                  const cust = customerMap.get(inv.customerId);
                  const total = computeInvoiceTotal(inv);
                  const balance = computeInvoiceBalance(inv);
                  const status = deriveInvoiceStatus(inv);

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
                        <div className="font-medium text-slate-900 truncate max-w-[200px]">
                          {cust?.company || 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">
                          {cust?.name} · {cust?.email}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDate(inv.issueDate)}
                      </td>
                      <td className="py-3 px-3 text-xs font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDate(inv.dueDate)}
                      </td>
                      <td className="py-3 px-3">
                        <StatusText invoice={inv} />
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {formatCurrency(total)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs text-emerald-700 tabular-nums whitespace-nowrap">
                        {formatCurrency(inv.amountPaid)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(balance)}
                      </td>
                      <td className="py-3 pl-3 pr-6">
                        <div className="flex items-center justify-end gap-1">
                          {status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => onSendInvoice(inv.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md whitespace-nowrap"
                              title="Issue invoice"
                            >
                              <Send className="w-3 h-3" />
                              <span>Issue</span>
                            </button>
                          )}
                          {status !== 'paid' && status !== 'draft' && (
                            <>
                              <button
                                type="button"
                                onClick={() => onRecordPayment(inv.id)}
                                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap"
                                title="Record payment"
                              >
                                <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                                <span>Pay</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onSendReminder(inv.id)}
                                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap"
                                title="Send reminder email"
                              >
                                <Mail className="w-3.5 h-3.5 text-slate-500" />
                                <span>Remind</span>
                              </button>
                            </>
                          )}
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
                            title="Open payment portal"
                            aria-label="Open payment portal"
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
      </div>
    </div>
  );
};
