import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AutomationRule,
  Customer,
  Invoice,
  LedgerData,
  Payment,
  PaymentNotification,
  ReminderLog,
  ReminderTemplate,
} from '../src/types.ts';
import {
  computeInvoiceBalance,
  computeInvoiceTotal,
  deriveInvoiceStatus,
  getDaysFromDue,
  renderReminderTemplate,
} from '../src/utils/format.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger.json');

function daysOffsetIso(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function timestampOffsetIso(daysFromToday: number, hour = 14): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  d.setUTCHours(hour, 25, 0, 0);
  return d.toISOString();
}

function createInitialData(): LedgerData {
  const customers: Customer[] = [
    {
      id: 'cust_1',
      name: 'Elena Vance',
      company: 'Northstar Logistics Group',
      email: 'ap@northstarlogistics.example',
      phone: '+1 (415) 890-4120',
      address: '580 Howard St, Suite 400, San Francisco, CA 94105',
      paymentTermsDays: 30,
      notes: 'Requires PO number referenced on monthly freight retainers.',
      createdAt: timestampOffsetIso(-170),
    },
    {
      id: 'cust_2',
      name: 'Marcus Sterling',
      company: 'Vanguard Architectural Supply',
      email: 'finance@vanguardarch.example',
      phone: '+1 (312) 641-9980',
      address: '215 W Superior St, Chicago, IL 60654',
      paymentTermsDays: 15,
      notes: 'Prefers ACH bank transfer; responds promptly to 3-day reminders.',
      createdAt: timestampOffsetIso(-150),
    },
    {
      id: 'cust_3',
      name: 'Priya Nair',
      company: 'Kestrel BioSystems',
      email: 'billing@kestrelbio.example',
      phone: '+1 (617) 552-3304',
      address: '100 Binney St, Cambridge, MA 02142',
      paymentTermsDays: 30,
      notes: 'Bi-monthly lab software & calibration billing.',
      createdAt: timestampOffsetIso(-135),
    },
    {
      id: 'cust_4',
      name: 'Daniel Okafor',
      company: 'Harborline Marine Freight',
      email: 'accounts@harborlinemarine.example',
      phone: '+1 (206) 714-2810',
      address: '1420 Alaskan Way, Seattle, WA 98101',
      paymentTermsDays: 30,
      notes: 'Net 30 terms; contact Daniel directly for balances over $10k.',
      createdAt: timestampOffsetIso(-110),
    },
    {
      id: 'cust_5',
      name: 'Claire Lindqvist',
      company: 'Alder & Co. Industrial Design',
      email: 'claire@alderdesign.example',
      phone: '+1 (503) 402-7745',
      address: '820 NW Flanders St, Portland, OR 97209',
      paymentTermsDays: 15,
      notes: 'Pays via hosted Card payment link within 48 hours of receipt.',
      createdAt: timestampOffsetIso(-95),
    },
    {
      id: 'cust_6',
      name: 'Tomasz Kowalski',
      company: 'Solstice Cold Storage',
      email: 'payables@solsticecold.example',
      phone: '+1 (720) 398-5102',
      address: '4900 Brighton Blvd, Denver, CO 80216',
      paymentTermsDays: 30,
      notes: 'Quarterly facility monitoring & compliance audits.',
      createdAt: timestampOffsetIso(-80),
    },
  ];

  const templates: ReminderTemplate[] = [
    {
      id: 'tpl_upcoming',
      name: 'Friendly Upcoming Due Reminder',
      stage: 'upcoming',
      subject: 'Upcoming invoice {{invoice_number}} due on {{due_date}}',
      body: `Hi {{customer_name}},\n\nThis is a courtesy reminder that invoice {{invoice_number}} for {{company_name}} with an outstanding balance of {{amount_due}} is due on {{due_date}}.\n\nYou can review the line items and pay securely online via Card or ACH using your payment link:\n{{payment_link}}\n\nThank you for your business.\n\nBest regards,\nClearLedger Billing`,
      updatedAt: timestampOffsetIso(-30),
    },
    {
      id: 'tpl_due_today',
      name: 'Due Today Notice',
      stage: 'due_today',
      subject: 'Payment due today: Invoice {{invoice_number}} ({{amount_due}})',
      body: `Hi {{customer_name}},\n\nInvoice {{invoice_number}} for {{amount_due}} is due today ({{due_date}}).\n\nPlease use your dedicated payment link below to settle this balance immediately:\n{{payment_link}}\n\nIf payment has already been initiated, please disregard this message.\n\nBest regards,\nClearLedger Billing`,
      updatedAt: timestampOffsetIso(-28),
    },
    {
      id: 'tpl_overdue_early',
      name: '7-Day Overdue Follow-Up',
      stage: 'overdue_early',
      subject: 'Reminder: Invoice {{invoice_number}} is {{days_overdue}} days past due',
      body: `Hi {{customer_name}},\n\nWe noticed that invoice {{invoice_number}} for {{company_name}} ({{amount_due}}) passed its due date on {{due_date}} and is now {{days_overdue}} days overdue.\n\nTo avoid any service interruption, please complete payment at your earliest convenience using this secure link:\n{{payment_link}}\n\nLet us know if you need a revised PO reference or have any billing questions.\n\nBest regards,\nClearLedger Billing`,
      updatedAt: timestampOffsetIso(-20),
    },
    {
      id: 'tpl_overdue_late',
      name: 'Escalated Overdue Final Notice',
      stage: 'overdue_late',
      subject: 'Action Required: Invoice {{invoice_number}} is {{days_overdue}} days overdue',
      body: `Dear {{customer_name}},\n\nDespite earlier reminders, invoice {{invoice_number}} for {{company_name}} remains unpaid with a balance of {{amount_due}} ({{days_overdue}} days past due).\n\nPlease remit payment immediately via the link below or reply with your scheduled wire/ACH settlement date:\n{{payment_link}}\n\nSincerely,\nClearLedger Accounts Receivable`,
      updatedAt: timestampOffsetIso(-14),
    },
    {
      id: 'tpl_receipt',
      name: 'Payment Received Confirmation',
      stage: 'receipt',
      subject: 'Receipt: Payment received for Invoice {{invoice_number}}',
      body: `Hi {{customer_name}},\n\nThank you! We have recorded your payment for invoice {{invoice_number}} ({{company_name}}). Remaining balance: {{amount_due}}.\n\nYou can view your updated invoice status anytime here:\n{{payment_link}}\n\nWe appreciate your prompt payment.\n\nBest regards,\nClearLedger Billing`,
      updatedAt: timestampOffsetIso(-12),
    },
  ];

  const rules: AutomationRule[] = [
    {
      id: 'rule_1',
      name: '3 days before due date',
      offsetDays: -3,
      templateId: 'tpl_upcoming',
      enabled: true,
    },
    {
      id: 'rule_2',
      name: 'On due date',
      offsetDays: 0,
      templateId: 'tpl_due_today',
      enabled: true,
    },
    {
      id: 'rule_3',
      name: '7 days overdue',
      offsetDays: 7,
      templateId: 'tpl_overdue_early',
      enabled: true,
    },
    {
      id: 'rule_4',
      name: '21 days overdue',
      offsetDays: 21,
      templateId: 'tpl_overdue_late',
      enabled: true,
    },
  ];

  const rawInvoices: Invoice[] = [
    // Historical paid invoices across recent months for analytics + avg collection time
    {
      id: 'inv_1001',
      invoiceNumber: 'INV-2026-1001',
      customerId: 'cust_1',
      issueDate: daysOffsetIso(-150),
      dueDate: daysOffsetIso(-120),
      lineItems: [
        { id: 'li_1', description: 'Fleet Telemetry Platform License', quantity: 1, unitPrice: 6800 },
        { id: 'li_2', description: 'API Integration Onboarding', quantity: 12, unitPrice: 225 },
      ],
      taxRate: 0,
      notes: 'PO #NS-8821',
      status: 'paid',
      amountPaid: 9500,
      paidAt: timestampOffsetIso(-136),
      paymentToken: 'pay_ns1001a9b2',
      sentAt: timestampOffsetIso(-150),
      createdAt: timestampOffsetIso(-150),
    },
    {
      id: 'inv_1002',
      invoiceNumber: 'INV-2026-1002',
      customerId: 'cust_2',
      issueDate: daysOffsetIso(-122),
      dueDate: daysOffsetIso(-107),
      lineItems: [
        { id: 'li_3', description: 'CAD Procurement Portal Retainer', quantity: 1, unitPrice: 5400 },
      ],
      taxRate: 6.25,
      notes: 'Net 15 standard billing.',
      status: 'paid',
      amountPaid: 5737.5,
      paidAt: timestampOffsetIso(-111),
      paymentToken: 'pay_vg1002c3d4',
      sentAt: timestampOffsetIso(-122),
      createdAt: timestampOffsetIso(-122),
    },
    {
      id: 'inv_1003',
      invoiceNumber: 'INV-2026-1003',
      customerId: 'cust_3',
      issueDate: daysOffsetIso(-92),
      dueDate: daysOffsetIso(-62),
      lineItems: [
        { id: 'li_4', description: 'LIMS Compliance Module (Q3)', quantity: 3, unitPrice: 2800 },
        { id: 'li_5', description: 'Validation Audit Report', quantity: 1, unitPrice: 1850 },
      ],
      taxRate: 0,
      notes: 'Bi-monthly lab calibration agreement.',
      status: 'paid',
      amountPaid: 10250,
      paidAt: timestampOffsetIso(-72),
      paymentToken: 'pay_kb1003e5f6',
      sentAt: timestampOffsetIso(-92),
      createdAt: timestampOffsetIso(-92),
    },
    {
      id: 'inv_1004',
      invoiceNumber: 'INV-2026-1004',
      customerId: 'cust_5',
      issueDate: daysOffsetIso(-64),
      dueDate: daysOffsetIso(-49),
      lineItems: [
        { id: 'li_6', description: 'Industrial Design Asset Library', quantity: 1, unitPrice: 4200 },
        { id: 'li_7', description: 'Custom Prototype Review', quantity: 8, unitPrice: 175 },
      ],
      taxRate: 0,
      notes: 'Settled via Card payment link.',
      status: 'paid',
      amountPaid: 5600,
      paidAt: timestampOffsetIso(-59),
      paymentToken: 'pay_al1004g7h8',
      sentAt: timestampOffsetIso(-64),
      createdAt: timestampOffsetIso(-64),
    },
    {
      id: 'inv_1005',
      invoiceNumber: 'INV-2026-1005',
      customerId: 'cust_4',
      issueDate: daysOffsetIso(-52),
      dueDate: daysOffsetIso(-22),
      lineItems: [
        { id: 'li_8', description: 'Port Dispatch Optimization Engine', quantity: 1, unitPrice: 8900 },
        { id: 'li_9', description: 'Vessel Tracking Connector', quantity: 2, unitPrice: 1200 },
      ],
      taxRate: 0,
      notes: 'Overdue 22 days — escalated follow-up.',
      status: 'overdue',
      amountPaid: 0,
      paidAt: null,
      paymentToken: 'pay_hm1005j9k1',
      sentAt: timestampOffsetIso(-52),
      createdAt: timestampOffsetIso(-52),
    },
    {
      id: 'inv_1006',
      invoiceNumber: 'INV-2026-1006',
      customerId: 'cust_6',
      issueDate: daysOffsetIso(-41),
      dueDate: daysOffsetIso(-11),
      lineItems: [
        { id: 'li_10', description: 'Cold-Chain Sensor Telemetry (40 Units)', quantity: 40, unitPrice: 145 },
        { id: 'li_11', description: 'Quarterly Regulatory Filing', quantity: 1, unitPrice: 1400 },
      ],
      taxRate: 5,
      notes: 'Partial deposit received; remainder 11 days overdue.',
      status: 'overdue',
      amountPaid: 3000,
      paidAt: null,
      paymentToken: 'pay_sc1006m2n3',
      sentAt: timestampOffsetIso(-41),
      createdAt: timestampOffsetIso(-41),
    },
    {
      id: 'inv_1007',
      invoiceNumber: 'INV-2026-1007',
      customerId: 'cust_2',
      issueDate: daysOffsetIso(-24),
      dueDate: daysOffsetIso(-4),
      lineItems: [
        { id: 'li_12', description: 'Supplier Catalog Sync & ERP Bridge', quantity: 1, unitPrice: 4650 },
      ],
      taxRate: 6.25,
      notes: '4 days past due.',
      status: 'overdue',
      amountPaid: 0,
      paidAt: null,
      paymentToken: 'pay_vg1007p4q5',
      sentAt: timestampOffsetIso(-24),
      createdAt: timestampOffsetIso(-24),
    },
    {
      id: 'inv_1008',
      invoiceNumber: 'INV-2026-1008',
      customerId: 'cust_1',
      issueDate: daysOffsetIso(-20),
      dueDate: daysOffsetIso(-2),
      lineItems: [
        { id: 'li_13', description: 'Fleet Telemetry Platform License (Nov)', quantity: 1, unitPrice: 6800 },
        { id: 'li_14', description: 'Dedicated SLA Support', quantity: 1, unitPrice: 1200 },
      ],
      taxRate: 0,
      notes: 'Paid 2 days before due date via ACH.',
      status: 'paid',
      amountPaid: 8000,
      paidAt: timestampOffsetIso(-4),
      paymentToken: 'pay_ns1008r6s7',
      sentAt: timestampOffsetIso(-20),
      createdAt: timestampOffsetIso(-20),
    },
    {
      id: 'inv_1009',
      invoiceNumber: 'INV-2026-1009',
      customerId: 'cust_5',
      issueDate: daysOffsetIso(-14),
      dueDate: daysOffsetIso(0),
      lineItems: [
        { id: 'li_15', description: 'Hardware Enclosure CAD Review', quantity: 14, unitPrice: 210 },
      ],
      taxRate: 0,
      notes: 'Paid earlier today via Payment Link.',
      status: 'paid',
      amountPaid: 2940,
      paidAt: timestampOffsetIso(0, 10),
      paymentToken: 'pay_al1009t8u9',
      sentAt: timestampOffsetIso(-14),
      createdAt: timestampOffsetIso(-14),
    },
    {
      id: 'inv_1010',
      invoiceNumber: 'INV-2026-1010',
      customerId: 'cust_3',
      issueDate: daysOffsetIso(-12),
      dueDate: daysOffsetIso(2),
      lineItems: [
        { id: 'li_16', description: 'LIMS Compliance Module (Nov)', quantity: 2, unitPrice: 2800 },
        { id: 'li_17', description: 'Sample Chain-of-Custody Export', quantity: 1, unitPrice: 950 },
      ],
      taxRate: 0,
      notes: 'Due in 2 days — 50% deposit applied.',
      status: 'partial',
      amountPaid: 3275,
      paidAt: null,
      paymentToken: 'pay_kb1010v1w2',
      sentAt: timestampOffsetIso(-12),
      createdAt: timestampOffsetIso(-12),
    },
    {
      id: 'inv_1011',
      invoiceNumber: 'INV-2026-1011',
      customerId: 'cust_1',
      issueDate: daysOffsetIso(-5),
      dueDate: daysOffsetIso(25),
      lineItems: [
        { id: 'li_18', description: 'Route Optimization Analytics Add-on', quantity: 1, unitPrice: 4400 },
        { id: 'li_19', description: 'Driver Mobile App Sync (25 Seats)', quantity: 25, unitPrice: 48 },
      ],
      taxRate: 0,
      notes: 'PO #NS-9104',
      status: 'sent',
      amountPaid: 0,
      paidAt: null,
      paymentToken: 'pay_ns1011x3y4',
      sentAt: timestampOffsetIso(-5),
      createdAt: timestampOffsetIso(-5),
    },
    {
      id: 'inv_1012',
      invoiceNumber: 'INV-2026-1012',
      customerId: 'cust_4',
      issueDate: daysOffsetIso(-1),
      dueDate: daysOffsetIso(29),
      lineItems: [
        { id: 'li_20', description: 'Customs Manifest Automation Setup', quantity: 1, unitPrice: 3600 },
      ],
      taxRate: 0,
      notes: 'Pending internal sign-off before sending.',
      status: 'draft',
      amountPaid: 0,
      paidAt: null,
      paymentToken: 'pay_hm1012z5a6',
      sentAt: null,
      createdAt: timestampOffsetIso(-1),
    },
  ];

  const invoices = rawInvoices.map((inv) => ({
    ...inv,
    status: deriveInvoiceStatus(inv),
  }));

  const payments: Payment[] = [
    {
      id: 'pay_1',
      invoiceId: 'inv_1001',
      customerId: 'cust_1',
      amount: 9500,
      method: 'ACH Transfer',
      reference: 'ACH-884120',
      paidAt: timestampOffsetIso(-136),
      notes: 'Full settlement against PO #NS-8821',
      source: 'payment_link',
    },
    {
      id: 'pay_2',
      invoiceId: 'inv_1002',
      customerId: 'cust_2',
      amount: 5737.5,
      method: 'ACH Transfer',
      reference: 'ACH-902311',
      paidAt: timestampOffsetIso(-111),
      notes: 'Paid via online portal',
      source: 'payment_link',
    },
    {
      id: 'pay_3',
      invoiceId: 'inv_1003',
      customerId: 'cust_3',
      amount: 10250,
      method: 'Wire',
      reference: 'WR-441092',
      paidAt: timestampOffsetIso(-72),
      notes: 'Q3 LIMS settlement',
      source: 'manual',
    },
    {
      id: 'pay_4',
      invoiceId: 'inv_1004',
      customerId: 'cust_5',
      amount: 5600,
      method: 'Card',
      reference: 'CH-773190',
      paidAt: timestampOffsetIso(-59),
      notes: 'Paid via Visa corporate card link',
      source: 'payment_link',
    },
    {
      id: 'pay_5',
      invoiceId: 'inv_1006',
      customerId: 'cust_6',
      amount: 3000,
      method: 'Check',
      reference: 'CHK-4108',
      paidAt: timestampOffsetIso(-26),
      notes: 'Partial check deposit received',
      source: 'manual',
    },
    {
      id: 'pay_6',
      invoiceId: 'inv_1010',
      customerId: 'cust_3',
      amount: 3275,
      method: 'ACH Transfer',
      reference: 'ACH-991402',
      paidAt: timestampOffsetIso(-9),
      notes: '50% upfront payment via payment link',
      source: 'payment_link',
    },
    {
      id: 'pay_7',
      invoiceId: 'inv_1008',
      customerId: 'cust_1',
      amount: 8000,
      method: 'ACH Transfer',
      reference: 'ACH-998120',
      paidAt: timestampOffsetIso(-4),
      notes: 'Paid ahead of due date via link',
      source: 'payment_link',
    },
    {
      id: 'pay_8',
      invoiceId: 'inv_1009',
      customerId: 'cust_5',
      amount: 2940,
      method: 'Card',
      reference: 'CH-999244',
      paidAt: timestampOffsetIso(0, 10),
      notes: 'Instant payment via hosted checkout link',
      source: 'payment_link',
    },
  ];

  const custMap = new Map(customers.map((c) => [c.id, c]));
  const tplMap = new Map(templates.map((t) => [t.id, t]));
  const invMap = new Map(invoices.map((i) => [i.id, i]));

  const buildSeedLog = (
    id: string,
    invoiceId: string,
    ruleId: string | null,
    templateId: string,
    daysAgo: number,
    triggerType: 'automated' | 'manual'
  ): ReminderLog => {
    const inv = invMap.get(invoiceId)!;
    const cust = custMap.get(inv.customerId)!;
    const tpl = tplMap.get(templateId)!;
    return {
      id,
      invoiceId,
      customerId: cust.id,
      ruleId,
      templateId,
      recipientEmail: cust.email,
      subject: renderReminderTemplate(tpl.subject, inv, cust, 'http://localhost:3000'),
      body: renderReminderTemplate(tpl.body, inv, cust, 'http://localhost:3000'),
      sentAt: timestampOffsetIso(daysAgo),
      triggerType,
    };
  };

  const reminderLogs: ReminderLog[] = [
    buildSeedLog('rem_1', 'inv_1005', 'rule_1', 'tpl_upcoming', -25, 'automated'),
    buildSeedLog('rem_2', 'inv_1005', 'rule_3', 'tpl_overdue_early', -15, 'automated'),
    buildSeedLog('rem_3', 'inv_1005', 'rule_4', 'tpl_overdue_late', -1, 'automated'),
    buildSeedLog('rem_4', 'inv_1006', 'rule_3', 'tpl_overdue_early', -4, 'automated'),
    buildSeedLog('rem_5', 'inv_1010', 'rule_1', 'tpl_upcoming', -1, 'automated'),
  ];

  const notifications: PaymentNotification[] = [
    {
      id: 'notif_1',
      paymentId: 'pay_8',
      invoiceId: 'inv_1009',
      invoiceNumber: 'INV-2026-1009',
      customerId: 'cust_5',
      customerName: 'Claire Lindqvist',
      company: 'Alder & Co. Industrial Design',
      amount: 2940,
      method: 'Card',
      createdAt: timestampOffsetIso(0, 10),
      read: false,
    },
    {
      id: 'notif_2',
      paymentId: 'pay_7',
      invoiceId: 'inv_1008',
      invoiceNumber: 'INV-2026-1008',
      customerId: 'cust_1',
      customerName: 'Elena Vance',
      company: 'Northstar Logistics Group',
      amount: 8000,
      method: 'ACH Transfer',
      createdAt: timestampOffsetIso(-4),
      read: true,
    },
  ];

  return {
    customers,
    invoices,
    payments,
    templates,
    rules,
    reminderLogs,
    notifications,
  };
}

