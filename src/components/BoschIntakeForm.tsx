import React, { useState, useRef } from 'react';
import { JobCard, ToolBrand, ToolCategory, GrievanceCategory, InventoryItem, JobPart, BusinessSettings, CustomField } from '../types';
import { adjudicateWarranty } from '../utils/warrantyAdjudicator';
import { Wrench, User, Phone, ShieldCheck, ShieldAlert, FileText, Sparkles, Printer, MessageSquare, Plus, PenTool, CheckCircle2, AlertCircle, Sliders } from 'lucide-react';

interface BoschIntakeFormProps {
  onAddJob: (job: JobCard) => void;
  inventory: InventoryItem[];
  settings: BusinessSettings;
  existingCount: number;
  onOpenWhatsApp: (job: JobCard) => void;
  customFields?: CustomField[];
}

export const BoschIntakeForm: React.FC<BoschIntakeFormProps> = ({
  onAddJob,
  inventory,
  settings,
  existingCount,
  onOpenWhatsApp,
  customFields = [],
}) => {
  const generatedId = `${settings.jobCardPrefix}${(existingCount + 45).toString().padStart(4, '0')}`;

  // Customer Details State
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [gstOrTaxId, setGstOrTaxId] = useState('');
  const [preApprovedLimit, setPreApprovedLimit] = useState(50.0);

  // Tool Specifications State
  const [brand, setBrand] = useState<ToolBrand>('Bosch Professional');
  const [category, setCategory] = useState<ToolCategory>('Rotary Hammer / SDS');
  const [modelNumber, setModelNumber] = useState('GBH 2-26 DFR');
  const [serialNumber, setSerialNumber] = useState('');
  const [voltageRating, setVoltageRating] = useState('230V AC');
  const [warrantyStatus, setWarrantyStatus] = useState<'Standard 1-Year' | 'Bosch Heavy Duty 3-Year Extended' | 'Out of Warranty' | 'Unconfirmed'>('Bosch Heavy Duty 3-Year Extended');
  const [physicalCondition, setPhysicalCondition] = useState('Heavy Jobsite Dust / Wear');
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>(['Auxiliary Handle', 'Depth Stop Rod']);

  // Grievances & Custom Field Values State
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [grievanceCategory, setGrievanceCategory] = useState<GrievanceCategory>('Motor Sparking / Excessive Smoke');
  const [detailedComplaint, setDetailedComplaint] = useState('');
  const [serviceType, setServiceType] = useState<'Diagnostic & Repair' | 'Standard Overhaul' | 'Carbon Brush & Maintenance' | 'Armature Replacement' | 'Warranty Claim'>('Diagnostic & Repair');

  // AI Diagnostic Assistant
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);

  // Canvas Signature State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Live Warranty Adjudication Evaluation
  const warrantyEval = adjudicateWarranty(
    {
      brand,
      serialNumber: serialNumber || 'N/A',
      warrantyStatus,
      physicalCondition,
    },
    {
      grievanceCategory,
      detailedComplaint,
    }
  );

  // Quick Preset Complaints for Counter Technicians
  const complaintPresets = [
    'Motor sparking heavily inside casing under load. Smells like burnt copper.',
    'Tool does not switch on. Intermittent power when cord is wiggled at strain relief.',
    'Hammer mechanism fails to impact concrete. Motor spins but bit does not strike.',
    'SDS chuck sleeve jammed. Bit cannot be removed or locked in place.',
    'Excessive gearbox grinding noise and gear housing heating up quickly.',
  ];

  const accessoryOptions = [
    'Auxiliary Handle',
    'Depth Stop Rod',
    'Plastic Carrying Case',
    'SDS Quick Change Chuck',
    '18V Battery Pack',
    'GAL Battery Charger',
    'Grinding Guard',
    'Pin Wrench',
  ];

  const toggleAccessory = (acc: string) => {
    if (selectedAccessories.includes(acc)) {
      setSelectedAccessories(selectedAccessories.filter(a => a !== acc));
    } else {
      setSelectedAccessories([...selectedAccessories, acc]);
    }
  };

  // AI Diagnostics call
  const handleRunAiDiagnosis = async () => {
    if (!detailedComplaint && !grievanceCategory) return;
    setIsAiLoading(true);

    try {
      const res = await fetch('/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueDescription: `${grievanceCategory}: ${detailedComplaint}`,
          vehicleOrDevice: `${brand} ${category} (Model: ${modelNumber})`,
          category: category,
          availableParts: inventory.slice(0, 25).map(i => ({ id: i.id, sku: i.sku, name: i.name, unitPrice: i.unitPrice })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiSuggestions(`Probable Fault: ${data.probableCause}\nRecommended Actions:\n${(data.recommendedSteps || []).map((s: string) => `• ${s}`).join('\n')}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setHasSignature(true);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignature(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || !modelNumber || !detailedComplaint) return;

    let signatureDataUrl: string | undefined = undefined;
    if (canvasRef.current && hasSignature) {
      signatureDataUrl = canvasRef.current.toDataURL();
    }

    const nowIso = new Date().toISOString();
    const { recommendedWarrantyStatus: _, ...adjudicationRecord } = warrantyEval;

    const newJob: JobCard = {
      id: generatedId,
      customerName,
      customerCompany,
      customerPhone,
      customerEmail,
      gstOrTaxId,
      tool: {
        brand,
        category,
        modelNumber,
        serialNumber: serialNumber || 'N/A',
        voltageRating,
        warrantyStatus,
        warrantyFlag: warrantyEval.flag,
        warrantyAdjudication: adjudicationRecord,
        physicalCondition,
        accessoriesReceived: selectedAccessories,
      },
      serviceReq: {
        grievanceCategory,
        detailedComplaint,
        serviceType,
        preApprovedLimit,
      },
      intakeDate: nowIso.slice(0, 16).replace('T', ' '),
      promisedCompletion: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '),
      status: 'Intake',
      priority: 'Routine',
      technician: 'David Miller (Bosch Master Tech)',
      diagnosticNotes: aiSuggestions || undefined,
      laborHours: 1.0,
      laborRate: settings.laborRate,
      discount: 0,
      taxRate: settings.taxRate,
      parts: [],
      operationalExpenses: [],
      totalAmount: settings.laborRate * (1 + settings.taxRate / 100),
      customerSignature: signatureDataUrl,
      attachments: [],
      messageLogs: [
        {
          id: `msg-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          type: 'Intake',
          recipientPhone: customerPhone,
          text: `Hi ${customerName}, your ${brand} ${modelNumber} (Job Card ${generatedId}) is received for service. Bosch Service Center.`,
          channel: 'WhatsApp',
          status: 'Pending',
        },
      ],
      stageEnteredAt: nowIso,
      stageHistory: [{ status: 'Intake', enteredAt: nowIso }],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    onAddJob(newJob);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      
      {/* Monochrome Intake Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold tracking-tight text-white font-mono uppercase">
                BOSCH &amp; Vendor Tool Intake Form
              </span>
              <span className="font-mono text-xs font-bold text-zinc-100 bg-zinc-800 px-2.5 py-0.5 rounded border border-zinc-700">
                {generatedId}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Streamlined counter intake form for power tools, rotary hammers, grinders &amp; cordless batteries.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-zinc-400 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
              Tax: {settings.taxRate}% · Base Labor: ${settings.laborRate}/hr
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Section 1: Customer Details */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-3">
            <User className="w-4 h-4 text-white" />
            <span>1. Customer &amp; Commercial Account Information</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Customer / Client Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Apex Construction / John Smith"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Company Name (Optional)</label>
              <input
                type="text"
                value={customerCompany}
                onChange={(e) => setCustomerCompany(e.target.value)}
                placeholder="e.g. Apex Industrial Infrastructure"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Mobile Phone (WhatsApp) *</label>
              <input
                type="text"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. +1 (555) 234-5678"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Email Address</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="service@apex.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">GSTIN / Tax Registration ID</label>
              <input
                type="text"
                value={gstOrTaxId}
                onChange={(e) => setGstOrTaxId(e.target.value)}
                placeholder="TAX-8920194"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Pre-Approved Auto Repair Limit ($)</label>
              <input
                type="number"
                value={preApprovedLimit}
                onChange={(e) => setPreApprovedLimit(parseFloat(e.target.value) || 0)}
                placeholder="50.00"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              <span className="text-[10px] text-zinc-500">Auto-approve repair if estimate &lt; limit</span>
            </div>
          </div>
        </div>

        {/* Section 2: Tool Specifications */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Wrench className="w-4 h-4 text-white" />
            <span>2. Bosch &amp; Tool Specifications</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Tool Brand</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none"
              >
                <option value="Bosch Professional">Bosch Professional (Blue)</option>
                <option value="Bosch DIY (Green)">Bosch Home &amp; Garden (Green)</option>
                <option value="Makita">Makita</option>
                <option value="DeWalt">DeWalt</option>
                <option value="Milwaukee">Milwaukee</option>
                <option value="Hilti">Hilti</option>
                <option value="Metabo">Metabo</option>
                <option value="Festool">Festool</option>
                <option value="Stihl">Stihl</option>
                <option value="Other Vendor">Other Vendor Tool</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Tool Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none"
              >
                <option value="Rotary Hammer / SDS">Rotary Hammer / SDS</option>
                <option value="Angle Grinder">Angle Grinder</option>
                <option value="Cordless Drill / Driver">Cordless Drill / Driver</option>
                <option value="Impact Wrench / Driver">Impact Wrench / Driver</option>
                <option value="Circular / Miter Saw">Circular / Miter Saw</option>
                <option value="Demolition Breaker">Demolition Breaker</option>
                <option value="Heat Gun / Blower">Heat Gun / Blower</option>
                <option value="High Pressure Washer">High Pressure Washer</option>
                <option value="Laser & Measuring">Laser &amp; Measuring</option>
                <option value="Lawn & Garden / Outdoor">Lawn &amp; Garden / Outdoor</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Model Number / Code *</label>
              <input
                type="text"
                required
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="e.g. GBH 2-26 DFR / GWS 900"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Serial Number / Bare Tool ID</label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="e.g. SN-3611B54300"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Voltage / Power Source</label>
              <select
                value={voltageRating}
                onChange={(e) => setVoltageRating(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none"
              >
                <option value="230V AC">230V AC Mains</option>
                <option value="110V Site">110V Transformer Site</option>
                <option value="18V Lithium">18V Cordless Battery</option>
                <option value="12V Lithium">12V Cordless Battery</option>
                <option value="36V Heavy Duty">36V Bi-Battery / Heavy Duty</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Warranty Status</label>
              <select
                value={warrantyStatus}
                onChange={(e) => setWarrantyStatus(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none"
              >
                <option value="Bosch Heavy Duty 3-Year Extended">Bosch Heavy Duty 3-Year Extended</option>
                <option value="Standard 1-Year">Standard 1-Year Warranty</option>
                <option value="Out of Warranty">Out of Warranty</option>
                <option value="Unconfirmed">Unconfirmed / Proof Pending</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-zinc-400 mb-1 font-medium">Physical Tool Condition</label>
              <input
                type="text"
                value={physicalCondition}
                onChange={(e) => setPhysicalCondition(e.target.value)}
                placeholder="e.g. Jobsite Concrete Dust, Cord Scratched, Guard Intact"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Live Warranty Adjudication Helper Panel */}
          <div
            className={`p-4 rounded-xl border space-y-2.5 text-xs font-mono ${
              warrantyEval.flag === 'In-Warranty'
                ? 'bg-emerald-950/25 border-emerald-700/60'
                : 'bg-zinc-950 border-zinc-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {warrantyEval.flag === 'In-Warranty' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                  Auto Warranty Adjudication
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                    warrantyEval.flag === 'In-Warranty'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-600/80'
                      : 'bg-amber-950/80 text-amber-300 border-amber-700/80'
                  }`}
                >
                  {warrantyEval.flag}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">Test Serials:</span>
                {['SN-3611B54300', 'SN-FD-5048812', 'SN-DW-991823', 'SN-3601C96000'].map((sampleSn) => (
                  <button
                    key={sampleSn}
                    type="button"
                    onClick={() => setSerialNumber(sampleSn)}
                    className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300"
                  >
                    {sampleSn}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
              <div className="bg-zinc-900/70 px-2.5 py-1.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 block text-[9px] uppercase">Manufacture Date</span>
                <span className="text-white font-bold">{warrantyEval.manufactureDate || 'Unknown'}</span>
              </div>
              <div className="bg-zinc-900/70 px-2.5 py-1.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 block text-[9px] uppercase">Warranty Expiry</span>
                <span className="text-white font-bold">{warrantyEval.expirationDate || 'N/A'}</span>
              </div>
              <div className="bg-zinc-900/70 px-2.5 py-1.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 block text-[9px] uppercase">Tool Age / Term</span>
                <span className="text-white font-bold">
                  {warrantyEval.ageMonths !== null ? `${warrantyEval.ageMonths}m` : '—'} / {warrantyEval.termMonths}m
                </span>
              </div>
              <div className="bg-zinc-900/70 px-2.5 py-1.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 block text-[9px] uppercase">Lookup Method</span>
                <span className="text-zinc-200 font-semibold truncate block">{warrantyEval.decodedMethod}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
              <p className="text-zinc-300 font-sans">{warrantyEval.reason}</p>
              {warrantyStatus !== warrantyEval.recommendedWarrantyStatus && (
                <button
                  type="button"
                  onClick={() => setWarrantyStatus(warrantyEval.recommendedWarrantyStatus)}
                  className="px-2.5 py-1 bg-white text-zinc-950 hover:bg-zinc-200 rounded-lg text-[10px] font-bold shrink-0"
                >
                  Sync Status: {warrantyEval.recommendedWarrantyStatus}
                </button>
              )}
            </div>

            {warrantyEval.exclusionAdvisory && (
              <div className="px-2.5 py-1.5 bg-amber-950/60 border border-amber-700/70 rounded-lg text-[11px] text-amber-200 font-sans">
                {warrantyEval.exclusionAdvisory}
              </div>
            )}
          </div>

          {/* Accessories Received Checklist */}
          <div className="pt-3 border-t border-zinc-800">
            <span className="block text-xs font-semibold text-zinc-400 mb-2">Accessories Received at Counter:</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {accessoryOptions.map((acc) => {
                const isSelected = selectedAccessories.includes(acc);
                return (
                  <button
                    key={acc}
                    type="button"
                    onClick={() => toggleAccessory(acc)}
                    className={`p-2 rounded-xl text-xs text-left transition-all border ${
                      isSelected
                        ? 'bg-zinc-100 text-zinc-950 border-white font-bold'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    {acc}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Section 3: Grievance & Service Requirements */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-white" />
              <span>3. Grievances &amp; Service Requirements</span>
            </h2>

            <button
              type="button"
              onClick={handleRunAiDiagnosis}
              disabled={isAiLoading}
              className="px-3 py-1.5 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-lg shadow transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
              <span>{isAiLoading ? 'Analyzing...' : '✨ AI Fault Diagnosis'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Primary Defect Category *</label>
              <select
                value={grievanceCategory}
                onChange={(e) => setGrievanceCategory(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none"
              >
                <option value="Motor Sparking / Excessive Smoke">Motor Sparking / Excessive Smoke</option>
                <option value="No Power / Dead Switch">No Power / Dead Switch</option>
                <option value="Chuck / SDS Lock Mechanism Jammed">Chuck / SDS Lock Mechanism Jammed</option>
                <option value="Low Impact / No Hammering Action">Low Impact / No Hammering Action</option>
                <option value="Gearbox Noise / Excessive Heat">Gearbox Noise / Excessive Heat</option>
                <option value="Battery Not Charging / Fast Drain">Battery Not Charging / Fast Drain</option>
                <option value="Cable Cut / Strain Relief Damaged">Cable Cut / Strain Relief Damaged</option>
                <option value="Routine Maintenance / Carbon Brush Check">Routine Maintenance / Carbon Brush Check</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Service Requirement Type</label>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none"
              >
                <option value="Diagnostic & Repair">Diagnostic &amp; Repair</option>
                <option value="Standard Overhaul">Standard Overhaul &amp; Repack</option>
                <option value="Carbon Brush & Maintenance">Carbon Brush Replacement &amp; Service</option>
                <option value="Armature Replacement">Armature &amp; Stator Overhaul</option>
                <option value="Warranty Claim">Bosch Heavy Duty Warranty Claim</option>
              </select>
            </div>
          </div>

          {/* Detailed Complaint Input & Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-zinc-400">Detailed Customer Complaint / Symptoms *</label>
              <span className="text-[11px] text-zinc-500">Click a preset below to auto-fill</span>
            </div>
            
            <textarea
              required
              rows={3}
              value={detailedComplaint}
              onChange={(e) => setDetailedComplaint(e.target.value)}
              placeholder="Describe exact customer grievance (e.g. sparks inside casing, lost hammer impact)..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-zinc-500 font-mono leading-relaxed"
            />

            <div className="flex items-center gap-1.5 overflow-x-auto mt-2 pb-1">
              {complaintPresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setDetailedComplaint(preset)}
                  className="px-2.5 py-1 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 rounded-lg text-[11px] text-zinc-400 hover:text-white whitespace-nowrap shrink-0 transition-colors"
                >
                  Preset {idx + 1}
                </button>
              ))}
            </div>
          </div>

          {/* AI Suggestions Box */}
          {aiSuggestions && (
            <div className="p-4 bg-zinc-950 border border-zinc-700 rounded-xl space-y-1 text-xs">
              <span className="font-bold text-white uppercase tracking-wider block text-[10px]">AI Diagnostic Assessment</span>
              <pre className="whitespace-pre-wrap font-mono text-zinc-300 text-[11px] leading-relaxed">{aiSuggestions}</pre>
            </div>
          )}
        </div>

        {/* Custom Form Fields Section */}
        {customFields.filter(f => !f.isSystem && f.enabled).length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-3 font-mono">
              <Sliders className="w-4 h-4 text-white" />
              <span>Custom Service Intake Properties ({customFields.filter(f => !f.isSystem && f.enabled).length} Custom Fields)</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono">
              {customFields.filter(f => !f.isSystem && f.enabled).map((field) => (
                <div key={field.id} className="space-y-1">
                  <label className="block text-zinc-400 font-medium">
                    {field.label} {field.required && <span className="text-white">*</span>}
                  </label>

                  {field.dataType === 'select' ? (
                    <select
                      value={customValues[field.key] || ''}
                      onChange={(e) => setCustomValues({ ...customValues, [field.key]: e.target.value })}
                      required={field.required}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none"
                    >
                      <option value="">Select option...</option>
                      {(field.options || []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.dataType === 'textarea' ? (
                    <textarea
                      rows={2}
                      value={customValues[field.key] || ''}
                      onChange={(e) => setCustomValues({ ...customValues, [field.key]: e.target.value })}
                      required={field.required}
                      placeholder={field.placeholder || ''}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white font-mono focus:outline-none"
                    />
                  ) : (
                    <input
                      type={field.dataType === 'number' ? 'number' : field.dataType === 'date' ? 'date' : 'text'}
                      value={customValues[field.key] || ''}
                      onChange={(e) => setCustomValues({ ...customValues, [field.key]: e.target.value })}
                      required={field.required}
                      placeholder={field.placeholder || ''}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 4: Customer Touch Signature */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <PenTool className="w-4 h-4 text-white" />
              <span>4. Customer Intake Sign-off</span>
            </h2>

            {hasSignature && (
              <button
                type="button"
                onClick={clearSignature}
                className="text-xs text-zinc-400 hover:text-white hover:underline"
              >
                Clear Signature
              </button>
            )}
          </div>

          <div className="border border-zinc-800 rounded-xl bg-zinc-950 overflow-hidden">
            <canvas
              ref={canvasRef}
              width={400}
              height={100}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-24 cursor-crosshair touch-none"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Customer signs above to acknowledge physical tool condition &amp; estimate pre-approval limit (${preApprovedLimit}).</span>
            {hasSignature && <span className="text-white font-bold">✓ Digital Signature Captured</span>}
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
          <div className="text-xs text-zinc-400">
            Intake Card ID: <span className="font-mono text-white font-bold">{generatedId}</span>
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-3 font-bold text-xs text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Bosch Service Ticket &amp; Save</span>
          </button>
        </div>

      </form>

    </div>
  );
};
