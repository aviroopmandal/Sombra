import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Customer, Invoice, PaymentMethod } from '../types.ts';
import {
  computeInvoiceBalance,
  deriveInvoiceStatus,
  formatCurrency,
} from '../utils/format.ts';

interface RecordPaymentModalProps {
  invoices: Invoice[];
  customers: Customer[];
  initialInvoiceId?: string | null;
  onClose: () => void;
  onSave: (payload: {
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    reference: string;
    notes: string;
  }) => Promise<void>;
}

const METHODS: PaymentMethod[] = ['ACH Transfer', 'Card', 'Wire', 'Check'];

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  invoices,
  customers,
  initialInvoiceId,
  onClose,
  onSave,
}) => {
  const unpaidInvoices = useMemo(
    () =>
      invoices.filter((inv) => {
        const st = deriveInvoiceStatus(inv);
        return st !== 'paid' && computeInvoiceBalance(inv) > 0.01;
      }),
    [invoices]
  );

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );

  const defaultInvoiceId =
    initialInvoiceId && unpaidInvoices.some((i) => i.id === initialInvoiceId)
      ? initialInvoiceId
      : unpaidInvoices[0]?.id || '';

  const [invoiceId, setInvoiceId] = useState(defaultInvoiceId);
  const selectedInvoice = unpaidInvoices.find((i) => i.id === invoiceId);
  const maxBalance = selectedInvoice ? computeInvoiceBalance(selectedInvoice) : 0;

  const [amount, setAmount] = useState<string>(maxBalance ? maxBalance.toFixed(2) : '');
  const [method, setMethod] = useState<PaymentMethod>('ACH Transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInvoiceSelect = (nextId: string) => {
    setInvoiceId(nextId);
    const inv = unpaidInvoices.find((i) => i.id === nextId);
    if (inv) {
      setAmount(computeInvoiceBalance(inv).toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const numAmount = Number(amount);
    if (!invoiceId || Number.isNaN(numAmount) || numAmount <= 0) {
      setError('Select an invoice and enter a valid payment amount.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        invoiceId,
        amount: numAmount,
        method,
        reference,
        notes,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Record Payment</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-3.5 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {unpaidInvoices.length === 0 ? (
            <div className="text-sm text-slate-600 py-4">
              All invoices are currently paid in full.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Invoice
                </label>
                <select
                  value={invoiceId}
                  onChange={(e) => handleInvoiceSelect(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {unpaidInvoices.map((inv) => {
                    const cust = customerMap.get(inv.customerId);
                    const bal = computeInvoiceBalance(inv);
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — {cust?.company} ({formatCurrency(bal)} due)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Amount (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={maxBalance}
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                    Remaining balance: {formatCurrency(maxBalance)}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reference / Transaction ID
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Optional (auto-generated if blank)"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional settlement note"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </>
          )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              Cancel
            </button>
            {unpaidInvoices.length > 0 && (
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Recording...' : 'Record Payment'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
