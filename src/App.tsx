import React, { useState, useEffect, useRef } from 'react';
import { JobCard, InventoryItem, BusinessSettings, CriticalQuestionnaire, MessageLog, JobStatus, RecurringMaintenance, CustomField } from './types';
import { INITIAL_JOB_CARDS } from './data/initialJobCards';
import { INITIAL_INVENTORY } from './data/mockInventory';
import { INITIAL_RECURRING_MAINTENANCE } from './data/initialRecurringMaintenance';
import { INITIAL_CUSTOM_FIELDS } from './data/initialCustomFields';
import { TransactionalDb } from './utils/localStorageDb';
import { autoAdjudicateJobCard } from './utils/warrantyAdjudicator';
import { ensurePublicAccessToken } from './utils/customerPortalUrl';
import {
  InventoryNotification,
  buildInventoryNotification,
  isItemBelowThreshold,
  syncInventoryNotifications,
} from './utils/inventoryNotifications';

import { Header } from './components/Header';
import { BoschIntakeForm } from './components/BoschIntakeForm';
import { JobCardList } from './components/JobCardList';
import { KanbanBoard } from './components/KanbanBoard';
import { JobCardDetail } from './components/JobCardDetail';
import { InventoryManager } from './components/InventoryManager';
import { MessagingCenter } from './components/MessagingCenter';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { TechnicianTimeTracker } from './components/TechnicianTimeTracker';
import { TransitionView } from './components/TransitionView';
import { RecurringMaintenanceView } from './components/RecurringMaintenanceView';
import { AiDiagnosis } from './components/AiDiagnosis';
import { NewJobModal } from './components/NewJobModal';
import { AddInventoryModal } from './components/AddInventoryModal';
import { PrintableJobCardModal } from './components/PrintableJobCardModal';
import { PdfViewModal } from './components/PdfViewModal';
import { InventoryNotificationToast } from './components/InventoryNotificationToast';
import { CustomerView, sanitizeJobForCustomer, PublicJobStatusSummary } from './components/CustomerView';

const normalizeJobCard = (job: JobCard): JobCard => {
  const adjudicated = autoAdjudicateJobCard(job);
  const stageEnteredAt = adjudicated.stageEnteredAt || adjudicated.updatedAt || adjudicated.createdAt;
  const stageHistory = adjudicated.stageHistory && adjudicated.stageHistory.length > 0
    ? adjudicated.stageHistory
    : [{ status: adjudicated.status, enteredAt: stageEnteredAt }];
  const attachments = Array.isArray(adjudicated.attachments)
    ? adjudicated.attachments
    : [];
  const publicAccessToken = ensurePublicAccessToken(adjudicated);
  return {
    ...adjudicated,
    attachments,
    publicAccessToken,
    stageEnteredAt,
    stageHistory,
  };
};

