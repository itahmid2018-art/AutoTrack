import React, { useState } from 'react';
import { BusinessSettings, CriticalQuestionnaire, CustomField, JobCard, InventoryItem, RecurringMaintenance } from '../types';
import { FieldCustomizer } from './FieldCustomizer';
import { TransactionalDb } from '../utils/localStorageDb';
import { 
  HelpCircle, 
  CheckCircle2, 
  MessageSquare, 
  ShieldCheck, 
  Cpu, 
  ArrowRight, 
  Save, 
  Sliders, 
  Settings,
  Download,
  FileSpreadsheet,
  Database,
  RefreshCw,
  FileCheck,
  HardDrive,
  Upload,
  AlertTriangle
} from 'lucide-react';

interface TransitionViewProps {
  settings: BusinessSettings;
  onUpdateSettings: (newSettings: BusinessSettings) => void;
  questionnaire: CriticalQuestionnaire;
  onUpdateQuestionnaire: (newQ: CriticalQuestionnaire) => void;
  customFields: CustomField[];
  onUpdateCustomFields: (newFields: CustomField[]) => void;
  jobCards: JobCard[];
  inventory: InventoryItem[];
  schedules: RecurringMaintenance[];
  onRestoreDatabase: (backupData: any) => void;
  onProceedToJobs: () => void;
}

