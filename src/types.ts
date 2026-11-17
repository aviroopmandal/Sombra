export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'overdue' | 'paid';

export type PaymentMethod = 'Card' | 'ACH Transfer' | 'Wire' | 'Check';

export type PaymentSource = 'payment_link' | 'manual';

export type TemplateStage =
  | 'upcoming'
  | 'due_today'
  | 'overdue_early'
  | 'overdue_late'
  | 'receipt';

export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  paymentTermsDays: number;
  notes: string;
  createdAt: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  issueDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  taxRate: number;
  notes: string;
  status: InvoiceStatus;
  amountPaid: number;
  paidAt: string | null;
  paymentToken: string;
  sentAt: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  paidAt: string;
  notes: string;
  source: PaymentSource;
}

export interface ReminderTemplate {
  id: string;
  name: string;
  stage: TemplateStage;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  offsetDays: number;
  templateId: string;
  enabled: boolean;
}

export interface ReminderLog {
  id: string;
  invoiceId: string;
  customerId: string;
  ruleId: string | null;
  templateId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  sentAt: string;
  triggerType: 'automated' | 'manual';
}

export interface PaymentNotification {
  id: string;
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  company: string;
  amount: number;
  method: PaymentMethod;
  createdAt: string;
  read: boolean;
}

export interface LedgerData {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  templates: ReminderTemplate[];
  rules: AutomationRule[];
  reminderLogs: ReminderLog[];
  notifications: PaymentNotification[];
}
