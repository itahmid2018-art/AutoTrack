import React, { useState, useEffect } from 'react';
import { JobCard, InventoryItem, BusinessSettings, CriticalQuestionnaire, MessageLog, JobStatus, RecurringMaintenance } from './types';
import { INITIAL_JOB_CARDS } from './data/initialJobCards';
import { INITIAL_INVENTORY } from './data/mockInventory';
import { INITIAL_RECURRING_MAINTENANCE } from './data/initialRecurringMaintenance';
import { TransactionalDb } from './utils/localStorageDb';

import { Header } from './components/Header';
import { BoschIntakeForm } from './components/BoschIntakeForm';
import { JobCardList } from './components/JobCardList';
import { JobCardDetail } from './components/JobCardDetail';
import { InventoryManager } from './components/InventoryManager';
import { MessagingCenter } from './components/MessagingCenter';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { TransitionView } from './components/TransitionView';
import { RecurringMaintenanceView } from './components/RecurringMaintenanceView';
import { NewJobModal } from './components/NewJobModal';
import { AddInventoryModal } from './components/AddInventoryModal';
import { PrintableJobCardModal } from './components/PrintableJobCardModal';
import { PdfViewModal } from './components/PdfViewModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<'intake' | 'jobs' | 'maintenance' | 'inventory' | 'messaging' | 'analytics' | 'transition'>('intake');
  
  // Core Persistent Transactional State
  const [jobCards, setJobCards] = useState<JobCard[]>(() => TransactionalDb.loadJobCards(INITIAL_JOB_CARDS));
  const [inventory, setInventory] = useState<InventoryItem[]>(() => TransactionalDb.loadInventory(INITIAL_INVENTORY));
  const [schedules, setSchedules] = useState<RecurringMaintenance[]>(INITIAL_RECURRING_MAINTENANCE);
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null);
  
  // Modals for PDF & Printing
  const [printableJob, setPrintableJob] = useState<JobCard | null>(null);
  const [pdfModalJob, setPdfModalJob] = useState<JobCard | null>(null);

  // Business Settings
  const [settings, setSettings] = useState<BusinessSettings>(() => TransactionalDb.loadSettings({
    centerName: 'BOSCH Authorised Service Center',
    address: 'Industrial Estate, Bay 4',
    phone: '+1 (555) 019-2831',
    email: 'service@boschtools.com',
    taxRate: 10.0,
    laborRate: 45.0,
    jobCardPrefix: 'BOSCH-2026-',
    currencySymbol: '$',
    WhatsAppTemplateIntake: 'Hi {{customer_name}}, your {{device}} has been received for service under Job Card {{job_id}}.',
    WhatsAppTemplateReady: 'Hi {{customer_name}}, your {{device}} is READY FOR PICKUP under Job Card {{job_id}}. Total: ${{total_amount}}.',
    WhatsAppTemplateEstimate: 'Hi {{customer_name}}, estimate for {{job_id}} is ${{total_amount}}. Reply YES to approve.',
    deductStockOn: 'InService',
    requireSignature: true,
  }));

  const [questionnaire, setQuestionnaire] = useState<CriticalQuestionnaire>({
    serviceType: 'Bosch Power Tools & Heavy Machinery',
    numberingFormat: 'BOSCH-2026-0001',
    messagingChannel: 'WhatsApp & SMS Direct',
    stockDeductionPolicy: 'InService',
    laborPricingModel: 'Hourly & Task Rate',
    signatureMandate: 'Yes',
    notes: 'Power tool service intake form, customer grievances, tool details & spare parts catalog.',
  });

  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState(false);
  const [isAddInventoryModalOpen, setIsAddInventoryModalOpen] = useState(false);

  // Persist Data on Changes
  useEffect(() => {
    TransactionalDb.saveJobCards(jobCards);
  }, [jobCards]);

  useEffect(() => {
    TransactionalDb.saveInventory(inventory);
  }, [inventory]);

  useEffect(() => {
    TransactionalDb.saveSettings(settings);
  }, [settings]);

  // Handlers
  const handleAddJobCard = (newJob: JobCard) => {
    const updated = [newJob, ...jobCards];
    setJobCards(updated);
    setSelectedJob(newJob);
    setActiveTab('jobs');
    setPdfModalJob(newJob);
  };

  const handleUpdateJobCard = (updatedJob: JobCard) => {
    setJobCards(jobCards.map(j => j.id === updatedJob.id ? updatedJob : j));
  };

  const handleQuickStatusChange = (jobId: string, newStatus: JobStatus) => {
    const updated = jobCards.map(j => {
      if (j.id === jobId) {
        return { ...j, status: newStatus, updatedAt: new Date().toISOString() };
      }
      return j;
    });
    setJobCards(updated);
  };

  const handleDeductInventoryStock = (partId: string, qty: number) => {
    setInventory(prev => prev.map(item => {
      if (item.id === partId) {
        return {
          ...item,
          stockQty: Math.max(0, item.stockQty - qty),
        };
      }
      return item;
    }));
  };

  const handleAddInventoryItem = (newItem: InventoryItem) => {
    setInventory([newItem, ...inventory]);
  };

  const handleLogMessageSent = (jobId: string, log: MessageLog) => {
    setJobCards(prev => prev.map(job => {
      if (job.id === jobId) {
        return {
          ...job,
          messageLogs: [log, ...job.messageLogs],
        };
      }
      return job;
    }));
  };

  const handleLogMessageFromPdf = (jobId: string, channel: 'WhatsApp' | 'SMS', text: string) => {
    const log: MessageLog = {
      id: `msg-pdf-${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      type: 'Intake',
      recipientPhone: jobCards.find(j => j.id === jobId)?.customerPhone || '',
      text,
      channel,
      status: 'Sent',
    };
    handleLogMessageSent(jobId, log);
  };

  const handleLogMaintenanceMessage = (scheduleId: string, log: MessageLog) => {
    setSchedules(prev => prev.map(s => {
      if (s.id === scheduleId) {
        return {
          ...s,
          queuedReminders: [log, ...s.queuedReminders],
        };
      }
      return s;
    }));
  };

  const handleCreateJobCardFromSchedule = (schedule: RecurringMaintenance) => {
    const generatedId = `${settings.jobCardPrefix}${(jobCards.length + 45).toString().padStart(4, '0')}`;
    const newJob: JobCard = {
      id: generatedId,
      customerName: schedule.customerName,
      customerCompany: schedule.customerCompany,
      customerPhone: schedule.customerPhone,
      customerEmail: schedule.customerEmail,
      tool: {
        brand: schedule.toolBrand,
        category: schedule.toolCategory,
        modelNumber: schedule.modelNumber,
        serialNumber: schedule.serialNumber,
        voltageRating: '230V AC',
        warrantyStatus: 'Bosch Heavy Duty 3-Year Extended',
        physicalCondition: 'Scheduled Preventive Maintenance Intake',
        accessoriesReceived: [],
      },
      serviceReq: {
        grievanceCategory: 'Routine Maintenance / Carbon Brush Check',
        detailedComplaint: `Scheduled ${schedule.intervalMonths}-Month Maintenance Overhaul. Scope: ${schedule.recommendedServiceScope}`,
        serviceType: 'Standard Overhaul',
        preApprovedLimit: 60.0,
      },
      intakeDate: new Date().toISOString().slice(0, 16).replace('T', ' '),
      promisedCompletion: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '),
      status: 'Intake',
      priority: 'Routine',
      technician: 'David Miller (Bosch Tech)',
      laborHours: 1.0,
      laborRate: settings.laborRate,
      discount: 0,
      taxRate: settings.taxRate,
      parts: [],
      totalAmount: settings.laborRate * (1 + settings.taxRate / 100),
      messageLogs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    handleAddJobCard(newJob);
  };

  const handleOpenWhatsAppForJob = (job: JobCard) => {
    setSelectedJob(job);
    setActiveTab('messaging');
  };

  const activeJobCount = jobCards.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled').length;
  const lowStockCount = inventory.filter(i => i.stockQty <= i.minStockThreshold).length;
  const dueMaintenanceCount = schedules.filter(s => s.status === 'Due Soon' || s.status === 'Overdue').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-white selection:text-zinc-950">
      
      {/* Monochrome Top Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'jobs') setSelectedJob(null);
        }}
        onOpenNewJobModal={() => setIsNewJobModalOpen(true)}
        activeJobCount={activeJobCount}
        lowStockCount={lowStockCount}
        dueMaintenanceCount={dueMaintenanceCount}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Active Job Card Detail View */}
        {selectedJob && activeTab === 'jobs' ? (
          <JobCardDetail
            job={selectedJob}
            inventory={inventory}
            onUpdateJob={handleUpdateJobCard}
            onClose={() => setSelectedJob(null)}
            onOpenWhatsApp={handleOpenWhatsAppForJob}
            onPrintJobCard={(jobToPrint) => setPrintableJob(jobToPrint)}
            deductStockOn={settings.deductStockOn}
            onDeductInventoryStock={handleDeductInventoryStock}
          />
        ) : (
          <>
            {activeTab === 'intake' && (
              <BoschIntakeForm
                onAddJob={handleAddJobCard}
                inventory={inventory}
                settings={settings}
                existingCount={jobCards.length}
                onOpenWhatsApp={handleOpenWhatsAppForJob}
              />
            )}

            {activeTab === 'jobs' && (
              <JobCardList
                jobCards={jobCards}
                onSelectJob={(job) => setSelectedJob(job)}
                onOpenNewJobModal={() => setIsNewJobModalOpen(true)}
                onQuickStatusChange={handleQuickStatusChange}
                onOpenWhatsApp={handleOpenWhatsAppForJob}
                onPrintJobCard={(jobToPrint) => setPrintableJob(jobToPrint)}
                onSendPdfToCustomer={(jobForPdf) => setPdfModalJob(jobForPdf)}
              />
            )}

            {activeTab === 'maintenance' && (
              <RecurringMaintenanceView
                schedules={schedules}
                onAddSchedule={(newSched) => setSchedules([newSched, ...schedules])}
                onUpdateSchedule={(upSched) => setSchedules(schedules.map(s => s.id === upSched.id ? upSched : s))}
                onLogMessageSent={handleLogMaintenanceMessage}
                onCreateJobCardFromSchedule={handleCreateJobCardFromSchedule}
              />
            )}

            {activeTab === 'inventory' && (
              <InventoryManager
                inventory={inventory}
                onUpdateInventory={(newInv) => setInventory(newInv)}
                onOpenAddItemModal={() => setIsAddInventoryModalOpen(true)}
                jobCards={jobCards}
                settings={settings}
              />
            )}

            {activeTab === 'messaging' && (
              <MessagingCenter
                jobCards={jobCards}
                selectedJob={selectedJob}
                onSelectJob={(job) => setSelectedJob(job)}
                settings={settings}
                onLogMessageSent={handleLogMessageSent}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsDashboard
                jobCards={jobCards}
                inventory={inventory}
              />
            )}

            {activeTab === 'transition' && (
              <TransitionView
                settings={settings}
                onUpdateSettings={(newSettings) => setSettings(newSettings)}
                questionnaire={questionnaire}
                onUpdateQuestionnaire={(newQ) => setQuestionnaire(newQ)}
                onProceedToJobs={() => setActiveTab('intake')}
              />
            )}
          </>
        )}

      </main>

      {/* Modals */}
      {pdfModalJob && (
        <PdfViewModal
          job={pdfModalJob}
          onClose={() => setPdfModalJob(null)}
          onLogMessageSent={handleLogMessageFromPdf}
        />
      )}

      {printableJob && (
        <PrintableJobCardModal
          job={printableJob}
          onClose={() => setPrintableJob(null)}
        />
      )}

      {isNewJobModalOpen && (
        <NewJobModal
          onClose={() => setIsNewJobModalOpen(false)}
          onAddJob={handleAddJobCard}
          settings={settings}
          existingCount={jobCards.length}
        />
      )}

      {isAddInventoryModalOpen && (
        <AddInventoryModal
          onClose={() => setIsAddInventoryModalOpen(false)}
          onAddItem={handleAddInventoryItem}
          existingCount={inventory.length}
        />
      )}

      {/* Monochrome Footer */}
      <footer className="border-t border-zinc-900 py-4 text-center text-xs text-zinc-500 font-mono no-print">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>BOSCH &amp; Vendor Power Tools Service Hub · Recurring Servicing &amp; Automated Message Queue</span>
          <button
            onClick={() => setActiveTab('transition')}
            className="text-zinc-400 hover:text-white underline font-semibold"
          >
            Setup Questions &amp; Business Rules
          </button>
        </div>
      </footer>

    </div>
  );
}
