import React, { useState } from 'react';
import { BusinessSettings, CustomField, JobCard } from '../types';
import { generateJobCardPdf } from '../utils/generatePdf';
import { getEffectiveJobBilling } from '../utils/billing';
import { buildPdfBrandMeta } from '../utils/pdfBrandMeta';
import { FileText, Download, MessageSquare, Phone, X, CheckCircle2, ArrowUpRight, Share2 } from 'lucide-react';

interface PdfViewModalProps {
  job: JobCard;
  settings?: BusinessSettings;
  customFields?: CustomField[];
  onClose: () => void;
  onLogMessageSent?: (jobId: string, channel: 'WhatsApp' | 'SMS', text: string) => void;
}

export const PdfViewModal: React.FC<PdfViewModalProps> = ({
  job,
  settings,
  customFields = [],
  onClose,
  onLogMessageSent,
}) => {
  const brandMeta = settings ? buildPdfBrandMeta(settings) : undefined;
  const centerPhone = settings?.phone || 'Not configured';
  const centerName = settings?.centerName || 'Bosch Service Center';
  const effectiveTotal = getEffectiveJobBilling(job).totalAmount;
  const { doc, filename, dataUrl } = generateJobCardPdf(job, brandMeta, customFields);
  const [sentSuccess, setSentSuccess] = useState(false);

  const handleDownloadPdf = () => {
    doc.save(filename);
  };

  const handleSendWhatsAppPdf = () => {
    const cleanPhone = job.customerPhone.replace(/[^0-9]/g, '');
    const message = `Hi ${job.customerName}, your official PDF Job Card for ${job.tool.brand} ${job.tool.modelNumber} (${job.id}) has been issued. Total Estimate: $${effectiveTotal.toFixed(2)}. Service Bay Contact: ${centerPhone}.`;
    
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    
    // Auto trigger PDF download for convenience
    doc.save(filename);
    
    if (onLogMessageSent) {
      onLogMessageSent(job.id, 'WhatsApp', message);
    }

    setSentSuccess(true);
    setTimeout(() => setSentSuccess(false), 3000);

    window.open(whatsappUrl, '_blank');
  };

  const handleSendSmsPdf = () => {
    const message = `Hi ${job.customerName}, your PDF Job Card for ${job.tool.modelNumber} (${job.id}) is issued. Total: $${effectiveTotal.toFixed(2)}. ${centerName}.`;
    const smsUrl = `sms:${job.customerPhone}?body=${encodeURIComponent(message)}`;
    
    doc.save(filename);
    
    if (onLogMessageSent) {
      onLogMessageSent(job.id, 'SMS', message);
    }

    window.location.href = smsUrl;
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/60 dark:bg-zinc-950/85 backdrop-blur flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-mono">
        
        {/* Modal Header */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-300 dark:border-zinc-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-950 dark:text-white uppercase">Official PDF Job Card Document</h2>
              <p className="text-xs text-zinc-700 dark:text-zinc-400 font-sans">
                Generated for Customer: <span className="text-zinc-950 dark:text-white font-bold">{job.customerName}</span> ({job.customerPhone})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 text-xs font-bold text-zinc-950 dark:text-white bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-xl transition-all flex items-center gap-1.5 border border-zinc-400 dark:border-zinc-700"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={handleSendWhatsAppPdf}
              className="px-4 py-2 text-xs font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl shadow-lg transition-all flex items-center gap-1.5 active:scale-95"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Send PDF to Customer WhatsApp</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>

            <button onClick={onClose} className="p-2 text-zinc-600 dark:text-zinc-500 hover:text-zinc-950 dark:hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Customer Notification Banner */}
        <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-300 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-800 dark:text-zinc-300 font-sans px-6">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-zinc-700 dark:text-zinc-400" />
            <span>Enrolled Customer Mobile: <strong className="font-mono text-zinc-950 dark:text-white">{job.customerPhone}</strong></span>
          </div>

          {sentSuccess && (
            <span className="text-xs font-bold text-zinc-950 dark:text-white flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>PDF link opened — delivery not confirmed</span>
            </span>
          )}
        </div>

        {/* PDF Embedded Viewer */}
        <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 p-4 min-h-[450px]">
          <iframe
            src={dataUrl}
            title={`PDF Preview ${job.id}`}
            className="w-full h-full min-h-[450px] rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white"
          />
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-300 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-zinc-600 dark:text-zinc-500 font-sans">
            Transactional Record ID: <strong className="font-mono text-zinc-950 dark:text-white">{job.id}</strong> (Stored in Transactional Database)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSendSmsPdf}
              className="px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white underline"
            >
              Send via SMS
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
