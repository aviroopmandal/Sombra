import React from 'react';
import {
  Copy,
  CreditCard,
  Edit3,
  ExternalLink,
  Mail,
  Printer,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { Customer, Invoice, Payment, ReminderLog } from '../types.ts';
import {
  computeInvoiceBalance,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  deriveInvoiceStatus,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '../utils/format.ts';
import { StatusText } from './StatusText.tsx';

interface InvoiceDetailModalProps {
  invoice: Invoice;
  customer: Customer | undefined;
  payments: Payment[];
  reminderLogs: ReminderLog[];
  onClose: () => void;
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoiceId: string) => Promise<void>;
  onSendInvoice: (invoiceId: string) => Promise<void>;
  onSendReminder: (invoiceId: string) => void;
  onRecordPayment: (invoiceId: string) => void;
  onCopyPaymentLink: (token: string) => void;
  onOpenPaymentPortal: (token: string) => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  invoice,
  customer,
  payments,
  reminderLogs,
  onClose,
  onEdit,
  onDelete,
  onSendInvoice,
  onSendReminder,
  onRecordPayment,
  onCopyPaymentLink,
  onOpenPaymentPortal,
}) => {
  const subtotal = computeInvoiceSubtotal(invoice);
  const total = computeInvoiceTotal(invoice);
  const taxAmount = Math.max(0, total - subtotal);
  const balance = computeInvoiceBalance(invoice);
  const status = deriveInvoiceStatus(invoice);
  const paymentUrl = `${window.location.origin}/pay/${invoice.paymentToken}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold font-mono text-slate-900">
              {invoice.invoiceNumber}
            </h2>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <StatusText invoice={invoice} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {status === 'draft' && (
              <button
                type="button"
                onClick={() => onSendInvoice(invoice.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Issue Invoice</span>
              </button>
            )}
            {status !== 'paid' && status !== 'draft' && (
              <>
                <button
                  type="button"
                  onClick={() => onRecordPayment(invoice.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Record Payment</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSendReminder(invoice.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Send Reminder</span>
                </button>
              </>
            )}
            {status !== 'paid' && (
              <button
                type="button"
                onClick={() => onEdit(invoice)}
                className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg"
                title="Edit invoice"
                aria-label="Edit invoice"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg"
              title="Print invoice"
              aria-label="Print invoice"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                await onDelete(invoice.id);
                onClose();
              }}
              className="p-1.5 text-slate-400 hover:text-red-600 border border-slate-200 hover:bg-red-50 rounded-lg"
              title="Delete invoice"
              aria-label="Delete invoice"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              aria-label="Close detail"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Payment Link Strip */}
          {status !== 'paid' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-700">Customer Payment Link</div>
                <div className="text-xs font-mono text-slate-500 truncate mt-0.5">
                  {paymentUrl}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onCopyPaymentLink(invoice.paymentToken)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPaymentPortal(invoice.paymentToken)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Pay Portal</span>
                </button>
              </div>
            </div>
          )}

          {/* Customer & Invoice Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-6 border-b border-slate-200">
            <div>
              <div className="text-xs font-medium text-slate-500">Billed To</div>
              <div className="mt-1 text-base font-semibold text-slate-900">
                {customer?.company || 'Unknown Customer'}
              </div>
              <div className="text-sm text-slate-600">{customer?.name}</div>
              <div className="text-xs text-slate-500 mt-1">{customer?.email}</div>
              {customer?.phone && (
                <div className="text-xs text-slate-500">{customer.phone}</div>
              )}
              {customer?.address && (
                <div className="text-xs text-slate-500 mt-1">{customer.address}</div>
              )}
            </div>

            <div className="sm:text-right space-y-1.5 text-sm">
              <div>
                <span className="text-slate-500">Issue Date: </span>
                <span className="font-mono text-slate-900 tabular-nums">
                  {formatDate(invoice.issueDate)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Due Date: </span>
                <span className="font-mono text-slate-900 tabular-nums">
                  {formatDate(invoice.dueDate)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Payment Terms: </span>
                <span className="text-slate-900">
                  Net {customer?.paymentTermsDays ?? 30}
                </span>
              </div>
              {invoice.paidAt && (
                <div>
                  <span className="text-slate-500">Settled On: </span>
                  <span className="font-mono text-emerald-700 tabular-nums">
                    {formatDate(invoice.paidAt)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Item Description</th>
                  <th className="py-2.5 px-4 text-right">Qty</th>
                  <th className="py-2.5 px-4 text-right">Unit Price</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {invoice.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 px-4 text-slate-900">{item.description}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 tabular-nums">
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            <div className="text-xs text-slate-600">
              {invoice.notes && (
                <div>
                  <div className="font-medium text-slate-700 mb-1">Invoice Notes</div>
                  <p className="leading-relaxed">{invoice.notes}</p>
                </div>
              )}
            </div>

            <div className="space-y-2 text-sm border border-slate-200 rounded-lg p-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-mono text-slate-900 tabular-nums">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tax ({invoice.taxRate}%)</span>
                <span className="font-mono text-slate-900 tabular-nums">
                  {formatCurrency(taxAmount)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="font-medium text-slate-900">Total</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Amount Paid</span>
                <span className="font-mono tabular-nums">
                  −{formatCurrency(invoice.amountPaid)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-bold text-slate-900">
                <span>Balance Due</span>
                <span className="font-mono tabular-nums">{formatCurrency(balance)}</span>
              </div>
            </div>
          </div>

          {/* Payment History & Reminder History for this Invoice */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200 no-print">
            <div>
              <h3 className="text-xs font-semibold text-slate-900 mb-3">
                Payment History ({payments.length})
              </h3>
              {payments.length === 0 ? (
                <div className="text-xs text-slate-500 py-3 border border-slate-200 rounded-lg px-4">
                  No payments applied to this invoice yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {payments.map((p) => (
                    <div key={p.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium text-slate-900">
                          {p.method} · <span className="font-mono text-slate-500">{p.reference}</span>
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          {formatDateTime(p.paidAt)} ·{' '}
                          {p.source === 'payment_link' ? 'Payment Link' : 'Manual'}
                        </div>
                      </div>
                      <div className="font-mono font-semibold text-emerald-700 tabular-nums">
                        {formatCurrency(p.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-900 mb-3">
                Reminder Emails Sent ({reminderLogs.length})
              </h3>
              {reminderLogs.length === 0 ? (
                <div className="text-xs text-slate-500 py-3 border border-slate-200 rounded-lg px-4">
                  No payment reminders sent for this invoice yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {reminderLogs.map((log) => (
                    <div key={log.id} className="px-4 py-2.5 text-xs">
                      <div className="font-medium text-slate-900 truncate">{log.subject}</div>
                      <div className="text-slate-500 mt-0.5 flex items-center justify-between">
                        <span>
                          {log.triggerType === 'automated' ? 'Automated' : 'Manual'} ·{' '}
                          {log.recipientEmail}
                        </span>
                        <span className="tabular-nums">{formatDateTime(log.sentAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
