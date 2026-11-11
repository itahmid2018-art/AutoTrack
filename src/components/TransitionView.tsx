import React, { useState } from 'react';
import { BusinessSettings, CriticalQuestionnaire } from '../types';
import { HelpCircle, CheckCircle2, MessageSquare, ShieldCheck, Cpu, ArrowRight, Save } from 'lucide-react';

interface TransitionViewProps {
  settings: BusinessSettings;
  onUpdateSettings: (newSettings: BusinessSettings) => void;
  questionnaire: CriticalQuestionnaire;
  onUpdateQuestionnaire: (newQ: CriticalQuestionnaire) => void;
  onProceedToJobs: () => void;
}

export const TransitionView: React.FC<TransitionViewProps> = ({
  settings,
  onUpdateSettings,
  questionnaire,
  onUpdateQuestionnaire,
  onProceedToJobs,
}) => {
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-cyan-950/30 border border-amber-500/30 rounded-2xl p-6 sm:p-8 mb-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-3 py-1 rounded-md border border-amber-500/20">
              Paper-to-Digital Transition Guide
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Business Owner Confirmation &amp; System Tuning
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Replacing traditional paper job pads requires confirming 6 critical operational decisions. 
              Confirming these options below optimizes your 1,000-item inventory deduction rules, digital customer signatures, and automated WhatsApp/SMS dispatch.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              onClick={onProceedToJobs}
              className="px-5 py-3 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <span>Launch Job Cards System</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 6 Critical Transition Questions Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Question 1 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-sm shrink-0">
              1
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Service Center Domain &amp; Niche</h3>
              <p className="text-xs text-slate-400">Determines default intake fields (Reg No, Odometer, Serial No).</p>
            </div>
          </div>

          <div className="space-y-2">
            {[
              { id: 'Automotive', label: 'Automotive Workshop (Cars, Trucks, SUVs)', desc: 'Requires Reg No, Odometer (km/mi), Color' },
              { id: 'Two-Wheeler', label: 'Motorcycle & Two-Wheeler Center', desc: 'Requires Bike Reg No, Fuel Level, Helmet check' },
              { id: 'Electronics & Mobile', label: 'Electronics, Phone & PC Repair', desc: 'Requires Serial / IMEI, Passcode lock state' },
              { id: 'Home Appliance', label: 'Home Appliance & HVAC Repair', desc: 'Requires Model Code, Serial No, On-site flag' },
            ].map((opt) => (
              <label
                key={opt.id}
                onClick={() => onUpdateQuestionnaire({ ...questionnaire, serviceType: opt.id })}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  questionnaire.serviceType === opt.id
                    ? 'bg-cyan-950/40 border-cyan-500/50 text-white'
                    : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="serviceType"
                  checked={questionnaire.serviceType === opt.id}
                  onChange={() => {}}
                  className="mt-1 accent-cyan-400"
                />
                <div>
                  <div className="text-xs font-bold text-slate-200">{opt.label}</div>
                  <div className="text-[11px] text-slate-400">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Question 2 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-sm shrink-0">
              2
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Job Card Prefix &amp; Numbering</h3>
              <p className="text-xs text-slate-400">Replaces physical paper booklet counter numbers.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Job Card Prefix Code</label>
              <input
                type="text"
                value={settings.jobCardPrefix}
                onChange={(e) => onUpdateSettings({ ...settings, jobCardPrefix: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
                placeholder="e.g. JC-2026-"
              />
              <p className="text-[11px] text-slate-500 mt-1">Example generated card ID: <span className="font-mono text-slate-300">{settings.jobCardPrefix}0045</span></p>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-amber-400">Paper Transition Benefit:</div>
              <p className="text-[11px] text-slate-400">Prevents missing pages or duplicated paper numbers. System automatically increments card IDs safely.</p>
            </div>
          </div>
        </div>

        {/* Question 3 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">
              3
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Customer Messaging Channel</h3>
              <p className="text-xs text-slate-400">Replaces manual phone calls &amp; paper receipts.</p>
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
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                    : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="messagingChannel"
                  checked={questionnaire.messagingChannel === opt.id}
                  onChange={() => {}}
                  className="mt-1 accent-emerald-400"
                />
                <div>
                  <div className="text-xs font-bold text-slate-200">{opt.label}</div>
                  <div className="text-[11px] text-slate-400">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Question 4 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-sm shrink-0">
              4
            </div>
            <div>
              <h3 className="text-base font-bold text-white">1,000-Item Stock Deduction Policy</h3>
              <p className="text-xs text-slate-400">Controls when spare parts stock is automatically decremented.</p>
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
                    ? 'bg-purple-950/40 border-purple-500/50 text-white'
                    : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="stockDeduction"
                  checked={settings.deductStockOn === opt.id}
                  onChange={() => {}}
                  className="mt-1 accent-purple-400"
                />
                <div>
                  <div className="text-xs font-bold text-slate-200">{opt.label}</div>
                  <div className="text-[11px] text-slate-400">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Question 5 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm shrink-0">
              5
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Labor &amp; Service Pricing Model</h3>
              <p className="text-xs text-slate-400">Configure base labor rates and sales tax/VAT percentages.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Base Labor Rate ($ / hr)</label>
              <input
                type="number"
                value={settings.laborRate}
                onChange={(e) => onUpdateSettings({ ...settings, laborRate: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-blue-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Sales Tax / GST Rate (%)</label>
              <input
                type="number"
                value={settings.taxRate}
                onChange={(e) => onUpdateSettings({ ...settings, taxRate: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Question 6 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-sm shrink-0">
              6
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Customer Digital Signature Mandate</h3>
              <p className="text-xs text-slate-400">Replaces physical paper signature pad check-in.</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={settings.requireSignature}
                onChange={(e) => onUpdateSettings({ ...settings, requireSignature: e.target.checked })}
                className="w-4 h-4 accent-cyan-400 rounded"
              />
              <span className="text-xs font-semibold text-slate-200">
                Require Digital Screen Signature during Customer Intake
              </span>
            </label>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              When enabled, customer signs directly on tablet or mobile touchscreen during intake. Signature is embedded into the digital PDF invoice &amp; job record.
            </p>
          </div>
        </div>

      </div>

      {/* Save Notification & Action Footer */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-slate-900/90 border border-slate-800 rounded-2xl">
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>All settings take effect immediately across all Job Cards, Inventory Stock &amp; Messaging tools.</span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {savedSuccess && (
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Configuration Saved!</span>
            </span>
          )}

          <button
            onClick={handleSave}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
