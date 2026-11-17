import React from 'react';
import type { Invoice } from '../types.ts';
import { deriveInvoiceStatus, getDaysFromDue } from '../utils/format.ts';

interface StatusTextProps {
  invoice: Invoice;
}

export const StatusText: React.FC<StatusTextProps> = ({ invoice }) => {
  const status = deriveInvoiceStatus(invoice);
  const daysFromDue = getDaysFromDue(invoice.dueDate);

  switch (status) {
    case 'paid':
      return <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">Paid</span>;
    case 'overdue':
      return (
        <span className="text-xs font-semibold text-red-600 tabular-nums whitespace-nowrap">
          Overdue · {daysFromDue}d
        </span>
      );
    case 'partial':
      return <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">Partial</span>;
    case 'sent':
      if (daysFromDue === 0) {
        return <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">Due today</span>;
      }
      return <span className="text-xs font-medium text-blue-700 whitespace-nowrap">Sent</span>;
    case 'draft':
      return <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Draft</span>;
  }
};
