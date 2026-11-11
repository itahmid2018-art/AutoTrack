import React, { useState } from 'react';
import { RecurringMaintenance, ToolBrand, ToolCategory, MessageLog, JobCard } from '../types';
import { 
  Clock, Calendar, AlertCircle, CheckCircle2, MessageSquare, Plus, Search, 
  Wrench, User, Phone, ArrowUpRight, ShieldAlert, Sparkles, X, RefreshCw 
} from 'lucide-react';

interface RecurringMaintenanceViewProps {
  schedules: RecurringMaintenance[];
  onAddSchedule: (schedule: RecurringMaintenance) => void;
  onUpdateSchedule: (schedule: RecurringMaintenance) => void;
  onLogMessageSent: (scheduleId: string, log: MessageLog) => void;
  onCreateJobCardFromSchedule: (schedule: RecurringMaintenance) => void;
}

export const RecurringMaintenanceView: React.FC<RecurringMaintenanceViewProps> = ({
  schedules,
  onAddSchedule,
  onUpdateSchedule,
  onLogMessageSent,
  onCreateJobCardFromSchedule,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Due Soon' | 'Overdue' | 'Upcoming'>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Filtered schedules
  const filteredSchedules = schedules.filter((s) => {
    const matchesSearch =
      s.modelNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.customerPhone.includes(searchTerm) ||
      (s.customerCompany && s.customerCompany.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const dueSoonCount = schedules.filter(s => s.status === 'Due Soon').length;
  const overdueCount = schedules.filter(s => s.status === 'Overdue').length;

  // Queue WhatsApp Maintenance Reminder Handler
  const handleQueueWhatsAppReminder = (schedule: RecurringMaintenance) => {
    const cleanPhone = schedule.customerPhone.replace(/[^0-9]/g, '');
    const text = `Hi ${schedule.customerName}, automated service reminder: Your ${schedule.toolBrand} ${schedule.modelNumber} (SN: ${schedule.serialNumber}) scheduled ${schedule.intervalMonths}-month maintenance is due on ${schedule.nextDueDate}. Scope: ${schedule.recommendedServiceScope}. Reply YES to reserve service bay. Bosch Service Center.`;

    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;

    const log: MessageLog = {
      id: `msg-maint-${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      type: 'Recurring Reminder',
      recipientPhone: schedule.customerPhone,
      text,
      channel: 'WhatsApp',
      status: 'Sent',
    };

    onLogMessageSent(schedule.id, log);

    // Update schedule's queuedReminders
    const updated = {
      ...schedule,
      queuedReminders: [log, ...schedule.queuedReminders],
      updatedAt: new Date().toISOString(),
    };
    onUpdateSchedule(updated);

    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="space-y-6 font-mono">
      
      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white tracking-tight uppercase flex items-center gap-2">
                <Clock className="w-5 h-5 text-white" />
                <span>Recurring Tool Maintenance Tracker</span>
              </h1>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-sans">
              Schedule periodic safety checks, carbon brush replacements &amp; gearbox overhauls for commercial contractors with automated WhatsApp reminders.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl shadow transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Register Tool Schedule</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Stat Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-zinc-800 text-xs">
          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
            <span className="text-zinc-500 font-bold block text-[10px]">TOTAL TRACKED TOOLS</span>
            <span className="text-lg font-bold text-white">{schedules.length}</span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
            <span className="text-zinc-500 font-bold block text-[10px]">DUE SOON (NEXT 14 DAYS)</span>
            <span className="text-lg font-bold text-white">{dueSoonCount}</span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
            <span className="text-zinc-500 font-bold block text-[10px]">OVERDUE SERVICE</span>
            <span className="text-lg font-bold text-white">{overdueCount}</span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
            <span className="text-zinc-500 font-bold block text-[10px]">SERVICE INTERVALS</span>
            <span className="text-xs text-zinc-300">3, 6 &amp; 12 Months</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Model (GBH 11 DE), Serial SN, Customer Name, Phone..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
            {(['All', 'Due Soon', 'Overdue', 'Upcoming'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${
                  statusFilter === st
                    ? 'bg-white text-zinc-950 font-bold shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Scheduled Maintenance Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSchedules.length === 0 ? (
          <div className="col-span-full bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-500">
            No recurring maintenance schedules found. Click "+ Register Tool Schedule" above.
          </div>
        ) : (
          filteredSchedules.map((item) => (
            <div
              key={item.id}
              className={`bg-zinc-900 border rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4 ${
                item.status === 'Overdue'
                  ? 'border-white bg-zinc-950'
                  : item.status === 'Due Soon'
                  ? 'border-zinc-700'
                  : 'border-zinc-800'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-white bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                    {item.id}
                  </span>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                    item.status === 'Overdue'
                      ? 'bg-white text-zinc-950 border-white'
                      : item.status === 'Due Soon'
                      ? 'bg-zinc-800 text-white border-zinc-600'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                  }`}>
                    {item.status}
                  </span>
                </div>

                {/* Tool Specs */}
                <div className="text-xs text-zinc-400 uppercase">{item.toolBrand}</div>
                <h3 className="text-base font-bold text-white">{item.modelNumber}</h3>
                <div className="text-[11px] text-zinc-400">
                  SN: <span className="text-white font-bold">{item.serialNumber}</span> · Category: {item.toolCategory}
                </div>

                {/* Customer Lockup */}
                <div className="flex items-center justify-between text-xs text-zinc-300 mt-2 pt-2 border-t border-zinc-800">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="font-bold">{item.customerName}</span>
                  </div>
                  <span className="text-zinc-400 text-[11px]">{item.customerPhone}</span>
                </div>

                {/* Due Date & Scope */}
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 mt-3 text-xs space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500 font-semibold">Service Interval:</span>
                    <span className="text-white font-bold">{item.intervalMonths} Months</span>
                  </div>

                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500 font-semibold">Next Scheduled Due:</span>
                    <span className="text-white font-bold">{item.nextDueDate}</span>
                  </div>

                  <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/80">
                    <span className="text-zinc-500 block text-[10px] font-bold uppercase">Recommended Scope:</span>
                    <p className="text-zinc-300 font-sans leading-relaxed">{item.recommendedServiceScope}</p>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-zinc-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleQueueWhatsAppReminder(item)}
                  className="px-3 py-1.5 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
                  title="Queue Automated WhatsApp Reminder"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Queue Reminder</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>

                <button
                  onClick={() => onCreateJobCardFromSchedule(item)}
                  className="px-3 py-1.5 text-xs font-bold text-zinc-200 bg-zinc-950 hover:bg-zinc-800 rounded-xl border border-zinc-800 transition-colors flex items-center gap-1"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Create Intake</span>
                </button>
              </div>

            </div>
          ))
        )}
      </div>

      {/* Modal: Register Scheduled Tool */}
      {isAddModalOpen && (
        <RegisterScheduleModal
          onClose={() => setIsAddModalOpen(false)}
          onAdd={(newSchedule) => {
            onAddSchedule(newSchedule);
            setIsAddModalOpen(false);
          }}
          existingCount={schedules.length}
        />
      )}

    </div>
  );
};

// Modal for registering tool maintenance schedule
interface RegisterScheduleModalProps {
  onClose: () => void;
  onAdd: (schedule: RecurringMaintenance) => void;
  existingCount: number;
}

const RegisterScheduleModal: React.FC<RegisterScheduleModalProps> = ({ onClose, onAdd, existingCount }) => {
  const generatedId = `MAINT-2026-${(existingCount + 5).toString().padStart(3, '0')}`;

  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  
  const [toolBrand, setToolBrand] = useState<ToolBrand>('Bosch Professional');
  const [toolCategory, setToolCategory] = useState<ToolCategory>('Rotary Hammer / SDS');
  const [modelNumber, setModelNumber] = useState('GBH 2-26 DFR');
  const [serialNumber, setSerialNumber] = useState('');
  const [intervalMonths, setIntervalMonths] = useState(6);
  const [lastServiceDate, setLastServiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [recommendedServiceScope, setRecommendedServiceScope] = useState('Carbon Brush & SDS Gearbox Lubrication');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || !modelNumber) return;

    // Calculate next due date
    const lastDate = new Date(lastServiceDate);
    lastDate.setMonth(lastDate.getMonth() + Number(intervalMonths));
    const nextDueDate = lastDate.toISOString().split('T')[0];

    const todayStr = new Date().toISOString().split('T')[0];
    let status: 'Upcoming' | 'Due Soon' | 'Overdue' | 'Serviced' = 'Upcoming';
    if (nextDueDate <= todayStr) {
      status = 'Overdue';
    } else if (new Date(nextDueDate).getTime() - new Date().getTime() <= 14 * 24 * 3600 * 1000) {
      status = 'Due Soon';
    }

    const newSchedule: RecurringMaintenance = {
      id: generatedId,
      customerName,
      customerCompany,
      customerPhone,
      customerEmail,
      toolBrand,
      toolCategory,
      modelNumber,
      serialNumber: serialNumber || 'N/A',
      intervalMonths: Number(intervalMonths),
      lastServiceDate,
      nextDueDate,
      status,
      recommendedServiceScope,
      queuedReminders: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onAdd(newSchedule);
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 font-mono">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-white" />
            <h2 className="text-base font-bold text-white uppercase">Register Scheduled Tool Servicing</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs font-sans">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1 font-mono">Customer Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Apex Construction"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-mono">Mobile Phone (WhatsApp) *</label>
              <input
                type="text"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+1 (555) 234-5678"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1 font-mono">Tool Brand</label>
              <select
                value={toolBrand}
                onChange={(e) => setToolBrand(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none font-mono"
              >
                <option value="Bosch Professional">Bosch Professional</option>
                <option value="Makita">Makita</option>
                <option value="DeWalt">DeWalt</option>
                <option value="Hilti">Hilti</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-mono">Model Number *</label>
              <input
                type="text"
                required
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="GBH 11 DE"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1 font-mono">Serial Number SN</label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="SN-3611C36000"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-mono">Maintenance Interval</label>
              <select
                value={intervalMonths}
                onChange={(e) => setIntervalMonths(parseInt(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none"
              >
                <option value={3}>3 Months (Heavy Construction)</option>
                <option value={6}>6 Months (Standard Contractor)</option>
                <option value={12}>12 Months (Annual Safety Check)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1 font-mono">Recommended Service Scope</label>
            <input
              type="text"
              value={recommendedServiceScope}
              onChange={(e) => setRecommendedServiceScope(e.target.value)}
              placeholder="Carbon Brush & Gearbox Lubrication Check"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800 font-mono">
            <button type="button" onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white">
              Cancel
            </button>

            <button
              type="submit"
              className="px-5 py-2 font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl"
            >
              Register Schedule
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
