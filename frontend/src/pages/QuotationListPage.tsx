import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Calculator,
  MessageSquare,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Building2,
  Phone,
  ExternalLink,
  TrendingUp,
  Eye,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Quotation, QuotationStatus } from '../types/api.types';
import { CreateQuotationModal } from '../components/CreateQuotationModal';
import { ViewQuotationModal } from '../components/ViewQuotationModal';

const STATUS_FILTERS: { label: string; value: QuotationStatus | 'ALL' }[] = [
  { label: 'All Quotations', value: 'ALL' },
  { label: 'Drafts', value: 'CREATED' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Accepted / Won', value: 'ACCEPTED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Expired', value: 'EXPIRED' },
];

export const QuotationListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number }>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<QuotationStatus | 'ALL'>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [viewingQuote, setViewingQuote] = useState<Quotation | null>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchQuotations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.quotations.list({
        page: currentPage,
        limit: 10,
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        search: debouncedSearch || undefined,
      });

      setQuotations(res.quotations || []);
      setMeta(res.meta || { total: 0, page: 1, limit: 10, totalPages: 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch quotations.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, selectedStatus, debouncedSearch]);

  useEffect(() => {
    void fetchQuotations();
  }, [fetchQuotations]);

  // Direct WhatsApp dispatch from table row
  const handleDirectWhatsApp = async (quote: Quotation) => {
    const rawPhone = quote.customerPhone || quote.enquiry?.phone || '';
    const cleanPhone = rawPhone.replace(/[^0-9]/g, '');

    const totalVal = quote.totalAmount
      ? Number(quote.totalAmount)
      : quote.amount
      ? Number(quote.amount)
      : 0;

    const messageText =
      `*QUOTATION / PROPOSAL - HB CRM*\n` +
      `--------------------------------\n` +
      `*Quotation Ref:* ${quote.quotationNumber || 'QT-N/A'}\n` +
      `*Enquiry Ref:* ${quote.enquiry?.enquiryCode || 'N/A'}\n` +
      `*Client:* ${quote.customerName || 'Valued Customer'}${quote.companyName ? ` (${quote.companyName})` : ''}\n` +
      `*Date:* ${new Date(quote.createdAt).toLocaleDateString('en-IN')}\n\n` +
      `*Total Amount:* ₹${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Incl. GST)\n\n` +
      (quote.terms ? `*Terms:*\n${quote.terms}\n\n` : '') +
      `--------------------------------\n` +
      `*Sales Manager:* ${quote.createdBy?.name || user?.name || 'HB CRM Team'}\n` +
      (quote.createdBy?.phone ? `*Mobile:* ${quote.createdBy.phone}\n` : '') +
      `*HB CRM Solutions*`;

    const encoded = encodeURIComponent(messageText);
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // Mark as sent in backend
    try {
      await api.quotations.markWhatsAppSent(quote.id);
      void fetchQuotations();
    } catch (err) {
      console.error('Failed to mark quote as sent:', err);
    }
  };

  // Status transition handler
  const handleTransitionStatus = async (quoteId: string, nextStatus: QuotationStatus) => {
    try {
      await api.quotations.transitionStatus(quoteId, { status: nextStatus });
      void fetchQuotations();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to transition status');
    }
  };

  // Status pill helper
  const renderStatusBadge = (status: QuotationStatus) => {
    switch (status) {
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Accepted
          </span>
        );
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5" /> Sent / Pending
          </span>
        );
      case 'VIEWED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Clock className="w-3.5 h-3.5" /> Viewed by Client
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <AlertTriangle className="w-3.5 h-3.5" /> Expired
          </span>
        );
      case 'REVISED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Calculator className="w-3.5 h-3.5" /> Revised
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <FileText className="w-3.5 h-3.5" /> Draft
          </span>
        );
    }
  };

  // Pipeline metrics
  const totalPipelineValue = quotations.reduce((acc, q) => {
    const val = q.totalAmount ? Number(q.totalAmount) : q.amount ? Number(q.amount) : 0;
    return acc + val;
  }, 0);

  const acceptedCount = quotations.filter((q) => q.status === 'ACCEPTED').length;
  const sentCount = quotations.filter((q) => q.status === 'SENT' || q.status === 'VIEWED').length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quotations & Proposals</h1>
          <p className="text-xs text-slate-500 mt-1">
            Generate itemized proposals by Enquiry Code and dispatch directly to client WhatsApp
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Generate Quotation</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Proposals</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{meta.total}</p>
          </div>
          <div className="p-3 rounded-xl bg-brand-50 text-brand-600">
            <Calculator className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Value (View)</p>
            <p className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">
              ₹{totalPipelineValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status Breakdown</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs font-semibold">
              <span className="text-blue-600">{sentCount} Sent</span>
              <span className="text-slate-300">•</span>
              <span className="text-emerald-600">{acceptedCount} Accepted</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by QT code, Enquiry code (e.g. ENQ-1001), customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          {/* Status Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setSelectedStatus(f.value);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  selectedStatus === f.value
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading quotations...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 space-y-2">
            <AlertTriangle className="w-6 h-6 mx-auto" />
            <p className="text-xs font-semibold">{error}</p>
          </div>
        ) : quotations.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <Calculator className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No quotations found</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Create a quotation by referencing any Enquiry Code to auto-fill pricing and details.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Generate First Quotation
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Quote #</th>
                  <th className="py-3 px-4">Enquiry Code</th>
                  <th className="py-3 px-4">Customer & Company</th>
                  <th className="py-3 px-4 text-right">Amount (₹)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Executive</th>
                  <th className="py-3 px-4 text-center">WhatsApp Dispatch</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotations.map((q) => {
                  const amountNum = q.totalAmount
                    ? Number(q.totalAmount)
                    : q.amount
                    ? Number(q.amount)
                    : 0;

                  return (
                    <tr key={q.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Quote Number */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => setViewingQuote(q)}
                          className="font-mono text-sm font-bold text-brand-700 hover:text-brand-900 hover:underline flex items-center gap-1.5 cursor-pointer text-left"
                          title="Click to view full commercial quotation"
                        >
                          <span>{q.quotationNumber || 'QT-DRAFT'}</span>
                          <Eye className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                        </button>
                        <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                          {new Date(q.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </td>

                      {/* Enquiry Code */}
                      <td className="py-3.5 px-4">
                        {q.enquiry?.enquiryCode ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/enquiries/${q.enquiryId}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100 font-bold text-xs transition-colors cursor-pointer"
                          >
                            <span>{q.enquiry.enquiryCode}</span>
                            <ExternalLink className="w-3 h-3 text-brand-500" />
                          </button>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Customer & Company */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">
                          {q.customerName || q.enquiry?.customer?.name || 'Unnamed Client'}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          {q.companyName && (
                            <span className="flex items-center gap-1 truncate max-w-[140px]">
                              <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                              {q.companyName}
                            </span>
                          )}
                          {q.customerPhone && (
                            <span className="flex items-center gap-1 text-slate-400">
                              <Phone className="w-3 h-3 shrink-0" />
                              {q.customerPhone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                        ₹{amountNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        {q.taxAmount && (
                          <div className="text-[10px] text-slate-400 font-normal">
                            Tax: ₹{Number(q.taxAmount).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(q.status)}
                      </td>

                      {/* Executive */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="font-medium text-slate-800">{q.createdBy?.name || 'Staff'}</div>
                        {q.createdBy?.phone && (
                          <div className="text-[10px] text-slate-400">{q.createdBy.phone}</div>
                        )}
                      </td>

                      {/* WhatsApp Dispatch Button */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => void handleDirectWhatsApp(q)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs border border-emerald-200/80 transition-colors cursor-pointer shadow-2xs"
                          title="Open WhatsApp with pre-filled quotation breakdown"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          <span>WhatsApp</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingQuote(q)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="View / Print Commercial Quotation"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-600" />
                          </button>

                          {/* Quick status change buttons */}
                          {q.status === 'SENT' && (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleTransitionStatus(q.id, 'ACCEPTED')}
                                className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-bold border border-emerald-200 cursor-pointer"
                                title="Mark Accepted"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleTransitionStatus(q.id, 'REJECTED')}
                                className="px-2 py-1 rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100 text-[10px] font-bold border border-rose-200 cursor-pointer"
                                title="Mark Rejected"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {q.status === 'CREATED' && (
                            <button
                              type="button"
                              onClick={() => void handleTransitionStatus(q.id, 'SENT')}
                              className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 text-[10px] font-bold border border-blue-200 cursor-pointer"
                            >
                              Mark Sent
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {meta.totalPages > 1 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Showing <span className="font-semibold text-slate-900">{quotations.length}</span> of{' '}
              <span className="font-semibold text-slate-900">{meta.total}</span> quotations
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">
                Page {meta.page} of {meta.totalPages}
              </span>
              <button
                disabled={currentPage >= meta.totalPages}
                onClick={() => setCurrentPage((p) => Math.min(meta.totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Quotation Modal */}
      <CreateQuotationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          void fetchQuotations();
        }}
      />

      {/* View / Print Quotation Modal */}
      <ViewQuotationModal
        quotation={viewingQuote}
        isOpen={Boolean(viewingQuote)}
        onClose={() => setViewingQuote(null)}
        onStatusUpdated={() => void fetchQuotations()}
      />
    </div>
  );
};

export default QuotationListPage;
