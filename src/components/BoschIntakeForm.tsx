import React, { useState, useRef, useEffect } from 'react';
import { JobCard, ToolBrand, ToolCategory, GrievanceCategory, InventoryItem, JobPart, BusinessSettings, CustomField, RecurringMaintenance } from '../types';
import { adjudicateWarranty } from '../utils/warrantyAdjudicator';
import { SerialBarcodeScannerModal } from './SerialBarcodeScannerModal';
import {
  BarcodeScanResult,
  ToolHistoryMatch,
  findMatchingInventoryItem,
  findMatchingToolHistory,
  parseProductQrPayload,
} from '../utils/barcodeSerialParser';
import { resolveApiUrl } from '../utils/apiBase';
import { nextJobCardId } from '../utils/jobId';
import { Wrench, User, Phone, ShieldCheck, ShieldAlert, FileText, Sparkles, Printer, MessageSquare, Plus, PenTool, CheckCircle2, AlertCircle, Sliders, ScanBarcode, QrCode, History, Package, ExternalLink, X } from 'lucide-react';

interface BoschIntakeFormProps {
  onAddJob: (job: JobCard) => void;
  inventory: InventoryItem[];
  settings: BusinessSettings;
  existingCount: number;
  onOpenWhatsApp: (job: JobCard) => void;
  customFields?: CustomField[];
  jobCards?: JobCard[];
  schedules?: RecurringMaintenance[];
  onSelectExistingJob?: (job: JobCard) => void;
  externalScanPrefill?: { result: BarcodeScanResult; nonce: number } | null;
}

