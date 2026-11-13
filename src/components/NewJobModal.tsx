import React, { useState } from 'react';
import { JobCard, JobPriority, BusinessSettings, ToolBrand, ToolCategory, GrievanceCategory } from '../types';
import { adjudicateWarranty, autoAdjudicateJobCard } from '../utils/warrantyAdjudicator';
import { Plus, X, Wrench, ShieldCheck, ShieldAlert } from 'lucide-react';

interface NewJobModalProps {
  onClose: () => void;
  onAddJob: (newJob: JobCard) => void;
  settings: BusinessSettings;
  existingCount: number;
}

export const NewJobModal: React.FC<NewJobModalProps> = ({
  onClose,
  onAddJob,
  settings,
  existingCount,
}) => {
  const generatedId = `${settings.jobCardPrefix}${(existingCount + 45).toString().padStart(4, '0')}`;

  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  
  const [brand, setBrand] = useState<ToolBrand>('Bosch Professional');
  const [category, setCategory] = useState<ToolCategory>('Rotary Hammer / SDS');
  const [modelNumber, setModelNumber] = useState('GBH 2-26 DFR');
  const [serialNumber, setSerialNumber] = useState('');
  
  const [grievanceCategory, setGrievanceCategory] = useState<GrievanceCategory>('Motor Sparking / Excessive Smoke');
  const [detailedComplaint, setDetailedComplaint] = useState('');

  const warrantyEval = adjudicateWarranty(
    {
      brand,
      serialNumber: serialNumber || 'N/A',
      warrantyStatus: 'Unconfirmed',
      physicalCondition: 'Jobsite Wear',
    },
    { grievanceCategory, detailedComplaint }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || !modelNumber || !detailedComplaint) return;

    const nowIso = new Date().toISOString();
    const rawJob: JobCard = {
      id: generatedId,
      customerName,
      customerCompany,
      customerPhone,
      customerEmail,
      tool: {
        brand,
        category,
        modelNumber,
        serialNumber: serialNumber || 'N/A',
        voltageRating: '230V AC',
        warrantyStatus: warrantyEval.recommendedWarrantyStatus,
        physicalCondition: 'Jobsite Wear',
        accessoriesReceived: ['Auxiliary Handle'],
      },
      serviceReq: {
        grievanceCategory,
        detailedComplaint,
        serviceType: 'Diagnostic & Repair',
        preApprovedLimit: 50.0,
      },
      intakeDate: nowIso.slice(0, 16).replace('T', ' '),
      promisedCompletion: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '),
      status: 'Intake',
      priority: 'Routine',
      technician: 'David Miller (Bosch Tech)',
      laborHours: 1.0,
      laborRate: settings.laborRate,
      discount: 0,
      taxRate: settings.taxRate,
      parts: [],
      operationalExpenses: [],
      totalAmount: settings.laborRate * (1 + settings.taxRate / 100),
      attachments: [],
      messageLogs: [
        {
          id: `msg-intake-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          type: 'Intake',
          recipientPhone: customerPhone,
          text: `Hi ${customerName}, your ${brand} ${modelNumber} is checked in under Job Card ${generatedId}. Bosch Service Center.`,
          channel: 'WhatsApp',
          status: 'Pending',
        },
      ],
      stageEnteredAt: nowIso,
      stageHistory: [{ status: 'Intake', enteredAt: nowIso }],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    onAddJob(autoAdjudicateJobCard(rawJob));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4 font-mono">
        
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-white uppercase">New Tool Service Intake</h2>
            <span className="text-xs font-bold text-white bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
              {generatedId}
            </span>
          </div>

          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans">
          <div className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
            <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[10px] font-mono">1. Customer Information</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 mb-1">Customer / Company *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Apex Construction"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Mobile Phone (WhatsApp) *</label>
                <input
                  type="text"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+1 (555) 234-5678"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[10px] font-mono">2. Tool Specifications</span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                  warrantyEval.flag === 'In-Warranty'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-zinc-900 text-amber-300 border-amber-800/70'
                }`}
              >
                {warrantyEval.flag === 'In-Warranty' ? (
                  <ShieldCheck className="w-3 h-3" />
                ) : (
                  <ShieldAlert className="w-3 h-3" />
                )}
                <span>{warrantyEval.flag}</span>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-zinc-400 mb-1">Brand</label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                >
                  <option value="Bosch Professional">Bosch Professional</option>
                  <option value="Bosch DIY (Green)">Bosch DIY (Green)</option>
                  <option value="Makita">Makita</option>
                  <option value="DeWalt">DeWalt</option>
                  <option value="Milwaukee">Milwaukee</option>
                  <option value="Hilti">Hilti</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Model Number *</label>
                <input
                  type="text"
                  required
                  value={modelNumber}
                  onChange={(e) => setModelNumber(e.target.value)}
                  placeholder="GBH 2-26 DFR"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Serial Number</label>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="SN-3611B54300"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 bg-zinc-900/70 px-3 py-1.5 rounded-lg border border-zinc-800">
              {warrantyEval.manufactureDate
                ? `Decoded Mfg: ${warrantyEval.manufactureDate} · Expiry: ${warrantyEval.expirationDate} (${warrantyEval.decodedMethod})`
                : warrantyEval.reason}
            </div>
          </div>

          <div className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
            <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[10px] font-mono">3. Customer Grievance</span>
            <div>
              <label className="block text-zinc-400 mb-1">Complaint / Symptom *</label>
              <textarea
                required
                rows={3}
                value={detailedComplaint}
                onChange={(e) => setDetailedComplaint(e.target.value)}
                placeholder="Motor sparking, cord cut, no impact..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white">
              Cancel
            </button>

            <button
              type="submit"
              className="px-5 py-2 font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl"
            >
              Save Service Ticket
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
