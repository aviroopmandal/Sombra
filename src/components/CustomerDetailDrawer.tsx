import React, { useMemo, useState } from 'react';
import { Edit3, Mail, MapPin, Phone, Plus, Trash2, X } from 'lucide-react';
import type { Customer, Invoice, Payment, ReminderLog } from '../types.ts';
import {
  computeInvoiceBalance,
  computeInvoiceTotal,
  deriveInvoiceStatus,
  formatCurrency,
  formatDate,
  formatDateTime,
  getDaysBetween,
} from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface CustomerDetailDrawerProps {
  customer: Customer;
  invoices: Invoice[];
  payments: Payment[];
  reminderLogs: ReminderLog[];
  onClose: () => void;
  onEditCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customerId: string) => Promise<void>;
  onNewInvoiceForCustomer: (customerId: string) => void;
  onViewInvoice: (invoiceId: string) => void;
  onSendReminder: (invoiceId: string) => void;
}

export const CustomerDetailDrawer: React.FC<CustomerDetailDrawerProps> = ({
  customer,
  invoices,
  payments,
  reminderLogs,
  onClose,
  onEditCustomer,
  onDeleteCustomer,
  onNewInvoiceForCustomer,
  onViewInvoice,
  onSendReminder,
}) => {
  const [subTab, setSubTab] = useState<'invoices' | 'payments' | 'reminders'>('invoices');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const issued = invoices.filter((i) => deriveInvoiceStatus(i) !== 'draft');
    const totalInvoiced = issued.reduce((sum, i) => sum + computeInvoiceTotal(i), 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = issued.reduce((sum, i) => sum + computeInvoiceBalance(i), 0);
    const settled = issued.filter((i) => deriveInvoiceStatus(i) === 'paid' && i.paidAt);
    const avgDays =
      settled.length > 0
        ? Math.round(
            (settled.reduce((sum, i) => sum + getDaysBetween(i.issueDate, i.paidAt!), 0) /
              settled.length) *
              10
          ) / 10
        : null;
    return { totalInvoiced, totalPaid, outstanding, avgDays };
  }, [invoices, payments]);

  const invoiceMap = useMemo(
    () => new Map(invoices.map((i) => [i.id, i])),
    [invoices]
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="w-full max-w-2xl bg-white h-full border-l border-slate-200 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{customer.company}</h2>
            <div className="text-sm text-slate-600">{customer.name} · Net {customer.paymentTermsDays}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEditCustomer(customer)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => onNewInvoiceForCustomer(customer.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Invoice</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {deleteError && (
            <div className="px-4 py-2.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {deleteError}
            </div>
          )}

          {/* Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600 pb-5 border-b border-slate-200">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-slate-900">{customer.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-mono text-slate-900">{customer.phone || 'Not provided'}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{customer.address || 'No billing address on file'}</span>
              </div>
              {customer.notes && (
                <div className="text-slate-500 italic">Note: {customer.notes}</div>
              )}
            </div>
          </div>

          {/* Account Balance Summary */}
          <div className="border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-4">
              <div className="text-[11px] font-medium text-slate-500">Total Invoiced</div>
              <div className="mt-1 text-base font-bold font-mono text-slate-900 tabular-nums">
                {formatCurrency(summary.totalInvoiced)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[11px] font-medium text-slate-500">Total Paid</div>
              <div className="mt-1 text-base font-bold font-mono text-emerald-700 tabular-nums">
                {formatCurrency(summary.totalPaid)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[11px] font-medium text-slate-500">Outstanding Balance</div>
              <div className="mt-1 text-base font-bold font-mono text-slate-900 tabular-nums">
                {formatCurrency(summary.outstanding)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[11px] font-medium text-slate-500">Avg. Pay Time</div>
              <div className="mt-1 text-base font-bold font-mono text-slate-900 tabular-nums">
                {summary.avgDays !== null ? `${summary.avgDays}d` : '—'}
              </div>
            </div>
          </div>

          {/* Sub-Tabs for Invoice History, Payment History, Reminders */}
          <div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-4">
              <button
                type="button"
                onClick={() => setSubTab('invoices')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  subTab === 'invoices'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Invoice History ({invoices.length})
              </button>
              <button
                type="button"
                onClick={() => setSubTab('payments')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  subTab === 'payments'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Payment History ({payments.length})
              </button>
              <button
                type="button"
                onClick={() => setSubTab('reminders')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  subTab === 'reminders'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Reminders ({reminderLogs.length})
              </button>
            </div>

            {subTab === 'invoices' && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {invoices.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No invoices issued to this customer yet.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                        <th className="py-2.5 px-4">Invoice #</th>
                        <th className="py-2.5 px-3">Due</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Balance</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {invoices.map((inv) => {
                        const bal = computeInvoiceBalance(inv);
                        const st = deriveInvoiceStatus(inv);
                        return (
                          <tr key={inv.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4">
                              <button
                                type="button"
                                onClick={() => onViewInvoice(inv.id)}
                                className="font-mono font-semibold text-blue-700 hover:underline"
                              >
                                {inv.invoiceNumber}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600 tabular-nums">
                              {formatDate(inv.dueDate)}
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusText invoice={inv} />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                              {formatCurrency(bal)}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              {st !== 'paid' && st !== 'draft' ? (
                                <button
                                  type="button"
                                  onClick={() => onSendReminder(inv.id)}
                                  className="text-blue-700 hover:underline font-medium"
                                >
                                  Remind
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onViewInvoice(inv.id)}
                                  className="text-slate-600 hover:underline"
                                >
                                  View
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {subTab === 'payments' && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {payments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No payments recorded for this customer yet.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                        <th className="py-2.5 px-4">Date</th>
                        <th className="py-2.5 px-3">Invoice</th>
                        <th className="py-2.5 px-3">Method</th>
                        <th className="py-2.5 px-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {payments.map((pay) => {
                        const inv = invoiceMap.get(pay.invoiceId);
                        return (
                          <tr key={pay.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums">
                              {formatDate(pay.paidAt)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-900">
                              {inv?.invoiceNumber || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {pay.method} · <span className="font-mono">{pay.reference}</span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                              {formatCurrency(pay.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {subTab === 'reminders' && (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {reminderLogs.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No reminder emails sent to this customer yet.
                  </div>
                ) : (
                  reminderLogs.map((log) => (
                    <div key={log.id} className="p-4 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{log.subject}</span>
                        <span className="text-slate-500 tabular-nums shrink-0">
                          {formatDateTime(log.sentAt)}
                        </span>
                      </div>
                      <div className="text-slate-500">
                        {log.triggerType === 'automated' ? 'Automated Reminder' : 'Manual Reminder'} ·{' '}
                        {log.recipientEmail}
                      </div>
                      <p className="text-slate-600 whitespace-pre-line pt-1 leading-relaxed">
                        {log.body}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={async () => {
              setDeleteError(null);
              try {
                await onDeleteCustomer(customer.id);
                onClose();
              } catch (err) {
                setDeleteError(
                  err instanceof Error ? err.message : 'Unable to delete customer.'
                );
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Customer</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
