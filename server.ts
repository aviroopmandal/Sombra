import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AutomationRule,
  Customer,
  Invoice,
  InvoiceLineItem,
  PaymentMethod,
  ReminderLog,
  ReminderTemplate,
} from './src/types.ts';
import {
  computeInvoiceBalance,
  computeInvoiceTotal,
  deriveInvoiceStatus,
  renderReminderTemplate,
} from './src/utils/format.ts';
import {
  generateId,
  generatePaymentToken,
  loadLedgerData,
  nextInvoiceNumber,
  recordInvoicePayment,
  runAutomatedReminderSweep,
  saveLedgerData,
} from './server/store.ts';

const PORT = 3000;
const app = express();
app.use(express.json());

// SSE client registry for real-time payment & reminder notifications
const sseClients = new Set<express.Response>();

function broadcastEvent(event: string, payload: unknown): void {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

function getAppOrigin(req: express.Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.get('/api/bootstrap', (_req, res) => {
  const data = loadLedgerData();
  res.json(data);
});

// Customers CRUD
app.post('/api/customers', (req, res) => {
  const body = req.body as Partial<Customer>;
  if (!body.name?.trim() || !body.email?.trim()) {
    res.status(400).json({ error: 'Customer name and email are required.' });
    return;
  }

  const data = loadLedgerData();
  const customer: Customer = {
    id: generateId('cust'),
    name: body.name.trim(),
    company: body.company?.trim() || body.name.trim(),
    email: body.email.trim(),
    phone: body.phone?.trim() || '',
    address: body.address?.trim() || '',
    paymentTermsDays: Number(body.paymentTermsDays) || 30,
    notes: body.notes?.trim() || '',
    createdAt: new Date().toISOString(),
  };

  data.customers.unshift(customer);
  saveLedgerData(data);
  res.status(201).json(customer);
});

app.patch('/api/customers/:id', (req, res) => {
  const data = loadLedgerData();
  const idx = data.customers.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  const existing = data.customers[idx];
  const body = req.body as Partial<Customer>;
  const updated: Customer = {
    ...existing,
    name: body.name !== undefined ? body.name.trim() : existing.name,
    company: body.company !== undefined ? body.company.trim() : existing.company,
    email: body.email !== undefined ? body.email.trim() : existing.email,
    phone: body.phone !== undefined ? body.phone.trim() : existing.phone,
    address: body.address !== undefined ? body.address.trim() : existing.address,
    paymentTermsDays:
      body.paymentTermsDays !== undefined
        ? Number(body.paymentTermsDays) || existing.paymentTermsDays
        : existing.paymentTermsDays,
    notes: body.notes !== undefined ? body.notes.trim() : existing.notes,
  };
  data.customers[idx] = updated;
  saveLedgerData(data);
  res.json(updated);
});

app.delete('/api/customers/:id', (req, res) => {
  const data = loadLedgerData();
  const hasInvoices = data.invoices.some((inv) => inv.customerId === req.params.id);
  if (hasInvoices) {
    res
      .status(400)
      .json({ error: 'Cannot delete customer with existing invoices. Archive or delete invoices first.' });
    return;
  }
  data.customers = data.customers.filter((c) => c.id !== req.params.id);
  saveLedgerData(data);
  res.json({ ok: true });
});

// Invoices CRUD & Actions
app.post('/api/invoices', (req, res) => {
  const body = req.body as Partial<Invoice> & { sendImmediately?: boolean };
  const data = loadLedgerData();

  if (!body.customerId || !data.customers.some((c) => c.id === body.customerId)) {
    res.status(400).json({ error: 'Valid customer is required.' });
    return;
  }
  const items: InvoiceLineItem[] = Array.isArray(body.lineItems)
    ? body.lineItems
        .filter((li) => li.description?.trim() && Number(li.quantity) > 0)
        .map((li) => ({
          id: li.id || generateId('li'),
          description: li.description.trim(),
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice) || 0,
        }))
    : [];

  if (items.length === 0) {
    res.status(400).json({ error: 'At least one valid line item is required.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const isDraft = body.status === 'draft' && !body.sendImmediately;
  const invoice: Invoice = {
    id: generateId('inv'),
    invoiceNumber: body.invoiceNumber?.trim() || nextInvoiceNumber(data.invoices),
    customerId: body.customerId,
    issueDate: body.issueDate || nowIso.slice(0, 10),
    dueDate: body.dueDate || nowIso.slice(0, 10),
    lineItems: items,
    taxRate: Number(body.taxRate) || 0,
    notes: body.notes?.trim() || '',
    status: isDraft ? 'draft' : 'sent',
    amountPaid: 0,
    paidAt: null,
    paymentToken: generatePaymentToken(),
    sentAt: isDraft ? null : nowIso,
    createdAt: nowIso,
  };
  invoice.status = deriveInvoiceStatus(invoice);

  data.invoices.unshift(invoice);
  saveLedgerData(data);
  res.status(201).json(invoice);
});

app.patch('/api/invoices/:id', (req, res) => {
  const data = loadLedgerData();
  const idx = data.invoices.findIndex((i) => i.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  const existing = data.invoices[idx];
  const body = req.body as Partial<Invoice>;

  const updated: Invoice = {
    ...existing,
    customerId: body.customerId ?? existing.customerId,
    issueDate: body.issueDate ?? existing.issueDate,
    dueDate: body.dueDate ?? existing.dueDate,
    lineItems: Array.isArray(body.lineItems) ? body.lineItems : existing.lineItems,
    taxRate: body.taxRate !== undefined ? Number(body.taxRate) : existing.taxRate,
    notes: body.notes !== undefined ? body.notes : existing.notes,
    status: body.status ?? existing.status,
  };
  updated.status = deriveInvoiceStatus(updated);
  data.invoices[idx] = updated;
  saveLedgerData(data);
  res.json(updated);
});

app.delete('/api/invoices/:id', (req, res) => {
  const data = loadLedgerData();
  data.invoices = data.invoices.filter((i) => i.id !== req.params.id);
  data.payments = data.payments.filter((p) => p.invoiceId !== req.params.id);
  data.reminderLogs = data.reminderLogs.filter((r) => r.invoiceId !== req.params.id);
  data.notifications = data.notifications.filter((n) => n.invoiceId !== req.params.id);
  saveLedgerData(data);
  res.json({ ok: true });
});

app.post('/api/invoices/:id/send', (req, res) => {
  const data = loadLedgerData();
  const idx = data.invoices.findIndex((i) => i.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  const inv = data.invoices[idx];
  const updated: Invoice = {
    ...inv,
    status: inv.status === 'draft' ? 'sent' : inv.status,
    sentAt: inv.sentAt || new Date().toISOString(),
  };
  updated.status = deriveInvoiceStatus(updated);
  data.invoices[idx] = updated;
  saveLedgerData(data);
  res.json(updated);
});

app.post('/api/invoices/:id/remind', (req, res) => {
  const data = loadLedgerData();
  const invoice = data.invoices.find((i) => i.id === req.params.id);
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  const customer = data.customers.find((c) => c.id === invoice.customerId);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const body = req.body as {
    templateId?: string;
    subject?: string;
    body?: string;
  };
  const appOrigin = getAppOrigin(req);
  const template =
    data.templates.find((t) => t.id === body.templateId) || data.templates[0];

  const renderedSubject = body.subject?.trim()
    ? renderReminderTemplate(body.subject, invoice, customer, appOrigin)
    : renderReminderTemplate(template.subject, invoice, customer, appOrigin);
  const renderedBody = body.body?.trim()
    ? renderReminderTemplate(body.body, invoice, customer, appOrigin)
    : renderReminderTemplate(template.body, invoice, customer, appOrigin);

  // If draft, mark sent when reminder dispatched
  if (invoice.status === 'draft') {
    invoice.status = 'sent';
    invoice.sentAt = new Date().toISOString();
    invoice.status = deriveInvoiceStatus(invoice);
  }

  const log: ReminderLog = {
    id: generateId('rem'),
    invoiceId: invoice.id,
    customerId: customer.id,
    ruleId: null,
    templateId: template.id,
    recipientEmail: customer.email,
    subject: renderedSubject,
    body: renderedBody,
    sentAt: new Date().toISOString(),
    triggerType: 'manual',
  };

  data.reminderLogs.unshift(log);
  saveLedgerData(data);
  res.status(201).json({ log, invoice });
});

// Manual Payment Recording
app.post('/api/payments', (req, res) => {
  const body = req.body as {
    invoiceId?: string;
    amount?: number;
    method?: PaymentMethod;
    reference?: string;
    notes?: string;
  };

  if (!body.invoiceId || !body.amount || !body.method) {
    res.status(400).json({ error: 'Invoice, amount, and payment method are required.' });
    return;
  }

  try {
    const data = loadLedgerData();
    const result = recordInvoicePayment(data, {
      invoiceId: body.invoiceId,
      amount: Number(body.amount),
      method: body.method,
      reference: body.reference,
      notes: body.notes,
      source: 'manual',
    });
    saveLedgerData(data);
    broadcastEvent('payment_received', result);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to record payment' });
  }
});

// Public Hosted Payment Link Endpoints
app.get('/api/pay/:token', (req, res) => {
  const data = loadLedgerData();
  const invoice = data.invoices.find((i) => i.paymentToken === req.params.token);
  if (!invoice) {
    res.status(404).json({ error: 'Payment link is invalid or expired.' });
    return;
  }
  const customer = data.customers.find((c) => c.id === invoice.customerId);
  if (!customer) {
    res.status(404).json({ error: 'Customer account not found.' });
    return;
  }
  const payments = data.payments.filter((p) => p.invoiceId === invoice.id);

  res.json({
    invoice: {
      ...invoice,
      status: deriveInvoiceStatus(invoice),
      total: computeInvoiceTotal(invoice),
      balanceDue: computeInvoiceBalance(invoice),
    },
    customer,
    payments,
  });
});

app.post('/api/pay/:token', (req, res) => {
  const data = loadLedgerData();
  const invoice = data.invoices.find((i) => i.paymentToken === req.params.token);
  if (!invoice) {
    res.status(404).json({ error: 'Payment link not found.' });
    return;
  }

  const body = req.body as {
    amount?: number;
    method?: PaymentMethod;
    reference?: string;
    notes?: string;
  };

  const amount = Number(body.amount);
  const method: PaymentMethod = body.method || 'Card';

  try {
    const result = recordInvoicePayment(data, {
      invoiceId: invoice.id,
      amount,
      method,
      reference: body.reference,
      notes: body.notes || 'Paid online via ClearLedger hosted payment link',
      source: 'payment_link',
    });
    saveLedgerData(data);
    broadcastEvent('payment_received', result);
    res.status(201).json({
      ...result,
      total: computeInvoiceTotal(result.invoice),
      balanceDue: computeInvoiceBalance(result.invoice),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Payment failed' });
  }
});

// Templates CRUD
app.post('/api/templates', (req, res) => {
  const body = req.body as Partial<ReminderTemplate>;
  if (!body.name?.trim() || !body.subject?.trim() || !body.body?.trim()) {
    res.status(400).json({ error: 'Template name, subject, and body are required.' });
    return;
  }
  const data = loadLedgerData();
  const template: ReminderTemplate = {
    id: generateId('tpl'),
    name: body.name.trim(),
    stage: body.stage || 'overdue_early',
    subject: body.subject.trim(),
    body: body.body.trim(),
    updatedAt: new Date().toISOString(),
  };
  data.templates.push(template);
  saveLedgerData(data);
  res.status(201).json(template);
});

app.patch('/api/templates/:id', (req, res) => {
  const data = loadLedgerData();
  const idx = data.templates.findIndex((t) => t.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  const existing = data.templates[idx];
  const body = req.body as Partial<ReminderTemplate>;
  const updated: ReminderTemplate = {
    ...existing,
    name: body.name !== undefined ? body.name.trim() : existing.name,
    stage: body.stage ?? existing.stage,
    subject: body.subject !== undefined ? body.subject.trim() : existing.subject,
    body: body.body !== undefined ? body.body.trim() : existing.body,
    updatedAt: new Date().toISOString(),
  };
  data.templates[idx] = updated;
  saveLedgerData(data);
  res.json(updated);
});

app.delete('/api/templates/:id', (req, res) => {
  const data = loadLedgerData();
  if (data.templates.length <= 1) {
    res.status(400).json({ error: 'At least one reminder template must remain.' });
    return;
  }
  const inUse = data.rules.some((r) => r.templateId === req.params.id);
  if (inUse) {
    res.status(400).json({ error: 'Reassign automation rules before deleting this template.' });
    return;
  }
  data.templates = data.templates.filter((t) => t.id !== req.params.id);
  saveLedgerData(data);
  res.json({ ok: true });
});

// Automation Rules
app.post('/api/rules', (req, res) => {
  const body = req.body as Partial<AutomationRule>;
  if (!body.name?.trim() || body.offsetDays === undefined || !body.templateId) {
    res.status(400).json({ error: 'Rule name, offset days, and template are required.' });
    return;
  }
  const data = loadLedgerData();
  const rule: AutomationRule = {
    id: generateId('rule'),
    name: body.name.trim(),
    offsetDays: Number(body.offsetDays),
    templateId: body.templateId,
    enabled: body.enabled ?? true,
  };
  data.rules.push(rule);
  data.rules.sort((a, b) => a.offsetDays - b.offsetDays);
  saveLedgerData(data);
  res.status(201).json(rule);
});

app.patch('/api/rules/:id', (req, res) => {
  const data = loadLedgerData();
  const idx = data.rules.findIndex((r) => r.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  const existing = data.rules[idx];
  const body = req.body as Partial<AutomationRule>;
  const updated: AutomationRule = {
    ...existing,
    name: body.name !== undefined ? body.name.trim() : existing.name,
    offsetDays: body.offsetDays !== undefined ? Number(body.offsetDays) : existing.offsetDays,
    templateId: body.templateId ?? existing.templateId,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : existing.enabled,
  };
  data.rules[idx] = updated;
  data.rules.sort((a, b) => a.offsetDays - b.offsetDays);
  saveLedgerData(data);
  res.json(updated);
});

app.delete('/api/rules/:id', (req, res) => {
  const data = loadLedgerData();
  data.rules = data.rules.filter((r) => r.id !== req.params.id);
  saveLedgerData(data);
  res.json({ ok: true });
});

// Automated Reminder Sweep
app.post('/api/reminders/sweep', (req, res) => {
  const data = loadLedgerData();
  const appOrigin = getAppOrigin(req);
  const { sentLogs, updated } = runAutomatedReminderSweep(data, appOrigin);
  if (updated) {
    saveLedgerData(data);
    broadcastEvent('reminders_dispatched', { sentCount: sentLogs.length, logs: sentLogs });
  }
  res.json({ sentCount: sentLogs.length, logs: sentLogs });
});

// Notifications
app.post('/api/notifications/mark-read', (req, res) => {
  const body = req.body as { id?: string };
  const data = loadLedgerData();
  if (!body.id || body.id === 'all') {
    data.notifications = data.notifications.map((n) => ({ ...n, read: true }));
  } else {
    data.notifications = data.notifications.map((n) =>
      n.id === body.id ? { ...n, read: true } : n
    );
  }
  saveLedgerData(data);
  res.json({ notifications: data.notifications });
});

// Background Automated Reminder Scheduler (every 60s)
setInterval(() => {
  try {
    const data = loadLedgerData();
    const origin =
      process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL.replace(/\/$/, '')
        : `http://localhost:${PORT}`;
    const { sentLogs, updated } = runAutomatedReminderSweep(data, origin);
    if (updated) {
      saveLedgerData(data);
      broadcastEvent('reminders_dispatched', { sentCount: sentLogs.length, logs: sentLogs });
    }
  } catch {
    // Keep background scheduler resilient
  }
}, 60_000);

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClearLedger server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