export const BoschIntakeForm: React.FC<BoschIntakeFormProps> = ({
  onAddJob,
  inventory,
  settings,
  existingCount,
  onOpenWhatsApp,
  customFields = [],
  jobCards = [],
  schedules = [],
  onSelectExistingJob,
  externalScanPrefill,
}) => {
  const generatedId = nextJobCardId(jobCards, settings.jobCardPrefix);

  const getFieldConfig = (
    key: string,
    defaults: { label: string; placeholder?: string; required: boolean; enabled?: boolean }
  ) => {
    const match = customFields.find((f) => f.key === key);
    if (!match) {
      return {
        label: defaults.label,
        placeholder: defaults.placeholder,
        required: defaults.required,
        enabled: defaults.enabled !== false,
        options: undefined as string[] | undefined,
      };
    }
    return {
      label: match.label || defaults.label,
      placeholder: match.placeholder ?? defaults.placeholder,
      required: match.required,
      enabled: match.enabled,
      options: match.options,
    };
  };

  const customerNameCfg = getFieldConfig('customerName', { label: 'Customer / Client Name', placeholder: 'e.g. Apex Construction / John Smith', required: true });
  const customerPhoneCfg = getFieldConfig('customerPhone', { label: 'Mobile Phone (WhatsApp)', placeholder: 'e.g. +1 (555) 234-5678', required: true });
  const customerCompanyCfg = getFieldConfig('customerCompany', { label: 'Company Name (Optional)', placeholder: 'e.g. Apex Industrial Infrastructure', required: false });
  const gstOrTaxIdCfg = getFieldConfig('gstOrTaxId', { label: 'GSTIN / Tax Registration ID', placeholder: 'TAX-8920194', required: false });
  const preApprovedLimitCfg = getFieldConfig('preApprovedLimit', { label: 'Pre-Approved Auto Repair Limit ($)', placeholder: '50.00', required: false });
  const toolBrandCfg = getFieldConfig('toolBrand', { label: 'Tool Brand', required: true });
  const modelNumberCfg = getFieldConfig('modelNumber', { label: 'Model Number / Code', placeholder: 'e.g. GBH 2-26 DFR / GWS 900', required: true });
  const serialNumberCfg = getFieldConfig('serialNumber', { label: 'Serial Number / Bare Tool ID', placeholder: 'e.g. SN-3611B54300', required: false });
  const voltageRatingCfg = getFieldConfig('voltageRating', { label: 'Voltage / Power Source', required: true });
  const warrantyStatusCfg = getFieldConfig('warrantyStatus', { label: 'Warranty Status', required: true });
  const grievanceCategoryCfg = getFieldConfig('grievanceCategory', { label: 'Primary Defect Category', required: true });
  const detailedComplaintCfg = getFieldConfig('detailedComplaint', { label: 'Detailed Customer Complaint / Symptoms', placeholder: 'Describe exact customer grievance (e.g. sparks inside casing, lost hammer impact)...', required: true });

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
  const [customValues, setCustomValues] = useState<Record<string, string | number | boolean>>({});
  const [grievanceCategory, setGrievanceCategory] = useState<GrievanceCategory>('Motor Sparking / Excessive Smoke');
  const [detailedComplaint, setDetailedComplaint] = useState('');
  const [serviceType, setServiceType] = useState<'Diagnostic & Repair' | 'Standard Overhaul' | 'Carbon Brush & Maintenance' | 'Armature Replacement' | 'Warranty Claim'>('Diagnostic & Repair');

  // AI Diagnostic Assistant
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Canvas Signature State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  // Camera Serial / Product QR Scanner State & Lookup Results
  const [isSerialScannerOpen, setIsSerialScannerOpen] = useState(false);
  const [scanResultBadge, setScanResultBadge] = useState<BarcodeScanResult | null>(null);
  const [qrLookupPanel, setQrLookupPanel] = useState<{
    result: BarcodeScanResult;
    matchedInventory: InventoryItem | null;
    historyMatch: ToolHistoryMatch;
  } | null>(null);

  const handlePrefillFromHistoryJob = (job: JobCard) => {
    setCustomerName(job.customerName || '');
    setCustomerCompany(job.customerCompany || '');
    setCustomerPhone(job.customerPhone || '');
    setCustomerEmail(job.customerEmail || '');
    setGstOrTaxId(job.gstOrTaxId || '');
    if (job.tool?.brand) setBrand(job.tool.brand);
    if (job.tool?.category) setCategory(job.tool.category);
    if (job.tool?.modelNumber) setModelNumber(job.tool.modelNumber);
    if (job.tool?.serialNumber && job.tool.serialNumber !== 'N/A') {
      setSerialNumber(job.tool.serialNumber);
    }
    if (job.tool?.voltageRating) setVoltageRating(job.tool.voltageRating);
    if (job.tool?.warrantyStatus) setWarrantyStatus(job.tool.warrantyStatus);
  };

  const handleSerialBarcodeDetected = (result: BarcodeScanResult) => {
    const parsed = parseProductQrPayload(result.rawValue);
    const matchedInventory = findMatchingInventoryItem(result.rawValue, inventory);
    const historyMatch = findMatchingToolHistory(
      result.rawValue,
      jobCards,
      schedules,
      matchedInventory?.sku
    );

    const nextSerial = result.serialNumber || parsed.serialNumber || matchedInventory?.sku || '';
    if (nextSerial) {
      setSerialNumber(nextSerial);
    }
    if (result.detectedModelNumber) {
      setModelNumber(result.detectedModelNumber);
    } else if (historyMatch.matchingJobs[0]?.tool?.modelNumber) {
      setModelNumber(historyMatch.matchingJobs[0].tool.modelNumber);
    }
    if (result.detectedBrand && result.detectedBrand.toLowerCase().includes('bosch')) {
      setBrand(result.detectedBrand.toLowerCase().includes('green') ? 'Bosch DIY (Green)' : 'Bosch Professional');
    } else if (historyMatch.matchingJobs[0]?.tool?.brand) {
      setBrand(historyMatch.matchingJobs[0].tool.brand);
    }
    if (historyMatch.matchingJobs[0]?.tool?.category) {
      setCategory(historyMatch.matchingJobs[0].tool.category);
    }
    if (!customerName && historyMatch.matchingJobs[0]) {
      handlePrefillFromHistoryJob(historyMatch.matchingJobs[0]);
    }

    setScanResultBadge(result);
    setQrLookupPanel({
      result,
      matchedInventory,
      historyMatch,
    });
    setIsSerialScannerOpen(false);
  };

  useEffect(() => {
    if (externalScanPrefill?.result) {
      handleSerialBarcodeDetected(externalScanPrefill.result);
    }
  }, [externalScanPrefill?.nonce]);

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
    setAiError(null);

    try {
      const res = await fetch(resolveApiUrl('/api/ai/diagnose'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueDescription: `${grievanceCategory}: ${detailedComplaint}`,
          vehicleOrDevice: `${brand} ${category} (Model: ${modelNumber})`,
          category: category,
          availableParts: inventory.slice(0, 25).map(i => ({ id: i.id, sku: i.sku, name: i.name, unitPrice: i.unitPrice })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiError(data?.error || data?.details || `AI diagnosis failed (HTTP ${res.status}). Check server Gemini API key and model configuration.`);
        return;
      }

      setAiSuggestions(`Probable Fault: ${data.probableCause}\nRecommended Actions:\n${(data.recommendedSteps || []).map((s: string) => `• ${s}`).join('\n')}`);
    } catch (err: any) {
      console.error(err);
      setAiError(err?.message || 'Unable to reach AI diagnosis endpoint. Check server connection and GEMINI_API_KEY.');
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
    setSignatureError(null);
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
    setSignatureError(null);

    if (customerNameCfg.enabled && customerNameCfg.required && !customerName.trim()) return;
    if (customerPhoneCfg.enabled && customerPhoneCfg.required && !customerPhone.trim()) return;
    if (modelNumberCfg.enabled && modelNumberCfg.required && !modelNumber.trim()) return;
    if (detailedComplaintCfg.enabled && detailedComplaintCfg.required && !detailedComplaint.trim()) return;

    const enabledCustomFields = customFields.filter((f) => !f.isSystem && f.enabled);
    const cleanedCustomFieldValues: Record<string, string | number | boolean> = {};
    for (const field of enabledCustomFields) {
      const rawVal = customValues[field.key];
      if (field.dataType === 'boolean') {
        const boolVal = Boolean(rawVal);
        if (field.required && !boolVal) {
          setSignatureError(`Please check required custom field "${field.label}" before saving.`);
          return;
        }
        if (rawVal !== undefined) {
          cleanedCustomFieldValues[field.key] = boolVal;
        }
      } else if (field.dataType === 'number') {
        const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
        if (field.required && !strVal) {
          setSignatureError(`Please enter a value for required custom field "${field.label}".`);
          return;
        }
        if (strVal !== '') {
          const parsedNum = Number(strVal);
          cleanedCustomFieldValues[field.key] = Number.isFinite(parsedNum) ? parsedNum : strVal;
        }
      } else {
        const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
        if (field.required && !strVal) {
          setSignatureError(`Please fill required custom field "${field.label}".`);
          return;
        }
        if (strVal !== '') {
          cleanedCustomFieldValues[field.key] = strVal;
        }
      }
    }

    if (settings.requireSignature && !hasSignature) {
      setSignatureError('Client intake signature is required by Business Rules before saving this service ticket.');
      return;
    }

    let signatureDataUrl: string | undefined = undefined;
    if (canvasRef.current && hasSignature) {
      signatureDataUrl = canvasRef.current.toDataURL();
    }

    const nowIso = new Date().toISOString();
    const { recommendedWarrantyStatus: _, ...adjudicationRecord } = warrantyEval;

    const newJob: JobCard = {
      id: generatedId,
      customerName: customerName.trim() || 'Walk-in Client',
      customerCompany,
      customerPhone: customerPhone.trim() || 'N/A',
      customerEmail,
      gstOrTaxId,
      tool: {
        brand,
        category,
        modelNumber: modelNumber.trim() || 'Unspecified Model',
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
        detailedComplaint: detailedComplaint.trim() || grievanceCategory,
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
      customFieldValues: Object.keys(cleanedCustomFieldValues).length > 0 ? cleanedCustomFieldValues : undefined,
      attachments: [],
      messageLogs: [
        {
          id: `msg-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          type: 'Intake',
          recipientPhone: customerPhone,
          text: `Hi ${customerName}, your ${brand} ${modelNumber} (Job Card ${generatedId}) is received for service. ${settings.centerName}.`,
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

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsSerialScannerOpen(true)}
              className="px-3.5 py-2 text-xs font-bold font-mono text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow flex items-center gap-1.5 transition-colors active:scale-95"
            >
              <ScanBarcode className="w-4 h-4" />
              <span>Barcode / QR Scanner</span>
            </button>
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
            {customerNameCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {customerNameCfg.label} {customerNameCfg.required && '*'}
                </label>
                <input
                  type="text"
                  required={customerNameCfg.required}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={customerNameCfg.placeholder}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
            )}

            {customerCompanyCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {customerCompanyCfg.label} {customerCompanyCfg.required && '*'}
                </label>
                <input
                  type="text"
                  required={customerCompanyCfg.required}
                  value={customerCompany}
                  onChange={(e) => setCustomerCompany(e.target.value)}
                  placeholder={customerCompanyCfg.placeholder}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
            )}

            {customerPhoneCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {customerPhoneCfg.label} {customerPhoneCfg.required && '*'}
                </label>
                <input
                  type="text"
                  required={customerPhoneCfg.required}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder={customerPhoneCfg.placeholder}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
            )}

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

            {gstOrTaxIdCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {gstOrTaxIdCfg.label} {gstOrTaxIdCfg.required && '*'}
                </label>
                <input
                  type="text"
                  required={gstOrTaxIdCfg.required}
                  value={gstOrTaxId}
                  onChange={(e) => setGstOrTaxId(e.target.value)}
                  placeholder={gstOrTaxIdCfg.placeholder}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
            )}

            {preApprovedLimitCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {preApprovedLimitCfg.label} {preApprovedLimitCfg.required && '*'}
                </label>
                <input
                  type="number"
                  required={preApprovedLimitCfg.required}
                  value={preApprovedLimit}
                  onChange={(e) => setPreApprovedLimit(parseFloat(e.target.value) || 0)}
                  placeholder={preApprovedLimitCfg.placeholder}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                <span className="text-[10px] text-zinc-500">Auto-approve repair if estimate &lt; limit</span>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Tool Specifications */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Wrench className="w-4 h-4 text-white" />
              <span>2. Bosch &amp; Tool Specifications</span>
            </h2>

            <button
              type="button"
              onClick={() => setIsSerialScannerOpen(true)}
              className="px-3 py-1.5 text-[11px] font-bold font-mono text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow flex items-center gap-1.5 transition-colors active:scale-95"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR / Barcode Scanner</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {toolBrandCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {toolBrandCfg.label} {toolBrandCfg.required && '*'}
                </label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none"
                >
                  {(toolBrandCfg.options && toolBrandCfg.options.length > 0
                    ? toolBrandCfg.options
                    : ['Bosch Professional', 'Bosch DIY (Green)', 'Makita', 'DeWalt', 'Milwaukee', 'Hilti', 'Metabo', 'Festool', 'Stihl', 'Other Vendor']
                  ).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}

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

            {modelNumberCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {modelNumberCfg.label} {modelNumberCfg.required && '*'}
                </label>
                <input
                  type="text"
                  required={modelNumberCfg.required}
                  value={modelNumber}
                  onChange={(e) => setModelNumber(e.target.value)}
                  placeholder={modelNumberCfg.placeholder}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none"
                />
              </div>
            )}

            {serialNumberCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {serialNumberCfg.label} {serialNumberCfg.required && '*'}
                </label>
                <div className="flex items-stretch gap-1.5">
                  <input
                    type="text"
                    required={serialNumberCfg.required}
                    value={serialNumber}
                    onChange={(e) => {
                      setSerialNumber(e.target.value);
                      if (scanResultBadge && e.target.value !== scanResultBadge.serialNumber) {
                        setScanResultBadge(null);
                      }
                    }}
                    placeholder={serialNumberCfg.placeholder}
                    className="w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() => setIsSerialScannerOpen(true)}
                    title="Scan tool serial barcode with device camera"
                    aria-label="Scan tool serial barcode with camera"
                    className="px-3 py-2 bg-zinc-950 hover:bg-zinc-800 text-emerald-400 hover:text-emerald-300 border border-emerald-700/60 rounded-xl font-mono text-[11px] font-bold flex items-center gap-1.5 shrink-0 transition-colors active:scale-95"
                  >
                    <ScanBarcode className="w-4 h-4" />
                    <span>Scan</span>
                  </button>
                </div>
                {scanResultBadge && (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-mono text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 rounded-lg px-2 py-1">
                    <span>
                      Scanned ({scanResultBadge.format}) via {scanResultBadge.method}
                    </span>
                    {scanResultBadge.detectedModelNumber && scanResultBadge.detectedModelNumber !== modelNumber && (
                      <button
                        type="button"
                        onClick={() => setModelNumber(scanResultBadge.detectedModelNumber!)}
                        className="underline font-bold text-white hover:text-emerald-200"
                      >
                        Use model {scanResultBadge.detectedModelNumber}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {voltageRatingCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {voltageRatingCfg.label} {voltageRatingCfg.required && '*'}
                </label>
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
            )}

            {warrantyStatusCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {warrantyStatusCfg.label} {warrantyStatusCfg.required && '*'}
                </label>
                <select
                  value={warrantyStatus}
                  onChange={(e) => setWarrantyStatus(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none"
                >
                  {(warrantyStatusCfg.options && warrantyStatusCfg.options.length > 0
                    ? warrantyStatusCfg.options
                    : ['Bosch Heavy Duty 3-Year Extended', 'Standard 1-Year', 'Out of Warranty', 'Unconfirmed']
                  ).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}

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

          {/* Product QR Scan Result: Inventory Item & Tool Service History Lookup */}
          {qrLookupPanel && (
            <div className="p-4 bg-zinc-950 border border-emerald-700/60 rounded-xl space-y-3 text-xs font-mono">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-white uppercase">
                    QR Lookup Result: {qrLookupPanel.historyMatch.queryCode || qrLookupPanel.result.serialNumber}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-emerald-300">
                    {qrLookupPanel.result.format}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setQrLookupPanel(null)}
                  className="text-[11px] text-zinc-400 hover:text-white underline"
                >
                  Dismiss
                </button>
              </div>

              {qrLookupPanel.matchedInventory && (
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-emerald-300 font-bold text-[11px]">
                      <Package className="w-3.5 h-3.5" />
                      <span>Matched Spare Part SKU: {qrLookupPanel.matchedInventory.sku}</span>
                    </div>
                    <div className="text-white font-sans font-semibold">
                      {qrLookupPanel.matchedInventory.name}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Bin {qrLookupPanel.matchedInventory.binLocation} · {qrLookupPanel.matchedInventory.stockQty} {qrLookupPanel.matchedInventory.unit} in stock · ${qrLookupPanel.matchedInventory.unitPrice.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {qrLookupPanel.historyMatch.matchingJobs.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        Prior Tool Service History ({qrLookupPanel.historyMatch.matchingJobs.length}{' '}
                        {qrLookupPanel.historyMatch.matchingJobs.length === 1 ? 'record' : 'records'})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePrefillFromHistoryJob(qrLookupPanel.historyMatch.matchingJobs[0])}
                      className="px-2.5 py-1 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-lg text-[10px]"
                    >
                      Prefill Client &amp; Tool from Latest
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {qrLookupPanel.historyMatch.matchingJobs.slice(0, 4).map((histJob) => (
                      <div
                        key={histJob.id}
                        className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{histJob.id}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-300">
                              {histJob.status}
                            </span>
                            <span className="text-[10px] text-zinc-400">{histJob.intakeDate}</span>
                          </div>
                          <div className="text-[11px] text-zinc-300 font-sans truncate">
                            {histJob.customerName} · {histJob.serviceReq.grievanceCategory}
                          </div>
                        </div>

                        {onSelectExistingJob && (
                          <button
                            type="button"
                            onClick={() => onSelectExistingJob(histJob)}
                            className="px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-emerald-300 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0"
                          >
                            <span>Open Ticket</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                !qrLookupPanel.matchedInventory && (
                  <p className="text-[11px] text-zinc-400 font-sans">
                    No prior tool repair records or spare part SKUs matched this code. Serial number filled for new intake.
                  </p>
                )
              )}

              {qrLookupPanel.historyMatch.matchingSchedules.length > 0 && (
                <div className="pt-1 border-t border-zinc-800 text-[11px] text-zinc-300 font-sans">
                  Recurring maintenance schedule found: Next service due{' '}
                  <strong className="text-emerald-300 font-mono">
                    {qrLookupPanel.historyMatch.matchingSchedules[0].nextDueDate}
                  </strong>{' '}
                  ({qrLookupPanel.historyMatch.matchingSchedules[0].status})
                </div>
              )}
            </div>
          )}

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
            {grievanceCategoryCfg.enabled && (
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  {grievanceCategoryCfg.label} {grievanceCategoryCfg.required && '*'}
                </label>
                <select
                  value={grievanceCategory}
                  onChange={(e) => setGrievanceCategory(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none"
                >
                  {(grievanceCategoryCfg.options && grievanceCategoryCfg.options.length > 0
                    ? grievanceCategoryCfg.options
                    : [
                        'Motor Sparking / Excessive Smoke',
                        'No Power / Dead Switch',
                        'Chuck / SDS Lock Mechanism Jammed',
                        'Low Impact / No Hammering Action',
                        'Gearbox Noise / Excessive Heat',
                        'Battery Not Charging / Fast Drain',
                        'Cable Cut / Strain Relief Damaged',
                        'Routine Maintenance / Carbon Brush Check',
                      ]
                  ).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}

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
          {detailedComplaintCfg.enabled && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-zinc-400">
                  {detailedComplaintCfg.label} {detailedComplaintCfg.required && '*'}
                </label>
                <span className="text-[11px] text-zinc-500">Click a preset below to auto-fill</span>
              </div>

              <textarea
                required={detailedComplaintCfg.required}
                rows={3}
                value={detailedComplaint}
                onChange={(e) => setDetailedComplaint(e.target.value)}
                placeholder={detailedComplaintCfg.placeholder}
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
          )}

          {aiError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/70 rounded-xl text-xs font-mono text-rose-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{aiError}</span>
              </div>
              <button
                type="button"
                onClick={() => setAiError(null)}
                aria-label="Dismiss AI diagnosis error"
                className="text-rose-300 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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
                      value={String(customValues[field.key] ?? '')}
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
                      value={String(customValues[field.key] ?? '')}
                      onChange={(e) => setCustomValues({ ...customValues, [field.key]: e.target.value })}
                      required={field.required}
                      placeholder={field.placeholder || ''}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white font-mono focus:outline-none"
                    />
                  ) : field.dataType === 'boolean' ? (
                    <label className="flex items-center gap-2.5 p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(customValues[field.key])}
                        onChange={(e) => setCustomValues({ ...customValues, [field.key]: e.target.checked })}
                        required={field.required}
                        className="w-4 h-4 accent-white rounded"
                      />
                      <span className="text-zinc-200 font-sans text-xs">
                        {field.placeholder || 'Confirmed'}
                      </span>
                    </label>
                  ) : (
                    <input
                      type={field.dataType === 'number' ? 'number' : field.dataType === 'date' ? 'date' : 'text'}
                      value={String(customValues[field.key] ?? '')}
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
              <span>
                4. Customer Intake Sign-off{' '}
                <span className={settings.requireSignature ? 'text-amber-300' : 'text-zinc-500'}>
                  ({settings.requireSignature ? 'Required' : 'Optional'})
                </span>
              </span>
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

          {signatureError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/70 rounded-xl text-xs font-mono text-rose-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{signatureError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSignatureError(null)}
                aria-label="Dismiss validation error"
                className="text-rose-300 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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

      {isSerialScannerOpen && (
        <SerialBarcodeScannerModal
          title="Scan Tool QR Code or Serial Barcode"
          subtitle="Auto-fills serial number and looks up inventory SKUs or prior tool repair history"
          prioritizeQr
          onDetected={handleSerialBarcodeDetected}
          onClose={() => setIsSerialScannerOpen(false)}
        />
      )}

    </div>
  );
};
