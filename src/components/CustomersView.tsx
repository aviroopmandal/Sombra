import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Customer, Invoice, Payment } from '../types.ts';
import {
  computeInvoiceBalance,
  computeInvoiceTotal,
  deriveInvoiceStatus,
  formatCurrency,
} from '../utils/format.ts';

interface CustomersViewProps {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  onAddCustomer: () => void;
  onSelectCustomer: (customerId: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  invoices,
  payments,
  onAddCustomer,
  onSelectCustomer,
}) => {
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'outstanding' | 'overdue'>('all');

  const statsByCustomer = useMemo(() => {
    const map = new Map<
      string,
      {
        invoiced: number;
        paid: number;
        outstanding: number;
        overdueCount: number;
        invoiceCount: number;
      }
    >();

    for (const c of customers) {
      map.set(c.id, {
        invoiced: 0,
        paid: 0,
        outstanding: 0,
        overdueCount: 0,
        invoiceCount: 0,
      });
    }

    for (const inv of invoices) {
      const entry = map.get(inv.customerId);
      if (!entry) continue;
      entry.invoiceCount += 1;
      const st = deriveInvoiceStatus(inv);
      if (st === 'draft') continue;
      entry.invoiced += computeInvoiceTotal(inv);
      entry.outstanding += computeInvoiceBalance(inv);
      if (st === 'overdue') entry.overdueCount += 1;
    }

    for (const pay of payments) {
      const entry = map.get(pay.customerId);
      if (!entry) continue;
      entry.paid += pay.amount;
    }

    return map;
  }, [customers, invoices, payments]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      const st = statsByCustomer.get(c.id);
      if (balanceFilter === 'outstanding' && (!st || st.outstanding <= 0.01)) return false;
      if (balanceFilter === 'overdue' && (!st || st.overdueCount === 0)) return false;
      if (!q) return true;
      return (
        c.company.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
      );
    });
  }, [customers, search, balanceFilter, statsByCustomer]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setBalanceFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              balanceFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Customers
          </button>
          <button
            type="button"
            onClick={() => setBalanceFilter('outstanding')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              balanceFilter === 'outstanding'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            With Balance
          </button>
          <button
            type="button"
            onClick={() => setBalanceFilter('overdue')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              balanceFilter === 'overdue'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Overdue Accounts
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, company, email..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={onAddCustomer}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-sm font-medium text-slate-900">No customers found</div>
            <p className="text-xs text-slate-500 mt-1">
              Add a customer account to begin issuing invoices and payment links.
            </p>
            <button
              type="button"
              onClick={onAddCustomer}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Customer</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 pl-6 pr-3">Customer / Company</th>
                  <th className="py-3 px-3">Contact Info</th>
                  <th className="py-3 px-3">Terms</th>
                  <th className="py-3 px-3 text-right">Invoices</th>
                  <th className="py-3 px-3 text-right">Total Invoiced</th>
                  <th className="py-3 px-3 text-right">Paid</th>
                  <th className="py-3 pl-3 pr-6 text-right">Outstanding Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredCustomers.map((cust) => {
                  const st = statsByCustomer.get(cust.id) || {
                    invoiced: 0,
                    paid: 0,
                    outstanding: 0,
                    overdueCount: 0,
                    invoiceCount: 0,
                  };
                  return (
                    <tr
                      key={cust.id}
                      onClick={() => onSelectCustomer(cust.id)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 pl-6 pr-3">
                        <div className="font-semibold text-slate-900">{cust.company}</div>
                        <div className="text-xs text-slate-500">{cust.name}</div>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="text-xs text-slate-800">{cust.email}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {cust.phone || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        Net {cust.paymentTermsDays}
                      </td>
                      <td className="py-3.5 px-3 text-right text-xs font-mono text-slate-700 tabular-nums">
                        {st.invoiceCount}
                        {st.overdueCount > 0 && (
                          <span className="text-red-600 font-semibold ml-1.5">
                            ({st.overdueCount} overdue)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {formatCurrency(st.invoiced)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-xs text-emerald-700 tabular-nums whitespace-nowrap">
                        {formatCurrency(st.paid)}
                      </td>
                      <td className="py-3.5 pl-3 pr-6 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap">
                        <span
                          className={
                            st.outstanding > 0.01 ? 'text-slate-900' : 'text-slate-400'
                          }
                        >
                          {formatCurrency(st.outstanding)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