export default function App() {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isLockedCustomerUrl = Boolean(
    urlParams && (urlParams.get('view') === 'customer' || urlParams.get('token'))
  );
  const initialCustomerQuery = urlParams?.get('token') || urlParams?.get('job') || '';

  const [isCustomerViewActive, setIsCustomerViewActive] = useState<boolean>(isLockedCustomerUrl);
  const [activeTab, setActiveTab] = useState<'intake' | 'jobs' | 'kanban' | 'maintenance' | 'inventory' | 'messaging' | 'analytics' | 'timetracking' | 'transition'>('intake');
  
  // Core Persistent Transactional State
  const [jobCards, setJobCards] = useState<JobCard[]>(() =>
    TransactionalDb.loadJobCards(INITIAL_JOB_CARDS).map(normalizeJobCard)
  );
  const [inventory, setInventory] = useState<InventoryItem[]>(() => TransactionalDb.loadInventory(INITIAL_INVENTORY));
  const [schedules, setSchedules] = useState<RecurringMaintenance[]>(INITIAL_RECURRING_MAINTENANCE);
  const [customFields, setCustomFields] = useState<CustomField[]>(() => TransactionalDb.loadCustomFields(INITIAL_CUSTOM_FIELDS));
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null);
  const [inventoryNotifications, setInventoryNotifications] = useState<InventoryNotification[]>(() =>
    syncInventoryNotifications(TransactionalDb.loadInventory(INITIAL_INVENTORY))
  );
  const [activeStockToasts, setActiveStockToasts] = useState<InventoryNotification[]>([]);
  const previousStockMapRef = useRef<Record<string, number>>(
    Object.fromEntries(inventory.map((item) => [item.id, item.stockQty]))
  );
  const [inventoryInitialFilterLow, setInventoryInitialFilterLow] = useState(false);

  // Modals for PDF, Printing & AI Diagnosis
  const [printableJob, setPrintableJob] = useState<JobCard | null>(null);
  const [pdfModalJob, setPdfModalJob] = useState<JobCard | null>(null);
  const [aiDiagnosisJob, setAiDiagnosisJob] = useState<JobCard | null>(null);

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

    const prevMap = previousStockMapRef.current;
    const newlyTriggered: InventoryNotification[] = [];

    inventory.forEach((item) => {
      const prevQty = prevMap[item.id];
      const belowNow = isItemBelowThreshold(item);
      if (belowNow) {
        const crossedThreshold = prevQty === undefined || prevQty >= item.minStockThreshold;
        const droppedFurther = prevQty !== undefined && item.stockQty < prevQty;
        if (crossedThreshold || droppedFurther) {
          newlyTriggered.push(buildInventoryNotification(item));
        }
      }
    });

    previousStockMapRef.current = Object.fromEntries(inventory.map((item) => [item.id, item.stockQty]));

    setInventoryNotifications((prevAlerts) => syncInventoryNotifications(inventory, prevAlerts));

    if (newlyTriggered.length > 0) {
      setActiveStockToasts((prev) => {
        const incomingIds = new Set(newlyTriggered.map((t) => t.id));
        return [...newlyTriggered, ...prev.filter((t) => !incomingIds.has(t.id))].slice(0, 5);
      });
    }
  }, [inventory]);

  useEffect(() => {
    TransactionalDb.saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    TransactionalDb.saveCustomFields(customFields);
  }, [customFields]);

  // Check and run automatic daily backup on startup
  useEffect(() => {
    if (settings.autoDailyBackupEnabled) {
      TransactionalDb.checkAndRunDailyAutoBackup(
        jobCards,
        inventory,
        settings,
        customFields,
        schedules,
        (newSettings) => setSettings(newSettings)
      );
    }
  }, []);

  // Handlers
  const handleAddJobCard = (newJob: JobCard) => {
    const normalized = normalizeJobCard({
      ...newJob,
      stageEnteredAt: newJob.stageEnteredAt || new Date().toISOString(),
    });
    const updated = [normalized, ...jobCards];
    setJobCards(updated);
    setSelectedJob(normalized);
    setActiveTab('jobs');
    setPdfModalJob(normalized);
  };

  const handleUpdateJobCard = (updatedJob: JobCard) => {
    const existing = jobCards.find(j => j.id === updatedJob.id);
    const nowIso = new Date().toISOString();
    let finalJob = updatedJob;

    if (existing && existing.status !== updatedJob.status) {
      const prevHistory = existing.stageHistory || [{ status: existing.status, enteredAt: existing.stageEnteredAt || existing.createdAt }];
      finalJob = {
        ...updatedJob,
        stageEnteredAt: nowIso,
        stageHistory: [...prevHistory, { status: updatedJob.status, enteredAt: nowIso }],
      };
    }

    finalJob = normalizeJobCard(finalJob);
    setJobCards(jobCards.map(j => j.id === finalJob.id ? finalJob : j));
    if (selectedJob && selectedJob.id === finalJob.id) {
      setSelectedJob(finalJob);
    }
  };

  const handleQuickStatusChange = (jobId: string, newStatus: JobStatus) => {
    const nowIso = new Date().toISOString();
    const updated = jobCards.map(j => {
      if (j.id === jobId) {
        if (j.status === newStatus) return j;
        const prevHistory = j.stageHistory || [{ status: j.status, enteredAt: j.stageEnteredAt || j.createdAt }];
        const nextAudit = [
          ...(j.auditLogs || []),
          {
            id: `aud-${Date.now()}`,
            timestamp: nowIso.slice(0, 16).replace('T', ' '),
            userName: j.technician || 'Workshop Operator',
            userRole: j.technician ? 'Technician' : 'Technician / Counter',
            action: 'STAGE_CHANGED',
            previousState: j.status,
            newState: `Status: ${newStatus}`,
          },
        ];
        return {
          ...j,
          status: newStatus,
          stageEnteredAt: nowIso,
          stageHistory: [...prevHistory, { status: newStatus, enteredAt: nowIso }],
          auditLogs: nextAudit,
          updatedAt: nowIso,
        };
      }
      return j;
    });
    setJobCards(updated);
    if (selectedJob && selectedJob.id === jobId) {
      const matched = updated.find(j => j.id === jobId);
      if (matched) setSelectedJob(matched);
    }
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

  const handleQuickReorderItem = (itemId: string, addQty: number) => {
    const today = new Date().toISOString().split('T')[0];
    setInventory((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              stockQty: item.stockQty + addQty,
              lastRestocked: today,
            }
          : item
      )
    );
    setActiveStockToasts((prev) => prev.filter((t) => t.itemId !== itemId));
  };

  const handleMarkNotificationRead = (notifId: string) => {
    setInventoryNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllNotificationsRead = () => {
    setInventoryNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleOpenInventoryAlerts = () => {
    setInventoryInitialFilterLow(true);
    setSelectedJob(null);
    setActiveTab('inventory');
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
    const nowIso = new Date().toISOString();
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
      intakeDate: nowIso.slice(0, 16).replace('T', ' '),
      promisedCompletion: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '),
      status: 'Intake',
      priority: 'Routine',
      technician: 'David Miller (Bosch Master Certified)',
      laborHours: 1.0,
      laborRate: settings.laborRate,
      discount: 0,
      taxRate: settings.taxRate,
      parts: [],
      operationalExpenses: [],
      totalAmount: settings.laborRate * (1 + settings.taxRate / 100),
      messageLogs: [],
      stageEnteredAt: nowIso,
      stageHistory: [{ status: 'Intake', enteredAt: nowIso }],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    handleAddJobCard(newJob);
  };

  const handleOpenWhatsAppForJob = (job: JobCard) => {
    setSelectedJob(job);
    setActiveTab('messaging');
  };

  const activeJobCount = jobCards.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled').length;
  const lowStockCount = inventory.filter(isItemBelowThreshold).length;
  const unreadInventoryCount = inventoryNotifications.filter((n) => !n.read).length;
  const dueMaintenanceCount = schedules.filter(s => s.status === 'Due Soon' || s.status === 'Overdue').length;

  const handleLookupCustomerJob = (query: string, phoneLast4?: string): PublicJobStatusSummary | null => {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const matchedByToken = jobCards.find(
      (j) => j.publicAccessToken && j.publicAccessToken.toLowerCase() === q
    );
    if (matchedByToken) {
      return sanitizeJobForCustomer(matchedByToken, true);
    }

    const matchedById = jobCards.find((j) => j.id.toLowerCase() === q);
    if (!matchedById) return null;

    const cleanLast4 = (phoneLast4 || '').replace(/\D/g, '').slice(-4);
    const jobPhoneLast4 = (matchedById.customerPhone || '').replace(/\D/g, '').slice(-4);

    if (cleanLast4) {
      if (cleanLast4 !== jobPhoneLast4) return null;
      return sanitizeJobForCustomer(matchedById, true);
    }

    return sanitizeJobForCustomer(matchedById, false);
  };

  if (isCustomerViewActive) {
    return (
      <CustomerView
        onLookupJob={handleLookupCustomerJob}
        initialQuery={initialCustomerQuery}
        sampleJobIds={jobCards.slice(0, 3).map((j) => j.id)}
        centerName={settings.centerName}
        centerPhone={settings.phone}
        onExitCustomerView={isLockedCustomerUrl ? undefined : () => setIsCustomerViewActive(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-white selection:text-zinc-950">
      
      {/* Monochrome Top Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'jobs' && tab !== 'kanban') setSelectedJob(null);
          if (tab !== 'inventory') setInventoryInitialFilterLow(false);
        }}
        onOpenNewJobModal={() => setIsNewJobModalOpen(true)}
        onOpenCustomerView={() => setIsCustomerViewActive(true)}
        activeJobCount={activeJobCount}
        lowStockCount={lowStockCount}
        dueMaintenanceCount={dueMaintenanceCount}
        jobCards={jobCards}
        inventory={inventory}
        onSelectJob={(job) => setSelectedJob(job)}
        inventoryNotifications={inventoryNotifications}
        unreadInventoryCount={unreadInventoryCount}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onQuickReorderItem={handleQuickReorderItem}
        onOpenInventoryAlerts={handleOpenInventoryAlerts}
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
                customFields={customFields}
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
                onOpenAiDiagnosis={(jobForAi) => setAiDiagnosisJob(jobForAi)}
              />
            )}

            {activeTab === 'kanban' && (
              <KanbanBoard
                jobCards={jobCards}
                onQuickStatusChange={handleQuickStatusChange}
                onUpdateJobCard={handleUpdateJobCard}
                onSelectJob={(job) => {
                  setSelectedJob(job);
                  setActiveTab('jobs');
                }}
                onPrintJobCard={(jobToPrint) => setPrintableJob(jobToPrint)}
                onSendPdfToCustomer={(jobForPdf) => setPdfModalJob(jobForPdf)}
                onOpenWhatsApp={handleOpenWhatsAppForJob}
                onOpenAiDiagnosis={(jobForAi) => setAiDiagnosisJob(jobForAi)}
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
                notifications={inventoryNotifications}
                onMarkNotificationRead={handleMarkNotificationRead}
                onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
                initialShowLowStockOnly={inventoryInitialFilterLow}
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
                onUpdateInventory={(newInv) => setInventory(newInv)}
              />
            )}

            {activeTab === 'timetracking' && (
              <TechnicianTimeTracker
                jobCards={jobCards}
                onUpdateJobCard={handleUpdateJobCard}
                onSelectJobCard={(job) => {
                  setSelectedJob(job);
                  setActiveTab('jobs');
                }}
              />
            )}

            {activeTab === 'transition' && (
              <TransitionView
                settings={settings}
                onUpdateSettings={(newSettings) => setSettings(newSettings)}
                questionnaire={questionnaire}
                onUpdateQuestionnaire={(newQ) => setQuestionnaire(newQ)}
                customFields={customFields}
                onUpdateCustomFields={(newFields) => setCustomFields(newFields)}
                jobCards={jobCards}
                inventory={inventory}
                schedules={schedules}
                onRestoreDatabase={(backupData) => {
                  if (backupData.jobCards) setJobCards(backupData.jobCards);
                  if (backupData.inventory) setInventory(backupData.inventory);
                  if (backupData.settings) setSettings(backupData.settings);
                  if (backupData.customFields) setCustomFields(backupData.customFields);
                  if (backupData.schedules) setSchedules(backupData.schedules);
                }}
                onProceedToJobs={() => setActiveTab('intake')}
              />
            )}
          </>
        )}

      </main>

      {/* Modals */}
      {aiDiagnosisJob && (
        <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-4xl w-full my-8">
            <AiDiagnosis
              jobCards={jobCards}
              selectedJobId={aiDiagnosisJob.id}
              inventory={inventory}
              onUpdateJobCard={(updatedJob) => {
                handleUpdateJobCard(updatedJob);
                setAiDiagnosisJob(updatedJob);
              }}
              onClose={() => setAiDiagnosisJob(null)}
            />
          </div>
        </div>
      )}

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

      <InventoryNotificationToast
        toasts={activeStockToasts}
        onDismiss={(id) => setActiveStockToasts((prev) => prev.filter((t) => t.id !== id))}
        onQuickReorder={handleQuickReorderItem}
        onOpenInventoryAlerts={handleOpenInventoryAlerts}
      />

      {/* Monochrome Footer */}
      <footer className="border-t border-zinc-900 py-4 text-center text-xs text-zinc-500 font-mono no-print">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>BOSCH &amp; Vendor Power Tools Service Hub · Technician Efficiency &amp; Kanban Workflow</span>
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
