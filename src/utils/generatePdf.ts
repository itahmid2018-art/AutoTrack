import { jsPDF } from 'jspdf';
import { JobCard } from '../types';

export function generateJobCardPdf(job: JobCard): { doc: jsPDF; filename: string; dataUrl: string } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header Banner
  doc.setFillColor(15, 23, 42); // #0f172a (dark navy)
  doc.rect(0, 0, pageWidth, 25, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BOSCH & VENDOR POWER TOOLS SERVICE HUB', 14, 12);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('AUTHORISED SERVICE CENTER · REPAIR TICKET & INVOICE RECEIPT', 14, 18);

  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.text(job.id, pageWidth - 14, 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Intake: ${job.intakeDate}`, pageWidth - 14, 19, { align: 'right' });

  y = 32;

  // Customer & Tool Specifications Box
  doc.setDrawColor(39, 39, 42);
  doc.setLineWidth(0.3);
  doc.setFillColor(248, 250, 252);
  doc.rect(14, y, pageWidth - 28, 35, 'FD');

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CUSTOMER INFORMATION', 18, y + 6);
  doc.text('TOOL SPECIFICATION', 110, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  // Customer column
  doc.text(`Name: ${job.customerName}`, 18, y + 12);
  doc.text(`Phone: ${job.customerPhone}`, 18, y + 17);
  if (job.customerCompany) doc.text(`Company: ${job.customerCompany}`, 18, y + 22);
  if (job.gstOrTaxId) doc.text(`GST/Tax ID: ${job.gstOrTaxId}`, 18, y + 27);

  // Tool column
  doc.text(`Brand: ${job.tool.brand}`, 110, y + 12);
  doc.text(`Model: ${job.tool.modelNumber}`, 110, y + 17);
  doc.text(`Serial SN: ${job.tool.serialNumber}`, 110, y + 22);
  doc.text(`Warranty: ${job.tool.warrantyStatus}`, 110, y + 27);

  y += 42;

  // Grievance & Complaint Box
  doc.setFillColor(255, 255, 255);
  doc.rect(14, y, pageWidth - 28, 25, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`DEFECT CATEGORY: ${job.serviceReq.grievanceCategory.toUpperCase()}`, 18, y + 6);

  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  const complaintLines = doc.splitTextToSize(`Complaint: ${job.serviceReq.detailedComplaint}`, pageWidth - 36);
  doc.text(complaintLines, 18, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`Pre-Approved Repair Limit: $${job.serviceReq.preApprovedLimit.toFixed(2)}`, pageWidth - 18, y + 21, { align: 'right' });

  y += 32;

  // Accessories Checklist
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('ACCESSORIES RECEIVED:', 14, y);
  doc.setFont('helvetica', 'normal');
  const accText = job.tool.accessoriesReceived.length > 0 ? job.tool.accessoriesReceived.join(', ') : 'None (Bare Tool Only)';
  doc.text(accText, 55, y);

  y += 6;

  // Table Headers
  doc.setFillColor(226, 232, 240);
  doc.rect(14, y, pageWidth - 28, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('SKU', 18, y + 5);
  doc.text('PART DESCRIPTION', 45, y + 5);
  doc.text('QTY', 125, y + 5, { align: 'center' });
  doc.text('UNIT PRICE', 155, y + 5, { align: 'right' });
  doc.text('TOTAL', pageWidth - 18, y + 5, { align: 'right' });

  y += 7;

  // Table Rows
  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);

  if (job.parts.length === 0) {
    doc.text('No replacement parts billed. Diagnostic / Service labor only.', 18, y + 5);
    y += 8;
  } else {
    job.parts.forEach((part) => {
      doc.text(part.sku, 18, y + 5);
      const nameLines = doc.splitTextToSize(part.name, 75);
      doc.text(nameLines, 45, y + 5);
      doc.text(String(part.quantity), 125, y + 5, { align: 'center' });
      doc.text(`$${part.unitPrice.toFixed(2)}`, 155, y + 5, { align: 'right' });
      doc.text(`$${part.total.toFixed(2)}`, pageWidth - 18, y + 5, { align: 'right' });
      y += 6 * Math.max(1, nameLines.length);
    });
  }

  y += 4;
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  // Financial Totals
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  
  const partsSubtotal = job.parts.reduce((s, p) => s + p.total, 0);
  const laborSubtotal = job.laborHours * job.laborRate;

  doc.text(`Labor (${job.laborHours} hrs @ $${job.laborRate}/hr):`, 120, y);
  doc.text(`$${laborSubtotal.toFixed(2)}`, pageWidth - 18, y, { align: 'right' });
  y += 5;

  doc.text(`Parts Subtotal:`, 120, y);
  doc.text(`$${partsSubtotal.toFixed(2)}`, pageWidth - 18, y, { align: 'right' });
  y += 5;

  doc.text(`Sales Tax / GST (${job.taxRate}%):`, 120, y);
  doc.text(`$${(((job.totalAmount * job.taxRate) / (100 + job.taxRate))).toFixed(2)}`, pageWidth - 18, y, { align: 'right' });
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL AMOUNT:', 120, y);
  doc.text(`$${job.totalAmount.toFixed(2)}`, pageWidth - 18, y, { align: 'right' });

  // Signature Block
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Customer Authorization Signature:', 14, y);
  doc.text('Service Center Manager Sign:', 120, y);

  y += 4;
  if (job.customerSignature) {
    try {
      doc.addImage(job.customerSignature, 'PNG', 14, y, 40, 15);
    } catch (e) {
      doc.line(14, y + 12, 64, y + 12);
    }
  } else {
    doc.line(14, y + 12, 64, y + 12);
  }

  doc.line(120, y + 12, 170, y + 12);

  // Footer Disclaimer
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Official Digital PDF Document generated by AutoTrack Bosch Service Center System.', 14, 285);

  const filename = `${job.id}_Service_JobCard.pdf`;
  const dataUrl = doc.output('datauristring');

  return { doc, filename, dataUrl };
}
