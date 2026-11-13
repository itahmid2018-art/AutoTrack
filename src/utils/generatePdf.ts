import { jsPDF } from 'jspdf';
import { JobCard } from '../types';
import { getEffectiveJobBilling } from './billing';
import {
  buildCustomerPortalUrl,
  buildQrMatrix,
  ensurePublicAccessToken,
} from './customerPortalUrl';

export interface PdfBrandMeta {
  centerName?: string;
  address?: string;
  phone?: string;
  email?: string;
  currencySymbol?: string;
  portalOrigin?: string;
}

export function generateJobCardPdf(
  job: JobCard,
  brandMeta?: PdfBrandMeta
): { doc: jsPDF; filename: string; dataUrl: string } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const currency = brandMeta?.currencySymbol || '$';
  const centerName = brandMeta?.centerName || 'BOSCH & VENDOR POWER TOOLS SERVICE HUB';
  const contactLine = [
    brandMeta?.address || 'Authorised Industrial Tool Service Center',
    brandMeta?.phone,
    brandMeta?.email,
  ]
    .filter(Boolean)
    .join('  |  ');

  const billing = getEffectiveJobBilling(job);
  const warrantyLabel =
    job.tool.warrantyFlag || job.tool.warrantyAdjudication?.flag || job.tool.warrantyStatus;

  const ensureSpace = (neededMm: number, currentY: number): number => {
    if (currentY + neededMm > pageHeight - 22) {
      doc.addPage();
      return 18;
    }
    return currentY;
  };

  let y = 0;

  // Branded Header Banner
  doc.setFillColor(15, 23, 42); // Slate-900 dark header
  doc.rect(0, 0, pageWidth, 29, 'F');
  doc.setFillColor(220, 38, 38); // Industrial red accent stripe
  doc.rect(0, 29, pageWidth, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(centerName.toUpperCase(), margin, 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text('AUTHORISED CUSTOMER SERVICE RECORD & TAX ESTIMATE', margin, 17.5);
  doc.setFontSize(7.5);
  doc.text(contactLine, margin, 23.5);

  // Right-side Job ID & Status Pill
  doc.setTextColor(255, 255, 255);
  doc.setFont('courier', 'bold');
  doc.setFontSize(13.5);
  doc.text(job.id, pageWidth - margin, 12, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(52, 211, 153);
  doc.text(`STATUS: ${job.status.toUpperCase()}`, pageWidth - margin, 17.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Intake: ${job.intakeDate}  |  Priority: ${job.priority}`, pageWidth - margin, 23.5, {
    align: 'right',
  });

  y = 37;

  // Customer & Tool Specification Two-Column Box
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 38, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CUSTOMER DETAILS', margin + 4, y + 6.5);
  doc.text('TOOL & WARRANTY DETAILS', 108, y + 6.5);

  doc.setDrawColor(226, 232, 240);
  doc.line(104, y + 3, 104, y + 35);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  doc.text(`Customer: ${job.customerName}`, margin + 4, y + 12.5);
  doc.text(`Phone: ${job.customerPhone}`, margin + 4, y + 18);
  if (job.customerCompany) {
    doc.text(`Company: ${job.customerCompany}`, margin + 4, y + 23.5);
  }
  if (job.customerEmail) {
    doc.text(`Email: ${job.customerEmail}`, margin + 4, y + (job.customerCompany ? 29 : 23.5));
  }
  if (job.gstOrTaxId) {
    doc.text(`GST / Tax ID: ${job.gstOrTaxId}`, margin + 4, y + 34);
  }

  doc.text(`Brand / Model: ${job.tool.brand} ${job.tool.modelNumber}`.slice(0, 46), 108, y + 12.5);
  doc.text(`Serial No: ${job.tool.serialNumber}  (${job.tool.voltageRating})`, 108, y + 18);
  doc.text(`Warranty: ${warrantyLabel} (${job.tool.warrantyStatus})`.slice(0, 46), 108, y + 23.5);
  doc.text(`Technician: ${job.technician || 'Unassigned'}`.slice(0, 46), 108, y + 29);
  doc.text(`Promised By: ${job.promisedCompletion}`, 108, y + 34);

  y += 43;

  // Grievance, Complaint & Diagnostic Notes Box
  const complaintLines = doc.splitTextToSize(
    `Reported Complaint: ${job.serviceReq.detailedComplaint}`,
    contentWidth - 8
  );
  const diagLines = job.diagnosticNotes
    ? doc.splitTextToSize(`Diagnostic Findings: ${job.diagnosticNotes}`, contentWidth - 8)
    : [];
  const grievanceBoxHeight = 16 + complaintLines.length * 4.2 + (diagLines.length > 0 ? diagLines.length * 4.2 + 3 : 0);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, grievanceBoxHeight, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`SERVICE GRIEVANCE: ${job.serviceReq.grievanceCategory.toUpperCase()}`, margin + 4, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Pre-Approved Limit: ${currency}${job.serviceReq.preApprovedLimit.toFixed(2)}`,
    pageWidth - margin - 4,
    y + 6,
    { align: 'right' }
  );

  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(complaintLines, margin + 4, y + 12);

  if (diagLines.length > 0) {
    const diagStartY = y + 12 + complaintLines.length * 4.2 + 1.5;
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(diagLines, margin + 4, diagStartY);
  }

  y += grievanceBoxHeight + 5;

  // Accessories Checklist
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('ACCESSORIES RECEIVED:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const accText =
    job.tool.accessoriesReceived.length > 0
      ? job.tool.accessoriesReceived.join(', ')
      : 'None (Bare Tool Only)';
  const accLines = doc.splitTextToSize(accText, contentWidth - 44);
  doc.text(accLines, margin + 42, y);

  y += Math.max(6, accLines.length * 4.2 + 2);

  // Spare Parts Table
  y = ensureSpace(24, y);
  doc.setFillColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('SKU', margin + 3, y + 4.8);
  doc.text('REPLACEMENT PART DESCRIPTION', margin + 30, y + 4.8);
  doc.text('QTY', 128, y + 4.8, { align: 'center' });
  doc.text('UNIT PRICE', 158, y + 4.8, { align: 'right' });
  doc.text('TOTAL', pageWidth - margin - 3, y + 4.8, { align: 'right' });

  y += 7;
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);

  if (job.parts.length === 0) {
    doc.text('No replacement parts billed. Diagnostic / service labor only.', margin + 3, y + 5);
    y += 8;
  } else {
    job.parts.forEach((part) => {
      const nameLines = doc.splitTextToSize(part.name, 75);
      const rowHeight = Math.max(6, nameLines.length * 4.5 + 2);
      y = ensureSpace(rowHeight + 4, y);
      doc.text(part.sku, margin + 3, y + 4.5);
      doc.text(nameLines, margin + 30, y + 4.5);
      doc.text(String(part.quantity), 128, y + 4.5, { align: 'center' });
      doc.text(`${currency}${part.unitPrice.toFixed(2)}`, 158, y + 4.5, { align: 'right' });
      doc.text(`${currency}${part.total.toFixed(2)}`, pageWidth - margin - 3, y + 4.5, {
        align: 'right',
      });
      y += rowHeight;
    });
  }

  // Operational Expenses Table (Non-Part Costs) if present
  const expenses = job.operationalExpenses || [];
  if (expenses.length > 0) {
    y = ensureSpace(20, y + 3);
    doc.setFillColor(254, 243, 199); // Warm amber tint header
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120, 53, 15);
    doc.text('CATEGORY', margin + 3, y + 4.8);
    doc.text('OPERATIONAL EXPENSE (NON-PART COST)', margin + 45, y + 4.8);
    doc.text('VENDOR', 152, y + 4.8, { align: 'right' });
    doc.text('AMOUNT', pageWidth - margin - 3, y + 4.8, { align: 'right' });

    y += 7;
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);

    expenses.forEach((exp) => {
      const descLines = doc.splitTextToSize(exp.description, 65);
      const rowHeight = Math.max(6, descLines.length * 4.5 + 2);
      y = ensureSpace(rowHeight + 4, y);
      doc.text(exp.category.slice(0, 22), margin + 3, y + 4.5);
      doc.text(descLines, margin + 45, y + 4.5);
      doc.text((exp.vendor || '-').slice(0, 18), 152, y + 4.5, { align: 'right' });
      doc.text(`${currency}${Number(exp.amount).toFixed(2)}`, pageWidth - margin - 3, y + 4.5, {
        align: 'right',
      });
      y += rowHeight;
    });
  }

  // Financial Totals & Customer Status QR Code Section
  y = ensureSpace(58, y + 4);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);

  y += 5;
  const sectionTopY = y;

  // Left: Unique QR Code Receipt Box linking directly to Customer View via publicAccessToken
  const accessToken = ensurePublicAccessToken(job);
  const customerPortalUrl = buildCustomerPortalUrl(
    { id: job.id, createdAt: job.createdAt, publicAccessToken: accessToken },
    brandMeta?.portalOrigin
  );
  const { size: qrMatrixSize, rows: qrRows } = buildQrMatrix(customerPortalUrl);

  const qrBoxWidth = 94;
  const qrBoxHeight = 36;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, sectionTopY, qrBoxWidth, qrBoxHeight, 2, 2, 'FD');

  const qrOuterSize = 28;
  const qrPadding = 1.6;
  const qrX = margin + 3;
  const qrY = sectionTopY + 4;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.rect(qrX, qrY, qrOuterSize, qrOuterSize, 'FD');

  const qrDrawArea = qrOuterSize - qrPadding * 2;
  const cellSize = qrDrawArea / qrMatrixSize;
  doc.setFillColor(15, 23, 42);
  for (let r = 0; r < qrMatrixSize; r++) {
    for (let c = 0; c < qrMatrixSize; c++) {
      if (qrRows[r][c]) {
        doc.rect(
          qrX + qrPadding + c * cellSize,
          qrY + qrPadding + r * cellSize,
          cellSize + 0.05,
          cellSize + 0.05,
          'F'
        );
      }
    }
  }
  doc.link(qrX, qrY, qrOuterSize, qrOuterSize, { url: customerPortalUrl });

  const qrTextX = qrX + qrOuterSize + 3.5;
  const qrTextMaxW = qrBoxWidth - (qrOuterSize + 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('SCAN FOR LIVE STATUS', qrTextX, sectionTopY + 7.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  const qrDescLines = doc.splitTextToSize(
    'Scan this receipt QR code to view real-time repair stages, parts count & pickup readiness.',
    qrTextMaxW
  );
  doc.text(qrDescLines, qrTextX, sectionTopY + 12);

  doc.setFont('courier', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`TOKEN: ${accessToken}`.slice(0, 32), qrTextX, sectionTopY + 24.5);

  doc.setFont('courier', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(37, 99, 235);
  const urlLines = doc.splitTextToSize(customerPortalUrl, qrTextMaxW).slice(0, 2);
  doc.text(urlLines, qrTextX, sectionTopY + 28.5);
  doc.link(qrTextX, sectionTopY + 25.5, qrTextMaxW, 8, { url: customerPortalUrl });

  // Right: Financial Totals Breakdown
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  const summaryLabelX = 114;
  const summaryValueX = pageWidth - margin - 3;
  let totalsY = sectionTopY + 4;

  doc.text(`Labor (${job.laborHours} hrs @ ${currency}${job.laborRate}/hr):`, summaryLabelX, totalsY);
  doc.text(`${currency}${billing.laborSubtotal.toFixed(2)}`, summaryValueX, totalsY, { align: 'right' });
  totalsY += 5;

  doc.text('Parts Subtotal:', summaryLabelX, totalsY);
  doc.text(`${currency}${billing.partsSubtotal.toFixed(2)}`, summaryValueX, totalsY, { align: 'right' });
  totalsY += 5;

  if (billing.operationalExpensesSubtotal > 0) {
    doc.text(`Operational Expenses (${expenses.length}):`, summaryLabelX, totalsY);
    doc.text(`${currency}${billing.operationalExpensesSubtotal.toFixed(2)}`, summaryValueX, totalsY, {
      align: 'right',
    });
    totalsY += 5;
  }

  if (job.discount > 0) {
    doc.text('Service Discount:', summaryLabelX, totalsY);
    doc.text(`-${currency}${job.discount.toFixed(2)}`, summaryValueX, totalsY, { align: 'right' });
    totalsY += 5;
  }

  doc.text(`Sales Tax / GST (${job.taxRate}%):`, summaryLabelX, totalsY);
  doc.text(`${currency}${billing.taxAmount.toFixed(2)}`, summaryValueX, totalsY, { align: 'right' });
  totalsY += 7;

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(summaryLabelX - 3, totalsY - 4.5, pageWidth - margin - (summaryLabelX - 3), 8, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL AMOUNT:', summaryLabelX, totalsY + 1);
  doc.text(`${currency}${billing.totalAmount.toFixed(2)}`, summaryValueX, totalsY + 1, {
    align: 'right',
  });

  y = Math.max(sectionTopY + qrBoxHeight, totalsY + 4);

  // Signature Block
  y = ensureSpace(36, y + 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Customer Authorization Signature:', margin, y);
  doc.text('Technician Repair Sign-Off:', 120, y);

  y += 3;
  doc.setDrawColor(100, 116, 139);
  if (job.customerSignature) {
    try {
      doc.addImage(job.customerSignature, 'PNG', margin, y, 42, 15);
    } catch {
      doc.line(margin, y + 13, margin + 54, y + 13);
    }
  } else {
    doc.line(margin, y + 13, margin + 54, y + 13);
  }

  if (job.technicianSignature) {
    try {
      doc.addImage(job.technicianSignature, 'PNG', 120, y, 42, 15);
      doc.line(120, y + 16, 176, y + 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      const signMeta = [
        job.technicianSignOffBy || job.technician,
        job.technicianSignOffAt ? job.technicianSignOffAt.slice(0, 16).replace('T', ' ') : undefined,
      ]
        .filter(Boolean)
        .join(' · ');
      if (signMeta) {
        doc.text(signMeta.slice(0, 44), 120, y + 20);
      }
    } catch {
      doc.line(120, y + 13, 176, y + 13);
    }
  } else {
    doc.line(120, y + 13, 176, y + 13);
  }

  // Footer Disclaimer on each page
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Official Customer Service Record & Receipt · ${centerName} · Job ${job.id}`,
      margin,
      pageHeight - 10
    );
    doc.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  const filename = `${job.id}_Service_Record.pdf`;
  const dataUrl = doc.output('datauristring');

  return { doc, filename, dataUrl };
}
