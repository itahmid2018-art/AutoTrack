import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BusinessSettings,
  JobCard,
  JobStatus,
  MessageLog,
  RecurringMaintenance,
} from '../types';
import { InventoryNotification } from '../utils/inventoryNotifications';
import { SHOP_TECHNICIANS } from '../data/mockTechnicians';
import { resolveApiUrl } from '../utils/apiBase';
import { isApiConfirmed, sentStatusFor } from '../utils/messagingStatus';
import { normalizeJobPriority } from '../utils/priority';
import {
  ApplyQuickReplyOptions,
  AssignTechnicianOptions,
  EscalateTaskOptions,
  ForwardBriefPayload,
  ForwardNotificationOptions,
  NotificationCategoryFilter,
  NotificationSortOrder,
  PendingSyncJobItem,
  QUICK_REPLY_PRESETS,
  QuickReplyPreset,
  TaskNotificationItem,
  buildClientReplyDraft,
  buildNotificationForwardText,
  buildQuickReplyMessage,
  buildScheduleReminderDraft,
  sortTaskNotifications,
} from '../utils/notificationsCenter';
import {
  AlertTriangle,
  ArrowRightCircle,
  ArrowUpCircle,
  ArrowUpDown,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Forward,
  History,
  LogIn,
  Mail,
  MessageSquare,
  MoreVertical,
  PackageX,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Smartphone,
  UserCheck,
  Wifi,
  WifiOff,
  Wrench,
  Zap,
} from 'lucide-react';

interface NotificationsViewProps {
  jobCards: JobCard[];
  pendingSyncJobs: PendingSyncJobItem[];
  taskNotifications: TaskNotificationItem[];
  inventoryNotifications: InventoryNotification[];
  schedules: RecurringMaintenance[];
  settings: BusinessSettings;
  isOnline: boolean;
  isAuthenticated: boolean;
  readNotificationIds?: string[];
  onToggleReadNotification?: (notifId: string) => void;
  onMarkAllNotificationsRead?: () => void;
  onSignIn?: () => void;
  onRetryCloudSync: (jobId?: string) => void;
  onSelectJob: (job: JobCard) => void;
  onEscalateJob: (jobId: string, options?: EscalateTaskOptions) => void;
  onForwardJobNotification?: (jobId: string, options: ForwardNotificationOptions) => void;
  onApplyQuickReply?: (
    jobId: string,
    options: Omit<ApplyQuickReplyOptions, 'deductStockOn'>
  ) => void;
  onAssignTechnician?: (jobId: string, options: AssignTechnicianOptions) => void;
  onQuickStatusChange?: (jobId: string, newStatus: JobStatus) => void;
  onLogMessageSent: (jobId: string, log: MessageLog) => void;
  onLogMaintenanceMessage?: (scheduleId: string, log: MessageLog) => void;
  onOpenWhatsApp: (job: JobCard) => void;
  onMarkInventoryRead: (notifId: string) => void;
  onToggleInventoryRead?: (notifId: string) => void;
  onMarkAllInventoryRead: () => void;
  onQuickReorderItem: (itemId: string, qty: number) => void;
  onOpenInventoryAlerts: () => void;
  onOpenMaintenance: () => void;
  onCreateJobCardFromSchedule: (schedule: RecurringMaintenance) => void;
  onDismissTaskNotification: (notifId: string) => void;
  onRestoreTaskNotification: (notifId: string) => void;
}

type ReplyChannel = 'WhatsApp' | 'SMS' | 'Email';
type ForwardChannel = 'Internal Handoff' | 'SMS' | 'WhatsApp' | 'Email';

interface ActiveReplyTarget {
  notifKey: string;
  job?: JobCard;
  schedule?: RecurringMaintenance;
  kindLabel: string;
  defaultType: MessageLog['type'];
}

interface ActiveForwardTarget {
  notifKey: string;
  jobId?: string;
  payload: ForwardBriefPayload;
  defaultRecipient: string;
}

interface InlineActionFeedback {
  type: 'success' | 'info' | 'error';
  text: string;
  fallbackHref?: string;
  fallbackLabel?: string;
}

function getNextStageAction(status: JobStatus): { label: string; nextStatus: JobStatus } | null {
  switch (status) {
    case 'Intake':
      return { label: 'Move to Diagnosis', nextStatus: 'Diagnosis' };
    case 'Diagnosis':
    case 'Awaiting Approval':
    case 'Awaiting Parts':
      return { label: 'Move to In Repair', nextStatus: 'In Repair' };
    case 'In Repair':
    case 'In Service':
      return { label: 'Mark Ready for Pickup', nextStatus: 'Ready for Pickup' };
    case 'Ready for Pickup':
      return { label: 'Mark Completed', nextStatus: 'Completed' };
    default:
      return null;
  }
}

