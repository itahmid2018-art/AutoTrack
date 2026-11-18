import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { JobCard, InventoryItem, BusinessSettings, CriticalQuestionnaire, MessageLog, JobStatus, RecurringMaintenance, CustomField, CustomerFeedback } from './types';
import { INITIAL_JOB_CARDS } from './data/initialJobCards';
import { INITIAL_INVENTORY } from './data/mockInventory';
import { INITIAL_RECURRING_MAINTENANCE } from './data/initialRecurringMaintenance';
import { INITIAL_CUSTOM_FIELDS } from './data/initialCustomFields';
import { TransactionalDb } from './utils/localStorageDb';
import { DEFAULT_ANALYTICS_METRICS } from './utils/analyticsConfig';
import { autoAdjudicateJobCard } from './utils/warrantyAdjudicator';
import { buildCustomerFeedbackUrl, ensurePublicAccessToken } from './utils/customerPortalUrl';
import { nextJobCardId } from './utils/jobId';
import { applyStockLifecycleTransition, InventoryDelta } from './utils/stockDeduction';
import { resolveApiUrl } from './utils/apiBase';
import {
  readOfflineCachedAllRecords,
  syncRecordsToServiceWorker,
} from './utils/offlineCache';
import {
  auth,
  signInWithGoogle,
  signOutWorkshopUser,
  testFirestoreConnection,
} from './lib/firebase';
import {
  seedWorkshopIfEmpty,
  subscribeWorkshopData,
  upsertCustomFieldsInFirestore,
  upsertInventoryItemsInFirestore,
  upsertJobCardInFirestore,
  upsertScheduleInFirestore,
  upsertSchedulesBatchInFirestore,
  upsertSettingsInFirestore,
  upsertWorkshopUser,
} from './utils/firestoreSync';
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
import { FeedbackSmsToast, FeedbackSmsDispatchNotice } from './components/FeedbackSmsToast';
import { CustomerView, sanitizeJobForCustomer, CustomerLookupResult } from './components/CustomerView';
import { SerialBarcodeScannerModal } from './components/SerialBarcodeScannerModal';
import { GlobalScanResultModal } from './components/GlobalScanResultModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  BarcodeScanResult,
  findMatchingInventoryItem,
  findMatchingToolHistory,
} from './utils/barcodeSerialParser';

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
  const initialShowFeedbackParam = Boolean(urlParams && urlParams.get('feedback') === '1');

  const [isCustomerViewActive, setIsCustomerViewActive] = useState<boolean>(isLockedCustomerUrl);
  const [customerPortalTarget, setCustomerPortalTarget] = useState<{ query: string; showFeedback: boolean } | null>(null);
  const [feedbackSmsNotices, setFeedbackSmsNotices] = useState<FeedbackSmsDispatchNotice[]>([]);
  const [activeTab, setActiveTab] = useState<'intake' | 'jobs' | 'kanban' | 'maintenance' | 'inventory' | 'messaging' | 'analytics' | 'timetracking' | 'transition'>('intake');
  const [transitionSubTab, setTransitionSubTab] = useState<'fields' | 'backups' | 'rules' | 'manual'>('backups');
  
  // Core Persistent Transactional State
  const [jobCards, setJobCards] = useState<JobCard[]>(() =>
    TransactionalDb.loadJobCards(INITIAL_JOB_CARDS).map(normalizeJobCard)
  );
  const [inventory, setInventory] = useState<InventoryItem[]>(() => TransactionalDb.loadInventory(INITIAL_INVENTORY));
  const [schedules, setSchedules] = useState<RecurringMaintenance[]>(() =>
    TransactionalDb.loadRecurringMaintenance(INITIAL_RECURRING_MAINTENANCE)
  );
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
  const [isGlobalScannerOpen, setIsGlobalScannerOpen] = useState(false);
  const [globalScanResult, setGlobalScanResult] = useState<BarcodeScanResult | null>(null);
  const [intakeScanPrefill, setIntakeScanPrefill] = useState<{ result: BarcodeScanResult; nonce: number } | null>(null);
  const [inventoryExternalLookup, setInventoryExternalLookup] = useState<{ code: string; nonce: number } | null>(null);

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
    autoSendFeedbackSms: true,
    analyticsMetrics: DEFAULT_ANALYTICS_METRICS,
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
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const initialSeedSnapshotRef = useRef({
    jobCards,
    inventory,
    schedules,
    settings,
    customFields,
  });
  initialSeedSnapshotRef.current = {
    jobCards,
    inventory,
    schedules,
    settings,
    customFields,
  };

  // Persist Data on Changes (localStorage + Service Worker Cache Storage for offline viewing)
  useEffect(() => {
    TransactionalDb.saveJobCards(jobCards);
    void syncRecordsToServiceWorker({ jobCards });
  }, [jobCards]);

  useEffect(() => {
    TransactionalDb.saveInventory(inventory);
    void syncRecordsToServiceWorker({ inventory });

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
    void syncRecordsToServiceWorker({ settings });
  }, [settings]);

  useEffect(() => {
    TransactionalDb.saveCustomFields(customFields);
  }, [customFields]);

  useEffect(() => {
    TransactionalDb.saveRecurringMaintenance(schedules);
    void syncRecordsToServiceWorker({ schedules });
  }, [schedules]);

  // Hydrate cached workshop records from Service Worker Cache Storage when localStorage is missing offline
  useEffect(() => {
    const hasLocalJobs = Boolean(localStorage.getItem('autotrack_db_job_cards_v1'));
    const hasLocalInv = Boolean(localStorage.getItem('autotrack_db_inventory_v1'));
    const hasLocalSched = Boolean(localStorage.getItem('autotrack_db_recurring_maintenance_v1'));
    if (!hasLocalJobs || !hasLocalInv || !hasLocalSched) {
      void readOfflineCachedAllRecords().then((cached) => {
        if (!hasLocalJobs && cached.jobCards && cached.jobCards.length > 0) {
          setJobCards(cached.jobCards.map(normalizeJobCard));
        }
        if (!hasLocalInv && cached.inventory && cached.inventory.length > 0) {
          setInventory(cached.inventory);
        }
        if (!hasLocalSched && cached.schedules && cached.schedules.length > 0) {
          setSchedules(cached.schedules);
        }
        if (!hasLocalJobs && cached.settings) {
          setSettings((prev) => ({ ...prev, ...cached.settings }));
        }
      });
    }
  }, []);

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

  // Multi-client real-time sync subscription for verified operators
  useEffect(() => {
    let activeUnsub: (() => void) | null = null;
    let cancelled = false;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (activeUnsub) {
        activeUnsub();
        activeUnsub = null;
      }
      setAuthUser(user);
      setAuthLoading(false);
      setAuthError(null);

      if (!user || !user.emailVerified) {
        return;
      }

      try {
        await testFirestoreConnection();
        await upsertWorkshopUser(user);
        const snap = initialSeedSnapshotRef.current;
        await seedWorkshopIfEmpty(user, [user.uid], snap);
        if (cancelled) return;

        activeUnsub = subscribeWorkshopData(user, {
          onJobCards: (remoteJobs) => {
            const normalized = remoteJobs.map(normalizeJobCard);
            setJobCards(normalized);
            setSelectedJob((curr) =>
              curr ? normalized.find((j) => j.id === curr.id) || curr : null
            );
          },
          onInventoryItems: (remoteItems) => {
            setInventory((prev) => {
              const remoteById = new Map(remoteItems.map((item) => [item.id, item]));
              const prevIds = new Set(prev.map((item) => item.id));
              const extraRemote = remoteItems.filter((item) => !prevIds.has(item.id));
              const mergedExisting = prev.map((item) => remoteById.get(item.id) || item);
              return [...extraRemote, ...mergedExisting];
            });
          },
          onSchedules: (remoteSchedules) => {
            setSchedules(remoteSchedules);
          },
          onSettings: (remoteSettings) => {
            setSettings((prev) => ({ ...prev, ...remoteSettings }));
          },
          onCustomFields: (remoteFields) => {
            setCustomFields(remoteFields);
          },
          onError: (err) => {
            console.warn('Live sync notice:', err.message);
          },
        });
      } catch (err) {
        console.warn('Live sync initialization warning:', err);
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
      if (activeUnsub) activeUnsub();
    };
  }, []);

  const handleOperatorSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in cancelled or blocked.');
    }
  };

  const handleOperatorSignOut = async () => {
    setAuthError(null);
    try {
      await signOutWorkshopUser();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to sign out.');
    }
  };

  const syncJobToCloud = (job: JobCard) => {
    if (!authUser?.emailVerified) return;
    void upsertJobCardInFirestore(job, authUser).catch((err) =>
      console.warn('Job card sync failed:', err)
    );
  };

  const syncInventoryDeltaToCloud = (nextInventory: InventoryItem[]) => {
    if (!authUser?.emailVerified) return;
    const prevById = new Map(inventory.map((i) => [i.id, i]));
    const changed = nextInventory.filter((item) => {
      const prevItem = prevById.get(item.id);
      if (!prevItem) return true;
      return (
        prevItem.stockQty !== item.stockQty ||
        prevItem.unitPrice !== item.unitPrice ||
        prevItem.costPrice !== item.costPrice ||
        prevItem.minStockThreshold !== item.minStockThreshold ||
        prevItem.name !== item.name ||
        prevItem.sku !== item.sku ||
        prevItem.barcode !== item.barcode ||
        prevItem.binLocation !== item.binLocation ||
        prevItem.lastRestocked !== item.lastRestocked
      );
    });
    if (changed.length > 0) {
      void upsertInventoryItemsInFirestore(changed, authUser).catch((err) =>
        console.warn('Inventory sync failed:', err)
      );
    }
  };

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
    syncJobToCloud(normalized);
  };

  const triggerFeedbackSmsForJob = (
    job: JobCard,
    options?: { forceResend?: boolean }
  ) => {
    const forceResend = Boolean(options?.forceResend);
    if (!forceResend) {
      if (settings.autoSendFeedbackSms === false) return;
      if (job.feedbackSmsSentAt) return;
      if (job.messageLogs?.some((m) => m.type === 'Feedback')) return;
    }

    const normalizedJob = normalizeJobCard(job);
    const nowIso = new Date().toISOString();
    const feedbackUrl = buildCustomerFeedbackUrl(normalizedJob);
    const smsText = `Hi ${normalizedJob.customerName || 'Client'}, your ${normalizedJob.tool.brand} ${normalizedJob.tool.modelNumber} (${normalizedJob.id}) service is complete. Rate our work & leave feedback: ${feedbackUrl}`;
    const fallbackSmsHref = `sms:${(normalizedJob.customerPhone || '').replace(/[^+\d]/g, '')}?body=${encodeURIComponent(smsText)}`;

    // Optimistically stamp feedbackSmsSentAt so rapid consecutive status writes do not double-fire SMS
    setJobCards((prev) =>
      prev.map((j) =>
        j.id === normalizedJob.id ? { ...j, feedbackSmsSentAt: nowIso, updatedAt: nowIso } : j
      )
    );
    setSelectedJob((curr) =>
      curr && curr.id === normalizedJob.id
        ? { ...curr, feedbackSmsSentAt: nowIso, updatedAt: nowIso }
        : curr
    );

    void (async () => {
      let sentViaTwilio = false;
      let sid: string | undefined;
      let providerLabel = 'Workshop SMS Queue';

      try {
        const res = await fetch(resolveApiUrl('/api/messaging/send-sms'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: normalizedJob.customerPhone,
            message: smsText,
            jobId: normalizedJob.id,
          }),
        });
        const data = await res.json().catch(() => ({}));
        sentViaTwilio = Boolean(res.ok && data?.success);
        sid = typeof data?.sid === 'string' ? data.sid : undefined;
        providerLabel = sentViaTwilio
          ? 'Twilio SMS Dispatch'
          : data?.provider || 'Simulated / Native SMS Relay';
      } catch {
        providerLabel = 'Offline / Native SMS Relay';
      }

      const logTimestamp = new Date().toLocaleString();
      const feedbackLog: MessageLog = {
        id: `msg-fb-${Date.now()}`,
        timestamp: logTimestamp,
        type: 'Feedback',
        recipientPhone: normalizedJob.customerPhone,
        text: smsText,
        channel: 'SMS',
        status: sentViaTwilio ? 'Sent' : 'Pending',
      };

      let updatedForCloud: JobCard | null = null;
      setJobCards((prev) =>
        prev.map((j) => {
          if (j.id !== normalizedJob.id) return j;
          updatedForCloud = {
            ...j,
            feedbackSmsSentAt: j.feedbackSmsSentAt || nowIso,
            messageLogs: [feedbackLog, ...(j.messageLogs || [])],
            updatedAt: new Date().toISOString(),
          };
          return updatedForCloud;
        })
      );
      setSelectedJob((curr) => {
        if (!curr || curr.id !== normalizedJob.id) return curr;
        return {
          ...curr,
          feedbackSmsSentAt: curr.feedbackSmsSentAt || nowIso,
          messageLogs: [feedbackLog, ...(curr.messageLogs || [])],
          updatedAt: new Date().toISOString(),
        };
      });

      if (updatedForCloud) {
        syncJobToCloud(updatedForCloud);
      }

      const noticeId = `fb-sms-${normalizedJob.id}-${Date.now()}`;
      setFeedbackSmsNotices((prev) =>
        [
          {
            id: noticeId,
            jobId: normalizedJob.id,
            customerName: normalizedJob.customerName,
            customerPhone: normalizedJob.customerPhone,
            feedbackUrl,
            smsMessage: smsText,
            fallbackSmsHref,
            sentViaTwilio,
            providerLabel,
            sid,
          },
          ...prev.filter((n) => n.jobId !== normalizedJob.id),
        ].slice(0, 3)
      );
    })();
  };

  const openCustomerSurvey = (jobOrId: JobCard | string) => {
    const matchedJob =
      typeof jobOrId === 'string'
        ? jobCards.find((j) => j.id === jobOrId)
        : jobOrId;
    const targetQuery = matchedJob
      ? ensurePublicAccessToken(matchedJob) || matchedJob.id
      : String(jobOrId);
    setCustomerPortalTarget({ query: targetQuery, showFeedback: true });
    setIsCustomerViewActive(true);
  };

  const handleSubmitCustomerFeedback = (jobId: string, feedback: CustomerFeedback) => {
    const nowIso = new Date().toISOString();
    const timestampLabel = nowIso.slice(0, 16).replace('T', ' ');
    let updatedForCloud: JobCard | null = null;

    setJobCards((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        const auditEntry = {
          id: `aud-fb-${Date.now()}`,
          timestamp: timestampLabel,
          userName: feedback.customerName || j.customerName || 'Client Portal',
          userRole: 'Client Feedback Survey',
          action: 'CUSTOMER_FEEDBACK_SUBMITTED',
          previousState: j.customerFeedback ? `${j.customerFeedback.rating}/5 Stars` : 'No Rating Recorded',
          newState: `${feedback.rating}/5 Stars${feedback.comment ? ` — ${feedback.comment.slice(0, 60)}` : ''}`,
        };
        updatedForCloud = normalizeJobCard({
          ...j,
          customerFeedback: feedback,
          auditLogs: [...(j.auditLogs || []), auditEntry],
          updatedAt: nowIso,
        });
        return updatedForCloud;
      })
    );

    setSelectedJob((curr) => {
      if (!curr || curr.id !== jobId) return curr;
      return updatedForCloud || { ...curr, customerFeedback: feedback, updatedAt: nowIso };
    });

    if (updatedForCloud) {
      syncJobToCloud(updatedForCloud);
    }
  };

  const handleUpdateJobCard = (updatedJob: JobCard) => {
    const existing = jobCards.find(j => j.id === updatedJob.id);
    const transitionedToCompleted = Boolean(
      existing && existing.status !== 'Completed' && updatedJob.status === 'Completed'
    );
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
    syncJobToCloud(finalJob);

    if (transitionedToCompleted) {
      triggerFeedbackSmsForJob(finalJob);
    }
  };

  const handleQuickStatusChange = (jobId: string, newStatus: JobStatus) => {
    const existingBefore = jobCards.find(j => j.id === jobId);
    const transitionedToCompleted = Boolean(
      existingBefore && existingBefore.status !== 'Completed' && newStatus === 'Completed'
    );
    const nowIso = new Date().toISOString();
    let changedJob: JobCard | null = null;
    let pendingDeltas: InventoryDelta[] = [];
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
        const draftJob: JobCard = {
          ...j,
          status: newStatus,
          stageEnteredAt: nowIso,
          stageHistory: [...prevHistory, { status: newStatus, enteredAt: nowIso }],
          auditLogs: nextAudit,
          updatedAt: nowIso,
        };
        const stockResult = applyStockLifecycleTransition(draftJob, newStatus, settings.deductStockOn, {
          actorName: j.technician || 'Workshop Operator',
          actorRole: j.technician ? 'Technician' : 'Technician / Counter',
          nowIso,
        });
        pendingDeltas = stockResult.inventoryDeltas;
        changedJob = normalizeJobCard(stockResult.updatedJob);
        return changedJob;
      }
      return j;
    });
    if (pendingDeltas.length > 0) {
      handleApplyInventoryDeltas(pendingDeltas);
    }
    setJobCards(updated);
    if (selectedJob && selectedJob.id === jobId) {
      const matched = updated.find(j => j.id === jobId);
      if (matched) setSelectedJob(matched);
    }
    if (changedJob) {
      syncJobToCloud(changedJob);
      if (transitionedToCompleted) {
        triggerFeedbackSmsForJob(changedJob);
      }
    }
  };

  const handleBulkStatusChange = (jobIds: string[], newStatus: JobStatus) => {
    const idSet = new Set(jobIds);
    if (idSet.size === 0) return;

    const nowIso = new Date().toISOString();
    const changedJobs: JobCard[] = [];
    const completedTransitions: JobCard[] = [];
    const pendingDeltas: InventoryDelta[] = [];

    const updated = jobCards.map((j, idx) => {
      if (!idSet.has(j.id) || j.status === newStatus) {
        return j;
      }

      const wasCompleted = j.status === 'Completed';
      const prevHistory = j.stageHistory || [{ status: j.status, enteredAt: j.stageEnteredAt || j.createdAt }];
      const nextAudit = [
        ...(j.auditLogs || []),
        {
          id: `aud-${Date.now()}-${idx}`,
          timestamp: nowIso.slice(0, 16).replace('T', ' '),
          userName: j.technician || 'Workshop Operator',
          userRole: j.technician ? 'Technician' : 'Technician / Counter',
          action: 'STAGE_CHANGED',
          previousState: j.status,
          newState: `Bulk Status: ${newStatus}`,
        },
      ];
      const draftJob: JobCard = {
        ...j,
        status: newStatus,
        stageEnteredAt: nowIso,
        stageHistory: [...prevHistory, { status: newStatus, enteredAt: nowIso }],
        auditLogs: nextAudit,
        updatedAt: nowIso,
      };
      const stockResult = applyStockLifecycleTransition(draftJob, newStatus, settings.deductStockOn, {
        actorName: j.technician || 'Workshop Operator',
        actorRole: j.technician ? 'Technician' : 'Technician / Counter',
        nowIso,
      });
      if (stockResult.inventoryDeltas.length > 0) {
        pendingDeltas.push(...stockResult.inventoryDeltas);
      }
      const normalizedChanged = normalizeJobCard(stockResult.updatedJob);
      changedJobs.push(normalizedChanged);
      if (!wasCompleted && newStatus === 'Completed') {
        completedTransitions.push(normalizedChanged);
      }
      return normalizedChanged;
    });

    if (changedJobs.length === 0) return;

    if (pendingDeltas.length > 0) {
      handleApplyInventoryDeltas(pendingDeltas);
    }

    setJobCards(updated);
    if (selectedJob && idSet.has(selectedJob.id)) {
      const matched = updated.find((j) => j.id === selectedJob.id);
      if (matched) setSelectedJob(matched);
    }

    changedJobs.forEach((job) => {
      syncJobToCloud(job);
    });
    completedTransitions.forEach((job) => {
      triggerFeedbackSmsForJob(job);
    });
  };

  const handleApplyInventoryDeltas = (deltas: InventoryDelta[]) => {
    if (!deltas || deltas.length === 0) return;
    const deltaByPart = new Map<string, number>();
    for (const d of deltas) {
      if (!d.partId || !Number.isFinite(d.deltaQty) || d.deltaQty === 0) continue;
      deltaByPart.set(d.partId, (deltaByPart.get(d.partId) || 0) + d.deltaQty);
    }
    if (deltaByPart.size === 0) return;

    const changedItems: InventoryItem[] = [];
    setInventory((prev) =>
      prev.map((item) => {
        const delta = deltaByPart.get(item.id);
        if (!delta) return item;
        const nextItem: InventoryItem = {
          ...item,
          stockQty: Math.max(0, item.stockQty + delta),
        };
        changedItems.push(nextItem);
        return nextItem;
      })
    );
    if (changedItems.length > 0 && authUser?.emailVerified) {
      void upsertInventoryItemsInFirestore(changedItems, authUser).catch((err) =>
        console.warn('Inventory stock adjustment sync failed:', err)
      );
    }
  };

  const handleDeductInventoryStock = (partId: string, qty: number) => {
    handleApplyInventoryDeltas([{ partId, deltaQty: -Math.abs(qty) }]);
  };

  const handleAddInventoryItem = (newItem: InventoryItem) => {
    setInventory([newItem, ...inventory]);
    if (authUser?.emailVerified) {
      void upsertInventoryItemsInFirestore([newItem], authUser).catch((err) =>
        console.warn('New inventory item sync failed:', err)
      );
    }
  };

  const handleQuickReorderItem = (itemId: string, addQty: number) => {
    const today = new Date().toISOString().split('T')[0];
    let changedItem: InventoryItem | null = null;
    setInventory((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          changedItem = {
            ...item,
            stockQty: item.stockQty + addQty,
            lastRestocked: today,
          };
          return changedItem;
        }
        return item;
      })
    );
    setActiveStockToasts((prev) => prev.filter((t) => t.itemId !== itemId));
    if (changedItem && authUser?.emailVerified) {
      void upsertInventoryItemsInFirestore([changedItem], authUser).catch((err) =>
        console.warn('Reorder sync failed:', err)
      );
    }
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
    let changedJob: JobCard | null = null;
    setJobCards(prev => prev.map(job => {
      if (job.id === jobId) {
        changedJob = {
          ...job,
          messageLogs: [log, ...job.messageLogs],
          updatedAt: new Date().toISOString(),
        };
        return changedJob;
      }
      return job;
    }));
    if (changedJob) {
      syncJobToCloud(changedJob);
    }
  };

  const handleLogMessageFromPdf = (jobId: string, channel: 'WhatsApp' | 'SMS', text: string) => {
    const log: MessageLog = {
      id: `msg-pdf-${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      type: 'Intake',
      recipientPhone: jobCards.find(j => j.id === jobId)?.customerPhone || '',
      text,
      channel,
      status: 'Pending',
    };
    handleLogMessageSent(jobId, log);
  };

  const handleLogMaintenanceMessage = (scheduleId: string, log: MessageLog) => {
    let changedSchedule: RecurringMaintenance | null = null;
    setSchedules(prev => prev.map(s => {
      if (s.id === scheduleId) {
        changedSchedule = {
          ...s,
          queuedReminders: [log, ...s.queuedReminders],
          updatedAt: new Date().toISOString(),
        };
        return changedSchedule;
      }
      return s;
    }));
    if (changedSchedule && authUser?.emailVerified) {
      void upsertScheduleInFirestore(changedSchedule, authUser).catch((err) =>
        console.warn('Schedule log sync failed:', err)
      );
    }
  };

  const handleCreateJobCardFromSchedule = (schedule: RecurringMaintenance) => {
    const generatedId = nextJobCardId(jobCards, settings.jobCardPrefix);
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

  const handleLookupCustomerJob = (query: string, phoneLast4?: string): CustomerLookupResult => {
    const q = query.trim().toLowerCase();
    if (!q) return { status: 'not-found' };

    const matchedByToken = jobCards.find(
      (j) => j.publicAccessToken && j.publicAccessToken.toLowerCase() === q
    );
    if (matchedByToken) {
      return {
        status: 'found',
        summary: sanitizeJobForCustomer(matchedByToken, true),
      };
    }

    const matchedById = jobCards.find((j) => j.id.toLowerCase() === q);
    if (!matchedById) return { status: 'not-found' };

    const cleanLast4 = (phoneLast4 || '').replace(/\D/g, '').slice(-4);
    const jobPhoneLast4 = (matchedById.customerPhone || '').replace(/\D/g, '').slice(-4);

    if (!cleanLast4) {
      return { status: 'needs-verification', jobId: matchedById.id };
    }
    if (cleanLast4 !== jobPhoneLast4) {
      return { status: 'invalid-phone', jobId: matchedById.id };
    }

    return {
      status: 'found',
      summary: sanitizeJobForCustomer(matchedById, true),
    };
  };

  if (isCustomerViewActive) {
    return (
      <CustomerView
        onLookupJob={handleLookupCustomerJob}
        initialQuery={customerPortalTarget?.query ?? initialCustomerQuery}
        initialShowFeedback={customerPortalTarget?.showFeedback ?? initialShowFeedbackParam}
        sampleJobIds={jobCards.slice(0, 3).map((j) => j.id)}
        centerName={settings.centerName}
        centerPhone={settings.phone}
        onSubmitFeedback={handleSubmitCustomerFeedback}
        onExitCustomerView={
          isLockedCustomerUrl
            ? undefined
            : () => {
                setIsCustomerViewActive(false);
                setCustomerPortalTarget(null);
              }
        }
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
        onOpenGlobalScanner={() => setIsGlobalScannerOpen(true)}
        authUser={authUser}
        authLoading={authLoading}
        onSignIn={handleOperatorSignIn}
        onSignOut={handleOperatorSignOut}
      />

      {authError && (
        <div className="bg-rose-950/80 border-b border-rose-800 px-4 py-2 text-xs font-mono text-rose-200 flex items-center justify-between gap-3">
          <span>Sign-in notice: {authError}</span>
          <button
            type="button"
            onClick={() => setAuthError(null)}
            className="text-rose-300 hover:text-white font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Active Job Card Detail View */}
        {selectedJob && activeTab === 'jobs' ? (
          <JobCardDetail
            job={selectedJob}
            inventory={inventory}
            settings={settings}
            customFields={customFields}
            onUpdateJob={handleUpdateJobCard}
            onClose={() => setSelectedJob(null)}
            onOpenWhatsApp={handleOpenWhatsAppForJob}
            onPrintJobCard={(jobToPrint) => setPrintableJob(jobToPrint)}
            deductStockOn={settings.deductStockOn}
            onDeductInventoryStock={handleDeductInventoryStock}
            onApplyInventoryDeltas={handleApplyInventoryDeltas}
            onOpenCustomerFeedback={(j) => openCustomerSurvey(j)}
            onSendFeedbackSms={(j) => triggerFeedbackSmsForJob(j, { forceResend: true })}
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
                jobCards={jobCards}
                schedules={schedules}
                externalScanPrefill={intakeScanPrefill}
                onSelectExistingJob={(job) => {
                  setSelectedJob(job);
                  setActiveTab('jobs');
                }}
              />
            )}

            {activeTab === 'jobs' && (
              <JobCardList
                jobCards={jobCards}
                onSelectJob={(job) => setSelectedJob(job)}
                onOpenNewJobModal={() => setIsNewJobModalOpen(true)}
                onQuickStatusChange={handleQuickStatusChange}
                onBulkStatusChange={handleBulkStatusChange}
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
                onAddSchedule={(newSched) => {
                  setSchedules((prev) => [newSched, ...prev]);
                  if (authUser?.emailVerified) {
                    void upsertScheduleInFirestore(newSched, authUser).catch((err) =>
                      console.warn('Schedule create sync failed:', err)
                    );
                  }
                }}
                onAddSchedules={(newScheds) => {
                  setSchedules((prev) => [...newScheds, ...prev]);
                  if (authUser?.emailVerified) {
                    void upsertSchedulesBatchInFirestore(newScheds, authUser).catch((err) =>
                      console.warn('Schedule batch sync failed:', err)
                    );
                  }
                }}
                onUpdateSchedule={(upSched) => {
                  setSchedules((prev) => prev.map((s) => (s.id === upSched.id ? upSched : s)));
                  if (authUser?.emailVerified) {
                    void upsertScheduleInFirestore(upSched, authUser).catch((err) =>
                      console.warn('Schedule update sync failed:', err)
                    );
                  }
                }}
                onLogMessageSent={handleLogMaintenanceMessage}
                onCreateJobCardFromSchedule={handleCreateJobCardFromSchedule}
              />
            )}

            {activeTab === 'inventory' && (
              <InventoryManager
                inventory={inventory}
                onUpdateInventory={(newInv) => {
                  setInventory(newInv);
                  syncInventoryDeltaToCloud(newInv);
                }}
                onOpenAddItemModal={() => setIsAddInventoryModalOpen(true)}
                jobCards={jobCards}
                schedules={schedules}
                settings={settings}
                customFields={customFields}
                notifications={inventoryNotifications}
                onMarkNotificationRead={handleMarkNotificationRead}
                onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
                initialShowLowStockOnly={inventoryInitialFilterLow}
                externalLookupCode={inventoryExternalLookup}
                onSelectJobCard={(job) => {
                  setSelectedJob(job);
                  setActiveTab('jobs');
                }}
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
                onUpdateInventory={(newInv) => {
                  setInventory(newInv);
                  syncInventoryDeltaToCloud(newInv);
                }}
                settings={settings}
                schedules={schedules}
                onOpenAnalyticsSettings={() => {
                  setTransitionSubTab('rules');
                  setActiveTab('transition');
                }}
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
                onUpdateSettings={(newSettings) => {
                  setSettings(newSettings);
                  if (authUser?.emailVerified) {
                    void upsertSettingsInFirestore(newSettings, authUser).catch((err) =>
                      console.warn('Settings sync failed:', err)
                    );
                  }
                }}
                questionnaire={questionnaire}
                onUpdateQuestionnaire={(newQ) => setQuestionnaire(newQ)}
                customFields={customFields}
                onUpdateCustomFields={(newFields) => {
                  setCustomFields(newFields);
                  if (authUser?.emailVerified) {
                    void upsertCustomFieldsInFirestore(newFields, authUser).catch((err) =>
                      console.warn('Custom fields sync failed:', err)
                    );
                  }
                }}
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
                initialSubTab={transitionSubTab}
                onOpenAnalytics={() => setActiveTab('analytics')}
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
          settings={settings}
          customFields={customFields}
          onClose={() => setPdfModalJob(null)}
          onLogMessageSent={handleLogMessageFromPdf}
        />
      )}

      {printableJob && (
        <PrintableJobCardModal
          job={printableJob}
          settings={settings}
          onClose={() => setPrintableJob(null)}
        />
      )}

      {isNewJobModalOpen && (
        <NewJobModal
          onClose={() => setIsNewJobModalOpen(false)}
          onAddJob={handleAddJobCard}
          settings={settings}
          existingCount={jobCards.length}
          inventory={inventory}
          jobCards={jobCards}
        />
      )}

      {isAddInventoryModalOpen && (
        <AddInventoryModal
          onClose={() => setIsAddInventoryModalOpen(false)}
          onAddItem={handleAddInventoryItem}
          existingCount={inventory.length}
        />
      )}

      {isGlobalScannerOpen && (
        <SerialBarcodeScannerModal
          title="Universal Barcode & QR Code Scanner"
          subtitle="Scan a tool serial barcode, spare part SKU QR, or job card QR to look up or prefill"
          prioritizeQr
          onDetected={(result) => {
            setIsGlobalScannerOpen(false);
            setGlobalScanResult(result);
          }}
          onClose={() => setIsGlobalScannerOpen(false)}
        />
      )}

      {globalScanResult && (
        <GlobalScanResultModal
          scanResult={globalScanResult}
          matchedInventory={findMatchingInventoryItem(globalScanResult.rawValue, inventory)}
          historyMatch={findMatchingToolHistory(
            globalScanResult.rawValue,
            jobCards,
            schedules,
            findMatchingInventoryItem(globalScanResult.rawValue, inventory)?.sku
          )}
          onClose={() => setGlobalScanResult(null)}
          onRescan={() => {
            setGlobalScanResult(null);
            setIsGlobalScannerOpen(true);
          }}
          onPrefillIntake={(result) => {
            setGlobalScanResult(null);
            setSelectedJob(null);
            setActiveTab('intake');
            setIntakeScanPrefill({ result, nonce: Date.now() });
          }}
          onOpenInventoryLookup={(code) => {
            setGlobalScanResult(null);
            setSelectedJob(null);
            setActiveTab('inventory');
            setInventoryExternalLookup({ code, nonce: Date.now() });
          }}
          onSelectJob={(job) => {
            setGlobalScanResult(null);
            setSelectedJob(job);
            setActiveTab('jobs');
          }}
        />
      )}

      <InventoryNotificationToast
        toasts={activeStockToasts}
        onDismiss={(id) => setActiveStockToasts((prev) => prev.filter((t) => t.id !== id))}
        onQuickReorder={handleQuickReorderItem}
        onOpenInventoryAlerts={handleOpenInventoryAlerts}
      />

      <FeedbackSmsToast
        notices={feedbackSmsNotices}
        onDismiss={(id) => setFeedbackSmsNotices((prev) => prev.filter((n) => n.id !== id))}
        onOpenSurvey={(notice) => {
          setFeedbackSmsNotices((prev) => prev.filter((n) => n.id !== notice.id));
          openCustomerSurvey(notice.jobId);
        }}
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

      <OfflineIndicator cachedJobCount={jobCards.length} />

    </div>
  );
}
