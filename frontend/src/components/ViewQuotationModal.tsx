import React from 'react';
import {
  X,
  Printer,
  MessageSquare,
  Building2,
  Phone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { Quotation, QuotationLineItem } from '../types/api.types';
import { api } from '../services/api';

interface ViewQuotationModalProps {
  quotation: Quotation | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated?: () => void;
}

export const ViewQuotationModal: React.FC<ViewQuotationModalProps> = ({
  quotation,
  isOpen,
  onClose,
  onStatusUpdated,
}) => {
  if (!isOpen || !quotation) return null;

  // Parse items safely
  let lineItems: QuotationLineItem[] = [];
  if (Array.isArray(quotation.items)) {
    lineItems = quotation.items as QuotationLineItem[];
  } else if (typeof quotation.items === 'string') {
    try {
      lineItems = JSON.parse(quotation.items);
    } catch {
      lineItems = [];
    }
  }

  const grandTotal = quotation.totalAmount != null
    ? Number(quotation.totalAmount)
    : quotation.amount != null
    ? Number(quotation.amount)
    : 0;

  const subtotal = quotation.subtotal != null
    ? Number(quotation.subtotal)
    : grandTotal;

  const taxAmount = quotation.taxAmount != null
    ? Number(quotation.taxAmount)
    : 0;

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = async () => {
    const rawPhone = quotation.customerPhone || quotation.enquiry?.phone || '';
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const targetPhone = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;

    let itemsSummary = '';
    if (lineItems.length > 0) {
      itemsSummary = lineItems
        .map((item, i) => `${i + 1}. ${item.description || 'Item'} (Qty: ${item.quantity}) - ₹${Number(item.quantity * item.unitPrice).toLocaleString('en-IN')}`)
        .join('\n');
    }

    const message = [
      `*COMMERCIAL QUOTATION*`,
      `*Quote No:* ${quotation.quotationNumber || 'QT-DRAFT'}`,
      `*Client:* ${quotation.customerName || quotation.companyName || 'Valued Customer'}`,
      quotation.enquiry?.enquiryCode ? `*Enquiry Ref:* ${quotation.enquiry.enquiryCode}` : '',
      `*Date:* ${new Date(quotation.createdAt).toLocaleDateString('en-IN')}`,
      '',
      '*Items / Requirements:*',
      itemsSummary || 'Commercial specifications as discussed.',
      '',
      `*Subtotal:* ₹${subtotal.toLocaleString('en-IN')}`,
      taxAmount > 0 ? `*GST:* ₹${taxAmount.toLocaleString('en-IN')}` : '',
      `*Total Amount:* ₹${grandTotal.toLocaleString('en-IN')}`,
      '',
      quotation.terms ? `*Terms:*\n${quotation.terms}\n` : '',
      `*Executive:* ${quotation.createdBy?.name || 'HB CRM Team'}${quotation.createdBy?.phone ? ` (${quotation.createdBy.phone})` : ''}`,
      '',
      'Thank you for your business!',
    ]
      .filter(Boolean)
      .join('\n');

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${targetPhone}?text=${encoded}`, '_blank');

    try {
      await api.quotations.markWhatsAppSent(quotation.id);
      if (onStatusUpdated) onStatusUpdated();
    } catch (err) {
      console.error('Failed to update WhatsApp sent status:', err);
    }
  };

  const renderBadge = (status: string) => {
    switch (status) {
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" /> Accepted / Won
          </span>
        );
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3.5 h-3.5" /> Sent to Client
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" /> Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
            Draft
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Toolbar (hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 no-print">
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-bold text-slate-900">
              {quotation.quotationNumber || 'QT-DRAFT'}
            </span>
            {renderBadge(quotation.status)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="Send quote details to customer on WhatsApp"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Send via WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Quotation Sheet */}
        <div className="p-8 overflow-y-auto space-y-6 text-slate-800 bg-white">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b-2 border-slate-900">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">COMMERCIAL QUOTATION</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">HB CRM Official Commercial Proposal</p>
              {quotation.enquiry?.enquiryCode && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs font-mono font-bold text-blue-700">
                  <span>Enquiry Ref: {quotation.enquiry.enquiryCode}</span>
                </div>
              )}
            </div>
            <div className="text-right sm:text-right space-y-1 text-xs">
              <div className="font-mono text-base font-extrabold text-slate-900">
                {quotation.quotationNumber || 'QT-DRAFT'}
              </div>
              <div className="text-slate-500">
                Date: <span className="font-medium text-slate-800">{new Date(quotation.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              {quotation.validUntil && (
                <div className="text-slate-500">
                  Valid Until: <span className="font-medium text-slate-800">{new Date(quotation.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              )}
            </div>
          </div>

          {/* Client & Executive Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Quotation Prepared For
              </span>
              <div className="font-bold text-slate-900 text-sm">
                {quotation.customerName || quotation.enquiry?.customer?.name || quotation.companyName || 'Valued Customer'}
              </div>
              {quotation.companyName && (
                <div className="text-xs text-slate-600 font-medium mt-0.5 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{quotation.companyName}</span>
                </div>
              )}
              {quotation.customerPhone && (
                <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1 font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{quotation.customerPhone}</span>
                </div>
              )}
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Issued By Sales Executive
              </span>
              <div className="font-bold text-slate-900 text-sm">
                {quotation.createdBy?.name || 'Commercial Sales Dept'}
              </div>
              {quotation.createdBy?.email && (
                <div className="text-xs text-slate-600 mt-0.5">
                  {quotation.createdBy.email}
                </div>
              )}
              {quotation.createdBy?.phone && (
                <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1 font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{quotation.createdBy.phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3 text-center w-10">#</th>
                  <th className="py-2.5 px-3">Item Description</th>
                  <th className="py-2.5 px-3 text-right w-16">Qty</th>
                  <th className="py-2.5 px-3 text-right w-24">Unit Price</th>
                  <th className="py-2.5 px-3 text-right w-16">GST %</th>
                  <th className="py-2.5 px-3 text-right w-28">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.length > 0 ? (
                  lineItems.map((item, idx) => {
                    const rowAmount = Number(item.quantity || 1) * Number(item.unitPrice || 0);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-3 px-3 font-medium text-slate-900">{item.description || '—'}</td>
                        <td className="py-3 px-3 text-right font-mono">{item.quantity}</td>
                        <td className="py-3 px-3 text-right font-mono">₹{Number(item.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-3 px-3 text-right font-mono">{item.taxRate || 0}%</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          ₹{rowAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-4 px-3 text-center text-slate-400 italic">
                      Lump-sum commercial proposal
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="flex justify-end pt-2">
            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (Taxable):</span>
                <span className="font-mono font-bold text-slate-900">
                  ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Total Tax (GST):</span>
                  <span className="font-mono font-bold text-slate-900">
                    ₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t-2 border-slate-900 text-sm font-extrabold text-slate-900">
                <span>Grand Total:</span>
                <span className="font-mono text-base text-brand-700">
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Terms & Conditions */}
          {quotation.terms && (
            <div className="pt-4 border-t border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Commercial Terms & Conditions
              </span>
              <p className="text-xs text-slate-600 whitespace-pre-line bg-slate-50 p-3 rounded-xl border border-slate-200">
                {quotation.terms}
              </p>
            </div>
          )}

          {/* Notes */}
          {quotation.notes && (
            <div className="pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Notes
              </span>
              <p className="text-xs text-slate-600 bg-amber-50/60 p-3 rounded-xl border border-amber-200 italic">
                {quotation.notes}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="pt-6 border-t border-slate-200 text-center text-[10px] text-slate-400">
            This is a computer-generated commercial quotation issued via HB CRM.
          </div>
        </div>
      </div>
    </div>
  );
};
