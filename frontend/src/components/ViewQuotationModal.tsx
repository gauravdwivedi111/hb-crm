import React, { useState } from 'react';
import {
  X,
  Printer,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Quotation, QuotationLineItem } from '../types/api.types';
import { api } from '../services/api';

interface ViewQuotationModalProps {
  quotation: Quotation | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated?: () => void;
}

// Indian Number to Words converter (e.g. 1,86,440 -> One Lakh Eighty Six Thousand Four Hundred Forty)
export function numberToWordsINR(amount: number): string {
  const num = Math.round(Math.abs(amount));
  if (num === 0) return 'Zero';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  function convertBelowThousand(n: number): string {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += ones[n] + ' ';
    }
    return str.trim();
  }

  let words = '';
  const crore = Math.floor(num / 10000000);
  let remainder = num % 10000000;
  const lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  const thousand = Math.floor(remainder / 1000);
  remainder = remainder % 1000;

  if (crore > 0) {
    words += convertBelowThousand(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertBelowThousand(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertBelowThousand(thousand) + ' Thousand ';
  }
  if (remainder > 0) {
    words += convertBelowThousand(remainder);
  }

  return words.trim();
}

function formatDateDDMMYYYY(dateString?: string | null): string {
  if (!dateString) return new Date().toLocaleDateString('en-GB');
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return new Date().toLocaleDateString('en-GB');
  }
}

