import React, { useState, useRef } from 'react';
import { JobCard, JobStatus, InventoryItem, JobPart } from '../types';
import { 
  ArrowLeft, Sparkles, Printer, MessageSquare, Plus, Trash2, 
  CheckCircle2, FileText, User, Phone, Wrench, Search, AlertCircle, PenTool, Check 
} from 'lucide-react';

interface JobCardDetailProps {
  job: JobCard;
  inventory: InventoryItem[];
  onUpdateJob: (updatedJob: JobCard) => void;
  onClose: () => void;
  onOpenWhatsApp: (job: JobCard) => void;
  onPrintJobCard: (job: JobCard) => void;
  deductStockOn: 'Approval' | 'InService' | 'Completion';
  onDeductInventoryStock: (partId: string, qty: number) => void;
}

export const JobCardDetail: React.FC<JobCardDetailProps> = ({
  job,
  inventory,
  onUpdateJob,
  onClose,
  onOpenWhatsApp,
  onPrintJobCard,
  deductStockOn,
  onDeductInventoryStock,
}) => {
  const [currentJob, setCurrentJob] = useState<JobCard>(job);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResultParts, setAiResultParts] = useState<any[]>([]);
  
  // Parts search state
  const [partSearch, setPartSearch] = useState('');
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [partQty, setPartQty] = useState(1);

  // Digital Signature Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!currentJob.customerSignature);

  const searchedInventory = inventory.filter((item) =>
    item.name.toLowerCase().includes(partSearch.toLowerCase()) ||
    item.sku.toLowerCase().includes(partSearch.toLowerCase()) ||
    item.category.toLowerCase().includes(partSearch.toLowerCase())
  ).slice(0, 10);

  const recalculateTotal = (parts: JobPart[], laborHours: number, laborRate: number, discount: number, taxRate: number) => {
    const partsSubtotal = parts.reduce((sum, p) => sum + p.total, 0);
    const laborSubtotal = laborHours * laborRate;
    const subtotal = partsSubtotal + laborSubtotal - discount;
    const tax = subtotal > 0 ? subtotal * (taxRate / 100) : 0;
    return Math.max(0, subtotal + tax);
  };

  const handleStatusChange = (newStatus: JobStatus) => {
    const updated = { ...currentJob, status: newStatus, updatedAt: new Date().toISOString() };
    
    if (
      (deductStockOn === 'InService' && newStatus === 'In Service') ||
      (deductStockOn === 'Approval' && newStatus === 'Awaiting Approval') ||
      (deductStockOn === 'Completion' && newStatus === 'Completed')
    ) {
      updated.parts.forEach((p) => {
        onDeductInventoryStock(p.partId, p.quantity);
      });
    }

    setCurrentJob(updated);
    onUpdateJob(updated);
  };

  const handleAddPart = () => {
    if (!selectedInventoryItem) return;

    const existingIndex = currentJob.parts.findIndex(p => p.partId === selectedInventoryItem.id);
    let updatedParts: JobPart[];

    if (existingIndex >= 0) {
      updatedParts = [...currentJob.parts];
      const existing = updatedParts[existingIndex];
      const newQty = existing.quantity + partQty;
      updatedParts[existingIndex] = {
        ...existing,
        quantity: newQty,
        total: newQty * existing.unitPrice,
      };
    } else {
      const newPart: JobPart = {
        partId: selectedInventoryItem.id,
        sku: selectedInventoryItem.sku,
        name: selectedInventoryItem.name,
        unitPrice: selectedInventoryItem.unitPrice,
        quantity: partQty,
        total: partQty * selectedInventoryItem.unitPrice,
      };
      updatedParts = [...currentJob.parts, newPart];
    }

    const newTotal = recalculateTotal(updatedParts, currentJob.laborHours, currentJob.laborRate, currentJob.discount, currentJob.taxRate);
    const updatedJob = { ...currentJob, parts: updatedParts, totalAmount: newTotal, updatedAt: new Date().toISOString() };

    setCurrentJob(updatedJob);
    onUpdateJob(updatedJob);

    setSelectedInventoryItem(null);
    setPartSearch('');
    setShowPartDropdown(false);
    setPartQty(1);
  };

  const handleRemovePart = (index: number) => {
    const updatedParts = currentJob.parts.filter((_, i) => i !== index);
    const newTotal = recalculateTotal(updatedParts, currentJob.laborHours, currentJob.laborRate, currentJob.discount, currentJob.taxRate);
    const updatedJob = { ...currentJob, parts: updatedParts, totalAmount: newTotal, updatedAt: new Date().toISOString() };
    setCurrentJob(updatedJob);
    onUpdateJob(updatedJob);
  };

  const handleLaborHoursChange = (hours: number) => {
    const newTotal = recalculateTotal(currentJob.parts, hours, currentJob.laborRate, currentJob.discount, currentJob.taxRate);
    const updatedJob = { ...currentJob, laborHours: hours, totalAmount: newTotal };
    setCurrentJob(updatedJob);
    onUpdateJob(updatedJob);
  };

  // ✨ Gemini AI Fault Diagnosis Engine
  const handleAiDiagnose = async () => {
    setIsAiLoading(true);
    setAiError(null);
    setAiResultParts([]);

    try {
      const response = await fetch('/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueDescription: `${currentJob.serviceReq.grievanceCategory}: ${currentJob.serviceReq.detailedComplaint}`,
          vehicleOrDevice: `${currentJob.tool.brand} ${currentJob.tool.modelNumber} (${currentJob.tool.voltageRating})`,
          category: currentJob.tool.category,
          availableParts: inventory.map(i => ({ id: i.id, sku: i.sku, name: i.name, unitPrice: i.unitPrice })),
        }),
      });

      if (!response.ok) throw new Error('Gemini AI Diagnosis service returned an error');
      const data = await response.json();
      
      const formattedNotes = `[Gemini AI Diagnostic Report]\nProbable Cause: ${data.probableCause || 'N/A'}\nRecommended Steps:\n${(data.recommendedSteps || []).map((s: string) => `• ${s}`).join('\n')}\nTech Notes: ${data.techNotes || ''}`;
      
      const estLabor = data.estimatedLaborHours || currentJob.laborHours;
      const updatedJob = {
        ...currentJob,
        diagnosticNotes: formattedNotes,
        laborHours: estLabor,
        totalAmount: recalculateTotal(
          currentJob.parts, 
          estLabor, 
          currentJob.laborRate, 
          currentJob.discount, 
          currentJob.taxRate
        ),
      };

      if (data.recommendedParts && Array.isArray(data.recommendedParts)) {
        setAiResultParts(data.recommendedParts);
      }

      setCurrentJob(updatedJob);
      onUpdateJob(updatedJob);
    } catch (err: any) {
      setAiError(err.message || 'Failed to generate AI diagnosis');
    } finally {
      setIsAiLoading(false);
    }
  };

  // 1-Click Auto Link AI Suggested Parts
  const handleAutoLinkAiPart = (recPart: any) => {
    const invItem = inventory.find(i => i.id === recPart.partId || i.sku === recPart.sku) || inventory[0];
    if (!invItem) return;

    const existingIndex = currentJob.parts.findIndex(p => p.partId === invItem.id);
    let updatedParts: JobPart[];

    if (existingIndex >= 0) {
      updatedParts = [...currentJob.parts];
      const existing = updatedParts[existingIndex];
      const newQty = existing.quantity + (recPart.quantity || 1);
      updatedParts[existingIndex] = {
        ...existing,
        quantity: newQty,
        total: newQty * existing.unitPrice,
      };
    } else {
      const newPart: JobPart = {
        partId: invItem.id,
        sku: invItem.sku,
        name: invItem.name,
        unitPrice: invItem.unitPrice,
        quantity: recPart.quantity || 1,
        total: (recPart.quantity || 1) * invItem.unitPrice,
      };
      updatedParts = [...currentJob.parts, newPart];
    }

    const newTotal = recalculateTotal(updatedParts, currentJob.laborHours, currentJob.laborRate, currentJob.discount, currentJob.taxRate);
    const updatedJob = { ...currentJob, parts: updatedParts, totalAmount: newTotal, updatedAt: new Date().toISOString() };
    setCurrentJob(updatedJob);
    onUpdateJob(updatedJob);
  };

  const statuses: JobStatus[] = ['Intake', 'Diagnosis', 'Awaiting Approval', 'In Service', 'Ready for Pickup', 'Completed'];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      
      {/* Detail Header Toolbar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-extrabold text-white font-mono">{currentJob.id}</h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-zinc-950 text-white border border-zinc-700 font-mono">
                  {currentJob.tool.brand}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                Model: <span className="text-white font-bold">{currentJob.tool.modelNumber}</span> (SN: {currentJob.tool.serialNumber})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto shrink-0">
            <button
              onClick={() => onOpenWhatsApp(currentJob)}
              className="px-3 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-all flex items-center gap-1.5 shadow"
            >
              <MessageSquare className="w-4 h-4" />
              <span>WhatsApp Customer</span>
            </button>

            <button
              onClick={() => onPrintJobCard(currentJob)}
              className="px-3.5 py-2 text-xs font-bold text-zinc-200 bg-zinc-950 hover:bg-zinc-800 rounded-xl transition-all flex items-center gap-1.5 border border-zinc-800"
            >
              <Printer className="w-4 h-4" />
              <span>Print Service Ticket</span>
            </button>
          </div>

        </div>

        {/* Workflow Lifecycle Stepper */}
        <div className="mt-6 pt-6 border-t border-zinc-800">
          <div className="text-xs font-semibold text-zinc-400 mb-3 flex items-center justify-between font-mono">
            <span className="uppercase tracking-wider">JOB STATUS LIFECYCLE</span>
            <span className="text-[11px] text-zinc-500">Click a stage to update progress</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {statuses.map((st, idx) => {
              const isActive = currentJob.status === st;
              const isPast = statuses.indexOf(currentJob.status) > idx;
              return (
                <button
                  key={st}
                  onClick={() => handleStatusChange(st)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border text-left flex flex-col justify-between ${
                    isActive
                      ? 'bg-white text-zinc-950 border-white shadow scale-[1.02]'
                      : isPast
                      ? 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                      : 'bg-zinc-950/40 text-zinc-600 border-zinc-900'
                  }`}
                >
                  <div className="text-[10px] opacity-70">Step 0{idx + 1}</div>
                  <div className="truncate font-medium">{st}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
        
        {/* Left Column: Tool Specs & Diagnosis */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-2 font-mono">
              <Wrench className="w-4 h-4 text-white" />
              <span>Bosch / Vendor Tool Specifications &amp; Customer</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block text-[10px] font-bold uppercase mb-1 font-mono">Customer Details</span>
                <div className="font-bold text-white text-sm">{currentJob.customerName}</div>
                <div className="text-zinc-400 font-mono text-[11px] mt-1">{currentJob.customerPhone}</div>
                {currentJob.customerCompany && <div className="text-zinc-500 text-[11px] mt-0.5">{currentJob.customerCompany}</div>}
              </div>

              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block text-[10px] font-bold uppercase mb-1 font-mono">Tool Specification</span>
                <div className="font-bold text-white">{currentJob.tool.brand} {currentJob.tool.modelNumber}</div>
                <div className="text-zinc-400 font-mono text-[11px] mt-1">SN: {currentJob.tool.serialNumber} · {currentJob.tool.voltageRating}</div>
                <div className="text-zinc-400 text-[11px] mt-0.5 font-mono">Warranty: {currentJob.tool.warrantyStatus}</div>
              </div>
            </div>

            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
              <span className="text-zinc-400 font-semibold text-xs block uppercase tracking-wider text-[10px] font-mono">Customer Grievance &amp; Complaint:</span>
              <div className="font-bold text-white text-xs">{currentJob.serviceReq.grievanceCategory}</div>
              <p className="text-xs text-zinc-300 leading-relaxed font-mono">{currentJob.serviceReq.detailedComplaint}</p>
              <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/80 font-mono">
                Pre-approved repair limit: <span className="font-mono text-white font-bold">${currentJob.serviceReq.preApprovedLimit.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Gemini AI Diagnosis Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 font-mono">
                <Sparkles className="w-4 h-4 text-white" />
                <span>Gemini AI Tool Diagnosis &amp; Component Recommendations</span>
              </h2>

              <button
                onClick={handleAiDiagnose}
                disabled={isAiLoading}
                className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl shadow transition-all flex items-center gap-1.5 disabled:opacity-50 font-mono active:scale-95"
              >
                <Sparkles className={`w-4 h-4 ${isAiLoading ? 'animate-spin' : ''}`} />
                <span>{isAiLoading ? 'Diagnosing...' : '✨ Run AI Diagnosis'}</span>
              </button>
            </div>

            {aiError && (
              <div className="p-3 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-zinc-300 flex items-center gap-2 font-mono">
                <AlertCircle className="w-4 h-4 text-white shrink-0" />
                <span>{aiError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1 font-mono">Technician Notes &amp; Diagnostic Log</label>
              <textarea
                rows={4}
                value={currentJob.diagnosticNotes || ''}
                onChange={(e) => {
                  const updated = { ...currentJob, diagnosticNotes: e.target.value };
                  setCurrentJob(updated);
                  onUpdateJob(updated);
                }}
                placeholder="Click '✨ Run AI Diagnosis' above to analyze grievance with Gemini AI or type technical findings..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none font-mono leading-relaxed"
              />
            </div>

            {/* AI Matched Parts Box */}
            {aiResultParts.length > 0 && (
              <div className="p-4 bg-zinc-950 border border-zinc-700 rounded-xl space-y-3 font-mono">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white uppercase text-[10px]">✨ AI Suggested Replacement Parts from Catalog</span>
                  <span className="text-[10px] text-zinc-400">{aiResultParts.length} parts matched</span>
                </div>

                <div className="space-y-2">
                  {aiResultParts.map((rp, i) => (
                    <div key={i} className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-white">{rp.name || rp.sku}</div>
                        <div className="text-[10px] text-zinc-400">SKU: {rp.sku || rp.partId} · Reason: {rp.reason || 'Component replacement'}</div>
                      </div>

                      <button
                        onClick={() => handleAutoLinkAiPart(rp)}
                        className="px-3 py-1 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-lg text-[11px] flex items-center gap-1 shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Link Part</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inventory Spare Parts Lookup */}
            <div className="space-y-3 pt-2">
              <span className="block text-xs font-semibold text-zinc-400 font-mono">Link Genuine Spare Parts (~1,000 Catalog):</span>
              
              <div className="relative flex items-center gap-2 font-mono">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={partSearch}
                    onChange={(e) => {
                      setPartSearch(e.target.value);
                      setShowPartDropdown(true);
                    }}
                    onFocus={() => setShowPartDropdown(true)}
                    placeholder="Search 1,000 parts by SKU (e.g. BRSH-1002, ARM-1009)..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                <input
                  type="number"
                  min={1}
                  value={partQty}
                  onChange={(e) => setPartQty(parseInt(e.target.value) || 1)}
                  className="w-16 bg-zinc-950 border border-zinc-800 rounded-xl py-2 text-center text-xs text-white focus:outline-none"
                />

                <button
                  onClick={handleAddPart}
                  disabled={!selectedInventoryItem}
                  className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 disabled:opacity-40 rounded-xl transition-colors"
                >
                  + Add
                </button>

                {showPartDropdown && partSearch.trim() !== '' && (
                  <div className="absolute left-0 right-0 top-11 z-30 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-zinc-800">
                    {searchedInventory.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedInventoryItem(item);
                          setPartSearch(item.name);
                          setShowPartDropdown(false);
                        }}
                        className="p-2.5 hover:bg-zinc-900 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <div className="font-bold text-white">{item.name}</div>
                          <div className="text-[11px] text-zinc-400 font-mono">SKU: {item.sku} · Bin: {item.binLocation}</div>
                        </div>
                        <div className="text-right font-mono font-bold text-white">${item.unitPrice.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Linked Parts Table */}
              <div className="overflow-x-auto border border-zinc-800 rounded-xl">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-zinc-950 text-zinc-400 text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Part Name</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-center">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-zinc-300">
                    {currentJob.parts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-zinc-500 text-xs">
                          No replacement parts linked yet. Use search or AI diagnosis above.
                        </td>
                      </tr>
                    ) : (
                      currentJob.parts.map((p, idx) => (
                        <tr key={idx} className="hover:bg-zinc-950/40">
                          <td className="py-2.5 px-3 font-bold text-white">{p.sku}</td>
                          <td className="py-2.5 px-3 font-medium text-white">{p.name}</td>
                          <td className="py-2.5 px-3 text-right">${p.unitPrice.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-white">{p.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-white">${p.total.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-center">
                            <button onClick={() => handleRemovePart(idx)} className="text-zinc-500 hover:text-white">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Billing */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-2 font-mono">
              <FileText className="w-4 h-4 text-white" />
              <span>Labor &amp; Service Cost Summary</span>
            </h2>

            <div className="space-y-3 text-xs font-mono">
              <div className="flex items-center justify-between bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                <span className="text-zinc-400 font-medium">Labor Hours</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={currentJob.laborHours}
                    onChange={(e) => handleLaborHoursChange(parseFloat(e.target.value) || 0)}
                    className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-center font-mono text-white text-xs focus:outline-none"
                  />
                  <span className="text-zinc-500 text-[11px]">hrs @ ${currentJob.laborRate}/hr</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                <div className="flex justify-between text-zinc-400">
                  <span>Parts Subtotal:</span>
                  <span className="text-zinc-200">
                    ${currentJob.parts.reduce((sum, p) => sum + p.total, 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between text-zinc-400">
                  <span>Labor Subtotal ({currentJob.laborHours}h):</span>
                  <span className="text-zinc-200">
                    ${(currentJob.laborHours * currentJob.laborRate).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between text-zinc-400">
                  <span>Sales Tax ({currentJob.taxRate}%):</span>
                  <span className="text-zinc-200">
                    ${(
                      (currentJob.parts.reduce((sum, p) => sum + p.total, 0) +
                        currentJob.laborHours * currentJob.laborRate -
                        currentJob.discount) *
                      (currentJob.taxRate / 100)
                    ).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-zinc-800 text-base font-extrabold text-white">
                  <span>Total Estimate</span>
                  <span className="text-lg">${currentJob.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
