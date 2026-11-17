import type { Customer, Invoice, InvoiceStatus } from '../types.ts';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCompactCurrency(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(amount) >= 10_000) {
    return `$${(amount / 1_000).toFixed(1)}k`;
  }
  return formatCurrency(amount);
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(isoDate);
}

export function computeInvoiceSubtotal(invoice: Pick<Invoice, 'lineItems'>): number {
  return invoice.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function computeInvoiceTotal(invoice: Pick<Invoice, 'lineItems' | 'taxRate'>): number {
  const subtotal = computeInvoiceSubtotal(invoice);
  return Math.round((subtotal * (1 + invoice.taxRate / 100)) * 100) / 100;
}

export function computeInvoiceBalance(invoice: Pick<Invoice, 'lineItems' | 'taxRate' | 'amountPaid'>): number {
  const total = computeInvoiceTotal(invoice);
  return Math.max(0, Math.round((total - invoice.amountPaid) * 100) / 100);
}

export function getDaysFromDue(dueDateIso: string, referenceNow: Date = new Date()): number {
  const due = new Date(dueDateIso);
  const dueMidnight = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const nowMidnight = Date.UTC(
    referenceNow.getUTCFullYear(),
    referenceNow.getUTCMonth(),
    referenceNow.getUTCDate()
  );
  return Math.round((nowMidnight - dueMidnight) / (1000 * 60 * 60 * 24));
}

export function getDaysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

export function deriveInvoiceStatus(invoice: Invoice, referenceNow: Date = new Date()): InvoiceStatus {
  const total = computeInvoiceTotal(invoice);
  const balance = Math.max(0, total - invoice.amountPaid);

  if (balance <= 0.01 && total > 0) {
    return 'paid';
  }
  if (invoice.status === 'draft') {
    return 'draft';
  }
  const daysPastDue = getDaysFromDue(invoice.dueDate, referenceNow);
  if (daysPastDue > 0) {
    return 'overdue';
  }
  if (invoice.amountPaid > 0) {
    return 'partial';
  }
  return 'sent';
}

export function renderReminderTemplate(
  templateText: string,
  invoice: Invoice,
  customer: Customer,
  appOrigin: string
): string {
  const balance = computeInvoiceBalance(invoice);
  const daysPastDue = Math.max(0, getDaysFromDue(invoice.dueDate));
  const paymentUrl = `${appOrigin}/pay/${invoice.paymentToken}`;

  const replacements: Record<string, string> = {
    '{{customer_name}}': customer.name,
    '{{company_name}}': customer.company,
    '{{invoice_number}}': invoice.invoiceNumber,
    '{{amount_due}}': formatCurrency(balance),
    '{{total_amount}}': formatCurrency(computeInvoiceTotal(invoice)),
    '{{due_date}}': formatDate(invoice.dueDate),
    '{{days_overdue}}': String(daysPastDue),
    '{{payment_link}}': paymentUrl,
  };

  let output = templateText;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.split(key).join(value);
  }
  return output;
}

export function getStatusLabel(invoice: Invoice): string {
  const status = deriveInvoiceStatus(invoice);
  const daysPast = getDaysFromDue(invoice.dueDate);
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'overdue':
      return `Overdue · ${daysPast}d`;
    case 'partial':
      return 'Partial';
    case 'sent':
      return daysPast === 0 ? 'Due today' : 'Sent';
    case 'draft':
      return 'Draft';
  }
}
