/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { CustomerDetailDrawer } from './components/CustomerDetailDrawer.tsx';
import { CustomerModal } from './components/CustomerModal.tsx';
import { CustomersView } from './components/CustomersView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { InvoiceDetailModal } from './components/InvoiceDetailModal.tsx';
import { InvoiceFormModal } from './components/InvoiceFormModal.tsx';
import { InvoicesView } from './components/InvoicesView.tsx';
import { PaymentPortal } from './components/PaymentPortal.tsx';
import { PaymentsView } from './components/PaymentsView.tsx';
import { RecordPaymentModal } from './components/RecordPaymentModal.tsx';
import { RemindersView } from './components/RemindersView.tsx';
import { SendReminderModal } from './components/SendReminderModal.tsx';
import { Sidebar, type NavTab } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import type {
  AutomationRule,
  Customer,
  Invoice,
  InvoiceLineItem,
  LedgerData,
  PaymentMethod,
  PaymentNotification,
  ReminderTemplate,
  TemplateStage,
} from './types.ts';
import { deriveInvoiceStatus, formatCurrency } from './utils/format.ts';

interface ToastMessage {
  id: string;
  title: string;
  subtitle?: string;
}

function getInitialPaymentToken(): string | null {
  const match = window.location.pathname.match(/^\/pay\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Payment portal route / preview state
  const [portalToken, setPortalToken] = useState<string | null>(getInitialPaymentToken);

  // Modals & Drawers
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [preselectedCustomerId, setPreselectedCustomerId] = useState<string | null>(null);
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);

  const [recordPaymentInvoiceId, setRecordPaymentInvoiceId] = useState<string | null>(null);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);

  const [remindInvoiceId, setRemindInvoiceId] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((title: string, subtitle?: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, subtitle }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const fetchBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Failed to load workspace data.');
      const json = (await res.json()) as LedgerData;
      setData(json);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to connect to server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  // Browser back/forward handling for /pay/:token
  useEffect(() => {
    const onPopState = () => {
      setPortalToken(getInitialPaymentToken());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Real-time Server-Sent Events listener for customer payment notifications & automated reminders
  useEffect(() => {
    const es = new EventSource('/api/events');

    es.addEventListener('payment_received', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          notification?: PaymentNotification;
        };
        if (payload.notification) {
          const n = payload.notification;
          pushToast(
            `Payment received: ${formatCurrency(n.amount)}`,
            `${n.company} paid ${n.invoiceNumber} via ${n.method}`
          );
        }
        fetchBootstrap();
      } catch {
        // Ignore malformed event
      }
    });

    es.addEventListener('reminders_dispatched', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { sentCount: number };
        if (payload.sentCount > 0) {
          pushToast(
            `${payload.sentCount} automated ${
              payload.sentCount === 1 ? 'reminder' : 'reminders'
            } sent`,
            'Dispatched according to your active schedule rules'
          );
          fetchBootstrap();
        }
      } catch {
        // Ignore malformed event
      }
    });

    return () => es.close();
  }, [fetchBootstrap, pushToast]);

  const openPaymentPortal = (token: string) => {
    window.history.pushState({}, '', `/pay/${encodeURIComponent(token)}`);
    setPortalToken(token);
    setDetailInvoiceId(null);
  };

  const exitPaymentPortal = () => {
    window.history.pushState({}, '', '/');
    setPortalToken(null);
    fetchBootstrap();
  };

  const handleCopyPaymentLink = async (token: string) => {
    const url = `${window.location.origin}/pay/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast('Payment link copied', url);
    } catch {
      pushToast('Payment link ready', url);
    }
  };

  // API Mutations
  const handleSaveCustomer = async (payload: {
    id?: string;
    name: string;
    company: string;
    email: string;
    phone: string;
    address: string;
    paymentTermsDays: number;
    notes: string;
  }) => {
    const url = payload.id ? `/api/customers/${payload.id}` : '/api/customers';
    const method = payload.id ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to save customer.');
    await fetchBootstrap();
    pushToast(payload.id ? 'Customer updated' : 'Customer added', payload.company);
  };

  const handleDeleteCustomer = async (customerId: string) => {
    const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete customer.');
    await fetchBootstrap();
    pushToast('Customer removed');
  };

  const handleSaveInvoice = async (payload: {
    id?: string;
    customerId: string;
    issueDate: string;
    dueDate: string;
    taxRate: number;
    notes: string;
    lineItems: InvoiceLineItem[];
    status: 'draft' | 'sent';
    sendImmediately?: boolean;
  }) => {
    const url = payload.id ? `/api/invoices/${payload.id}` : '/api/invoices';
    const method = payload.id ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to save invoice.');
    await fetchBootstrap();
    pushToast(
      payload.id ? 'Invoice updated' : 'Invoice created',
      `${json.invoiceNumber} ${payload.sendImmediately ? 'issued' : 'saved'}`
    );
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete invoice.');
    await fetchBootstrap();
    pushToast('Invoice deleted');
  };

  const handleSendInvoice = async (invoiceId: string) => {
    const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to issue invoice.');
    const inv = (await res.json()) as Invoice;
    await fetchBootstrap();
    pushToast('Invoice issued', `${inv.invoiceNumber} is now active with payment link`);
  };

  const handleRecordPayment = async (payload: {
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    reference: string;
    notes: string;
  }) => {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to record payment.');
    await fetchBootstrap();
  };

  const handleSendReminder = async (payload: {
    invoiceId: string;
    templateId: string;
    subject: string;
    body: string;
  }) => {
    const res = await fetch(`/api/invoices/${payload.invoiceId}/remind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: payload.templateId,
        subject: payload.subject,
        body: payload.body,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to send reminder.');
    await fetchBootstrap();
    pushToast('Reminder email sent', `Delivered to ${json.log.recipientEmail}`);
  };

  const handleRunSweep = async () => {
    setSweeping(true);
    try {
      const res = await fetch('/api/reminders/sweep', { method: 'POST' });
      const json = (await res.json()) as { sentCount: number };
      await fetchBootstrap();
      if (json.sentCount === 0) {
        pushToast(
          'Reminder sweep complete',
          'No additional invoices matched pending schedule rules'
        );
      }
    } finally {
      setSweeping(false);
    }
  };

  const handleSaveTemplate = async (payload: {
    id?: string;
    name: string;
    stage: TemplateStage;
    subject: string;
    body: string;
  }): Promise<ReminderTemplate> => {
    const url = payload.id ? `/api/templates/${payload.id}` : '/api/templates';
    const method = payload.id ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to save template.');
    await fetchBootstrap();
    return json as ReminderTemplate;
  };

  const handleDeleteTemplate = async (id: string) => {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete template.');
    await fetchBootstrap();
    pushToast('Template deleted');
  };

  const handleCreateRule = async (payload: {
    name: string;
    offsetDays: number;
    templateId: string;
    enabled: boolean;
  }) => {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create schedule rule.');
    await fetchBootstrap();
    pushToast('Schedule rule added', payload.name);
  };

  const handleUpdateRule = async (id: string, patch: Partial<AutomationRule>) => {
    const res = await fetch(`/api/rules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Failed to update rule.');
    await fetchBootstrap();
  };

  const handleDeleteRule = async (id: string) => {
    const res = await fetch(`/api/rules/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete rule.');
    await fetchBootstrap();
    pushToast('Schedule rule removed');
  };

  const handleMarkNotificationRead = async (id: string) => {
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await fetchBootstrap();
  };

  const overdueCount = useMemo(() => {
    if (!data) return 0;
    return data.invoices.filter((inv) => deriveInvoiceStatus(inv) === 'overdue').length;
  }, [data]);

  // If visiting a Payment Link (/pay/:token), render the hosted customer checkout portal
  if (portalToken) {
    return (
      <PaymentPortal
        token={portalToken}
        onExitPortal={exitPaymentPortal}
        onPaymentCompleted={fetchBootstrap}
      />
    );
  }

  const detailInvoice = data?.invoices.find((i) => i.id === detailInvoiceId) || null;
  const detailCustomer = data?.customers.find((c) => c.id === detailCustomerId) || null;
  const remindInvoice = data?.invoices.find((i) => i.id === remindInvoiceId) || null;
  const remindCustomer = remindInvoice
    ? data?.customers.find((c) => c.id === remindInvoice.customerId) || null
    : null;

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        overdueCount={overdueCount}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeTab={activeTab}
          notifications={data?.notifications || []}
          onMarkRead={handleMarkNotificationRead}
          onViewInvoice={(invId) => setDetailInvoiceId(invId)}
          onNewInvoice={() => {
            setEditingInvoice(null);
            setInvoiceFormOpen(true);
          }}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {loading ? (
            <div className="space-y-6">
              <div className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
                <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
              </div>
            </div>
          ) : loadError || !data ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
              <div className="text-base font-semibold text-slate-900">
                Unable to Load Ledger
              </div>
              <p className="text-sm text-slate-500">{loadError}</p>
              <button
                type="button"
                onClick={fetchBootstrap}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  customers={data.customers}
                  invoices={data.invoices}
                  payments={data.payments}
                  onViewInvoice={(id) => setDetailInvoiceId(id)}
                  onSendReminder={(id) => setRemindInvoiceId(id)}
                  onCopyPaymentLink={handleCopyPaymentLink}
                  onOpenPaymentPortal={openPaymentPortal}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onRunSweep={handleRunSweep}
                  sweeping={sweeping}
                />
              )}

              {activeTab === 'invoices' && (
                <InvoicesView
                  invoices={data.invoices}
                  customers={data.customers}
                  onNewInvoice={() => {
                    setEditingInvoice(null);
                    setInvoiceFormOpen(true);
                  }}
                  onViewInvoice={(id) => setDetailInvoiceId(id)}
                  onSendInvoice={handleSendInvoice}
                  onSendReminder={(id) => setRemindInvoiceId(id)}
                  onRecordPayment={(id) => {
                    setRecordPaymentInvoiceId(id);
                    setRecordPaymentOpen(true);
                  }}
                  onCopyPaymentLink={handleCopyPaymentLink}
                  onOpenPaymentPortal={openPaymentPortal}
                />
              )}

              {activeTab === 'customers' && (
                <CustomersView
                  customers={data.customers}
                  invoices={data.invoices}
                  payments={data.payments}
                  onAddCustomer={() => {
                    setEditingCustomer(null);
                    setCustomerModalOpen(true);
                  }}
                  onSelectCustomer={(id) => setDetailCustomerId(id)}
                />
              )}

              {activeTab === 'payments' && (
                <PaymentsView
                  payments={data.payments}
                  invoices={data.invoices}
                  customers={data.customers}
                  onRecordPayment={() => {
                    setRecordPaymentInvoiceId(null);
                    setRecordPaymentOpen(true);
                  }}
                  onViewInvoice={(id) => setDetailInvoiceId(id)}
                />
              )}

              {activeTab === 'reminders' && (
                <RemindersView
                  templates={data.templates}
                  rules={data.rules}
                  reminderLogs={data.reminderLogs}
                  invoices={data.invoices}
                  customers={data.customers}
                  onSaveTemplate={handleSaveTemplate}
                  onDeleteTemplate={handleDeleteTemplate}
                  onCreateRule={handleCreateRule}
                  onUpdateRule={handleUpdateRule}
                  onDeleteRule={handleDeleteRule}
                  onRunSweep={handleRunSweep}
                  sweeping={sweeping}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals & Drawers */}
      {data && invoiceFormOpen && (
        <InvoiceFormModal
          customers={data.customers}
          existingInvoice={editingInvoice}
          initialCustomerId={preselectedCustomerId}
          onClose={() => {
            setInvoiceFormOpen(false);
            setEditingInvoice(null);
            setPreselectedCustomerId(null);
          }}
          onSave={handleSaveInvoice}
        />
      )}

      {data && detailInvoice && (
        <InvoiceDetailModal
          invoice={detailInvoice}
          customer={data.customers.find((c) => c.id === detailInvoice.customerId)}
          payments={data.payments.filter((p) => p.invoiceId === detailInvoice.id)}
          reminderLogs={data.reminderLogs.filter((r) => r.invoiceId === detailInvoice.id)}
          onClose={() => setDetailInvoiceId(null)}
          onEdit={(inv) => {
            setDetailInvoiceId(null);
            setEditingInvoice(inv);
            setInvoiceFormOpen(true);
          }}
          onDelete={handleDeleteInvoice}
          onSendInvoice={handleSendInvoice}
          onSendReminder={(id) => setRemindInvoiceId(id)}
          onRecordPayment={(id) => {
            setRecordPaymentInvoiceId(id);
            setRecordPaymentOpen(true);
          }}
          onCopyPaymentLink={handleCopyPaymentLink}
          onOpenPaymentPortal={openPaymentPortal}
        />
      )}

      {data && customerModalOpen && (
        <CustomerModal
          existingCustomer={editingCustomer}
          onClose={() => {
            setCustomerModalOpen(false);
            setEditingCustomer(null);
          }}
          onSave={handleSaveCustomer}
        />
      )}

      {data && detailCustomer && (
        <CustomerDetailDrawer
          customer={detailCustomer}
          invoices={data.invoices.filter((i) => i.customerId === detailCustomer.id)}
          payments={data.payments.filter((p) => p.customerId === detailCustomer.id)}
          reminderLogs={data.reminderLogs.filter((r) => r.customerId === detailCustomer.id)}
          onClose={() => setDetailCustomerId(null)}
          onEditCustomer={(cust) => {
            setEditingCustomer(cust);
            setCustomerModalOpen(true);
          }}
          onDeleteCustomer={handleDeleteCustomer}
          onNewInvoiceForCustomer={(custId) => {
            setDetailCustomerId(null);
            setEditingInvoice(null);
            setPreselectedCustomerId(custId);
            setInvoiceFormOpen(true);
          }}
          onViewInvoice={(invId) => {
            setDetailCustomerId(null);
            setDetailInvoiceId(invId);
          }}
          onSendReminder={(invId) => setRemindInvoiceId(invId)}
        />
      )}

      {data && recordPaymentOpen && (
        <RecordPaymentModal
          invoices={data.invoices}
          customers={data.customers}
          initialInvoiceId={recordPaymentInvoiceId}
          onClose={() => {
            setRecordPaymentOpen(false);
            setRecordPaymentInvoiceId(null);
          }}
          onSave={handleRecordPayment}
        />
      )}

      {data && remindInvoice && remindCustomer && (
        <SendReminderModal
          invoice={remindInvoice}
          customer={remindCustomer}
          templates={data.templates}
          onClose={() => setRemindInvoiceId(null)}
          onSend={handleSendReminder}
        />
      )}

      {/* Real-Time Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none no-print">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto bg-slate-900 text-white border border-slate-800 rounded-xl px-4 py-3 shadow-lg flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{toast.title}</div>
                  {toast.subtitle && (
                    <div className="text-xs text-slate-300 truncate mt-0.5">
                      {toast.subtitle}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setToasts((prev) => prev.filter((item) => item.id !== toast.id))
                }
                className="text-slate-400 hover:text-white shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
