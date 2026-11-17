import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { Customer, Invoice, InvoiceLineItem } from '../types.ts';
import { formatCurrency } from '../utils/format.ts';

interface InvoiceFormModalProps {
  customers: Customer[];
  existingInvoice?: Invoice | null;
  initialCustomerId?: string | null;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    customerId: string;
    issueDate: string;
    dueDate: string;
    taxRate: number;
    notes: string;
    lineItems: InvoiceLineItem[];
    status: 'draft' | 'sent';
    sendImmediately?: boolean;
  }) => Promise<void>;
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(baseIso);
  if (Number.isNaN(d.getTime())) return baseIso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const InvoiceFormModal: React.FC<InvoiceFormModalProps> = ({
  customers,
  existingInvoice,
  initialCustomerId: preselectedCustomerId,
  onClose,
  onSave,
}) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const initialCustomerId =
    existingInvoice?.customerId || preselectedCustomerId || customers[0]?.id || '';
  const initialCustomer = customers.find((c) => c.id === initialCustomerId);

  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [issueDate, setIssueDate] = useState(existingInvoice?.issueDate || todayIso);
  const [dueDate, setDueDate] = useState(
    existingInvoice?.dueDate || addDaysIso(todayIso, initialCustomer?.paymentTermsDays || 30)
  );
  const [taxRate, setTaxRate] = useState<number>(existingInvoice?.taxRate ?? 0);
  const [notes, setNotes] = useState(existingInvoice?.notes || '');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(
    existingInvoice?.lineItems.length
      ? existingInvoice.lineItems
      : [{ id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0 }]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCustomerChange = (newId: string) => {
    setCustomerId(newId);
    if (!existingInvoice) {
      const cust = customers.find((c) => c.id === newId);
      if (cust) {
        setDueDate(addDaysIso(issueDate, cust.paymentTermsDays));
      }
    }
  };

  const handleIssueDateChange = (newDate: string) => {
    setIssueDate(newDate);
    if (!existingInvoice) {
      const cust = customers.find((c) => c.id === customerId);
      setDueDate(addDaysIso(newDate, cust?.paymentTermsDays || 30));
    }
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: `li_${Date.now()}_${prev.length}`, description: '', quantity: 1, unitPrice: 0 },
    ]);
  };

  const updateLineItem = (index: number, patch: Partial<InvoiceLineItem>) => {
    setLineItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    );
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const subtotal = lineItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );
  const taxAmount = subtotal * (Number(taxRate) / 100);
  const total = subtotal + taxAmount;

  const submitForm = async (mode: 'draft' | 'send') => {
    setError(null);
    if (!customerId) {
      setError('Please select a customer.');
      return;
    }
    const validItems = lineItems.filter(
      (item) => item.description.trim() && Number(item.quantity) > 0
    );
    if (validItems.length === 0) {
      setError('Add at least one line item with a description and quantity.');
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        id: existingInvoice?.id,
        customerId,
        issueDate,
        dueDate,
        taxRate: Number(taxRate) || 0,
        notes,
        lineItems: validItems.map((i) => ({
          ...i,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice) || 0,
        })),
        status: mode === 'draft' ? 'draft' : 'sent',
        sendImmediately: mode === 'send',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {existingInvoice ? `Edit ${existingInvoice.invoiceNumber}` : 'Create Invoice'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              A unique payment link will be generated automatically for this invoice.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="px-4 py-2.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Customer
              </label>
              <select
                value={customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {customers.length === 0 && <option value="">No customers available</option>}
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company} ({c.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Issue Date
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => handleIssueDateChange(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-700">Line Items</label>
              <button
                type="button"
                onClick={addLineItem}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Line Item</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3 w-24 text-right">Qty</th>
                    <th className="py-2 px-3 w-32 text-right">Unit Price</th>
                    <th className="py-2 px-3 w-28 text-right">Amount</th>
                    <th className="py-2 px-2 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineItems.map((item, idx) => {
                    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                    return (
                      <tr key={item.id}>
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) =>
                              updateLineItem(idx, { description: e.target.value })
                            }
                            placeholder="Service or deliverable description"
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={1}
                            step="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateLineItem(idx, { quantity: Number(e.target.value) })
                            }
                            className="w-full px-2.5 py-1.5 text-sm font-mono text-right border border-slate-200 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateLineItem(idx, { unitPrice: Number(e.target.value) })
                            }
                            className="w-full px-2.5 py-1.5 text-sm font-mono text-right border border-slate-200 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </td>
                        <td className="p-2 text-right font-mono text-sm text-slate-900 tabular-nums">
                          {formatCurrency(lineTotal)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeLineItem(idx)}
                            disabled={lineItems.length <= 1}
                            className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30"
                            aria-label="Remove line item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tax & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Notes / Payment Instructions
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="PO reference, wire instructions, or project notes..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-mono text-slate-900 tabular-nums">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-slate-600 flex items-center gap-2">
                  <span>Tax (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step="0.25"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-20 px-2 py-1 text-xs font-mono text-right bg-white border border-slate-200 rounded-md tabular-nums"
                  />
                </label>
                <span className="font-mono text-slate-900 tabular-nums">
                  {formatCurrency(taxAmount)}
                </span>
              </div>
              <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between font-semibold text-slate-900">
                <span>Invoice Total</span>
                <span className="font-mono text-base tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => submitForm('draft')}
            className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => submitForm('send')}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save & Issue Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
};