export const ViewQuotationModal: React.FC<ViewQuotationModalProps> = ({
  quotation,
  isOpen,
  onClose,
  onStatusUpdated,
}) => {
  if (!isOpen || !quotation) return null;

  // Parse items safely
  let rawItems: QuotationLineItem[] = [];
  if (Array.isArray(quotation.items)) {
    rawItems = quotation.items as QuotationLineItem[];
  } else if (typeof quotation.items === 'string') {
    try {
      rawItems = JSON.parse(quotation.items);
    } catch {
      rawItems = [];
    }
  }

  // Calculate totals
  const subtotal = quotation.subtotal != null
    ? Number(quotation.subtotal)
    : rawItems.length > 0
    ? rawItems.reduce((acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0)
    : Number(quotation.amount || 0);

  const grandTotal = quotation.totalAmount != null
    ? Number(quotation.totalAmount)
    : quotation.amount != null
    ? Number(quotation.amount)
    : subtotal * 1.18;

  const totalTax = quotation.taxAmount != null
    ? Number(quotation.taxAmount)
    : Math.max(0, grandTotal - subtotal);

  const totalQuantity = rawItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);

  // Customizable Bill Fields State
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [docTitle, setDocTitle] = useState('Proforma Invoice');
  const [invoiceNo, setInvoiceNo] = useState(quotation.quotationNumber || 'HBPI/0634/26-27');
  const [invoiceDate, setInvoiceDate] = useState(formatDateDDMMYYYY(quotation.createdAt));
  const [refNo, setRefNo] = useState(
    quotation.enquiry?.enquiryCode ? `REF BY ${quotation.enquiry.enquiryCode}` : 'REF BY ASHOK SIR'
  );
  const [refDate, setRefDate] = useState(formatDateDDMMYYYY(quotation.createdAt));
  const [supplierCode, setSupplierCode] = useState('');
  const [dispatchThrough, setDispatchThrough] = useState('');
  const [modeOfPayment, setModeOfPayment] = useState('100% ADVANCE');
  const [destination, setDestination] = useState(
    quotation.enquiry?.customer?.location || quotation.enquiry?.companyName || 'PUNE'
  );
  const [ewayBill, setEwayBill] = useState('| Dated //');
  const [distance, setDistance] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('Maharashtra');
  const [billType, setBillType] = useState('Credit');

  // Customer / Shipping info
  const [customerName, setCustomerName] = useState(
    quotation.companyName || quotation.customerName || quotation.enquiry?.customer?.name || 'NEHA CONSTRUCTION'
  );
  const [billingAddress, setBillingAddress] = useState(
    quotation.enquiry?.customer?.location
      ? `${quotation.enquiry.customer.location}, Pune, Maharashtra, 412115`
      : 'hirth, flet.no. 403, heigth, nande, MULSHI PUNE, Pune, Maharashtra, 412115'
  );
  const [billingCityState, setBillingCityState] = useState('PUNE, Maharashtra - 412115, India');
  const [customerGstin, setCustomerGstin] = useState(
    quotation.enquiry?.customer?.gstNumber || '27DARPD4486D1ZG'
  );
  const [customerPhone, setCustomerPhone] = useState(
    quotation.customerPhone || quotation.enquiry?.phone || '9922248387'
  );
  const [customerEmail, setCustomerEmail] = useState(
    quotation.enquiry?.email || 'Pandudhanawat111@gmail.Com'
  );
  const [customerStateCode, setCustomerStateCode] = useState('27');

  const [shippingName, setShippingName] = useState(
    quotation.companyName || quotation.customerName || 'NEHA CONSTRUCTION'
  );
  const [shippingAddress, setShippingAddress] = useState(
    quotation.enquiry?.customer?.location
      ? `SITE- ${quotation.enquiry.customer.location.toUpperCase()}-411014`
      : 'SITE- VIMAN NAGAR-411014'
  );
  const [shippingCityState, setShippingCityState] = useState('PUNE, Maharashtra - 411014, India');
  const [salesman, setSalesman] = useState(
    quotation.createdBy?.name?.toUpperCase() || 'RAJSHREE'
  );

  const [isInterState, setIsInterState] = useState(false);
  const [narration, setNarration] = useState(
    `Estimate Generated for Party ${customerName}`
  );
  const [orderNo, setOrderNo] = useState(
    quotation.enquiry?.enquiryCode ? `REF. BY ${quotation.enquiry.enquiryCode}` : 'REF. BY ASHOK SIR'
  );
  const [deliveryChallanNo, setDeliveryChallanNo] = useState('');

  // Tax breakdown values
  const cgst = isInterState ? 0 : totalTax / 2;
  const sgst = isInterState ? 0 : totalTax / 2;
  const igst = isInterState ? totalTax : 0;
  const roundOff = 0;

  const taxInWords = numberToWordsINR(totalTax);
  const billTotalInWords = numberToWordsINR(grandTotal);

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = async () => {
    const rawPhone = customerPhone || quotation.customerPhone || quotation.enquiry?.phone || '';
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const targetPhone = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;

    let itemsSummary = '';
    if (rawItems.length > 0) {
      itemsSummary = rawItems
        .map(
          (item, i) =>
            `${i + 1}. *${item.description || 'Item'}* (HSN: ${item.hsnCode || item.hsn || '39172110'}) | Qty: ${item.quantity} | Rate: ₹${Number(item.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })} = ₹${Number(item.quantity * item.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        )
        .join('\n');
    }

    const message = [
      `*HB POLYTECH INDUSTRIES*`,
      `*PROFORMA INVOICE / COMMERCIAL QUOTATION*`,
      `GSTIN: 27BAUPD5356D1ZK | PAN: BAUPD5356D`,
      `---------------------------------------`,
      `*Invoice / Quote No:* ${invoiceNo}`,
      `*Date:* ${invoiceDate}`,
      `*Ref / PO No:* ${refNo}`,
      `*Client:* ${customerName}`,
      `*Destination:* ${destination}`,
      `*GSTIN:* ${customerGstin}`,
      `---------------------------------------`,
      `*Itemized Specifications:*`,
      itemsSummary || 'Commercial materials as discussed.',
      `---------------------------------------`,
      `*Sub Total:* ₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      !isInterState
        ? `*CGST (9%):* ₹${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n*SGST (9%):* ₹${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        : `*IGST (18%):* ₹${igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `*Bill Total:* ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `*(Amount in words: INR ${billTotalInWords} Only)*`,
      `---------------------------------------`,
      `*Bank Details for Payment:*`,
      `AXIS BANK | A/C: 921030005804008 | IFSC: UTIB0003144 | Branch: RAVET | HB POLYTECH INDUSTRIES`,
      `---------------------------------------`,
      `*Terms & Conditions:*`,
      `1) 100% ADVANCE PAYMENTS.`,
      `2) TRANSPORT EXTRA.`,
      `3) RATE VALID ONLY FOR 10 DAYS.`,
      `---------------------------------------`,
      `*Sales Executive:* ${salesman}`,
      `Contact: 8956117811 | hbpolytechind@gmail.com`,
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
    <>
      {/* Print Specific CSS to ensure clean A4 page print */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 8mm;
          }
          body * {
            visibility: hidden;
          }
          #quotation-printable-sheet, #quotation-printable-sheet * {
            visibility: visible;
          }
          #quotation-printable-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <div className="bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 max-w-4xl w-full my-6 overflow-hidden flex flex-col max-h-[95vh]">
          {/* Modal Header Toolbar (Hidden when printing) */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 bg-white no-print shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm sm:text-base font-extrabold text-slate-900">
                {invoiceNo}
              </span>
              {renderBadge(quotation.status)}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCustomizer(!showCustomizer)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                title="Tweak invoice meta fields before printing"
              >
                <Sliders className="w-3.5 h-3.5 text-slate-600" />
                <span>Customize Fields</span>
                {showCustomizer ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={handleWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                title="Send quote details to customer on WhatsApp"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Send WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
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

          {/* Quick Customizer Drawer (Hidden when printing) */}
          {showCustomizer && (
            <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs no-print space-y-3 max-h-72 overflow-y-auto">
              <div className="font-bold text-slate-800 flex items-center justify-between">
                <span>Invoice & Reference Customizer</span>
                <span className="text-[11px] text-slate-500 font-normal">Changes update live in the document below</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Doc Title</label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Invoice / Quote No</label>
                  <input
                    type="text"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Invoice Date</label>
                  <input
                    type="text"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Ref / PO No</label>
                  <input
                    type="text"
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Ref / PO Date</label>
                  <input
                    type="text"
                    value={refDate}
                    onChange={(e) => setRefDate(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Supplier Code</label>
                  <input
                    type="text"
                    value={supplierCode}
                    onChange={(e) => setSupplierCode(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Mode/Terms of Paym</label>
                  <input
                    type="text"
                    value={modeOfPayment}
                    onChange={(e) => setModeOfPayment(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Dispatch Through</label>
                  <input
                    type="text"
                    value={dispatchThrough}
                    onChange={(e) => setDispatchThrough(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Destination</label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Eway Bill</label>
                  <input
                    type="text"
                    value={ewayBill}
                    onChange={(e) => setEwayBill(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Distance</label>
                  <input
                    type="text"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Place of Supply</label>
                  <input
                    type="text"
                    value={placeOfSupply}
                    onChange={(e) => setPlaceOfSupply(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Bill Type</label>
                  <input
                    type="text"
                    value={billType}
                    onChange={(e) => setBillType(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Customer / Party Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      setNarration(`Estimate Generated for Party ${e.target.value}`);
                    }}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Billing Address</label>
                  <input
                    type="text"
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Billing City/State</label>
                  <input
                    type="text"
                    value={billingCityState}
                    onChange={(e) => setBillingCityState(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Customer GSTIN</label>
                  <input
                    type="text"
                    value={customerGstin}
                    onChange={(e) => setCustomerGstin(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Customer Phone</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Customer Email</label>
                  <input
                    type="text"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">State Code</label>
                  <input
                    type="text"
                    value={customerStateCode}
                    onChange={(e) => setCustomerStateCode(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Shipping Party Name</label>
                  <input
                    type="text"
                    value={shippingName}
                    onChange={(e) => setShippingName(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Shipping / Site Address</label>
                  <input
                    type="text"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Shipping City/State</label>
                  <input
                    type="text"
                    value={shippingCityState}
                    onChange={(e) => setShippingCityState(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Salesman Name</label>
                  <input
                    type="text"
                    value={salesman}
                    onChange={(e) => setSalesman(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Tax Scheme</label>
                  <select
                    value={isInterState ? 'IGST' : 'CGST_SGST'}
                    onChange={(e) => setIsInterState(e.target.value === 'IGST')}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  >
                    <option value="CGST_SGST">Intra-State (CGST 9% + SGST 9%)</option>
                    <option value="IGST">Inter-State (IGST 18%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Order No</label>
                  <input
                    type="text"
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Delivery Challan No</label>
                  <input
                    type="text"
                    value={deliveryChallanNo}
                    onChange={(e) => setDeliveryChallanNo(e.target.value)}
                    className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Printable Document Container */}
          <div className="overflow-y-auto p-3 sm:p-6 bg-slate-200/50 flex justify-center">
            <div
              id="quotation-printable-sheet"
              className="bg-white text-black shadow-lg mx-auto w-full max-w-[780px] p-5 sm:p-7 border border-black print:border-none print:shadow-none print:p-0"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              {/* TOP HEADER ROW */}
              <div className="flex items-center justify-between pb-1 text-[11px] leading-tight font-sans">
                <div className="font-bold text-[12px]">
                  GSTIN : <span className="font-extrabold">27BAUPD5356D1ZK</span>
                </div>
                <div className="text-center font-bold text-[15px] underline tracking-wide uppercase">
                  {docTitle}
                </div>
                <div className="text-right text-[11px] font-semibold text-slate-800">
                  Original For Recipient
                </div>
              </div>

              {/* MAIN OUTER BORDER BOX */}
              <div className="border border-black text-[11px] leading-[1.35]">
                {/* 1. COMPANY HEADER BOX */}
                <div className="flex items-center justify-between p-2.5 border-b border-black gap-3">
                  {/* Left Logo */}
                  <div className="w-[125px] shrink-0 flex items-center justify-center">
                    <img
                      src="/hb-polytech-logo.png"
                      alt="HB Polytech Industries Logo"
                      className="max-h-[85px] w-auto object-contain"
                    />
                  </div>

                  {/* Center Company Details */}
                  <div className="flex-1 text-center px-1">
                    <div className="text-[17px] font-black tracking-wide text-black uppercase leading-tight mb-0.5">
                      HB POLYTECH INDUSTRIES
                    </div>
                    <div className="text-[9.5px] leading-snug font-medium text-black">
                      WALHEKARWADI CHOWK NEAR PCMC SCHOOL, SR. NO. 113/10K SARASWTI NIWAS, WALHEKARWADI, CHINCHWAD -
                    </div>
                    <div className="text-[9.5px] leading-snug font-medium text-black">
                      RAVET, CHINCHWAD, Pune, Maharashtra, 411033
                    </div>
                    <div className="text-[9.5px] leading-snug font-medium text-black">
                      PUNE, Maharashtra - 411033, India
                    </div>
                    <div className="text-[10px] font-bold text-black mt-0.5">
                      Phone No: 8956117811 | Email: hbpolytechind@gmail.com
                    </div>
                    <div className="text-[9.5px] font-semibold text-black">
                      PAN No: BAUPD5356D &nbsp;|&nbsp; State Code : 27
                    </div>
                  </div>

                  {/* Right QR Code */}
                  <div className="w-[125px] shrink-0 text-center flex flex-col items-center justify-center">
                    <div className="text-[8.5px] font-bold uppercase tracking-tight text-black mb-1">
                      scan QRCode for Payment
                    </div>
                    <img
                      src="/payment-qr.png"
                      alt="Payment QR Code"
                      className="w-[72px] h-[72px] object-contain border border-slate-300"
                    />
                  </div>
                </div>

                {/* 2. INVOICE META GRID (2 Columns) */}
                <div className="grid grid-cols-2 border-b border-black text-[10.5px]">
                  {/* Left Column */}
                  <div className="p-2 border-r border-black space-y-0.5">
                    <div className="flex">
                      <span className="w-36 font-semibold">Invoice No.</span>
                      <span className="font-bold">: {invoiceNo}</span>
                    </div>
                    <div className="flex">
                      <span className="w-36 font-semibold">Ref No / PO No</span>
                      <span className="font-bold">: {refNo}</span>
                    </div>
                    <div className="flex">
                      <span className="w-36 font-semibold">Supplier Code</span>
                      <span>: {supplierCode}</span>
                    </div>
                    <div className="flex">
                      <span className="w-36 font-semibold">Mode/Terms of Paym</span>
                      <span>: {modeOfPayment}</span>
                    </div>
                    <div className="flex">
                      <span className="w-36 font-semibold">Eway Bill No & Date</span>
                      <span>: {ewayBill}</span>
                    </div>
                    <div className="flex">
                      <span className="w-36 font-semibold">Place of Supply</span>
                      <span>: {placeOfSupply}</span>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="p-2 space-y-0.5">
                    <div className="flex">
                      <span className="w-32 font-semibold">Invoice Date</span>
                      <span className="font-bold">: {invoiceDate}</span>
                    </div>
                    <div className="flex">
                      <span className="w-32 font-semibold">Ref / PO Date</span>
                      <span>: {refDate}</span>
                    </div>
                    <div className="flex">
                      <span className="w-32 font-semibold">Dispatch Through</span>
                      <span>: {dispatchThrough}</span>
                    </div>
                    <div className="flex">
                      <span className="w-32 font-semibold">Destination</span>
                      <span className="font-bold">: {destination}</span>
                    </div>
                    <div className="flex">
                      <span className="w-32 font-semibold">Distance</span>
                      <span>: {distance}</span>
                    </div>
                    <div className="flex">
                      <span className="w-32 font-semibold">Bill Type</span>
                      <span>: {billType}</span>
                    </div>
                  </div>
                </div>

                {/* 3. BILLING & SHIPPING ADDRESSES (2 Columns) */}
                <div className="grid grid-cols-2 border-b border-black text-[10.5px]">
                  {/* Left: Customer Name & Billing Address */}
                  <div className="p-2 border-r border-black flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-[11px] mb-1 underline">
                        Customer Name & Billing Address
                      </div>
                      <div className="font-bold text-[11px] text-black">
                        {customerName}
                      </div>
                      <div className="text-[10px] leading-tight text-slate-900 whitespace-pre-line mt-0.5">
                        {billingAddress}
                      </div>
                      <div className="text-[10px] leading-tight text-slate-900 mt-0.5">
                        {billingCityState}
                      </div>
                    </div>
                    <div className="mt-2 pt-1 border-t border-slate-300 space-y-0.5 text-[10px]">
                      <div>
                        <span className="font-semibold">GSTIN / UIN : </span>
                        <span className="font-bold">{customerGstin}</span>
                      </div>
                      <div>
                        <span className="font-semibold">Phone : </span>
                        <span>{customerPhone}</span>
                      </div>
                      <div>
                        <span className="font-semibold">Email : </span>
                        <span>{customerEmail}</span>
                      </div>
                      <div>
                        <span className="font-semibold">State Code : </span>
                        <span>{customerStateCode}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Shipping Address */}
                  <div className="p-2 flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-[11px] mb-1 underline">
                        Shipping Address
                      </div>
                      <div className="font-bold text-[11px] text-black">
                        {shippingName}
                      </div>
                      <div className="text-[10px] leading-tight text-slate-900 whitespace-pre-line mt-0.5">
                        {shippingAddress}
                      </div>
                      <div className="text-[10px] leading-tight text-slate-900 mt-0.5">
                        {shippingCityState}
                      </div>
                    </div>
                    <div className="mt-2 pt-1 border-t border-slate-300 space-y-0.5 text-[10px]">
                      <div>
                        <span className="font-semibold">State Code : </span>
                        <span>{customerStateCode}</span>
                      </div>
                      <div className="pt-1">
                        <span className="font-bold">Salesman : </span>
                        <span className="font-bold text-black">{salesman}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. ITEMS TABLE */}
                <div className="border-b border-black">
                  <table className="w-full border-collapse text-[10.5px]">
                    <thead>
                      <tr className="border-b border-black font-bold text-center bg-slate-50">
                        <th className="py-1.5 px-2 border-r border-black w-10">S No</th>
                        <th className="py-1.5 px-3 border-r border-black text-left">Description</th>
                        <th className="py-1.5 px-2 border-r border-black w-24">HSN / SAC</th>
                        <th className="py-1.5 px-2 border-r border-black w-20 text-right">Qty</th>
                        <th className="py-1.5 px-2 border-r border-black w-24 text-right">Item Rate</th>
                        <th className="py-1.5 px-3 w-28 text-right">Amount (INR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawItems.length > 0 ? (
                        rawItems.map((item, idx) => {
                          const qty = Number(item.quantity) || 0;
                          const rate = Number(item.unitPrice) || 0;
                          const amt = qty * rate;
                          const hsn = item.hsnCode || item.hsn || '39172110';
                          return (
                            <tr key={idx} className="align-top">
                              <td className="py-1.5 px-2 border-r border-black text-center font-medium">
                                {idx + 1}
                              </td>
                              <td className="py-1.5 px-3 border-r border-black font-medium text-black">
                                {item.description || 'Commercial Specification'}
                              </td>
                              <td className="py-1.5 px-2 border-r border-black text-center">
                                {hsn}
                              </td>
                              <td className="py-1.5 px-2 border-r border-black text-right font-mono">
                                {qty.toFixed(2)}
                              </td>
                              <td className="py-1.5 px-2 border-r border-black text-right font-mono">
                                {rate.toFixed(2)}
                              </td>
                              <td className="py-1.5 px-3 text-right font-mono font-semibold">
                                {amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr className="align-top">
                          <td className="py-1.5 px-2 border-r border-black text-center">1</td>
                          <td className="py-1.5 px-3 border-r border-black">
                            Hdpe Subsoil Drain Pipe With Geotextile 200mm
                          </td>
                          <td className="py-1.5 px-2 border-r border-black text-center">39172110</td>
                          <td className="py-1.5 px-2 border-r border-black text-right font-mono">200.00</td>
                          <td className="py-1.5 px-2 border-r border-black text-right font-mono">790.00</td>
                          <td className="py-1.5 px-3 text-right font-mono font-semibold">158,000.00</td>
                        </tr>
                      )}

                      {/* Filler row for visual paper balance matching the reference PDF */}
                      {rawItems.length <= 2 && (
                        <tr>
                          <td className="h-28 border-r border-black"></td>
                          <td className="border-r border-black"></td>
                          <td className="border-r border-black"></td>
                          <td className="border-r border-black"></td>
                          <td className="border-r border-black"></td>
                          <td></td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-black font-bold">
                        <td colSpan={3} className="py-1.5 px-3 border-r border-black text-center font-bold">
                          Total
                        </td>
                        <td className="py-1.5 px-2 border-r border-black text-right font-mono font-bold">
                          {(totalQuantity || 200).toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 border-r border-black"></td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold">
                          {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* 5. TAX BREAKDOWN & BILL SUMMARY SECTION */}
                <div className="grid grid-cols-12 border-b border-black text-[10px]">
                  {/* Left 7 Columns: Tax Matrix & Words */}
                  <div className="col-span-8 border-r border-black p-2 flex flex-col justify-between space-y-2">
                    {/* GST Summary Table */}
                    <div>
                      <table className="w-full border border-black border-collapse text-center text-[9.5px]">
                        <thead>
                          <tr className="border-b border-black font-bold bg-slate-50">
                            <th className="py-1 px-1 border-r border-black">Tax Rate</th>
                            <th className="py-1 px-1 border-r border-black">Taxable Value</th>
                            <th className="py-1 px-1 border-r border-black">CGST Amount</th>
                            <th className="py-1 px-1 border-r border-black">SGST Amount</th>
                            <th className="py-1 px-1 border-r border-black">IGST Amount</th>
                            <th className="py-1 px-1">Total Tax</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="py-1 px-1 border-r border-black font-semibold">TAX @ 18%</td>
                            <td className="py-1 px-1 border-r border-black font-mono">
                              {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1 px-1 border-r border-black font-mono">
                              {cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1 px-1 border-r border-black font-mono">
                              {sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1 px-1 border-r border-black font-mono">
                              {igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1 px-1 font-mono font-semibold">
                              {totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Words & Document Extra Info */}
                    <div className="space-y-1 text-[10px] leading-tight">
                      <div className="font-semibold">
                        Tax Amount : <span className="font-bold">INR {taxInWords} Only</span>
                      </div>
                      <div className="font-semibold">
                        Bill Amount : <span className="font-bold">INR {billTotalInWords} Only</span>
                      </div>
                      <div className="text-[9.5px] pt-1">
                        <span className="font-semibold">Narration : </span>
                        <span>{narration}</span>
                      </div>
                      <div className="text-[9.5px]">
                        <span className="font-semibold">Document extra info : </span>
                      </div>
                      <div className="text-[9.5px] flex items-center justify-between">
                        <span>
                          <strong className="font-semibold">Order no :</strong> {orderNo}
                        </span>
                        <span>
                          <strong className="font-semibold">Delivery Challan No :</strong> {deliveryChallanNo}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right 4 Columns: Totals Box */}
                  <div className="col-span-4 p-2.5 flex flex-col justify-between text-[10.5px]">
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-bold">Sub Total</span>
                        <span className="font-mono">
                          {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-bold">Taxable Amount</span>
                        <span className="font-mono">
                          {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      {!isInterState ? (
                        <>
                          <div className="flex justify-between">
                            <span className="font-semibold">CGST</span>
                            <span className="font-mono">
                              {cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold">SGST/UTGST</span>
                            <span className="font-mono">
                              {sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between">
                          <span className="font-semibold">IGST</span>
                          <span className="font-mono">
                            {igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-700">
                        <span>Round Off</span>
                        <span className="font-mono">{roundOff.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t-2 border-black text-[13px] font-black">
                      <span>Bill Total</span>
                      <span className="font-mono text-[14px]">
                        {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 6. BANK DETAILS BANNER */}
                <div className="p-1.5 border-b border-black text-center text-[10px] font-bold tracking-wide uppercase bg-slate-50">
                  Bank Details : AXIS BANK | 921030005804008 | RAVET | UTIB0003144 | HB POLYTECH INDUSTRIES
                </div>

                {/* 7. DECLARATION, TERMS & SIGNATURES */}
                <div className="grid grid-cols-2 text-[10px]">
                  {/* Left: Declaration & Terms */}
                  <div className="p-2.5 border-r border-black space-y-1.5">
                    <div>
                      <div className="font-bold underline mb-0.5">Declaration:</div>
                      <p className="text-[9.5px] leading-snug">
                        We declare that this invoice shows the actual price of the goods / services described and that all particulars are true and correct.
                      </p>
                    </div>
                    <div>
                      <div className="font-bold underline mb-0.5">Terms and Conditions:</div>
                      <div className="text-[9.5px] leading-snug font-medium">
                        <div>1) 100% ADVANCE PAYMENTS.</div>
                        <div>2) TRANSPORT EXTRA.</div>
                        <div>3) RATE VALID ONLY FOR 10 DAYS.</div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Signature Box */}
                  <div className="p-2.5 flex flex-col justify-between">
                    <div className="text-right font-bold text-[11px] text-black">
                      For &nbsp; HB POLYTECH INDUSTRIES
                    </div>
                    <div className="h-14"></div>
                    <div className="flex justify-between text-[10px] font-bold pt-1 border-t border-slate-300">
                      <span>Receiver's Signature</span>
                      <span>Authorised Signatory</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* BOTTOM FOOTER */}
              <div className="flex justify-end pt-1 text-[10px] font-medium text-slate-700">
                Page : 1/1
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
