import React, { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Send, Trash2 } from 'lucide-react';
import type {
  AutomationRule,
  Customer,
  Invoice,
  ReminderLog,
  ReminderTemplate,
  TemplateStage,
} from '../types.ts';
import { formatDateTime, renderReminderTemplate } from '../utils/format.ts';

interface RemindersViewProps {
  templates: ReminderTemplate[];
  rules: AutomationRule[];
  reminderLogs: ReminderLog[];
  invoices: Invoice[];
  customers: Customer[];
  onSaveTemplate: (payload: {
    id?: string;
    name: string;
    stage: TemplateStage;
    subject: string;
    body: string;
  }) => Promise<ReminderTemplate>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onCreateRule: (payload: {
    name: string;
    offsetDays: number;
    templateId: string;
    enabled: boolean;
  }) => Promise<void>;
  onUpdateRule: (id: string, patch: Partial<AutomationRule>) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onRunSweep: () => Promise<void>;
  sweeping: boolean;
}

const MERGE_VARIABLES = [
  '{{customer_name}}',
  '{{company_name}}',
  '{{invoice_number}}',
  '{{amount_due}}',
  '{{due_date}}',
  '{{days_overdue}}',
  '{{payment_link}}',
];

const STAGE_LABELS: Record<TemplateStage, string> = {
  upcoming: 'Upcoming Due',
  due_today: 'Due Today',
  overdue_early: 'Early Overdue',
  overdue_late: 'Final Notice',
  receipt: 'Payment Receipt',
};