const INTERNAL_DESK_RECIPIENTS = [
  'Workshop Supervisor',
  'Parts Procurement Desk',
  'Counter Intake Desk',
  'Warranty & Claims Desk',
];

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  pendingSyncJobs,
  taskNotifications,
  inventoryNotifications,
  schedules,
  settings,
  isOnline,
  isAuthenticated,
  readNotificationIds = [],
  onToggleReadNotification,
  onMarkAllNotificationsRead,
  onSignIn,
  onRetryCloudSync,
  onSelectJob,
  onEscalateJob,
  onForwardJobNotification,
  onApplyQuickReply,
  onAssignTechnician,
  onQuickStatusChange,
  onLogMessageSent,
  onLogMaintenanceMessage,
  onOpenWhatsApp,
  onMarkInventoryRead,
  onToggleInventoryRead,
  onMarkAllInventoryRead,
  onQuickReorderItem,
  onOpenInventoryAlerts,
  onOpenMaintenance,
  onCreateJobCardFromSchedule,
  onDismissTaskNotification,
  onRestoreTaskNotification,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategoryFilter>('all');
  const [sortOrder, setSortOrder] = useState<NotificationSortOrder>('priority');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDismissedTasks, setShowDismissedTasks] = useState(false);

  // 3-dot dropdown menu open state
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [quickReplyOpenKey, setQuickReplyOpenKey] = useState<string | null>(null);
  const [assignTechOpenKey, setAssignTechOpenKey] = useState<string | null>(null);
  const [quickReplyBusyKey, setQuickReplyBusyKey] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Per-row inline Escalate panel state
  const [escalatingJobId, setEscalatingJobId] = useState<string | null>(null);
  const [escalationReason, setEscalationReason] = useState('');
  const [escalationTech, setEscalationTech] = useState('');

  // Per-row inline Reply composer state (supports Task, Sync job, and Recurring Schedule)
  const [replyTarget, setReplyTarget] = useState<ActiveReplyTarget | null>(null);
  const [replyChannel, setReplyChannel] = useState<ReplyChannel>('WhatsApp');
  const [replyRecipient, setReplyRecipient] = useState('');
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Per-row inline Forward drawer state (supports Job, Inventory SKU, Schedule)
  const [forwardTarget, setForwardTarget] = useState<ActiveForwardTarget | null>(null);
  const [forwardRecipient, setForwardRecipient] = useState('');
  const [forwardContact, setForwardContact] = useState('');
  const [forwardChannel, setForwardChannel] = useState<ForwardChannel>('Internal Handoff');
  const [forwardNote, setForwardNote] = useState('');
  const [isSendingForward, setIsSendingForward] = useState(false);

  // Feedback message keyed by notification key
  const [feedbackById, setFeedbackById] = useState<Record<string, InlineActionFeedback>>({});

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-notif-menu-root="true"]')) {
        setOpenMenuKey(null);
        setQuickReplyOpenKey(null);
        setAssignTechOpenKey(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuKey(null);
        setQuickReplyOpenKey(null);
        setAssignTechOpenKey(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const readSet = useMemo(() => new Set(readNotificationIds), [readNotificationIds]);

  const dueSchedules = useMemo(
    () =>
      schedules.filter((s) => s.status === 'Overdue' || s.status === 'Due Soon').sort((a, b) => {
        if (a.status !== b.status) return a.status === 'Overdue' ? -1 : 1;
        return a.nextDueDate.localeCompare(b.nextDueDate);
      }),
    [schedules]
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredSyncJobs = useMemo(() => {
    if (categoryFilter !== 'all' && categoryFilter !== 'sync') return [];
    if (!normalizedQuery) return pendingSyncJobs;
    return pendingSyncJobs.filter(
      (item) =>
        item.job.id.toLowerCase().includes(normalizedQuery) ||
        item.job.customerName.toLowerCase().includes(normalizedQuery) ||
        item.job.tool.modelNumber.toLowerCase().includes(normalizedQuery) ||
        item.reason.toLowerCase().includes(normalizedQuery)
    );
  }, [pendingSyncJobs, categoryFilter, normalizedQuery]);

  const activeTaskCount = useMemo(
    () => taskNotifications.filter((t) => !t.dismissed).length,
    [taskNotifications]
  );
  const dismissedTaskCount = taskNotifications.length - activeTaskCount;

  const filteredTaskNotifications = useMemo(() => {
    if (categoryFilter !== 'all' && categoryFilter !== 'tasks') return [];
    const filtered = taskNotifications.filter((item) => {
      if (!showDismissedTasks && item.dismissed) return false;
      if (!normalizedQuery) return true;
      return (
        item.job.id.toLowerCase().includes(normalizedQuery) ||
        item.job.customerName.toLowerCase().includes(normalizedQuery) ||
        item.job.customerPhone.toLowerCase().includes(normalizedQuery) ||
        item.job.tool.modelNumber.toLowerCase().includes(normalizedQuery) ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.reasons.some((r) => r.toLowerCase().includes(normalizedQuery))
      );
    });
    return sortTaskNotifications(filtered, sortOrder);
  }, [taskNotifications, categoryFilter, showDismissedTasks, normalizedQuery, sortOrder]);

  const filteredInventoryNotifications = useMemo(() => {
    if (categoryFilter !== 'all' && categoryFilter !== 'inventory') return [];
    if (!normalizedQuery) return inventoryNotifications;
    return inventoryNotifications.filter(
      (item) =>
        item.sku.toLowerCase().includes(normalizedQuery) ||
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.category.toLowerCase().includes(normalizedQuery) ||
        item.binLocation.toLowerCase().includes(normalizedQuery)
    );
  }, [inventoryNotifications, categoryFilter, normalizedQuery]);

  const filteredSchedules = useMemo(() => {
    if (categoryFilter !== 'all' && categoryFilter !== 'maintenance') return [];
    if (!normalizedQuery) return dueSchedules;
    return dueSchedules.filter(
      (s) =>
        s.id.toLowerCase().includes(normalizedQuery) ||
        s.customerName.toLowerCase().includes(normalizedQuery) ||
        s.modelNumber.toLowerCase().includes(normalizedQuery) ||
        s.recommendedServiceScope.toLowerCase().includes(normalizedQuery)
    );
  }, [dueSchedules, categoryFilter, normalizedQuery]);

  const unreadInventoryCount = useMemo(
    () => inventoryNotifications.filter((n) => !n.read).length,
    [inventoryNotifications]
  );

  const unreadNonInventoryCount = useMemo(() => {
    let count = 0;
    for (const s of pendingSyncJobs) {
      if (!readSet.has(`sync-${s.job.id}`)) count += 1;
    }
    for (const t of taskNotifications) {
      if (!t.dismissed && !readSet.has(t.id)) count += 1;
    }
    for (const sched of dueSchedules) {
      if (!readSet.has(`sched-${sched.id}`)) count += 1;
    }
    return count;
  }, [pendingSyncJobs, taskNotifications, dueSchedules, readSet]);

  const totalUnreadCount = unreadInventoryCount + unreadNonInventoryCount;

  const visibleTotalCount =
    filteredSyncJobs.length +
    filteredTaskNotifications.length +
    filteredInventoryNotifications.length +
    filteredSchedules.length;

  const markReadIfUnread = (notifKey: string) => {
    if (onToggleReadNotification && !readSet.has(notifKey)) {
      onToggleReadNotification(notifKey);
    }
  };

  const openReplyForJob = (
    notifKey: string,
    job: JobCard,
    kindLabel: string,
    defaultDraft: string,
    defaultType: MessageLog['type']
  ) => {
    setOpenMenuKey(null);
    setEscalatingJobId(null);
    setForwardTarget(null);
    if (replyTarget?.notifKey === notifKey) {
      setReplyTarget(null);
      return;
    }
    const ch: ReplyChannel = job.customerPhone ? 'WhatsApp' : job.customerEmail ? 'Email' : 'SMS';
    setReplyTarget({ notifKey, job, kindLabel, defaultType });
    setReplyChannel(ch);
    setReplyRecipient(ch === 'Email' ? job.customerEmail || '' : job.customerPhone || '');
    setReplyText(defaultDraft);
  };

  const openReplyForSchedule = (notifKey: string, schedule: RecurringMaintenance) => {
    setOpenMenuKey(null);
    setEscalatingJobId(null);
    setForwardTarget(null);
    if (replyTarget?.notifKey === notifKey) {
      setReplyTarget(null);
      return;
    }
    const ch: ReplyChannel = schedule.customerPhone
      ? 'WhatsApp'
      : schedule.customerEmail
      ? 'Email'
      : 'SMS';
    setReplyTarget({
      notifKey,
      schedule,
      kindLabel: schedule.customerName,
      defaultType: 'Recurring Reminder',
    });
    setReplyChannel(ch);
    setReplyRecipient(
      ch === 'Email' ? schedule.customerEmail || '' : schedule.customerPhone || ''
    );
    setReplyText(buildScheduleReminderDraft(schedule, settings));
  };

  const handleReplyChannelChange = (ch: ReplyChannel) => {
    setReplyChannel(ch);
    if (replyTarget?.job) {
      setReplyRecipient(
        ch === 'Email' ? replyTarget.job.customerEmail || '' : replyTarget.job.customerPhone || ''
      );
    } else if (replyTarget?.schedule) {
      setReplyRecipient(
        ch === 'Email'
          ? replyTarget.schedule.customerEmail || ''
          : replyTarget.schedule.customerPhone || ''
      );
    }
  };

  const openEscalateForm = (job: JobCard) => {
    setOpenMenuKey(null);
    setReplyTarget(null);
    setForwardTarget(null);
    if (escalatingJobId === job.id) {
      setEscalatingJobId(null);
      return;
    }
    setEscalatingJobId(job.id);
    setEscalationReason('');
    setEscalationTech(job.technician || '');
  };

  const openForwardDrawer = (target: ActiveForwardTarget) => {
    setOpenMenuKey(null);
    setReplyTarget(null);
    setEscalatingJobId(null);
    if (forwardTarget?.notifKey === target.notifKey) {
      setForwardTarget(null);
      return;
    }
    setForwardTarget(target);
    setForwardRecipient(target.defaultRecipient);
    const matchedTech = SHOP_TECHNICIANS.find((t) => t.name === target.defaultRecipient);
    setForwardContact(matchedTech?.phone || '');
    setForwardChannel('Internal Handoff');
    setForwardNote('');
  };

  const handleForwardRecipientSelect = (val: string) => {
    setForwardRecipient(val);
    const matchedTech = SHOP_TECHNICIANS.find((t) => t.name === val);
    if (matchedTech && (forwardChannel === 'SMS' || forwardChannel === 'WhatsApp')) {
      setForwardContact(matchedTech.phone);
    }
  };

  const handleConfirmEscalation = (notifKey: string, job: JobCard) => {
    onEscalateJob(job.id, {
      reason: escalationReason,
      technician: escalationTech,
    });
    markReadIfUnread(notifKey);
    setEscalatingJobId(null);
    setEscalationReason('');
    setFeedbackById((prev) => ({
      ...prev,
      [notifKey]: {
        type: 'success',
        text: `Escalated ${job.id} to High priority${
          escalationTech && escalationTech !== job.technician ? ` and assigned ${escalationTech}` : ''
        }.`,
      },
    }));
  };

  const handleSubmitForward = async (target: ActiveForwardTarget) => {
    const recipient = forwardRecipient.trim() || 'Workshop Supervisor';
    const briefText = buildNotificationForwardText(target.payload, recipient, forwardNote);
    setIsSendingForward(true);

    try {
      if (target.jobId && onForwardJobNotification) {
        onForwardJobNotification(target.jobId, {
          recipient,
          note: forwardNote,
          channel: forwardChannel,
        });
      }

      if (forwardChannel === 'Internal Handoff') {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(briefText).catch(() => {});
        }
        setFeedbackById((prev) => ({
          ...prev,
          [target.notifKey]: {
            type: 'success',
            text: target.jobId
              ? `Forwarded to ${recipient}, logged on ${target.jobId}, and copied handoff brief to clipboard.`
              : `Handoff brief for ${recipient} copied to clipboard.`,
          },
        }));
      } else if (forwardChannel === 'Email') {
        const contact = forwardContact.trim();
        if (!contact) {
          setFeedbackById((prev) => ({
            ...prev,
            [target.notifKey]: {
              type: 'error',
              text: 'Enter a colleague or vendor email address to forward via Email.',
            },
          }));
          setIsSendingForward(false);
          return;
        }
        const res = await fetch(resolveApiUrl('/api/messaging/send-email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: contact,
            subject: `Workshop Forward — ${recipient}`,
            message: briefText,
            jobId: target.jobId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        const confirmed = isApiConfirmed(res.ok, data);
        setFeedbackById((prev) => ({
          ...prev,
          [target.notifKey]: confirmed
            ? { type: 'success', text: `Forwarded via Email to ${recipient} (${contact}).` }
            : { type: 'error', text: data?.error || 'Email forward failed.' },
        }));
      } else if (forwardChannel === 'SMS') {
        const contact = forwardContact.trim();
        if (!contact) {
          setFeedbackById((prev) => ({
            ...prev,
            [target.notifKey]: {
              type: 'error',
              text: 'Enter a phone number to forward via SMS.',
            },
          }));
          setIsSendingForward(false);
          return;
        }
        const smsHref = `sms:${contact.replace(/[^+\d]/g, '')}?body=${encodeURIComponent(briefText)}`;
        const res = await fetch(resolveApiUrl('/api/messaging/send-sms'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: contact, message: briefText, jobId: target.jobId }),
        });
        const data = await res.json().catch(() => ({}));
        const confirmed = isApiConfirmed(res.ok, data);
        setFeedbackById((prev) => ({
          ...prev,
          [target.notifKey]: confirmed
            ? { type: 'success', text: `Forwarded via SMS to ${recipient} (${contact}).` }
            : {
                type: 'info',
                text: `SMS gateway unavailable — handoff logged${target.jobId ? ` on ${target.jobId}` : ''}.`,
                fallbackHref: smsHref,
                fallbackLabel: 'Open SMS App',
              },
        }));
      } else {
        const contact = forwardContact.trim();
        const cleanPhone = contact.replace(/[^0-9]/g, '');
        const waHref = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(briefText)}`;
        const res = await fetch(resolveApiUrl('/api/messaging/send-whatsapp'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: contact, message: briefText, jobId: target.jobId }),
        });
        const data = await res.json().catch(() => ({}));
        const confirmed = isApiConfirmed(res.ok, data);
        setFeedbackById((prev) => ({
          ...prev,
          [target.notifKey]: confirmed
            ? { type: 'success', text: `Forwarded via WhatsApp to ${recipient}.` }
            : {
                type: 'info',
                text: 'WhatsApp API not configured — open WhatsApp Web to send handoff brief.',
                fallbackHref: typeof data?.fallbackUrl === 'string' ? data.fallbackUrl : waHref,
                fallbackLabel: 'Open WhatsApp Web',
              },
        }));
      }

      if (target.payload.type === 'inventory') {
        if (!target.payload.notif.read) onMarkInventoryRead(target.payload.notif.id);
      } else {
        markReadIfUnread(target.notifKey);
      }
      setForwardTarget(null);
    } catch {
      setFeedbackById((prev) => ({
        ...prev,
        [target.notifKey]: {
          type: 'error',
          text: 'Unable to reach forwarding dispatch endpoint.',
        },
      }));
    } finally {
      setIsSendingForward(false);
    }
  };

  const handleSendReply = async (target: ActiveReplyTarget) => {
    const message = replyText.trim();
    const recipient = replyRecipient.trim();

    if (!message) {
      setFeedbackById((prev) => ({
        ...prev,
        [target.notifKey]: { type: 'error', text: 'Enter a response message before sending.' },
      }));
      return;
    }

    if (!recipient) {
      setFeedbackById((prev) => ({
        ...prev,
        [target.notifKey]: {
          type: 'error',
          text:
            replyChannel === 'Email'
              ? 'Client email address is required for email replies.'
              : 'Client phone number is required for SMS or WhatsApp replies.',
        },
      }));
      return;
    }

    setIsSendingReply(true);
    const recordId = target.job?.id || target.schedule?.id || '';
    const toolName = target.job
      ? `${target.job.tool.brand} ${target.job.tool.modelNumber}`
      : target.schedule
      ? `${target.schedule.toolBrand} ${target.schedule.modelNumber}`
      : 'Service Tool';

    const recordLog = (apiConfirmed: boolean) => {
      const log: MessageLog = {
        id: `msg-notif-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        type: target.defaultType,
        ...(replyChannel === 'Email' ? { recipientEmail: recipient } : { recipientPhone: recipient }),
        text: message,
        channel: replyChannel,
        status: sentStatusFor(apiConfirmed),
      };
      if (target.job) {
        onLogMessageSent(target.job.id, log);
      } else if (target.schedule && onLogMaintenanceMessage) {
        onLogMaintenanceMessage(target.schedule.id, log);
      }
    };

    try {
      if (replyChannel === 'Email') {
        const res = await fetch(resolveApiUrl('/api/messaging/send-email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipient,
            subject: `Service Update — ${recordId} (${toolName})`,
            message,
            jobId: recordId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        const apiConfirmed = isApiConfirmed(res.ok, data);
        recordLog(apiConfirmed);
        setFeedbackById((prev) => ({
          ...prev,
          [target.notifKey]: apiConfirmed
            ? {
                type: 'success',
                text: `Email sent to ${recipient} via ${data.provider || 'Mail Relay'} and logged on ${recordId}.`,
              }
            : {
                type: 'error',
                text: data?.error || 'Email dispatch failed — logged as Pending.',
              },
        }));
      } else if (replyChannel === 'SMS') {
        const encoded = encodeURIComponent(message);
        const smsHref = `sms:${recipient.replace(/[^+\d]/g, '')}?body=${encoded}`;
        const res = await fetch(resolveApiUrl('/api/messaging/send-sms'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: recipient, message, jobId: recordId }),
        });
        const data = await res.json().catch(() => ({}));
        const apiConfirmed = isApiConfirmed(res.ok, data);
        recordLog(apiConfirmed);
        setFeedbackById((prev) => ({
          ...prev,
          [target.notifKey]: apiConfirmed
            ? {
                type: 'success',
                text: `SMS dispatched to ${recipient} (${data.provider || 'SMS API'}) and logged on ${recordId}.`,
              }
            : {
                type: 'info',
                text: 'SMS gateway unavailable — logged as Pending. Use your device SMS app to send directly.',
                fallbackHref: smsHref,
                fallbackLabel: 'Open SMS App',
              },
        }));
      } else {
        const cleanPhone = recipient.replace(/[^0-9]/g, '');
        const waHref = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        const res = await fetch(resolveApiUrl('/api/messaging/send-whatsapp'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: recipient, message, jobId: recordId }),
        });
        const data = await res.json().catch(() => ({}));
        const apiConfirmed = isApiConfirmed(res.ok, data);
        recordLog(apiConfirmed);
        setFeedbackById((prev) => ({
          ...prev,
          [target.notifKey]: apiConfirmed
            ? {
                type: 'success',
                text: `WhatsApp sent to ${recipient} via ${data.provider || 'WhatsApp API'} and logged on ${recordId}.`,
              }
            : {
                type: 'info',
                text: 'WhatsApp API not configured — logged as Pending. Launch WhatsApp Web to send now.',
                fallbackHref: typeof data?.fallbackUrl === 'string' ? data.fallbackUrl : waHref,
                fallbackLabel: 'Open WhatsApp Web',
              },
        }));
      }
      markReadIfUnread(target.notifKey);
      setReplyTarget(null);
    } catch {
      recordLog(false);
      const cleanPhone = recipient.replace(/[^0-9]/g, '');
      const fallbackHref =
        replyChannel === 'WhatsApp'
          ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
          : replyChannel === 'SMS'
          ? `sms:${recipient.replace(/[^+\d]/g, '')}?body=${encodeURIComponent(message)}`
          : undefined;
      setFeedbackById((prev) => ({
        ...prev,
        [target.notifKey]: {
          type: 'info',
          text: 'Network unreachable — response logged as Pending on the record.',
          fallbackHref,
          fallbackLabel:
            replyChannel === 'WhatsApp'
              ? 'Open WhatsApp Web'
              : replyChannel === 'SMS'
              ? 'Open SMS App'
              : undefined,
        },
      }));
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleQuickReplySelect = async (
    notifKey: string,
    job: JobCard,
    preset: QuickReplyPreset
  ) => {
    const channel: ReplyChannel = job.customerPhone?.trim()
      ? 'WhatsApp'
      : job.customerEmail?.trim()
      ? 'Email'
      : 'SMS';
    const recipient =
      channel === 'Email' ? (job.customerEmail || '').trim() : (job.customerPhone || '').trim();
    const messageText = buildQuickReplyMessage(job, preset.id, settings);
    const statusWillChange = Boolean(preset.targetStatus && preset.targetStatus !== job.status);

    setOpenMenuKey(null);
    setQuickReplyOpenKey(null);
    setQuickReplyBusyKey(notifKey);

    let apiConfirmed = false;
    let providerLabel = '';
    let fallbackHref: string | undefined;
    let fallbackLabel: string | undefined;

    try {
      if (recipient) {
        if (channel === 'Email') {
          const res = await fetch(resolveApiUrl('/api/messaging/send-email'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: recipient,
              subject: `${preset.label} — ${job.id} (${job.tool.brand} ${job.tool.modelNumber})`,
              message: messageText,
              jobId: job.id,
            }),
          });
          const data = await res.json().catch(() => ({}));
          apiConfirmed = isApiConfirmed(res.ok, data);
          providerLabel = data?.provider || 'Mail Relay';
        } else if (channel === 'SMS') {
          const smsHref = `sms:${recipient.replace(/[^+\d]/g, '')}?body=${encodeURIComponent(messageText)}`;
          const res = await fetch(resolveApiUrl('/api/messaging/send-sms'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: recipient, message: messageText, jobId: job.id }),
          });
          const data = await res.json().catch(() => ({}));
          apiConfirmed = isApiConfirmed(res.ok, data);
          providerLabel = data?.provider || 'SMS API';
          if (!apiConfirmed) {
            fallbackHref = smsHref;
            fallbackLabel = 'Open SMS App';
          }
        } else {
          const cleanPhone = recipient.replace(/[^0-9]/g, '');
          const waHref = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
          const res = await fetch(resolveApiUrl('/api/messaging/send-whatsapp'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: recipient, message: messageText, jobId: job.id }),
          });
          const data = await res.json().catch(() => ({}));
          apiConfirmed = isApiConfirmed(res.ok, data);
          providerLabel = data?.provider || 'WhatsApp API';
          if (!apiConfirmed) {
            fallbackHref = typeof data?.fallbackUrl === 'string' ? data.fallbackUrl : waHref;
            fallbackLabel = 'Open WhatsApp Web';
          }
        }
      }
    } catch {
      if (recipient && channel !== 'Email') {
        const cleanPhone = recipient.replace(/[^0-9]/g, '');
        fallbackHref =
          channel === 'WhatsApp'
            ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`
            : `sms:${recipient.replace(/[^+\d]/g, '')}?body=${encodeURIComponent(messageText)}`;
        fallbackLabel = channel === 'WhatsApp' ? 'Open WhatsApp Web' : 'Open SMS App';
      }
    } finally {
      setQuickReplyBusyKey(null);
    }

    if (onApplyQuickReply) {
      onApplyQuickReply(job.id, {
        presetId: preset.id,
        channel,
        recipient,
        messageText,
        apiConfirmed,
      });
    } else {
      if (statusWillChange && preset.targetStatus && onQuickStatusChange) {
        onQuickStatusChange(job.id, preset.targetStatus);
      }
      onLogMessageSent(job.id, {
        id: `msg-qr-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        type: preset.messageType,
        ...(recipient
          ? channel === 'Email'
            ? { recipientEmail: recipient }
            : { recipientPhone: recipient }
          : {}),
        text: messageText,
        channel,
        status: sentStatusFor(apiConfirmed),
      });
    }

    markReadIfUnread(notifKey);

    const statusSummary =
      statusWillChange && preset.targetStatus ? ` updated to ${preset.targetStatus}` : ' logged';
    if (!recipient) {
      setFeedbackById((prev) => ({
        ...prev,
        [notifKey]: {
          type: 'info',
          text: `Quick Reply "${preset.label}"${statusSummary} on ${job.id}. Add a client phone or email on the job card to send messages.`,
        },
      }));
    } else if (apiConfirmed) {
      setFeedbackById((prev) => ({
        ...prev,
        [notifKey]: {
          type: 'success',
          text: `Quick Reply "${preset.label}"${statusSummary} on ${job.id} and notified ${job.customerName || 'client'} via ${providerLabel || channel}.`,
        },
      }));
    } else {
      setFeedbackById((prev) => ({
        ...prev,
        [notifKey]: {
          type: 'info',
          text: `Quick Reply "${preset.label}"${statusSummary} on ${job.id} and saved as Pending. Launch ${channel} to send now.`,
          fallbackHref,
          fallbackLabel,
        },
      }));
    }
  };

  const handleAssignTechnicianSelect = (
    notifKey: string,
    job: JobCard,
    technicianName: string
  ) => {
    const previousTechnician = (job.technician || '').trim() || 'Unassigned';
    setOpenMenuKey(null);
    setQuickReplyOpenKey(null);
    setAssignTechOpenKey(null);

    if (onAssignTechnician) {
      onAssignTechnician(job.id, { technician: technicianName });
    }
    markReadIfUnread(notifKey);

    setFeedbackById((prev) => ({
      ...prev,
      [notifKey]: {
        type: 'success',
        text:
          previousTechnician === technicianName
            ? `${job.id} remains assigned to ${technicianName}.`
            : `Reassigned ${job.id} from ${previousTechnician} to ${technicianName}.`,
      },
    }));
  };

  const renderQuickReplyMenuGroup = (notifKey: string, job: JobCard) => {
    const isExpanded = quickReplyOpenKey === notifKey;
    const isBusy = quickReplyBusyKey === notifKey;

    return (
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-1 mb-1">
        <button
          type="button"
          role="menuitem"
          aria-expanded={isExpanded}
          data-testid={`quick-reply-toggle-${notifKey}`}
          onClick={() => {
            setAssignTechOpenKey(null);
            setQuickReplyOpenKey((curr) => (curr === notifKey ? null : notifKey));
          }}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-950 dark:text-white font-semibold flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Quick Reply</span>
          </span>
          <ChevronRight
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </button>

        {isExpanded && (
          <div
            data-testid={`quick-reply-list-${notifKey}`}
            className="mt-1 pl-2 pr-1 space-y-0.5"
          >
            {QUICK_REPLY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="menuitem"
                disabled={isBusy}
                data-testid={`quick-reply-option-${preset.id}-${notifKey}`}
                onClick={() => void handleQuickReplySelect(notifKey, job, preset)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50 text-zinc-900 dark:text-zinc-200 block"
              >
                <div className="font-semibold text-xs leading-tight">{preset.label}</div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5">
                  {preset.actionHint}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAssignTechnicianMenuGroup = (notifKey: string, job: JobCard) => {
    const isExpanded = assignTechOpenKey === notifKey;
    const currentTech = (job.technician || '').trim();

    return (
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-1 mb-1">
        <button
          type="button"
          role="menuitem"
          aria-expanded={isExpanded}
          data-testid={`assign-tech-toggle-${notifKey}`}
          onClick={() => {
            setQuickReplyOpenKey(null);
            setAssignTechOpenKey((curr) => (curr === notifKey ? null : notifKey));
          }}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-950 dark:text-white font-semibold flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2">
            <UserCheck className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
            <span>Assign to Technician</span>
          </span>
          <ChevronRight
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </button>

        {isExpanded && (
          <div
            data-testid={`assign-tech-list-${notifKey}`}
            className="mt-1 pl-2 pr-1 space-y-0.5"
          >
            {SHOP_TECHNICIANS.map((tech) => {
              const isAssigned = currentTech === tech.name;
              return (
                <button
                  key={tech.id}
                  type="button"
                  role="menuitem"
                  data-testid={`assign-tech-option-${tech.id}-${notifKey}`}
                  onClick={() => handleAssignTechnicianSelect(notifKey, job, tech.name)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-xs leading-tight truncate">{tech.name}</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5 truncate">
                      {tech.role} · {tech.activeStatus}
                    </div>
                  </div>
                  {isAssigned && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderForwardPanel = (notifKey: string) => {
    if (!forwardTarget || forwardTarget.notifKey !== notifKey) return null;
    const previewBrief = buildNotificationForwardText(
      forwardTarget.payload,
      forwardRecipient,
      forwardNote
    );

    return (
      <div
        data-testid={`forward-panel-${notifKey}`}
        className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
            <Forward className="w-3.5 h-3.5" />
            <span>Forward Notification Handoff</span>
          </div>
          <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
            {forwardTarget.jobId ? `Logs audit trail on ${forwardTarget.jobId}` : 'Generates shareable workshop brief'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Forward To (Colleague / Desk)
            </label>
            <select
              value={forwardRecipient}
              onChange={(e) => handleForwardRecipientSelect(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white"
            >
              <optgroup label="Workshop Desks">
                {INTERNAL_DESK_RECIPIENTS.map((desk) => (
                  <option key={desk} value={desk}>
                    {desk}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Bench Technicians">
                {SHOP_TECHNICIANS.map((tech) => (
                  <option key={tech.id} value={tech.name}>
                    {tech.name} ({tech.role})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Forward Method
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(['Internal Handoff', 'SMS', 'WhatsApp', 'Email'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => {
                    setForwardChannel(ch);
                    const matched = SHOP_TECHNICIANS.find((t) => t.name === forwardRecipient);
                    if (matched && (ch === 'SMS' || ch === 'WhatsApp')) {
                      setForwardContact(matched.phone);
                    }
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    forwardChannel === ch
                      ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        </div>

        {forwardChannel !== 'Internal Handoff' && (
          <div>
            <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Recipient {forwardChannel === 'Email' ? 'Email' : 'Phone'}
            </label>
            <input
              type={forwardChannel === 'Email' ? 'email' : 'text'}
              value={forwardContact}
              onChange={(e) => setForwardContact(e.target.value)}
              placeholder={forwardChannel === 'Email' ? 'procurement@boschtools.com' : '+1 555-901-2244'}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white"
            />
          </div>
        )}

        <div>
          <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Handoff Note
          </label>
          <input
            type="text"
            value={forwardNote}
            onChange={(e) => setForwardNote(e.target.value)}
            placeholder="e.g., Client called for ETA; verify stator lead before noon"
            className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white placeholder-zinc-500"
          />
        </div>

        <pre className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
          {previewBrief}
        </pre>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setForwardTarget(null)}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSendingForward}
            data-testid={`confirm-forward-${notifKey}`}
            onClick={() => handleSubmitForward(forwardTarget)}
            className="px-4 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-bold inline-flex items-center gap-1.5"
          >
            {forwardChannel === 'Internal Handoff' ? <Copy className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            <span>
              {isSendingForward
                ? 'Forwarding...'
                : forwardChannel === 'Internal Handoff'
                ? 'Log & Copy Handoff Brief'
                : `Forward via ${forwardChannel}`}
            </span>
          </button>
        </div>
      </div>
    );
  };

  const renderReplyPanel = (notifKey: string) => {
    if (!replyTarget || replyTarget.notifKey !== notifKey) return null;

    return (
      <div
        data-testid={`respond-panel-${notifKey}`}
        className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-zinc-950 dark:text-white">
            Reply to Client ({replyTarget.kindLabel})
          </div>
          {replyTarget.job && (
            <button
              type="button"
              onClick={() => onOpenWhatsApp(replyTarget.job!)}
              className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white underline inline-flex items-center gap-1"
            >
              <span>Open Full Messaging Center</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'WhatsApp', label: 'WhatsApp', icon: <MessageSquare className="w-3.5 h-3.5" /> },
              { id: 'SMS', label: 'SMS', icon: <Smartphone className="w-3.5 h-3.5" /> },
              { id: 'Email', label: 'Email', icon: <Mail className="w-3.5 h-3.5" /> },
            ] as const
          ).map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => handleReplyChannelChange(ch.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                replyChannel === ch.id
                  ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                  : 'bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {ch.icon}
              <span>{ch.label}</span>
            </button>
          ))}
        </div>

        <div>
          <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            {replyChannel === 'Email' ? 'Client Email' : 'Client Phone'}
          </label>
          <input
            type={replyChannel === 'Email' ? 'email' : 'text'}
            value={replyRecipient}
            onChange={(e) => setReplyRecipient(e.target.value)}
            placeholder={replyChannel === 'Email' ? 'client@company.com' : '+1 555-0100'}
            className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Message to Client
          </label>
          <textarea
            rows={3}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setReplyTarget(null)}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSendingReply}
            onClick={() => handleSendReply(replyTarget)}
            data-testid={`send-response-${notifKey}`}
            className="px-4 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSendingReply ? 'Sending...' : `Send ${replyChannel}`}</span>
          </button>
        </div>
      </div>
    );
  };

  const renderFeedbackBanner = (notifKey: string) => {
    const feedback = feedbackById[notifKey];
    if (!feedback) return null;

    return (
      <div
        role="status"
        className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
          feedback.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            : feedback.type === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            : 'bg-zinc-100 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200'
        }`}
      >
        <span>{feedback.text}</span>
        {feedback.fallbackHref && feedback.fallbackLabel && (
          <a
            href={feedback.fallbackHref}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold inline-flex items-center gap-1"
          >
            <span>{feedback.fallbackLabel}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    );
  };

  return (
    <div ref={pageRef} className="space-y-6" data-testid="notifications-page">
      {/* Page Header & Connectivity Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Bell className="w-5 h-5 text-zinc-950 dark:text-white shrink-0" />
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
                Notifications
              </h1>
              {totalUnreadCount > 0 && (
                <span className="text-xs font-mono font-semibold text-amber-800 dark:text-amber-300 tabular-nums">
                  · {totalUnreadCount} unread
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Review offline cloud sync issues, escalate stalled repairs, forward handoffs, reply to clients, and handle stock alerts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div
              className={`px-3 py-2 rounded-xl border text-xs font-mono font-semibold inline-flex items-center gap-2 whitespace-nowrap ${
                isOnline
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-300'
              }`}
            >
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              <span>{isOnline ? 'Network Online' : 'Offline Mode'}</span>
            </div>

            {!isAuthenticated && onSignIn && (
              <button
                type="button"
                onClick={onSignIn}
                className="px-3.5 py-2 rounded-xl border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-950 dark:text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <LogIn className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>Sign In to Cloud</span>
              </button>
            )}

            {pendingSyncJobs.length > 0 && (
              <button
                type="button"
                onClick={() => onRetryCloudSync()}
                disabled={!isOnline || !isAuthenticated}
                data-testid="retry-all-sync-btn"
                className="px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-zinc-950 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry All Syncs ({pendingSyncJobs.length})</span>
              </button>
            )}

            {totalUnreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  onMarkAllInventoryRead();
                  if (onMarkAllNotificationsRead) {
                    const keys = [
                      ...pendingSyncJobs.map((s) => `sync-${s.job.id}`),
                      ...taskNotifications.map((t) => t.id),
                      ...dueSchedules.map((sched) => `sched-${sched.id}`),
                    ];
                    if (keys.length > 0) onMarkAllNotificationsRead();
                  }
                }}
                className="px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <CheckCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
        </div>

        {/* 4-Column Summary Metric Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-5 border-t border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setCategoryFilter('sync')}
            className={`text-left p-3.5 rounded-xl border transition-colors ${
              pendingSyncJobs.length > 0
                ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 hover:border-rose-400'
                : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <span>Offline / Sync Failed</span>
              {pendingSyncJobs.length > 0 ? (
                <CloudOff className="w-4 h-4 text-rose-700 dark:text-rose-400" />
              ) : (
                <Cloud className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              )}
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-zinc-950 dark:text-white mt-1">
              {pendingSyncJobs.length}
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              {pendingSyncJobs.length > 0 ? 'Check connection & retry' : 'All local edits synced'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('tasks')}
            className="text-left p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <span>Tasks &amp; Clients</span>
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-zinc-950 dark:text-white mt-1">
              {activeTaskCount}
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Overdue, approvals &amp; pickups
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('inventory')}
            className="text-left p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <span>Low-Stock Alerts</span>
              <PackageX className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-zinc-950 dark:text-white mt-1">
              {inventoryNotifications.length}
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 tabular-nums">
              {unreadInventoryCount} unread SKU alerts
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('maintenance')}
            className="text-left p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <span>Servicing Due</span>
              <Clock className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-zinc-950 dark:text-white mt-1">
              {dueSchedules.length}
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Overdue or upcoming plans
            </div>
          </button>
        </div>
      </div>

      {/* Category Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-200/80 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl">
          {(
            [
              {
                id: 'all',
                label: `All (${
                  pendingSyncJobs.length +
                  activeTaskCount +
                  inventoryNotifications.length +
                  dueSchedules.length
                })`,
              },
              { id: 'sync', label: `Cloud Sync (${pendingSyncJobs.length})` },
              { id: 'tasks', label: `Tasks & Clients (${activeTaskCount})` },
              { id: 'inventory', label: `Stock (${inventoryNotifications.length})` },
              { id: 'maintenance', label: `Servicing (${dueSchedules.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors tabular-nums ${
                categoryFilter === tab.id
                  ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                  : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 flex-1 md:max-w-2xl justify-end">
          {dismissedTaskCount > 0 && (
            <button
              type="button"
              onClick={() => setShowDismissedTasks((prev) => !prev)}
              className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5" />
              <span>
                {showDismissedTasks ? 'Hide' : 'Show'} Acknowledged ({dismissedTaskCount})
              </span>
            </button>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <label
              htmlFor="notifications-sort-select"
              className="text-xs font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap inline-flex items-center gap-1"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
              <span>Sort By</span>
            </label>
            <select
              id="notifications-sort-select"
              aria-label="Sort By"
              data-testid="notifications-sort-select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as NotificationSortOrder)}
              className="px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl text-zinc-950 dark:text-white focus:outline-none focus:border-zinc-950 dark:focus:border-white cursor-pointer"
            >
              <option value="priority">Priority</option>
              <option value="oldest">Oldest First</option>
              <option value="newest">Newest First</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by Job ID, client, SKU..."
              aria-label="Filter notifications"
              className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl text-zinc-950 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-950 dark:focus:border-white"
            />
          </div>
        </div>
      </div>

      {/* Empty State */}
      {visibleTotalCount === 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-10 text-center space-y-3">
          <Check className="w-8 h-8 text-emerald-700 dark:text-emerald-400 mx-auto" />
          <h2 className="text-base font-bold text-zinc-950 dark:text-white">
            No notifications match this view
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            All cloud sync queues, SLA tasks, stock alerts, and scheduled servicing items in this filter are clear.
          </p>
          {(categoryFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('all');
                setSearchQuery('');
              }}
              className="px-4 py-2 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-xs font-bold"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Section 1: Pending / Failed Offline Cloud Sync Queue */}
      {filteredSyncJobs.length > 0 && (
        <section
          aria-labelledby="sync-alerts-heading"
          className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl overflow-visible"
        >
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-rose-50/60 dark:bg-rose-950/20 rounded-t-2xl">
            <div>
              <h2
                id="sync-alerts-heading"
                className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2"
              >
                <CloudOff className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                <span>Offline &amp; Failed Cloud Sync Jobs ({filteredSyncJobs.length})</span>
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                These job cards have local changes that have not reached Cloud Firestore yet.
              </p>
            </div>
            {!isOnline && (
              <span className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                Reconnect to internet to resume automatic upload
              </span>
            )}
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredSyncJobs.map((item) => {
              const notifKey = `sync-${item.job.id}`;
              const isRead = readSet.has(notifKey);
              const isMenuOpen = openMenuKey === notifKey;
              const priority = normalizeJobPriority(item.job.priority);

              return (
                <div
                  key={notifKey}
                  className={`p-4 sm:p-5 space-y-3 ${
                    !isRead ? 'bg-zinc-50/70 dark:bg-zinc-950/40' : ''
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                        <span className="font-bold text-zinc-950 dark:text-white">{item.job.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>Priority: {priority}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.job.status}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{item.failedAt.slice(0, 16).replace('T', ' ')}</span>
                        <span aria-hidden="true">·</span>
                        <span className={isRead ? 'text-zinc-500' : 'font-bold text-amber-800 dark:text-amber-300'}>
                          {isRead ? 'Read' : 'Unread'}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-zinc-950 dark:text-white">
                        {item.job.customerName} — {item.job.tool.brand} {item.job.tool.modelNumber}
                      </div>
                      <p className="text-xs text-rose-800 dark:text-rose-300">{item.reason}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {isOnline && isAuthenticated ? (
                        <button
                          type="button"
                          onClick={() => onRetryCloudSync(item.job.id)}
                          disabled={item.inFlight}
                          className="px-3.5 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${item.inFlight ? 'animate-spin' : ''}`} />
                          <span>{item.inFlight ? 'Syncing...' : 'Retry Sync'}</span>
                        </button>
                      ) : !isAuthenticated && onSignIn ? (
                        <button
                          type="button"
                          onClick={onSignIn}
                          className="px-3.5 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          <span>Sign In to Sync</span>
                        </button>
                      ) : (
                        <span className="text-xs font-mono font-semibold text-amber-800 dark:text-amber-300 px-2">
                          Waiting for network
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectJob(item.job)}
                        className="px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Open Job Card</span>
                      </button>

                      {/* 3-Dot Action Menu */}
                      <div className="relative" data-notif-menu-root="true">
                        <button
                          type="button"
                          aria-label={`More actions for ${item.job.id}`}
                          aria-haspopup="menu"
                          aria-expanded={isMenuOpen}
                          data-testid={`notif-menu-btn-${notifKey}`}
                          onClick={() => {
                            setQuickReplyOpenKey(null);
                            setAssignTechOpenKey(null);
                            setOpenMenuKey((curr) => (curr === notifKey ? null : notifKey));
                          }}
                          className="p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                          <div
                            role="menu"
                            className="absolute right-0 top-11 z-40 w-64 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-2xl p-1.5 space-y-0.5 text-xs"
                          >
                            {renderQuickReplyMenuGroup(notifKey, item.job)}
                            {renderAssignTechnicianMenuGroup(notifKey, item.job)}

                            {onToggleReadNotification && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onToggleReadNotification(notifKey);
                                  setOpenMenuKey(null);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                              >
                                {isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span>{isRead ? 'Mark as Unread' : 'Mark as Read'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                openReplyForJob(
                                  notifKey,
                                  item.job,
                                  item.job.customerName,
                                  `Hi ${item.job.customerName}, status update on Job Card ${item.job.id} (${item.job.tool.brand} ${item.job.tool.modelNumber}): currently in ${item.job.status}.`,
                                  'Custom'
                                )
                              }
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Reply to Client</span>
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                openForwardDrawer({
                                  notifKey,
                                  jobId: item.job.id,
                                  defaultRecipient: item.job.technician || 'Workshop Supervisor',
                                  payload: {
                                    type: 'job',
                                    job: item.job,
                                    heading: 'Offline / Sync Attention',
                                    details: item.reason,
                                  },
                                })
                              }
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              <Forward className="w-3.5 h-3.5" />
                              <span>Forward Sync Issue</span>
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuKey(null);
                                openEscalateForm(item.job);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-rose-700 dark:text-rose-300 flex items-center gap-2"
                            >
                              <ArrowUpCircle className="w-3.5 h-3.5" />
                              <span>Escalate Job Priority</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {renderFeedbackBanner(notifKey)}
                  {renderReplyPanel(notifKey)}
                  {renderForwardPanel(notifKey)}

                  {escalatingJobId === item.job.id && (
                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 space-y-3">
                      <div className="text-xs font-bold text-zinc-950 dark:text-white">
                        Escalate {item.job.id} to High Priority
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select
                          value={escalationTech}
                          onChange={(e) => setEscalationTech(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white"
                        >
                          <option value="">Keep current ({item.job.technician || 'Unassigned'})</option>
                          {SHOP_TECHNICIANS.map((tech) => (
                            <option key={tech.id} value={tech.name}>
                              {tech.name} — {tech.specialization}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={escalationReason}
                          onChange={(e) => setEscalationReason(e.target.value)}
                          placeholder="Reason for supervisor escalation..."
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEscalatingJobId(null)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmEscalation(notifKey, item.job)}
                          className="px-4 py-1.5 rounded-lg bg-rose-700 text-white text-xs font-bold"
                        >
                          Confirm Escalation
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 2: Actionable Tasks & Client Follow-ups */}
      {filteredTaskNotifications.length > 0 && (
        <section
          aria-labelledby="tasks-alerts-heading"
          className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl overflow-visible"
        >
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2
              id="tasks-alerts-heading"
              className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              <span>Tasks &amp; Client Follow-Ups ({filteredTaskNotifications.length})</span>
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Use the 3-dot action menu or quick buttons to mark read, escalate, forward to bench technicians, or reply to clients.
            </p>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredTaskNotifications.map((item) => {
              const priority = normalizeJobPriority(item.job.priority);
              const isEscalating = escalatingJobId === item.job.id;
              const isRead = readSet.has(item.id);
              const isMenuOpen = openMenuKey === item.id;
              const stageAdvance = onQuickStatusChange ? getNextStageAction(item.job.status) : null;

              return (
                <div
                  key={item.id}
                  data-testid={`task-notif-${item.job.id}`}
                  className={`p-4 sm:p-5 space-y-3 ${
                    item.dismissed
                      ? 'opacity-65 bg-zinc-50/70 dark:bg-zinc-950/40'
                      : !isRead
                      ? 'bg-zinc-50/60 dark:bg-zinc-950/30'
                      : ''
                  }`}
                >
                  <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                        <span
                          className={`font-bold ${
                            item.severity === 'critical'
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-amber-800 dark:text-amber-400'
                          }`}
                        >
                          {item.severity === 'critical' ? 'Action Required' : 'Attention'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-bold text-zinc-950 dark:text-white">{item.job.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>Priority: {priority}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.job.status}</span>
                        <span aria-hidden="true">·</span>
                        <span>Tech: {item.job.technician || 'Unassigned'}</span>
                        {(item.triggeredAt || item.job.updatedAt || item.job.createdAt) && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {(item.triggeredAt || item.job.updatedAt || item.job.createdAt)
                                .slice(0, 16)
                                .replace('T', ' ')}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className={isRead ? 'text-zinc-500' : 'font-bold text-amber-800 dark:text-amber-300'}>
                          {isRead ? 'Read' : 'Unread'}
                        </span>
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-zinc-950 dark:text-white">
                        {item.title}
                      </h3>

                      <div className="text-xs text-zinc-700 dark:text-zinc-300">
                        {item.summary} · {item.job.customerPhone || 'No phone on file'}
                        {item.job.customerEmail ? ` · ${item.job.customerEmail}` : ''}
                      </div>

                      <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5 list-disc list-inside">
                        {item.reasons.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEscalateForm(item.job)}
                        data-testid={`escalate-btn-${item.job.id}`}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                          isEscalating
                            ? 'bg-rose-700 text-white'
                            : 'bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/80 text-rose-900 dark:text-rose-200 border border-rose-300 dark:border-rose-700'
                        }`}
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        <span>{priority === 'High' ? 'Escalate / Reassign' : 'Escalate Task'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openReplyForJob(
                            item.id,
                            item.job,
                            item.job.customerName,
                            buildClientReplyDraft(item.job, item.kind, settings),
                            item.kind === 'awaiting-approval'
                              ? 'Estimate'
                              : item.kind === 'ready-for-pickup'
                              ? 'Ready'
                              : 'Custom'
                          )
                        }
                        data-testid={`respond-btn-${item.job.id}`}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Respond to Client</span>
                      </button>

                      {/* 3-Dot Action Menu */}
                      <div className="relative" data-notif-menu-root="true">
                        <button
                          type="button"
                          aria-label={`More actions for ${item.job.id}`}
                          aria-haspopup="menu"
                          aria-expanded={isMenuOpen}
                          data-testid={`notif-menu-btn-${item.id}`}
                          onClick={() => {
                            setQuickReplyOpenKey(null);
                            setAssignTechOpenKey(null);
                            setOpenMenuKey((curr) => (curr === item.id ? null : item.id));
                          }}
                          className="p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                          <div
                            role="menu"
                            className="absolute right-0 top-11 z-40 w-64 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-2xl p-1.5 space-y-0.5 text-xs"
                          >
                            {renderQuickReplyMenuGroup(item.id, item.job)}
                            {renderAssignTechnicianMenuGroup(item.id, item.job)}

                            {onToggleReadNotification && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onToggleReadNotification(item.id);
                                  setOpenMenuKey(null);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                              >
                                {isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span>{isRead ? 'Mark as Unread' : 'Mark as Read'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                openReplyForJob(
                                  item.id,
                                  item.job,
                                  item.job.customerName,
                                  buildClientReplyDraft(item.job, item.kind, settings),
                                  item.kind === 'awaiting-approval'
                                    ? 'Estimate'
                                    : item.kind === 'ready-for-pickup'
                                    ? 'Ready'
                                    : 'Custom'
                                )
                              }
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Reply to Client</span>
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                openForwardDrawer({
                                  notifKey: item.id,
                                  jobId: item.job.id,
                                  defaultRecipient: item.job.technician || 'Workshop Supervisor',
                                  payload: {
                                    type: 'job',
                                    job: item.job,
                                    heading: item.title,
                                    details: item.reasons.join(' '),
                                  },
                                })
                              }
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              <Forward className="w-3.5 h-3.5" />
                              <span>Forward to Technician / Desk</span>
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => openEscalateForm(item.job)}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-rose-700 dark:text-rose-300 flex items-center gap-2"
                            >
                              <ArrowUpCircle className="w-3.5 h-3.5" />
                              <span>{priority === 'High' ? 'Escalate / Reassign' : 'Escalate to High Priority'}</span>
                            </button>

                            {stageAdvance && onQuickStatusChange && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onQuickStatusChange(item.job.id, stageAdvance.nextStatus);
                                  markReadIfUnread(item.id);
                                  setOpenMenuKey(null);
                                  setFeedbackById((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      type: 'success',
                                      text: `Updated ${item.job.id} status to ${stageAdvance.nextStatus}.`,
                                    },
                                  }));
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
                              >
                                <ArrowRightCircle className="w-3.5 h-3.5" />
                                <span>{stageAdvance.label}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuKey(null);
                                onSelectJob(item.job);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              <span>Open Job Card</span>
                            </button>

                            {item.dismissed ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onRestoreTaskNotification(item.id);
                                  setOpenMenuKey(null);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 flex items-center gap-2"
                              >
                                <History className="w-3.5 h-3.5" />
                                <span>Restore Alert</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onDismissTaskNotification(item.id);
                                  setOpenMenuKey(null);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 flex items-center gap-2"
                              >
                                <CheckCheck className="w-3.5 h-3.5" />
                                <span>Acknowledge &amp; Dismiss</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {renderFeedbackBanner(item.id)}

                  {/* Inline Escalate Form */}
                  {isEscalating && (
                    <div
                      data-testid={`escalate-panel-${item.job.id}`}
                      className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 space-y-3"
                    >
                      <div className="text-xs font-bold text-zinc-950 dark:text-white">
                        Escalate {item.job.id} to High Priority
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Assign / Reassign Technician
                          </label>
                          <select
                            value={escalationTech}
                            onChange={(e) => setEscalationTech(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white"
                          >
                            <option value="">Keep current ({item.job.technician || 'Unassigned'})</option>
                            {SHOP_TECHNICIANS.map((tech) => (
                              <option key={tech.id} value={tech.name}>
                                {tech.name} — {tech.specialization}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Escalation Reason / Supervisor Note
                          </label>
                          <input
                            type="text"
                            value={escalationReason}
                            onChange={(e) => setEscalationReason(e.target.value)}
                            placeholder="e.g., Client crew waiting on job site"
                            className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-white placeholder-zinc-500"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEscalatingJobId(null)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmEscalation(item.id, item.job)}
                          data-testid={`confirm-escalate-${item.job.id}`}
                          className="px-4 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold"
                        >
                          Confirm Escalation
                        </button>
                      </div>
                    </div>
                  )}

                  {renderReplyPanel(item.id)}
                  {renderForwardPanel(item.id)}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 3: Spare Parts Low-Stock Notifications */}
      {filteredInventoryNotifications.length > 0 && (
        <section
          aria-labelledby="stock-alerts-heading"
          className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl overflow-visible"
        >
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
            <div>
              <h2
                id="stock-alerts-heading"
                className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2"
              >
                <PackageX className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                <span>Spare Parts Stock Alerts ({filteredInventoryNotifications.length})</span>
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                Parts below minimum threshold ready for quick stock replenishment or vendor forwarding.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenInventoryAlerts}
              className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:underline whitespace-nowrap"
            >
              Open Catalog
            </button>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredInventoryNotifications.map((notif) => {
              const isMenuOpen = openMenuKey === notif.id;
              return (
                <div
                  key={notif.id}
                  className={`p-4 sm:p-5 space-y-3 ${
                    !notif.read ? 'bg-zinc-50/80 dark:bg-zinc-950/40' : ''
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                        <span className="font-bold text-zinc-950 dark:text-white">{notif.sku}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            notif.severity === 'OUT_OF_STOCK'
                              ? 'text-rose-700 dark:text-rose-400 font-bold'
                              : 'text-amber-800 dark:text-amber-400 font-bold'
                          }
                        >
                          {notif.severity.replace(/_/g, ' ')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          Stock: {notif.stockQty} / Min {notif.minStockThreshold} {notif.unit}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Bin {notif.binLocation}</span>
                        <span aria-hidden="true">·</span>
                        <span className={notif.read ? 'text-zinc-500' : 'font-bold text-amber-800 dark:text-amber-300'}>
                          {notif.read ? 'Read' : 'Unread'}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-zinc-950 dark:text-white">{notif.name}</div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                        Suggested reorder: +{notif.suggestedReorderQty} {notif.unit} (${notif.estimatedReorderCost.toFixed(2)})
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onQuickReorderItem(notif.itemId, notif.suggestedReorderQty)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Reorder +{notif.suggestedReorderQty}</span>
                      </button>

                      {!notif.read && (
                        <button
                          type="button"
                          onClick={() => onMarkInventoryRead(notif.id)}
                          className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                        >
                          Mark Read
                        </button>
                      )}

                      {/* 3-Dot Action Menu */}
                      <div className="relative" data-notif-menu-root="true">
                        <button
                          type="button"
                          aria-label={`More actions for ${notif.sku}`}
                          aria-haspopup="menu"
                          aria-expanded={isMenuOpen}
                          data-testid={`notif-menu-btn-${notif.id}`}
                          onClick={() => setOpenMenuKey((curr) => (curr === notif.id ? null : notif.id))}
                          className="p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                          <div
                            role="menu"
                            className="absolute right-0 top-11 z-40 w-56 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-2xl p-1.5 space-y-0.5 text-xs"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                if (onToggleInventoryRead) {
                                  onToggleInventoryRead(notif.id);
                                } else {
                                  onMarkInventoryRead(notif.id);
                                }
                                setOpenMenuKey(null);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              {notif.read ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              <span>{notif.read ? 'Mark as Unread' : 'Mark as Read'}</span>
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                openForwardDrawer({
                                  notifKey: notif.id,
                                  defaultRecipient: 'Parts Procurement Desk',
                                  payload: { type: 'inventory', notif },
                                })
                              }
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              <Forward className="w-3.5 h-3.5" />
                              <span>Forward Restock Request</span>
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                onQuickReorderItem(notif.itemId, notif.suggestedReorderQty);
                                setOpenMenuKey(null);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>Reorder +{notif.suggestedReorderQty} {notif.unit}</span>
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuKey(null);
                                onOpenInventoryAlerts();
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              <PackageX className="w-3.5 h-3.5" />
                              <span>View in Spare Parts Catalog</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {renderFeedbackBanner(notif.id)}
                  {renderForwardPanel(notif.id)}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 4: Recurring Servicing Due / Overdue */}
      {filteredSchedules.length > 0 && (
        <section
          aria-labelledby="servicing-alerts-heading"
          className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl overflow-visible"
        >
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
            <div>
              <h2
                id="servicing-alerts-heading"
                className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2"
              >
                <Clock className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                <span>Recurring Servicing Due ({filteredSchedules.length})</span>
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                Preventative maintenance contracts requiring intake scheduling or client reminders.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenMaintenance}
              className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:underline whitespace-nowrap"
            >
              Open Servicing
            </button>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredSchedules.map((schedule) => {
              const notifKey = `sched-${schedule.id}`;
              const isRead = readSet.has(notifKey);
              const isMenuOpen = openMenuKey === notifKey;

              return (
                <div
                  key={notifKey}
                  className={`p-4 sm:p-5 space-y-3 ${
                    !isRead ? 'bg-zinc-50/70 dark:bg-zinc-950/30' : ''
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                        <span className="font-bold text-zinc-950 dark:text-white">{schedule.id}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            schedule.status === 'Overdue'
                              ? 'text-rose-700 dark:text-rose-400 font-bold'
                              : 'text-amber-800 dark:text-amber-400 font-bold'
                          }
                        >
                          {schedule.status}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">Due {schedule.nextDueDate}</span>
                        <span aria-hidden="true">·</span>
                        <span className={isRead ? 'text-zinc-500' : 'font-bold text-amber-800 dark:text-amber-300'}>
                          {isRead ? 'Read' : 'Unread'}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-zinc-950 dark:text-white">
                        {schedule.customerName} — {schedule.toolBrand} {schedule.modelNumber}
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Scope: {schedule.recommendedServiceScope}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onCreateJobCardFromSchedule(schedule)}
                        className="px-3.5 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-bold whitespace-nowrap"
                      >
                        Create Job Card
                      </button>

                      {/* 3-Dot Action Menu */}
                      <div className="relative" data-notif-menu-root="true">
                        <button
                          type="button"
                          aria-label={`More actions for ${schedule.id}`}
                          aria-haspopup="menu"
                          aria-expanded={isMenuOpen}
                          data-testid={`notif-menu-btn-${notifKey}`}
                          onClick={() => setOpenMenuKey((curr) => (curr === notifKey ? null : notifKey))}
                          className="p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                          <div
                            role="menu"
                            className="absolute right-0 top-11 z-40 w-56 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-2xl p-1.5 space-y-0.5 text-xs"
                          >
                            {onToggleReadNotification && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onToggleReadNotification(notifKey);
                                  setOpenMenuKey(null);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                              >
                                {isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span>{isRead ? 'Mark as Unread' : 'Mark as Read'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => openReplyForSchedule(notifKey, schedule)}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Reply / Send Reminder</span>
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                openForwardDrawer({
                                  notifKey,
                                  defaultRecipient: 'Counter Intake Desk',
                                  payload: { type: 'schedule', schedule },
                                })
                              }
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              <Forward className="w-3.5 h-3.5" />
                              <span>Forward to Intake / Field Tech</span>
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuKey(null);
                                onCreateJobCardFromSchedule(schedule);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              <span>Create Job Card</span>
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuKey(null);
                                onOpenMaintenance();
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200 flex items-center gap-2"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Open Servicing Schedule</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {renderFeedbackBanner(notifKey)}
                  {renderReplyPanel(notifKey)}
                  {renderForwardPanel(notifKey)}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
