import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, CreditCard, Lock, Printer } from 'lucide-react';
import type { Customer, Invoice, Payment, PaymentMethod } from '../types.ts';
import {
  computeInvoiceSubtotal,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '../utils/format.ts';

interface PaymentPortalProps {
  token: string;
  onExitPortal?: () => void;
  onPaymentCompleted?: () => void;
}

interface PortalPayload {
  invoice: Invoice & { total: number; balanceDue: number };
  customer: Customer;
  payments: Payment[];
}

export const PaymentPortal: React.FC<PaymentPortalProps> = ({
  token,
  onExitPortal,
  onPaymentCompleted,
}) => {
  const [data, setData] = useState<PortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payMode, setPayMode] = useState<'full' | 'custom'>('full');
  const [customAmount, setCustomAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Card');
  const [cardLast4, setCardLast4] = useState('4242');
  const [accountHolder, setAccountHolder] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);

  const loadPortal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Payment link not found.');
      }
      setData(json as PortalPayload);
      setAccountHolder(json.customer?.name || '');
      setCustomAmount(String((json.invoice?.balanceDue ?? 0).toFixed(2)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payment link.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortal();
  }, [token]);

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setSubmitError(null);

    const amountToPay =
      payMode === 'full' ? data.invoice.balanceDue : Number(customAmount);

    if (
      Number.isNaN(amountToPay) ||
      amountToPay <= 0 ||
      amountToPay > data.invoice.balanceDue + 0.01
    ) {
      setSubmitError(
        `Enter an amount between $0.01 and ${formatCurrency(data.invoice.balanceDue)}.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountToPay,
          method,
          notes: `Paid online by ${accountHolder || data.customer.name} via ${method}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Payment could not be processed.');
      }
      setReceiptPayment(json.payment as Payment);
      await loadPortal();
      onPaymentCompleted?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-slate-900">
            ClearLedger
          </span>
          <span className="text-slate-300" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-medium text-slate-500">
            Hosted Invoice Checkout
          </span>
        </div>

        {onExitPortal && (
          <button
            type="button"
            onClick={onExitPortal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>
        )}
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
            Loading invoice details...
          </div>
        ) : error || !data ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <div className="text-base font-semibold text-slate-900">
              Payment Link Unavailable
            </div>
            <p className="text-sm text-slate-500">{error}</p>
            {onExitPortal && (
              <button
                type="button"
                onClick={onExitPortal}
                className="mt-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg"
              >
                Return to Dashboard
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Invoice Breakdown */}
            <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-slate-200">
                <div>
                  <div className="text-xs font-medium text-slate-500">Invoice</div>
                  <h1 className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                    {data.invoice.invoiceNumber}
                  </h1>
                  <div className="text-xs text-slate-500 mt-1">
                    Issued {formatDate(data.invoice.issueDate)} · Due{' '}
                    {formatDate(data.invoice.dueDate)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium text-slate-500">Balance Due</div>
                  <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-0.5">
                    {formatCurrency(data.invoice.balanceDue)}
                  </div>
                </div>
              </div>

              <div className="text-sm">
                <div className="text-xs font-medium text-slate-500">Billed To</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {data.customer.company}
                </div>
                <div className="text-slate-600 text-xs mt-0.5">
                  {data.customer.name} · {data.customer.email}
                </div>
                {data.customer.address && (
                  <div className="text-slate-500 text-xs mt-0.5">
                    {data.customer.address}
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {data.invoice.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 px-4 text-slate-900">
                          <div>{item.description}</div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums">
                            {formatCurrency(item.unitPrice)} each
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600 tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 tabular-nums">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 text-sm pt-2">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(computeInvoiceSubtotal(data.invoice))}
                  </span>
                </div>
                {data.invoice.taxRate > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax ({data.invoice.taxRate}%)</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(
                        data.invoice.total - computeInvoiceSubtotal(data.invoice)
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-100">
                  <span>Invoice Total</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(data.invoice.total)}
                  </span>
                </div>
                {data.invoice.amountPaid > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Payments Applied</span>
                    <span className="font-mono tabular-nums">
                      −{formatCurrency(data.invoice.amountPaid)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Remaining Balance</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(data.invoice.balanceDue)}
                  </span>
                </div>
              </div>
            </section>

            {/* Right Payment Form or Paid Receipt */}
            <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              {receiptPayment && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Payment Confirmed</span>
                  </div>
                  <div className="text-xs text-emerald-900 space-y-1">
                    <div>
                      Amount paid:{' '}
                      <span className="font-mono font-semibold tabular-nums">
                        {formatCurrency(receiptPayment.amount)}
                      </span>
                    </div>
                    <div>
                      Reference:{' '}
                      <span className="font-mono">{receiptPayment.reference}</span>
                    </div>
                    <div>Date: {formatDateTime(receiptPayment.paidAt)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 hover:underline no-print"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Receipt</span>
                  </button>
                </div>
              )}

              {data.invoice.balanceDue <= 0.01 ? (
                <div className="py-6 text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h2 className="text-lg font-bold text-slate-900">
                    Invoice Paid in Full
                  </h2>
                  <p className="text-xs text-slate-500">
                    No further balance is due on {data.invoice.invoiceNumber}.
                  </p>
                  {onExitPortal && (
                    <button
                      type="button"
                      onClick={onExitPortal}
                      className="mt-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                    >
                      Return to Dashboard
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handlePaySubmit} className="space-y-4">
                  <div className="pb-3 border-b border-slate-200">
                    <h2 className="text-base font-semibold text-slate-900">
                      Complete Payment
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pay securely via Card, ACH Transfer, or Wire
                    </p>
                  </div>

                  {submitError && (
                    <div className="px-3.5 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
                      {submitError}
                    </div>
                  )}

                  {/* Full vs Partial Selector */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-700">
                      Payment Amount
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPayMode('full')}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border text-left transition-colors ${
                          payMode === 'full'
                            ? 'border-blue-700 bg-blue-50 text-blue-900'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div>Full Balance</div>
                        <div className="font-mono font-semibold tabular-nums mt-0.5">
                          {formatCurrency(data.invoice.balanceDue)}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayMode('custom')}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border text-left transition-colors ${
                          payMode === 'custom'
                            ? 'border-blue-700 bg-blue-50 text-blue-900'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div>Custom Amount</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Partial payment
                        </div>
                      </button>
                    </div>

                    {payMode === 'custom' && (
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={data.invoice.balanceDue}
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    )}
                  </div>

                  {/* Method */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Payment Method
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Card', 'ACH Transfer', 'Wire'] as PaymentMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMethod(m)}
                          className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                            method === m
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {m === 'ACH Transfer' ? 'ACH Bank' : m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Authorized Payer Name
                    </label>
                    <input
                      type="text"
                      required
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {method === 'Card' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Card Ending Digits
                      </label>
                      <div className="relative">
                        <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          maxLength={4}
                          value={cardLast4}
                          onChange={(e) =>
                            setCardLast4(e.target.value.replace(/\D/g, ''))
                          }
                          placeholder="4242"
                          className="w-full pl-9 pr-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    <span>
                      {submitting
                        ? 'Processing Payment...'
                        : `Pay ${formatCurrency(
                            payMode === 'full'
                              ? data.invoice.balanceDue
                              : Number(customAmount) || 0
                          )}`}
                    </span>
                  </button>
                </form>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