export function loadLedgerData(): LedgerData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = createInitialData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const data = JSON.parse(raw) as LedgerData;
  data.invoices = data.invoices.map((inv) => ({
    ...inv,
    status: deriveInvoiceStatus(inv),
  }));
  return data;
}

export function saveLedgerData(data: LedgerData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const normalized: LedgerData = {
    ...data,
    invoices: data.invoices.map((inv) => ({
      ...inv,
      status: deriveInvoiceStatus(inv),
    })),
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf8');
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

export function generatePaymentToken(): string {
  return `pay_${crypto.randomBytes(8).toString('hex')}`;
}

export function nextInvoiceNumber(invoices: Invoice[]): string {
  const year = new Date().getUTCFullYear();
  let maxSeq = 1012;
  for (const inv of invoices) {
    const match = inv.invoiceNumber.match(/(\d+)$/);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
    }
  }
  return `INV-${year}-${maxSeq + 1}`;
}

export function runAutomatedReminderSweep(
  data: LedgerData,
  appOrigin: string
): { sentLogs: ReminderLog[]; updated: boolean } {
  const activeRules = data.rules.filter((r) => r.enabled);
  const custMap = new Map(data.customers.map((c) => [c.id, c]));
  const tplMap = new Map(data.templates.map((t) => [t.id, t]));
  const sentLogs: ReminderLog[] = [];

  for (const invoice of data.invoices) {
    const status = deriveInvoiceStatus(invoice);
    if (status === 'draft' || status === 'paid') continue;
    const balance = computeInvoiceBalance(invoice);
    if (balance <= 0.01) continue;

    const customer = custMap.get(invoice.customerId);
    if (!customer) continue;

    const daysFromDue = getDaysFromDue(invoice.dueDate);

    for (const rule of activeRules) {
      const alreadySentForRule = data.reminderLogs.some(
        (log) => log.invoiceId === invoice.id && log.ruleId === rule.id
      );
      if (alreadySentForRule) continue;

      let shouldTrigger = false;
      if (rule.offsetDays < 0) {
        // Upcoming reminder: trigger when within offsetDays before due date up to due date
        shouldTrigger = daysFromDue >= rule.offsetDays && daysFromDue < 0;
      } else if (rule.offsetDays === 0) {
        // Due today reminder
        shouldTrigger = daysFromDue === 0;
      } else {
        // Overdue reminder: trigger once past offsetDays overdue
        shouldTrigger = daysFromDue >= rule.offsetDays;
      }

      if (!shouldTrigger) continue;

      const template = tplMap.get(rule.templateId);
      if (!template) continue;

      const log: ReminderLog = {
        id: generateId('rem'),
        invoiceId: invoice.id,
        customerId: customer.id,
        ruleId: rule.id,
        templateId: template.id,
        recipientEmail: customer.email,
        subject: renderReminderTemplate(template.subject, invoice, customer, appOrigin),
        body: renderReminderTemplate(template.body, invoice, customer, appOrigin),
        sentAt: new Date().toISOString(),
        triggerType: 'automated',
      };

      data.reminderLogs.unshift(log);
      sentLogs.push(log);
    }
  }

  return {
    sentLogs,
    updated: sentLogs.length > 0,
  };
}

export function recordInvoicePayment(
  data: LedgerData,
  params: {
    invoiceId: string;
    amount: number;
    method: Payment['method'];
    reference?: string;
    notes?: string;
    source: Payment['source'];
  }
): { payment: Payment; notification: PaymentNotification; invoice: Invoice } {
  const invoiceIndex = data.invoices.findIndex((i) => i.id === params.invoiceId);
  if (invoiceIndex === -1) {
    throw new Error('Invoice not found');
  }
  const invoice = data.invoices[invoiceIndex];
  const customer = data.customers.find((c) => c.id === invoice.customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }

  const total = computeInvoiceTotal(invoice);
  const currentBalance = computeInvoiceBalance(invoice);
  if (currentBalance <= 0.01) {
    throw new Error('Invoice is already paid in full');
  }

  const cleanAmount = Math.min(currentBalance, Math.round(params.amount * 100) / 100);
  if (cleanAmount <= 0 || Number.isNaN(cleanAmount)) {
    throw new Error('Payment amount must be greater than zero');
  }

  const nowIso = new Date().toISOString();
  const newAmountPaid = Math.round((invoice.amountPaid + cleanAmount) * 100) / 100;
  const remainingAfter = Math.max(0, total - newAmountPaid);

  const updatedInvoice: Invoice = {
    ...invoice,
    amountPaid: newAmountPaid,
    paidAt: remainingAfter <= 0.01 ? nowIso : invoice.paidAt,
    status: invoice.status === 'draft' ? 'sent' : invoice.status,
  };
  updatedInvoice.status = deriveInvoiceStatus(updatedInvoice);
  data.invoices[invoiceIndex] = updatedInvoice;

  const prefixMap: Record<Payment['method'], string> = {
    Card: 'CH',
    'ACH Transfer': 'ACH',
    Wire: 'WR',
    Check: 'CHK',
  };
  const payment: Payment = {
    id: generateId('pay'),
    invoiceId: updatedInvoice.id,
    customerId: customer.id,
    amount: cleanAmount,
    method: params.method,
    reference:
      params.reference?.trim() ||
      `${prefixMap[params.method]}-${Math.floor(100000 + Math.random() * 900000)}`,
    paidAt: nowIso,
    notes:
      params.notes?.trim() ||
      (params.source === 'payment_link'
        ? 'Paid online via hosted payment link'
        : 'Recorded manually'),
    source: params.source,
  };
  data.payments.unshift(payment);

  const notification: PaymentNotification = {
    id: generateId('notif'),
    paymentId: payment.id,
    invoiceId: updatedInvoice.id,
    invoiceNumber: updatedInvoice.invoiceNumber,
    customerId: customer.id,
    customerName: customer.name,
    company: customer.company,
    amount: cleanAmount,
    method: params.method,
    createdAt: nowIso,
    read: false,
  };
  data.notifications.unshift(notification);

  return { payment, notification, invoice: updatedInvoice };
}