export const TransitionView: React.FC<TransitionViewProps> = ({
  settings,
  onUpdateSettings,
  questionnaire,
  onUpdateQuestionnaire,
  customFields,
  onUpdateCustomFields,
  jobCards,
  inventory,
  schedules,
  onRestoreDatabase,
  onProceedToJobs,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'fields' | 'backups' | 'rules'>('backups');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleExportJobCardsCsv = () => {
    TransactionalDb.exportJobCardsCsv(jobCards);
    showNotice(`Exported ${jobCards.length} Job Cards to CSV.`);
  };

  const handleExportInventoryCsv = () => {
    TransactionalDb.exportInventoryCsv(inventory);
    showNotice(`Exported ${inventory.length} Parts SKUs to CSV.`);
  };

  const handleExportAllCsv = () => {
    TransactionalDb.exportJobCardsCsv(jobCards);
    setTimeout(() => TransactionalDb.exportInventoryCsv(inventory), 300);
    showNotice('Exported Job Cards and Inventory CSV files.');
  };

  const handleDownloadJsonBackup = () => {
    TransactionalDb.exportFullBackupJson(jobCards, inventory, settings, customFields, schedules);
    showNotice('Downloaded complete transactional database backup (.json).');
  };

  const handleRestoreJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed && (parsed.data || parsed.jobCards)) {
          onRestoreDatabase(parsed.data || parsed);
          showNotice('Database restored successfully from backup file!');
        } else {
          alert('Invalid JSON backup file structure.');
        }
      } catch (err: any) {
        alert(`Failed to parse backup JSON file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const toggleAutoBackup = (enabled: boolean) => {
    const updated = {
      ...settings,
      autoDailyBackupEnabled: enabled,
      autoDailyBackupDestination: settings.autoDailyBackupDestination || 'localStorage',
    };
    onUpdateSettings(updated);
    showNotice(`Automatic Daily Backup ${enabled ? 'ENABLED' : 'DISABLED'}.`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      
      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl font-mono">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white bg-zinc-950 px-3 py-1 rounded-md border border-zinc-800">
              System Settings &amp; Data Governance
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white uppercase tracking-tight">
              Settings, Data Exports &amp; Auto-Backup Management
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Export CSV reports for external accounting, configure automatic daily database backups, customize form fields, and tune operational rules.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onProceedToJobs}
              className="px-5 py-3 text-xs font-bold font-mono text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 shrink-0"
            >
              <span>Launch Service Hub</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="mt-6 pt-4 border-t border-zinc-800 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveSubTab('backups')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeSubTab === 'backups'
                ? 'bg-white text-zinc-950 shadow'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>1. CSV Reports &amp; Daily Auto-Backups</span>
          </button>

          <button
            onClick={() => setActiveSubTab('fields')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeSubTab === 'fields'
                ? 'bg-white text-zinc-950 shadow'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>2. Form Fields &amp; Custom UI</span>
          </button>

          <button
            onClick={() => setActiveSubTab('rules')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeSubTab === 'rules'
                ? 'bg-white text-zinc-950 shadow'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>3. Business Rules &amp; Operational Policies</span>
          </button>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionNotice && (
        <div className="bg-zinc-900 border border-white/20 p-3.5 rounded-xl text-xs font-mono text-white flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-white" />
            <span>{actionNotice}</span>
          </div>
          <span className="text-[10px] text-zinc-400">System Notification</span>
        </div>
      )}

      {/* SUB-TAB 1: CSV EXPORTS & DAILY AUTO-BACKUP TOGGLE */}
      {activeSubTab === 'backups' && (
        <div className="space-y-6 font-mono">
          
          {/* Section A: CSV Data Export Center */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-white" />
                  <span>CSV Data Exports for Accounting &amp; Audit</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Export complete job history and spare parts inventory data into standard CSV files for external audits and reporting.
                </p>
              </div>

              <button
                onClick={handleExportAllCsv}
                className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-all shadow flex items-center gap-1.5 shrink-0 active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Export Both CSVs (Job Cards &amp; Stock)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Job Cards CSV Card */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs uppercase">Job Cards History CSV</span>
                  <span className="text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {jobCards.length} Tickets
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Exports all customer details, tool models, serials, complaints, technician assignments, labor hours, parts costs, tax rates, and total estimate amounts.
                </p>
                <button
                  onClick={handleExportJobCardsCsv}
                  className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-lg border border-zinc-700 text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Download Job Cards CSV</span>
                </button>
              </div>

              {/* Parts Inventory CSV Card */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs uppercase">Spare Parts Inventory CSV</span>
                  <span className="text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {inventory.length} SKUs
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Exports full ~1,000 spare parts catalog with SKUs, barcodes, categories, compatible models, cost prices, selling unit prices, stock quantities, and bin locations.
                </p>
                <button
                  onClick={handleExportInventoryCsv}
                  className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-lg border border-zinc-700 text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Inventory Stock CSV</span>
                </button>
              </div>

            </div>
          </div>

          {/* Section B: Automatic Daily Backups & Database Restoration */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-white" />
                  <span>Automatic Daily Database Backups &amp; Disaster Recovery</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Automatically backs up all job cards, 1,000 inventory items, custom fields, and settings to local browser storage or JSON file.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${
                  settings.autoDailyBackupEnabled 
                    ? 'bg-zinc-950 text-white border-zinc-700' 
                    : 'bg-zinc-950/40 text-zinc-600 border-zinc-900'
                }`}>
                  {settings.autoDailyBackupEnabled ? '● AUTO BACKUP ACTIVE' : '○ BACKUP DISABLED'}
                </span>
              </div>
            </div>

            {/* Toggle Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Toggle Switch */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs uppercase">Enable Automatic Daily Backups</span>
                  <input
                    type="checkbox"
                    checked={!!settings.autoDailyBackupEnabled}
                    onChange={(e) => toggleAutoBackup(e.target.checked)}
                    className="w-5 h-5 accent-white rounded cursor-pointer"
                  />
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  When enabled, the system automatically creates a daily snapshot of all transactional data once per day.
                </p>
                <div className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-900">
                  Last Auto-Backup Date: <span className="text-white font-bold">{settings.lastAutoBackupDate || 'Not run today'}</span>
                </div>
              </div>

              {/* Destination Selector */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <span className="font-bold text-white text-xs uppercase block">Backup Destination &amp; Target</span>
                <select
                  value={settings.autoDailyBackupDestination || 'localStorage'}
                  onChange={(e) => onUpdateSettings({ ...settings, autoDailyBackupDestination: e.target.value as any })}
                  disabled={!settings.autoDailyBackupEnabled}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded-lg px-3 py-2 focus:outline-none disabled:opacity-40"
                >
                  <option value="localStorage">Local Browser Storage Snapshot (Indexed/Local)</option>
                  <option value="downloadJson">Automatic JSON File Download Prompt</option>
                  <option value="both">Both Browser Snapshot &amp; Auto JSON File Download</option>
                </select>
                <p className="text-[10px] text-zinc-500">
                  Snapshots are stored under <code className="text-zinc-300">autotrack_daily_snapshot_YYYY-MM-DD</code>.
                </p>
              </div>

            </div>

            {/* Manual Backup Download & File Restore */}
            <div className="pt-3 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Instant Backup Download */}
              <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Instant Full Database Backup (.json)</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Download a complete snapshot JSON file now</div>
                </div>

                <button
                  onClick={handleDownloadJsonBackup}
                  className="px-3.5 py-2 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow shrink-0 active:scale-95"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Download JSON</span>
                </button>
              </div>

              {/* File Restoration */}
              <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Restore Database from JSON Backup</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Upload a previously exported .json backup file</div>
                </div>

                <label className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-lg text-xs border border-zinc-700 flex items-center gap-1.5 cursor-pointer shrink-0">
                  <Upload className="w-3.5 h-3.5 text-white" />
                  <span>Upload &amp; Restore</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRestoreJsonFile}
                    className="hidden"
                  />
                </label>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* SUB-TAB 2: FORM FIELDS & UI CUSTOMIZATION */}
      {activeSubTab === 'fields' && (
        <FieldCustomizer
          customFields={customFields}
          onUpdateFields={onUpdateCustomFields}
        />
      )}

      {/* SUB-TAB 3: BUSINESS RULES & OPERATIONAL POLICIES */}
      {activeSubTab === 'rules' && (
        <div className="space-y-6 font-mono">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Question 1 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase">Service Center Domain &amp; Niche</h3>
                  <p className="text-xs text-zinc-400">Determines default intake fields (Reg No, Odometer, Serial No).</p>
                </div>
              </div>

              <div className="space-y-2">
                {[
                  { id: 'Bosch Power Tools & Heavy Machinery', label: 'Bosch Power Tools & Heavy Machinery (Default)', desc: 'Requires Model, Serial No, Voltage & Warranty' },
                  { id: 'Automotive Workshop', label: 'Automotive Workshop (Cars, Trucks, SUVs)', desc: 'Requires Reg No, Odometer (km/mi), Color' },
                  { id: 'Two-Wheeler Center', label: 'Motorcycle & Two-Wheeler Center', desc: 'Requires Bike Reg No, Fuel Level, Helmet check' },
                  { id: 'Electronics & Mobile', label: 'Electronics, Phone & PC Repair', desc: 'Requires Serial / IMEI, Passcode lock state' },
                ].map((opt) => (
                  <label
                    key={opt.id}
                    onClick={() => onUpdateQuestionnaire({ ...questionnaire, serviceType: opt.id })}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      questionnaire.serviceType === opt.id
                        ? 'bg-zinc-950 border-white text-white font-bold'
                        : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="serviceType"
                      checked={questionnaire.serviceType === opt.id}
                      onChange={() => {}}
                      className="mt-1 accent-white"
                    />
                    <div>
                      <div className="text-xs font-bold text-zinc-200">{opt.label}</div>
                      <div className="text-[11px] text-zinc-400">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Question 2 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase">Job Card Prefix &amp; Numbering</h3>
                  <p className="text-xs text-zinc-400">Replaces physical paper booklet counter numbers.</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Job Card Prefix Code</label>
                  <input
                    type="text"
                    value={settings.jobCardPrefix}
                    onChange={(e) => onUpdateSettings({ ...settings, jobCardPrefix: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-zinc-500 font-bold"
                    placeholder="e.g. BOSCH-2026-"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">Example generated card ID: <span className="font-mono text-white font-bold">{settings.jobCardPrefix}0045</span></p>
                </div>

                <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-800 text-xs text-zinc-300 space-y-1">
                  <div className="font-semibold text-white uppercase text-[10px]">Paper Transition Benefit:</div>
                  <p className="text-[11px] text-zinc-400">Prevents missing pages or duplicated paper numbers. System automatically increments card IDs safely.</p>
                </div>
              </div>
            </div>

            {/* Question 3 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  3
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase">Customer Messaging Channel</h3>
                  <p className="text-xs text-zinc-400">Replaces manual phone calls &amp; paper receipts.</p>
                </div>
              </div>

              <div className="space-y-2">
                {[
                  { id: 'WhatsApp & SMS Direct', label: '1-Click WhatsApp Web & SMS Trigger (Recommended)', desc: 'Launches native WhatsApp Web / SMS app with prefilled status message' },
                  { id: 'WhatsApp Direct Only', label: 'WhatsApp Only (Instant Chat)', desc: 'Opens WhatsApp conversation with customer phone number' },
                  { id: 'Copy-Paste SMS', label: 'Copy-to-Clipboard Manual Messaging', desc: 'Allows copy-pasting into any third-party SMS gateway' },
                ].map((opt) => (
                  <label
                    key={opt.id}
                    onClick={() => onUpdateQuestionnaire({ ...questionnaire, messagingChannel: opt.id })}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      questionnaire.messagingChannel === opt.id
                        ? 'bg-zinc-950 border-white text-white font-bold'
                        : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="messagingChannel"
                      checked={questionnaire.messagingChannel === opt.id}
                      onChange={() => {}}
                      className="mt-1 accent-white"
                    />
                    <div>
                      <div className="text-xs font-bold text-zinc-200">{opt.label}</div>
                      <div className="text-[11px] text-zinc-400">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Question 4 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  4
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase">1,000-Item Stock Deduction Policy</h3>
                  <p className="text-xs text-zinc-400">Controls when spare parts stock is automatically decremented.</p>
                </div>
              </div>

              <div className="space-y-2">
                {[
                  { id: 'InService', label: 'Deduct Stock when Job is moved to "In Service" (Recommended)', desc: 'Reserves part as technician pulls it from shelf/bin' },
                  { id: 'Approval', label: 'Deduct Stock immediately upon Customer Estimate Approval', desc: 'Reserves stock ahead of time to prevent double-booking' },
                  { id: 'Completion', label: 'Deduct Stock only on Job Completion & Payment', desc: 'Traditional accounting method on final invoice' },
                ].map((opt) => (
                  <label
                    key={opt.id}
                    onClick={() => {
                      onUpdateQuestionnaire({ ...questionnaire, stockDeductionPolicy: opt.id });
                      onUpdateSettings({ ...settings, deductStockOn: opt.id as any });
                    }}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      settings.deductStockOn === opt.id
                        ? 'bg-zinc-950 border-white text-white font-bold'
                        : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="stockDeduction"
                      checked={settings.deductStockOn === opt.id}
                      onChange={() => {}}
                      className="mt-1 accent-white"
                    />
                    <div>
                      <div className="text-xs font-bold text-zinc-200">{opt.label}</div>
                      <div className="text-[11px] text-zinc-400">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Question 5 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  5
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase">Labor &amp; Service Pricing Model</h3>
                  <p className="text-xs text-zinc-400">Configure base labor rates and sales tax/VAT percentages.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Base Labor Rate ($ / hr)</label>
                  <input
                    type="number"
                    value={settings.laborRate}
                    onChange={(e) => onUpdateSettings({ ...settings, laborRate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-zinc-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Sales Tax / GST Rate (%)</label>
                  <input
                    type="number"
                    value={settings.taxRate}
                    onChange={(e) => onUpdateSettings({ ...settings, taxRate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-zinc-500 font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Question 6 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  6
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase">Customer Digital Signature Mandate</h3>
                  <p className="text-xs text-zinc-400">Replaces physical paper signature pad check-in.</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.requireSignature}
                    onChange={(e) => onUpdateSettings({ ...settings, requireSignature: e.target.checked })}
                    className="w-4 h-4 accent-white rounded"
                  />
                  <span className="text-xs font-semibold text-zinc-200">
                    Require Digital Screen Signature during Customer Intake
                  </span>
                </label>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  When enabled, customer signs directly on tablet or mobile touchscreen during intake. Signature is embedded into the digital PDF invoice &amp; job record.
                </p>
              </div>
            </div>

          </div>

          {/* Save Notification & Action Footer */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-zinc-900/90 border border-zinc-800 rounded-2xl font-mono">
            <div className="flex items-center gap-3 text-xs text-zinc-300">
              <ShieldCheck className="w-5 h-5 text-white shrink-0" />
              <span>All settings take effect immediately across all Job Cards, Inventory Stock &amp; Messaging tools.</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {savedSuccess && (
                <span className="text-xs font-semibold text-white flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Configuration Saved!</span>
                </span>
              )}

              <button
                onClick={handleSave}
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-all flex items-center justify-center gap-2 shadow"
              >
                <Save className="w-4 h-4" />
                <span>Save System Rules</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
