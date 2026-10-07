import html2pdf from 'html2pdf.js';

export interface PdfGenerationOptions {
  filename?: string;
}

/**
 * Downloads the official formatted Quotation PDF directly in the browser.
 */
export async function downloadQuotationPdf(
  element: HTMLElement,
  filename: string = 'HB_Polytech_Quotation.pdf'
): Promise<void> {
  const opt = {
    margin: [6, 8, 6, 8] as [number, number, number, number],
    filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2.5,
      useCORS: true,
      letterRendering: true,
      scrollY: 0,
      scrollX: 0,
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait' as const,
      compress: true,
    },
  };

  await html2pdf().from(element).set(opt).save();
}

/**
 * Generates an official Quotation PDF as a Blob for sharing or storage.
 */
export async function generateQuotationPdfBlob(
  element: HTMLElement,
  filename: string = 'HB_Polytech_Quotation.pdf'
): Promise<Blob> {
  const opt = {
    margin: [6, 8, 6, 8] as [number, number, number, number],
    filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2.5,
      useCORS: true,
      letterRendering: true,
      scrollY: 0,
      scrollX: 0,
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait' as const,
      compress: true,
    },
  };

  const blob: Blob = await html2pdf().from(element).set(opt).output('blob');
  return blob;
}

/**
 * Attempts to share the PDF file directly via Web Share API (native mobile WhatsApp/Gmail),
 * or falls back to auto-downloading the PDF and opening WhatsApp with the direct link.
 */
export async function shareQuotationPdfViaWhatsApp(
  element: HTMLElement,
  filename: string,
  targetPhone: string,
  messageText: string
): Promise<{ sharedViaNative: boolean; pdfDownloaded: boolean }> {
  const cleanPhone = targetPhone.replace(/\D/g, '');
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  // 1. Try Native Web Share API if device supports sharing files (Android / iOS / Modern Chrome)
  try {
    const blob = await generateQuotationPdfBlob(element, safeFilename);
    const pdfFile = new File([blob], safeFilename, { type: 'application/pdf' });

    if (
      navigator.canShare &&
      navigator.canShare({ files: [pdfFile] }) &&
      navigator.share
    ) {
      await navigator.share({
        files: [pdfFile],
        title: safeFilename.replace('.pdf', ''),
        text: messageText,
      });
      return { sharedViaNative: true, pdfDownloaded: false };
    }
  } catch (err: any) {
    // If user cancelled share sheet, do not fail
    if (err.name === 'AbortError') {
      return { sharedViaNative: true, pdfDownloaded: false };
    }
    console.warn('Native file share unavailable or failed, falling back to download + WhatsApp Web:', err);
  }

  // 2. Fallback: Automatically download the PDF onto the user's computer/phone
  await downloadQuotationPdf(element, safeFilename);

  // 3. Open WhatsApp click-to-chat with message containing public PDF link
  const encoded = encodeURIComponent(messageText);
  window.open(`https://wa.me/${formattedPhone}?text=${encoded}`, '_blank');

  return { sharedViaNative: false, pdfDownloaded: true };
}
