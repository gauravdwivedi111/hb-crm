import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Download,
  Printer,
  Phone,
  Building2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Quotation, QuotationLineItem } from '../types/api.types';
import { api } from '../services/api';
import { downloadQuotationPdf } from '../utils/pdfGenerator';
import { numberToWordsINR } from '../components/ViewQuotationModal';

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

export const PublicQuotationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) {
      setError('Quotation identifier is missing.');
      setLoading(false);
      return;
    }

    const fetchQuote = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.quotations.getPublicById(id);
        setQuotation(data);
      } catch (err: any) {
        setError(err.message || 'Quotation not found or expired.');
      } finally {
        setLoading(false);
      }
    };

    void fetchQuote();
  }, [id]);

  const handleDownloadPdf = async () => {
    if (!sheetRef.current || !quotation) return;
    try {
      setIsDownloading(true);
      const filename = `HB_Polytech_Quotation_${quotation.quotationNumber || 'HBPI'}.pdf`;
      await downloadQuotationPdf(sheetRef.current, filename);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      // Fallback to window.print()
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">Loading Official Quotation</h3>
            <p className="text-xs text-slate-500 mt-1">Preparing verified document from HB Polytech Industries...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Quotation Not Available</h3>
            <p className="text-sm text-slate-500 mt-1">{error || 'This quotation could not be loaded.'}</p>
          </div>
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 w-full">
            If you need assistance, please contact HB Polytech Industries at{' '}
            <a href="tel:8956117811" className="font-semibold text-brand-600 underline">
              8956117811
            </a>
          </div>
        </div>
      </div>
    );
  }

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

  const invoiceNo = quotation.quotationNumber || 'HBPI/0634/26-27';
  const invoiceDate = formatDateDDMMYYYY(quotation.createdAt);
  const refNo = quotation.enquiry?.enquiryCode ? `REF BY ${quotation.enquiry.enquiryCode}` : 'REF BY ASHOK SIR';
  const customerName = quotation.companyName || quotation.customerName || quotation.enquiry?.customer?.name || 'VALUED CUSTOMER';
  const destination = quotation.enquiry?.customer?.location || quotation.enquiry?.companyName || 'PUNE';
  const billingAddress = quotation.enquiry?.customer?.location
    ? `${quotation.enquiry.customer.location}, Pune, Maharashtra, 412115`
    : 'hirth, flet.no. 403, heigth, nande, MULSHI PUNE, Pune, Maharashtra, 412115';
  const customerGstin = quotation.enquiry?.customer?.gstNumber || '27DARPD4486D1ZG';
  const customerPhone = quotation.customerPhone || quotation.enquiry?.phone || '';
  const customerEmail = quotation.enquiry?.email || '';
  const salesman = quotation.createdBy?.name?.toUpperCase() || 'RAJSHREE';

  const cgst = totalTax / 2;
  const sgst = totalTax / 2;
  const taxInWords = numberToWordsINR(totalTax);
  const billTotalInWords = numberToWordsINR(grandTotal);

  return (
    <div className="min-h-screen bg-slate-200 text-slate-900">
      {/* Print Specific CSS */}
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

      {/* Client Action Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-300 shadow-xs no-print">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>HB POLYTECH INDUSTRIES</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Verified Quotation
                </span>
              </div>
              <div className="text-xs text-slate-500 font-mono">
                Quote Ref: <span className="font-bold text-slate-800">{invoiceNo}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isDownloading}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isDownloading ? 'Generating PDF...' : 'Download Official PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>

            <a
              href="tel:8956117811"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-medium transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-brand-600" />
              <span>8956117811</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Document Container */}
      <main className="p-3 sm:p-8 flex justify-center">
        <div
          ref={sheetRef}
          id="quotation-printable-sheet"
          className="bg-white text-black shadow-xl mx-auto w-full max-w-[780px] p-5 sm:p-7 border border-black print:border-none print:shadow-none print:p-0"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          {/* TOP HEADER ROW */}
          <div className="flex items-center justify-between pb-1 text-[11px] leading-tight font-sans">
            <div className="font-bold text-[12px]">
              GSTIN : <span className="font-extrabold">27BAUPD5356D1ZK</span>
            </div>
            <div className="text-center font-bold text-[15px] underline tracking-wide uppercase">
              Proforma Invoice
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
                  <span>: </span>
                </div>
                <div className="flex">
                  <span className="w-36 font-semibold">Mode/Terms of Paym</span>
                  <span>: 100% ADVANCE</span>
                </div>
                <div className="flex">
                  <span className="w-36 font-semibold">Eway Bill No & Date</span>
                  <span>: | Dated //</span>
                </div>
                <div className="flex">
                  <span className="w-36 font-semibold">Place of Supply</span>
                  <span>: Maharashtra</span>
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
                  <span>: {invoiceDate}</span>
                </div>
                <div className="flex">
                  <span className="w-32 font-semibold">Dispatch Through</span>
                  <span>: </span>
                </div>
                <div className="flex">
                  <span className="w-32 font-semibold">Destination</span>
                  <span className="font-bold">: {destination}</span>
                </div>
                <div className="flex">
                  <span className="w-32 font-semibold">Distance</span>
                  <span>: </span>
                </div>
                <div className="flex">
                  <span className="w-32 font-semibold">Bill Type</span>
                  <span>: Credit</span>
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
                    PUNE, Maharashtra - 412115, India
                  </div>
                </div>
                <div className="mt-2 pt-1 border-t border-slate-300 space-y-0.5 text-[10px]">
                  <div>
                    <span className="font-semibold">GSTIN / UIN : </span>
                    <span className="font-bold">{customerGstin}</span>
                  </div>
                  {customerPhone && (
                    <div>
                      <span className="font-semibold">Phone : </span>
                      <span>{customerPhone}</span>
                    </div>
                  )}
                  {customerEmail && (
                    <div>
                      <span className="font-semibold">Email : </span>
                      <span>{customerEmail}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-semibold">State Code : </span>
                    <span>27</span>
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
                    {customerName}
                  </div>
                  <div className="text-[10px] leading-tight text-slate-900 whitespace-pre-line mt-0.5">
                    SITE- {destination.toUpperCase()}
                  </div>
                  <div className="text-[10px] leading-tight text-slate-900 mt-0.5">
                    PUNE, Maharashtra - 411014, India
                  </div>
                </div>
                <div className="mt-2 pt-1 border-t border-slate-300 space-y-0.5 text-[10px]">
                  <div>
                    <span className="font-semibold">State Code : </span>
                    <span>27</span>
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
                        Commercial Materials & Solutions
                      </td>
                      <td className="py-1.5 px-2 border-r border-black text-center">39172110</td>
                      <td className="py-1.5 px-2 border-r border-black text-right font-mono">1.00</td>
                      <td className="py-1.5 px-2 border-r border-black text-right font-mono">{subtotal.toFixed(2)}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold">
                        {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}

                  {/* Filler space */}
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
                      {(totalQuantity || 1).toFixed(2)}
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
              {/* Left 8 Columns */}
              <div className="col-span-8 border-r border-black p-2 flex flex-col justify-between space-y-2">
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
                        <td className="py-1 px-1 border-r border-black font-mono">0.00</td>
                        <td className="py-1 px-1 font-mono font-semibold">
                          {totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="space-y-1 text-[10px] leading-tight">
                  <div className="font-semibold">
                    Tax Amount : <span className="font-bold">INR {taxInWords} Only</span>
                  </div>
                  <div className="font-semibold">
                    Bill Amount : <span className="font-bold">INR {billTotalInWords} Only</span>
                  </div>
                  <div className="text-[9.5px] pt-1">
                    <span className="font-semibold">Narration : </span>
                    <span>Estimate Generated for Party {customerName}</span>
                  </div>
                </div>
              </div>

              {/* Right 4 Columns */}
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
                  <div className="flex justify-between">
                    <span className="font-semibold">CGST (9%)</span>
                    <span className="font-mono">
                      {cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">SGST (9%)</span>
                    <span className="font-mono">
                      {sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Round Off</span>
                    <span className="font-mono">0.00</span>
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

          <div className="flex justify-end pt-1 text-[10px] font-medium text-slate-700">
            Page : 1/1
          </div>
        </div>
      </main>

      {/* Footer Contact bar */}
      <footer className="text-center py-6 text-xs text-slate-500 no-print">
        Official Commercial Proposal issued by HB Polytech Industries • Pune, Maharashtra
      </footer>
    </div>
  );
};
