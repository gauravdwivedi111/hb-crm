import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Search,
  Check,
  AlertCircle,
  FileText,
  Calculator,
  Calendar,
  Building2,
  Phone,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Enquiry,
  Quotation,
  QuotationLineItem,
  CreateQuotationPayload,
  Product,
} from '../types/api.types';

interface CreateQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (quotation: Quotation) => void;
  initialEnquiryCode?: string;
  initialEnquiryId?: string;
}

const GST_RATES = [0, 5, 12, 18, 28];

export const CreateQuotationModal: React.FC<CreateQuotationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialEnquiryCode = '',
  initialEnquiryId,
}) => {
  const { user } = useAuth();

  // Enquiry Search State
  const [enquiryCode, setEnquiryCode] = useState<string>(initialEnquiryCode);
  const [isFetchingEnquiry, setIsFetchingEnquiry] = useState<boolean>(false);
  const [enquiryError, setEnquiryError] = useState<string | null>(null);
  const [loadedEnquiry, setLoadedEnquiry] = useState<Enquiry | null>(null);

  // Line items state
  const [items, setItems] = useState<QuotationLineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, taxRate: 18, amount: 0 },
  ]);

  // Product Catalog Autocomplete State
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState<boolean>(false);

  // General fields
  const [validityDays, setValidityDays] = useState<number>(15);
  const [terms, setTerms] = useState<string>(
    '1. 50% advance along with purchase order.\n2. Balance against dispatch / delivery.\n3. Prices inclusive of GST as indicated.',
  );
  const [notes, setNotes] = useState<string>('');
  const [employeePhone, setEmployeePhone] = useState<string>(user?.phone || '');

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-fetch if initialEnquiryCode provided
  useEffect(() => {
    if (isOpen) {
      if (initialEnquiryCode) {
        setEnquiryCode(initialEnquiryCode);
        void fetchEnquiryDetails(initialEnquiryCode);
      } else if (initialEnquiryId) {
        void fetchEnquiryById(initialEnquiryId);
      }
    } else {
      // Reset on close
      setEnquiryCode('');
      setLoadedEnquiry(null);
      setEnquiryError(null);
      setSubmitError(null);
      setItems([{ description: '', quantity: 1, unitPrice: 0, taxRate: 18, amount: 0 }]);
      setNotes('');
    }
  }, [isOpen, initialEnquiryCode, initialEnquiryId]);

  const fetchEnquiryById = async (id: string) => {
    setIsFetchingEnquiry(true);
    setEnquiryError(null);
    try {
      const enq = await api.enquiries.getById(id);
      setLoadedEnquiry(enq);
      if (enq.enquiryCode) {
        setEnquiryCode(enq.enquiryCode);
      }
      if (enq.product) {
        setItems([
          {
            description: enq.product,
            quantity: 1,
            unitPrice: enq.expectedValue ? Number(enq.expectedValue) : 0,
            taxRate: 18,
            amount: enq.expectedValue ? Number(enq.expectedValue) : 0,
          },
        ]);
      }
    } catch (err) {
      setEnquiryError(err instanceof Error ? err.message : 'Unable to load enquiry details');
    } finally {
      setIsFetchingEnquiry(false);
    }
  };

  const fetchEnquiryDetails = async (codeToFetch: string) => {
    const clean = codeToFetch.trim().toUpperCase();
    if (!clean) return;

    setIsFetchingEnquiry(true);
    setEnquiryError(null);

    try {
      const enq = await api.enquiries.getByCode(clean);
      setLoadedEnquiry(enq);

      // Pre-fill first item if product is specified on enquiry
      if (enq.product && items.length === 1 && !items[0].description) {
        const val = enq.expectedValue ? Number(enq.expectedValue) : 0;
        setItems([
          {
            description: enq.product,
            quantity: 1,
            unitPrice: val,
            taxRate: 18,
            amount: val,
          },
        ]);
      }
    } catch (err) {
      setLoadedEnquiry(null);
      setEnquiryError(err instanceof Error ? err.message : `Enquiry with code "${clean}" not found.`);
    } finally {
      setIsFetchingEnquiry(false);
    }
  };

  // Item handlers
  const handleItemChange = (index: number, field: keyof QuotationLineItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      item.amount = qty * price;
      next[index] = item;
      return next;
    });
  };

  const handleDescriptionChange = (index: number, value: string) => {
    handleItemChange(index, 'description', value);
    if (value.trim().length >= 2) {
      setActiveSearchIndex(index);
      setIsSearchingProducts(true);
      void api.products
        .search(value.trim(), 8)
        .then((res) => {
          setSearchResults(res);
          setIsSearchingProducts(false);
        })
        .catch(() => {
          setIsSearchingProducts(false);
        });
    } else {
      setSearchResults([]);
      setActiveSearchIndex(null);
    }
  };

  const selectProduct = (p: Product, index: number) => {
    setItems((prev) => {
      const next = [...prev];
      const target = { ...next[index] };
      target.description = p.code ? `[${p.code}] ${p.name}` : p.name;
      target.unitPrice = Number(p.unitPrice) || 0;
      target.taxRate = Number(p.taxRate) || 18;
      const qty = Number(target.quantity) || 1;
      target.amount = qty * target.unitPrice;
      next[index] = target;
      return next;
    });
    setActiveSearchIndex(null);
    setSearchResults([]);
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unitPrice: 0, taxRate: 18, amount: 0 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Totals calculation
  const subtotal = items.reduce((acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const totalTax = items.reduce((acc, item) => {
    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    return acc + lineTotal * ((Number(item.taxRate) || 0) / 100);
  }, 0);
  const grandTotal = subtotal + totalTax;

  // Format WhatsApp message text
  const buildWhatsAppText = (quotationNumber?: string) => {
    const qNum = quotationNumber || 'QT-XXXX';
    const cName = loadedEnquiry?.customer?.name || loadedEnquiry?.companyName || 'Valued Customer';
    const compName = loadedEnquiry?.companyName || loadedEnquiry?.customer?.companyName || '';
    const code = loadedEnquiry?.enquiryCode || enquiryCode;

    const itemLines = items
      .filter((i) => i.description.trim())
      .map((i, idx) => `  ${idx + 1}. *${i.description}* (Qty: ${i.quantity}) - ₹${(i.quantity * i.unitPrice).toLocaleString('en-IN')}`)
      .join('\n');

    return (
      `*QUOTATION / PROPOSAL*\n` +
      `--------------------------------\n` +
      `*Quotation Ref:* ${qNum}\n` +
      `*Enquiry Ref:* ${code}\n` +
      `*Client:* ${cName}${compName ? ` (${compName})` : ''}\n` +
      `*Date:* ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}\n` +
      `*Validity:* ${validityDays} Days\n\n` +
      `*Itemized Pricing:*\n${itemLines}\n\n` +
      `*Subtotal:* ₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
      `*GST / Tax:* ₹${totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
      `*Grand Total:* ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Incl. GST)\n\n` +
      `*Terms:*\n${terms}\n` +
      (notes ? `\n*Notes:*\n${notes}\n` : '') +
      `--------------------------------\n` +
      `*Sales Executive:* ${user?.name || 'HB CRM Team'}\n` +
      (employeePhone ? `*Contact:* ${employeePhone}\n` : '') +
      `*HB CRM Solutions*`
    );
  };

  const handleSubmit = async (sendViaWhatsApp: boolean = false) => {
    if (!loadedEnquiry) {
      setSubmitError('Please enter a valid Enquiry Code and fetch enquiry details first.');
      return;
    }

    const validItems = items.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      setSubmitError('Please add at least one line item with a description.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const validUntilDate = new Date();
      validUntilDate.setDate(validUntilDate.getDate() + validityDays);

      const payload: CreateQuotationPayload = {
        enquiryId: loadedEnquiry.id,
        enquiryCode: loadedEnquiry.enquiryCode || undefined,
        items: validItems,
        subtotal,
        taxAmount: totalTax,
        totalAmount: grandTotal,
        amount: grandTotal,
        terms,
        notes,
        validUntil: validUntilDate.toISOString(),
        customerName: loadedEnquiry.customer?.name || loadedEnquiry.companyName || '',
        customerPhone: loadedEnquiry.phone || loadedEnquiry.customer?.phone || '',
        companyName: loadedEnquiry.companyName || loadedEnquiry.customer?.companyName || '',
      };

      const created = await api.quotations.create(payload, loadedEnquiry.id);

      if (sendViaWhatsApp) {
        // Mark as sent in CRM
        await api.quotations.markWhatsAppSent(created.id);

        // Open WhatsApp
        const rawPhone = loadedEnquiry.phone || loadedEnquiry.customer?.phone || '';
        const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
        const messageText = buildWhatsAppText(created.quotationNumber || undefined);
        const encodedText = encodeURIComponent(messageText);

        const waUrl = cleanPhone
          ? `https://wa.me/${cleanPhone}?text=${encodedText}`
          : `https://api.whatsapp.com/send?text=${encodedText}`;

        window.open(waUrl, '_blank', 'noopener,noreferrer');
      }

      onSuccess(created);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to generate quotation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Generate Quotation</h2>
              <p className="text-xs text-slate-500">
                Auto-pull lead details using Enquiry Code and dispatch via WhatsApp
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-900">
          {submitError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Section 1: Enquiry Reference Code & Auto-Fetch */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              1. Enquiry Reference Code *
            </label>
            <div className="flex gap-2.5">
              <div className="relative flex-1">
                <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. ENQ-1001"
                  value={enquiryCode}
                  onChange={(e) => setEnquiryCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void fetchEnquiryDetails(enquiryCode);
                    }
                  }}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold tracking-wide text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
              <button
                type="button"
                disabled={isFetchingEnquiry || !enquiryCode.trim()}
                onClick={() => void fetchEnquiryDetails(enquiryCode)}
                className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 transition-colors"
              >
                {isFetchingEnquiry ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>Auto-Fetch Details</span>
              </button>
            </div>

            {enquiryError && (
              <p className="text-xs text-red-600 flex items-center gap-1.5 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                {enquiryError}
              </p>
            )}

            {/* Loaded Enquiry Overview Card */}
            {loadedEnquiry && (
              <div className="mt-3 p-3.5 bg-white rounded-xl border border-brand-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-800 text-[11px] font-bold">
                      {loadedEnquiry.enquiryCode}
                    </span>
                    <span className="font-bold text-sm text-slate-900">
                      {loadedEnquiry.customer?.name || loadedEnquiry.companyName}
                    </span>
                    {loadedEnquiry.companyName && loadedEnquiry.companyName !== loadedEnquiry.customer?.name && (
                      <span className="text-xs text-slate-500">({loadedEnquiry.companyName})</span>
                    )}
                  </div>
                  <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Lead Linked
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{loadedEnquiry.phone || 'No phone'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{loadedEnquiry.location || 'No location set'}</span>
                  </div>
                  {loadedEnquiry.gstNumber && (
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <span className="text-[10px] bg-slate-100 px-1 py-0.5 rounded font-mono">GST</span>
                      <span>{loadedEnquiry.gstNumber}</span>
                    </div>
                  )}
                </div>

                {loadedEnquiry.product && (
                  <div className="text-xs text-slate-500 pt-1">
                    <span className="font-semibold text-slate-700">Requirement:</span> {loadedEnquiry.product}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Line Items Builder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                2. Quotation Line Items *
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Another Item
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Item Description *</th>
                    <th className="py-2.5 px-3 w-20">Qty</th>
                    <th className="py-2.5 px-3 w-28">Unit Price (₹)</th>
                    <th className="py-2.5 px-3 w-24">GST Rate</th>
                    <th className="py-2.5 px-3 w-28 text-right">Amount (₹)</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => {
                    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="p-2 relative">
                          <div className="relative">
                            <input
                              type="text"
                              required
                              placeholder="Type to search 2,600+ items (e.g. KOHLER, SIKA, DR. FIXIT)..."
                              value={item.description}
                              onChange={(e) => handleDescriptionChange(idx, e.target.value)}
                              onFocus={() => {
                                if (item.description.trim().length >= 2) {
                                  handleDescriptionChange(idx, item.description);
                                }
                              }}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                            {isSearchingProducts && activeSearchIndex === idx && (
                              <div className="absolute right-2 top-2">
                                <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                              </div>
                            )}
                          </div>

                          {activeSearchIndex === idx && searchResults.length > 0 && (
                            <div className="absolute left-2 right-2 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100">
                              <div className="p-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                                <span>Catalog Matches ({searchResults.length})</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveSearchIndex(null)}
                                  className="text-slate-400 hover:text-slate-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              {searchResults.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => selectProduct(p, idx)}
                                  className="w-full p-2 text-left hover:bg-brand-50/70 transition-colors cursor-pointer flex items-center justify-between gap-2"
                                >
                                  <div>
                                    <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                                      <span className="font-mono text-[10px] font-bold px-1 py-0.5 rounded bg-slate-100 text-slate-700">
                                        {p.code}
                                      </span>
                                      <span>{p.name}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      {p.brand && <span className="font-medium text-brand-600 mr-1.5">{p.brand}</span>}
                                      {p.category && <span>{p.category} • </span>}
                                      <span>Unit: {p.unit || 'Pcs'}</span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="font-mono font-bold text-xs text-slate-900">
                                      ₹{Number(p.unitPrice).toLocaleString('en-IN')}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">GST {p.taxRate}%</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={item.taxRate}
                            onChange={(e) => handleItemChange(idx, 'taxRate', Number(e.target.value))}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
                          >
                            {GST_RATES.map((rate) => (
                              <option key={rate} value={rate}>
                                {rate}% GST
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-right font-mono font-medium text-slate-800">
                          ₹{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                              title="Delete Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totals Summary Footer */}
              <div className="bg-slate-50/80 p-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="text-xs text-slate-500">
                  Total items: <span className="font-semibold text-slate-700">{items.length}</span>
                </div>
                <div className="space-y-1.5 text-right w-full sm:w-auto">
                  <div className="flex justify-between sm:justify-end gap-6 text-xs text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-semibold">
                      ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between sm:justify-end gap-6 text-xs text-slate-600">
                    <span>Estimated GST:</span>
                    <span className="font-mono font-semibold text-amber-700">
                      ₹{totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between sm:justify-end gap-6 text-sm font-bold text-slate-900 border-t border-slate-200 pt-1.5">
                    <span>Grand Total:</span>
                    <span className="font-mono text-emerald-700 text-base">
                      ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Terms, Validity & Executive Attribution */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Validity Period
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={validityDays}
                  onChange={(e) => setValidityDays(Number(e.target.value))}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
                >
                  <option value={7}>Valid for 7 Days</option>
                  <option value={15}>Valid for 15 Days (Standard)</option>
                  <option value={30}>Valid for 30 Days</option>
                  <option value={60}>Valid for 60 Days</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Executive WhatsApp Contact Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={employeePhone}
                  onChange={(e) => setEmployeePhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                This will appear in the quotation signature sent to customer
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Terms & Conditions
              </label>
              <textarea
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* Standard Save */}
            <button
              type="button"
              disabled={isSubmitting || !loadedEnquiry}
              onClick={() => void handleSubmit(false)}
              className="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              Save as Draft
            </button>

            {/* Direct WhatsApp Trigger */}
            <button
              type="button"
              disabled={isSubmitting || !loadedEnquiry}
              onClick={() => void handleSubmit(true)}
              className="flex-1 sm:flex-none px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <MessageSquare className="w-3.5 h-3.5" />
              )}
              <span>⚡ Generate & Send via WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateQuotationModal;
