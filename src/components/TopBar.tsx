import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Menu, Plus } from 'lucide-react';
import type { PaymentNotification } from '../types.ts';
import { formatCurrency, formatRelativeTime } from '../utils/format.ts';
import type { NavTab } from './Sidebar.tsx';

interface TopBarProps {
  activeTab: NavTab;
  notifications: PaymentNotification[];
  onMarkRead: (id: string) => void;
  onViewInvoice: (invoiceId: string) => void;
  onNewInvoice: () => void;
  onOpenMobileNav: () => void;
}

const TAB_LABELS: Record<NavTab, string> = {
  dashboard: 'Dashboard & Analytics',
  invoices: 'Invoices & Balances',
  customers: 'Customers',
  payments: 'Payment History',
  reminders: 'Automated Reminders & Templates',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  notifications,
  onMarkRead,
  onViewInvoice,
  onNewInvoice,
  onOpenMobileNav,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen]);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6 shrink-0 no-print">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-400 hidden sm:inline whitespace-nowrap">ClearLedger</span>
          <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <h1 className="font-semibold text-slate-900 truncate">{TAB_LABELS[activeTab]}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            className="relative flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label="Payment notifications"
          >
            <Bell className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Payments</span>
            {unreadCount > 0 && (
              <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                {unreadCount} new
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">
                  Payment Notifications
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onMarkRead('all')}
                    className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">
                    No customer payments recorded yet.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => {
                        if (!notif.read) onMarkRead(notif.id);
                        onViewInvoice(notif.invoiceId);
                        setNotifOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex flex-col gap-1 ${
                        notif.read ? 'bg-white' : 'bg-emerald-50/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {notif.company}
                        </span>
                        <span className="text-sm font-mono font-semibold text-emerald-700 tabular-nums shrink-0">
                          +{formatCurrency(notif.amount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="truncate">
                          {notif.customerName} · {notif.invoiceNumber} · {notif.method}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>
                      {!notif.read && (
                        <span className="text-[11px] font-semibold text-emerald-700">
                          Unread payment alert
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onNewInvoice}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
        >
          <Plus className="w-4 h-4" />
          <span>New Invoice</span>
        </button>
      </div>
    </header>
  );
};
