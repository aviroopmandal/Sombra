import React, { useState } from 'react';
import { Send, X } from 'lucide-react';
import type { Customer, Invoice, ReminderTemplate } from '../types.ts';
import { computeInvoiceBalance, formatCurrency, renderReminderTemplate } from '../utils/format.ts';

interface SendReminderModalProps {
  invoice: Invoice;
  customer: Customer;
  templates: ReminderTemplate[];
  onClose: () => void;
  onSend: (payload: {
    invoiceId: string;
    templateId: string;
    subject: string;
    body: string;
  }) => Promise<void>;
}

export const SendReminderModal: React.FC<SendReminderModalProps> = ({
  invoice,
  customer,
  templates,
  onClose,
  onSend,
}) => {
  const defaultTemplate = templates[0];
  const [templateId, setTemplateId] = useState(defaultTemplate?.id || '');
  const [subject, setSubject] = useState(
    defaultTemplate
      ? renderReminderTemplate(
          defaultTemplate.subject,
          invoice,
          customer,
          window.location.origin
        )
      : ''
  );
  const [body, setBody] = useState(
    defaultTemplate
      ? renderReminderTemplate(
          defaultTemplate.body,
          invoice,
          customer,
          window.location.origin
        )
      : ''
  );
  const [sending, setSending] = useState(false);

  const handleTemplateChange = (nextId: string) => {
    setTemplateId(nextId);
    const tpl = templates.find((t) => t.id === nextId);
    if (tpl) {
      setSubject(
        renderReminderTemplate(tpl.subject, invoice, customer, window.location.origin)
      );
      setBody(renderReminderTemplate(tpl.body, invoice, customer, window.location.origin));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await onSend({ invoiceId: invoice.id, templateId, subject, body });
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Send Payment Reminder
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {invoice.invoiceNumber} · {customer.company} · Balance{' '}
              <span className="font-mono tabular-nums">
                {formatCurrency(computeInvoiceBalance(invoice))}
              </span>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Recipient Email
              </label>
              <input
                type="text"
                readOnly
                value={customer.email}
                className="w-full px-3 py-2 text-sm bg-slate-50 text-slate-600 border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reminder Template
              </label>
              <select
                value={templateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Message Body (includes Payment Link)
            </label>
            <textarea
              rows={8}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 text-sm leading-relaxed border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Sending...' : 'Send Reminder Email'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