export const RemindersView: React.FC<RemindersViewProps> = ({
  templates,
  rules,
  reminderLogs,
  invoices,
  customers,
  onSaveTemplate,
  onDeleteTemplate,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onRunSweep,
  sweeping,
}) => {
  const [subTab, setSubTab] = useState<'automation' | 'templates' | 'logs'>('automation');

  // Template editor state
  const [selectedTplId, setSelectedTplId] = useState<string>(templates[0]?.id || '');
  const [tplName, setTplName] = useState('');
  const [tplStage, setTplStage] = useState<TemplateStage>('overdue_early');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string>(invoices[0]?.id || '');
  const [tplSaving, setTplSaving] = useState(false);
  const [tplFeedback, setTplFeedback] = useState<string | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);
  const [isCreatingNewTpl, setIsCreatingNewTpl] = useState(false);

  // New rule state
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleOffset, setNewRuleOffset] = useState<number>(14);
  const [newRuleTplId, setNewRuleTplId] = useState<string>(templates[0]?.id || '');

  // Selected log inspector
  const [selectedLogId, setSelectedLogId] = useState<string>(reminderLogs[0]?.id || '');

  const templateMap = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates]
  );
  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );
  const invoiceMap = useMemo(
    () => new Map(invoices.map((i) => [i.id, i])),
    [invoices]
  );

  useEffect(() => {
    if (isCreatingNewTpl) return;
    const current = templates.find((t) => t.id === selectedTplId) || templates[0];
    if (current) {
      setSelectedTplId(current.id);
      setTplName(current.name);
      setTplStage(current.stage);
      setTplSubject(current.subject);
      setTplBody(current.body);
    }
  }, [selectedTplId, templates, isCreatingNewTpl]);

  useEffect(() => {
    if (!previewInvoiceId && invoices[0]) {
      setPreviewInvoiceId(invoices[0].id);
    }
  }, [invoices, previewInvoiceId]);

  useEffect(() => {
    if (!selectedLogId && reminderLogs[0]) {
      setSelectedLogId(reminderLogs[0].id);
    }
  }, [reminderLogs, selectedLogId]);

  const previewInvoice = invoiceMap.get(previewInvoiceId) || invoices[0];
  const previewCustomer = previewInvoice
    ? customerMap.get(previewInvoice.customerId)
    : customers[0];

  const renderedPreviewSubject =
    previewInvoice && previewCustomer
      ? renderReminderTemplate(tplSubject, previewInvoice, previewCustomer, window.location.origin)
      : tplSubject;
  const renderedPreviewBody =
    previewInvoice && previewCustomer
      ? renderReminderTemplate(tplBody, previewInvoice, previewCustomer, window.location.origin)
      : tplBody;

  const handleStartNewTemplate = () => {
    setIsCreatingNewTpl(true);
    setTplError(null);
    setTplFeedback(null);
    setTplName('Custom Reminder Template');
    setTplStage('overdue_early');
    setTplSubject('Payment reminder: Invoice {{invoice_number}} ({{amount_due}})');
    setTplBody(
      `Hi {{customer_name}},\n\nThis is a reminder for invoice {{invoice_number}} ({{amount_due}}) due on {{due_date}}.\n\nPay online in one click:\n{{payment_link}}\n\nThank you,\nClearLedger Billing`
    );
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTplError(null);
    setTplFeedback(null);
    setTplSaving(true);
    try {
      const saved = await onSaveTemplate({
        id: isCreatingNewTpl ? undefined : selectedTplId,
        name: tplName,
        stage: tplStage,
        subject: tplSubject,
        body: tplBody,
      });
      setIsCreatingNewTpl(false);
      setSelectedTplId(saved.id);
      setTplFeedback('Template saved');
      setTimeout(() => setTplFeedback(null), 2500);
    } catch (err) {
      setTplError(err instanceof Error ? err.message : 'Unable to save template.');
    } finally {
      setTplSaving(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim() || !newRuleTplId) return;
    await onCreateRule({
      name: newRuleName.trim(),
      offsetDays: Number(newRuleOffset),
      templateId: newRuleTplId,
      enabled: true,
    });
    setNewRuleName('');
    setShowNewRule(false);
  };

  const selectedLog = reminderLogs.find((l) => l.id === selectedLogId) || reminderLogs[0];

  return (
    <div className="space-y-6">
      {/* Sub-Navigation & Primary Sweep Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setSubTab('automation')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'automation'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Automated Schedule ({rules.filter((r) => r.enabled).length} active)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('templates')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'templates'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Reminder Templates ({templates.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('logs')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'logs'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Email Dispatch Log ({reminderLogs.length})
          </button>
        </div>

        <button
          type="button"
          onClick={onRunSweep}
          disabled={sweeping}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{sweeping ? 'Evaluating Invoices...' : 'Run Automated Reminder Sweep'}</span>
        </button>
      </div>

      {/* TAB 1: Automated Schedule Rules */}
      {subTab === 'automation' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Automated Email Reminder Cadence
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Rules automatically evaluate unpaid invoices against due dates and embed each invoice’s payment link.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewRule((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Schedule Rule</span>
            </button>
          </div>

          {showNewRule && (
            <form
              onSubmit={handleAddRule}
              className="px-6 py-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Rule Label
                </label>
                <input
                  type="text"
                  required
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="e.g., 14 days overdue"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Days From Due Date (- before, + after)
                </label>
                <input
                  type="number"
                  required
                  value={newRuleOffset}
                  onChange={(e) => setNewRuleOffset(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Template
                </label>
                <select
                  value={newRuleTplId}
                  onChange={(e) => setNewRuleTplId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap"
                >
                  Save Rule
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewRule(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-100">
            {rules.map((rule) => {
              const tpl = templateMap.get(rule.templateId);
              const timingText =
                rule.offsetDays < 0
                  ? `${Math.abs(rule.offsetDays)} days before due date`
                  : rule.offsetDays === 0
                  ? 'On exact due date'
                  : `${rule.offsetDays} days after due date`;

              return (
                <div
                  key={rule.id}
                  className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/60"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-semibold text-slate-900">
                        {rule.name}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          rule.enabled ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {rule.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Trigger: <span className="font-mono">{timingText}</span> · Template:{' '}
                      <span className="text-slate-700 font-medium">
                        {tpl?.name || 'Template'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <select
                      value={rule.templateId}
                      onChange={(e) =>
                        onUpdateRule(rule.id, { templateId: e.target.value })
                      }
                      aria-label={`Template for ${rule.name}`}
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg max-w-[220px]"
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => onUpdateRule(rule.id, { enabled: !rule.enabled })}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                        rule.enabled
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteRule(rule.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                      title="Delete schedule rule"
                      aria-label="Delete schedule rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Customisable Reminder Templates */}
      {subTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left List */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Templates</h2>
              <button
                type="button"
                onClick={handleStartNewTemplate}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Template</span>
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {templates.map((tpl) => {
                const selected = !isCreatingNewTpl && tpl.id === selectedTplId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setIsCreatingNewTpl(false);
                      setSelectedTplId(tpl.id);
                      setTplError(null);
                    }}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selected ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{tpl.name}</div>
                    <div
                      className={`text-xs mt-0.5 ${
                        selected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {STAGE_LABELS[tpl.stage]}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Editor + Live Preview */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <form onSubmit={handleSaveTemplate} className="p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-900">
                  {isCreatingNewTpl ? 'Create Reminder Template' : 'Customize Reminder Template'}
                </h3>
                <div className="flex items-center gap-2">
                  {!isCreatingNewTpl && (
                    <button
                      type="button"
                      onClick={async () => {
                        setTplError(null);
                        try {
                          await onDeleteTemplate(selectedTplId);
                        } catch (err) {
                          setTplError(
                            err instanceof Error ? err.message : 'Unable to delete template.'
                          );
                        }
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={tplSaving}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
                  >
                    {tplFeedback ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{tplFeedback}</span>
                      </>
                    ) : (
                      <span>{tplSaving ? 'Saving...' : 'Save Template'}</span>
                    )}
                  </button>
                </div>
              </div>

              {tplError && (
                <div className="px-3.5 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {tplError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Template Name
                  </label>
                  <input
                    type="text"
                    required
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Reminder Stage
                  </label>
                  <select
                    value={tplStage}
                    onChange={(e) => setTplStage(e.target.value as TemplateStage)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {Object.entries(STAGE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={tplSubject}
                  onChange={(e) => setTplSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Email Body
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {MERGE_VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setTplBody((prev) => `${prev}${prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${v}`)}
                        className="px-2 py-0.5 text-[11px] font-mono text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={7}
                  required
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-sans leading-relaxed border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Live Rendered Preview */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900">
                    Live Customer Preview
                  </div>
                  <select
                    value={previewInvoice?.id || ''}
                    onChange={(e) => setPreviewInvoiceId(e.target.value)}
                    aria-label="Preview invoice"
                    className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md"
                  >
                    {invoices.map((inv) => {
                      const c = customerMap.get(inv.customerId);
                      return (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} — {c?.company}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
                  <div>
                    <span className="text-slate-500">To: </span>
                    <span className="font-medium text-slate-900">
                      {previewCustomer?.email || 'customer@example.com'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Subject: </span>
                    <span className="font-semibold text-slate-900">
                      {renderedPreviewSubject}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 whitespace-pre-line text-slate-700 leading-relaxed">
                    {renderedPreviewBody}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: Sent Email Dispatch Log */}
      {subTab === 'logs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Dispatched Payment Reminders
              </h2>
            </div>

            {reminderLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No reminder emails have been sent yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
                {reminderLogs.map((log) => {
                  const cust = customerMap.get(log.customerId);
                  const inv = invoiceMap.get(log.invoiceId);
                  const isSelected = selectedLog?.id === log.id;
                  return (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => setSelectedLogId(log.id)}
                      className={`w-full text-left px-5 py-3.5 transition-colors ${
                        isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {log.subject}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0">
                          {formatDateTime(log.sentAt)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {cust?.company} · {inv?.invoiceNumber} ·{' '}
                        <span className="font-medium text-slate-700">
                          {log.triggerType === 'automated' ? 'Automated Rule' : 'Manual Send'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
            {selectedLog ? (
              <div className="space-y-3 text-xs">
                <div className="pb-3 border-b border-slate-200 space-y-1">
                  <div className="text-sm font-semibold text-slate-900">
                    {selectedLog.subject}
                  </div>
                  <div className="text-slate-500">
                    Recipient: <span className="text-slate-800">{selectedLog.recipientEmail}</span>
                  </div>
                  <div className="text-slate-500">
                    Sent: <span className="font-mono tabular-nums">{formatDateTime(selectedLog.sentAt)}</span>
                  </div>
                </div>
                <div className="whitespace-pre-line text-slate-700 leading-relaxed pt-1">
                  {selectedLog.body}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">
                Select a dispatched email to inspect its full content.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
