import React, { useState, useRef, useEffect } from 'react';
import { JobCard, JobStatus, InventoryItem, JobPart, TimeLog, OperationalExpense, OperationalExpenseCategory } from '../types';
import { SHOP_TECHNICIANS } from '../data/mockTechnicians';
import { adjudicateWarranty, autoAdjudicateJobCard } from '../utils/warrantyAdjudicator';
import { calculateJobBilling } from '../utils/billing';
import { generateJobCardPdf } from '../utils/generatePdf';
import { buildCustomerPortalUrl } from '../utils/customerPortalUrl';
import { 
  ArrowLeft, Sparkles, Printer, MessageSquare, Plus, Trash2, 
  CheckCircle2, FileText, User, Phone, Wrench, Search, AlertCircle, PenTool, Check, UserCheck,
  Bot, Send, Copy, RotateCcw, Zap, Timer, Play, Square, Clock, ShieldCheck, ShieldAlert, RefreshCw,
  Camera, Video, VideoOff, Upload, Maximize2, X, Download, Image as ImageIcon, Receipt,
  Mic, MicOff, Loader2, Package
} from 'lucide-react';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstanceLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface RecommendedInventoryPart {
  partId: string;
  sku: string;
  name: string;
  category?: string;
  compatibleModels?: string;
  unitPrice: number;
  stockQty: number;
  minStockThreshold?: number;
  binLocation?: string;
  quantity: number;
  confidence: 'HIGH' | 'MEDIUM';
  reason: string;
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

  // AI Recommended Parts State
  const [recommendedParts, setRecommendedParts] = useState<RecommendedInventoryPart[]>([]);
  const [recPartsSummary, setRecPartsSummary] = useState<string | null>(null);
  const [isRecPartsLoading, setIsRecPartsLoading] = useState(false);
  const [recPartsError, setRecPartsError] = useState<string | null>(null);
  
  // AI Panel Tab state: 'chatbot' or 'quick'
  const [aiPanelTab, setAiPanelTab] = useState<'chatbot' | 'quick'>('chatbot');

  // AI Chatbot State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'msg-init',
      role: 'assistant',
      text: `Hello! I am your Gemini AI Repair Assistant for Job Card ${job.id}.\n\nTool Context: ${job.tool.brand} ${job.tool.modelNumber} (${job.tool.voltageRating})\nReported Grievance: "${job.serviceReq.grievanceCategory}: ${job.serviceReq.detailedComplaint}"\n\nHow can I help you troubleshoot this repair on the bench today? You can ask for teardown steps, electrical multimeter tests, or replacement parts.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Parts search state
  const [partSearch, setPartSearch] = useState('');
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [partQty, setPartQty] = useState(1);

  // Operational Expenses (non-part costs) form state
  const [expenseCategory, setExpenseCategory] = useState<OperationalExpenseCategory>('Outsourced Labor');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseVendor, setExpenseVendor] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');

  // Time Clock State inside JobCardDetail
  const [clockInTechId, setClockInTechId] = useState<string>(SHOP_TECHNICIANS[0].id);
  const [serialDraft, setSerialDraft] = useState<string>(job.tool.serialNumber || '');
  const [, setTick] = useState(0);

  // Camera & Dispute Resolution Photo Gallery State
  const [captureStage, setCaptureStage] = useState<'Pre-Repair' | 'Post-Repair'>(() =>
    job.status === 'Ready for Pickup' || job.status === 'Completed' ? 'Post-Repair' : 'Pre-Repair'
  );
  const [photoCaption, setPhotoCaption] = useState('');
  const [galleryFilter, setGalleryFilter] = useState<'All' | 'Pre-Repair' | 'Post-Repair'>('All');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [pdfFeedback, setPdfFeedback] = useState<string | null>(null);
  const [customerLinkCopied, setCustomerLinkCopied] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<{
    dataUrl: string;
    stageLabel: 'Pre-Repair' | 'Post-Repair';
    caption: string;
    uploadedAt: string;
    attachmentIndex: number;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Voice Note Recording & Transcription State
  const [voiceTarget, setVoiceTarget] = useState<'complaint' | 'notes'>('notes');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveSpeechPreview, setLiveSpeechPreview] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);

  // Technician Digital Signature Pad & Job Finalization State
  const signOffCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signOffStrokesRef = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const isSigningRef = useRef<boolean>(false);
  const [hasSignOffStroke, setHasSignOffStroke] = useState<boolean>(false);
  const [isEditingSignature, setIsEditingSignature] = useState<boolean>(!job.technicianSignature);
  const [signOffTechName, setSignOffTechName] = useState<string>(
    job.technicianSignOffBy || job.technician || SHOP_TECHNICIANS[0].name
  );
  const [signOffNotes, setSignOffNotes] = useState<string>(job.technicianSignOffNotes || '');
  const [finalizationTargetStatus, setFinalizationTargetStatus] = useState<'Completed' | 'Ready for Pickup'>('Completed');
  const [qcChecks, setQcChecks] = useState({
    loadTested: true,
    safetyGrounded: true,
    partsVerified: true,
  });
  const [signOffFeedback, setSignOffFeedback] = useState<string | null>(null);
  const [signOffError, setSignOffError] = useState<string | null>(null);

  const currentJobRef = useRef<JobCard>(job);
  const voiceTargetRef = useRef<'complaint' | 'notes'>('notes');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const speechFinalTranscriptRef = useRef<string>('');
  const recordingTimerRef = useRef<number | null>(null);
  const voiceCancelledRef = useRef<boolean>(false);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const cleanupVoiceResources = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // Ignore already-stopped SpeechRecognition
      }
      speechRecRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
  };

  useEffect(() => {
    setCurrentJob(job);
    currentJobRef.current = job;
    setSerialDraft(job.tool.serialNumber || '');
    setIsEditingSignature(!job.technicianSignature);
    setSignOffTechName(job.technicianSignOffBy || job.technician || SHOP_TECHNICIANS[0].name);
    setSignOffNotes(job.technicianSignOffNotes || '');
    setSignOffError(null);
    signOffStrokesRef.current = [];
    setHasSignOffStroke(false);
  }, [job]);

  useEffect(() => {
    currentJobRef.current = currentJob;
  }, [currentJob]);

  useEffect(() => {
    voiceTargetRef.current = voiceTarget;
  }, [voiceTarget]);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        voiceCancelledRef.current = true;
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore stop errors on unmount
        }
      }
      cleanupVoiceResources();
    };
  }, []);

  useEffect(() => {
    if (isCameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraOpen]);

  const formatElapsed = (clockInIso: string) => {
    const elapsedMs = Math.max(0, Date.now() - new Date(clockInIso).getTime());
    const totalSecs = Math.floor(elapsedMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs > 0 ? `${hrs}h ` : ''}${mins}m ${secs}s`;
  };

  // Technician Signature Pad Canvas Engine
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = signOffCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const redrawSignOffCanvas = () => {
    const canvas = signOffCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    signOffStrokesRef.current.forEach((stroke) => {
      if (stroke.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      if (stroke.length === 1) {
        ctx.lineTo(stroke[0].x + 0.5, stroke[0].y + 0.5);
      } else {
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
      }
      ctx.stroke();
    });
  };

  const handleSignaturePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = signOffCanvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors in synthetic pointer contexts
    }
    const point = getCanvasPoint(e);
    signOffStrokesRef.current.push([point]);
    isSigningRef.current = true;
    setSignOffError(null);
    redrawSignOffCanvas();
  };

  const handleSignaturePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSigningRef.current) return;
    e.preventDefault();
    const point = getCanvasPoint(e);
    const activeStroke = signOffStrokesRef.current[signOffStrokesRef.current.length - 1];
    if (!activeStroke) return;
    activeStroke.push(point);

    const canvas = signOffCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && activeStroke.length >= 2) {
      const prev = activeStroke[activeStroke.length - 2];
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  };

  const handleSignaturePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSigningRef.current) return;
    isSigningRef.current = false;
    const canvas = signOffCanvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors
      }
    }
    setHasSignOffStroke(signOffStrokesRef.current.length > 0);
  };

  const handleUndoSignOffStroke = () => {
    if (signOffStrokesRef.current.length === 0) return;
    signOffStrokesRef.current.pop();
    redrawSignOffCanvas();
    setHasSignOffStroke(signOffStrokesRef.current.length > 0);
  };

  const handleClearSignOffCanvas = () => {
    signOffStrokesRef.current = [];
    const canvas = signOffCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignOffStroke(false);
    setSignOffError(null);
  };

  const handleCommitTechnicianSignOff = (finalizeStatus?: 'Completed' | 'Ready for Pickup') => {
    setSignOffError(null);
    let signatureDataUrl = currentJob.technicianSignature;

    if (isEditingSignature) {
      if (!hasSignOffStroke || !signOffCanvasRef.current) {
        setSignOffError('Draw the technician signature on the pad before signing off.');
        return;
      }
      signatureDataUrl = signOffCanvasRef.current.toDataURL('image/png');
    }

    if (!signatureDataUrl) {
      setSignOffError('A technician digital signature is required to sign off this repair.');
      return;
    }

    const nowIso = new Date().toISOString();
    const targetStatus: JobStatus = finalizeStatus || currentJob.status;
    const isStatusChanging = targetStatus !== currentJob.status;
    const signerName = signOffTechName.trim() || currentJob.technician || 'Bench Technician';

    const qcSummary = [
      qcChecks.loadTested ? 'Load Tested' : null,
      qcChecks.safetyGrounded ? 'Safety Checked' : null,
      qcChecks.partsVerified ? 'Parts Verified' : null,
    ]
      .filter(Boolean)
      .join(', ');

    const prevHistory = currentJob.stageHistory || [
      { status: currentJob.status, enteredAt: currentJob.stageEnteredAt || currentJob.createdAt },
    ];

    const nextAudit = [
      ...(currentJob.auditLogs || []),
      {
        id: `aud-signoff-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: signerName.split(' (')[0],
        userRole: 'Technician',
        action: finalizeStatus ? 'REPAIR_FINALIZED_SIGNED_OFF' : 'TECHNICIAN_SIGNED_OFF',
        previousState: currentJob.status,
        newState: `Status: ${targetStatus} · QC: ${qcSummary || 'Standard'}${signOffNotes.trim() ? ` · ${signOffNotes.trim()}` : ''}`,
      },
    ];

    if (deductStockOn === 'Completion' && targetStatus === 'Completed' && currentJob.status !== 'Completed') {
      currentJob.parts.forEach((p) => {
        onDeductInventoryStock(p.partId, p.quantity);
      });
    }

    const updated: JobCard = {
      ...currentJob,
      status: targetStatus,
      technicianSignature: signatureDataUrl,
      technicianSignOffBy: signerName,
      technicianSignOffAt: nowIso,
      technicianSignOffNotes: signOffNotes.trim() || qcSummary || undefined,
      stageEnteredAt: isStatusChanging ? nowIso : currentJob.stageEnteredAt,
      stageHistory: isStatusChanging ? [...prevHistory, { status: targetStatus, enteredAt: nowIso }] : prevHistory,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };

    setCurrentJob(updated);
    onUpdateJob(updated);
    setIsEditingSignature(false);
    setHasSignOffStroke(false);
    signOffStrokesRef.current = [];
    setSignOffFeedback(
      finalizeStatus
        ? `Signed off by ${signerName.split(' (')[0]} and finalized as ${targetStatus}.`
        : `Technician digital sign-off saved by ${signerName.split(' (')[0]}.`
    );
    window.setTimeout(() => setSignOffFeedback(null), 4000);
  };

  const handleClearSavedSignOff = () => {
    const nowIso = new Date().toISOString();
    const nextAudit = [
      ...(currentJob.auditLogs || []),
      {
        id: `aud-signclear-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: currentJob.technician || 'Bench Technician',
        userRole: 'Technician',
        action: 'TECHNICIAN_SIGNOFF_CLEARED',
        newState: 'Digital sign-off cleared for re-signature',
      },
    ];

    const updated: JobCard = {
      ...currentJob,
      technicianSignature: undefined,
      technicianSignOffBy: undefined,
      technicianSignOffAt: undefined,
      technicianSignOffNotes: undefined,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };

    setCurrentJob(updated);
    onUpdateJob(updated);
    setIsEditingSignature(true);
    setSignOffFeedback(null);
    setSignOffError(null);
    signOffStrokesRef.current = [];
    setHasSignOffStroke(false);
  };

  const handleDetailClockIn = () => {
    const targetTech = SHOP_TECHNICIANS.find((t) => t.id === clockInTechId);
    if (!targetTech) return;

    const newLog: TimeLog = {
      id: `time-det-${Date.now()}`,
      jobCardId: currentJob.id,
      technicianId: targetTech.id,
      technicianName: targetTech.name,
      clockInTime: new Date().toISOString(),
      notes: 'Bench repair & overhaul session',
      status: 'ACTIVE',
    };

    const updated = {
      ...currentJob,
      timeLogs: [newLog, ...(currentJob.timeLogs || [])],
      updatedAt: new Date().toISOString(),
    };

    setCurrentJob(updated);
    onUpdateJob(updated);
  };

  const handleDetailClockOut = (logId: string) => {
    const clockOutTime = new Date().toISOString();
    const updatedTimeLogs = (currentJob.timeLogs || []).map((l) => {
      if (l.id === logId) {
        const startTime = new Date(l.clockInTime).getTime();
        const endTime = new Date(clockOutTime).getTime();
        const diffMs = Math.max(60000, endTime - startTime);
        const durationMinutes = Math.round(diffMs / (1000 * 60));
        const durationHours = Math.round((durationMinutes / 60) * 10) / 10;
        return {
          ...l,
          clockOutTime,
          durationMinutes,
          durationHours,
          status: 'COMPLETED' as const,
        };
      }
      return l;
    });

    const totalJobHours = updatedTimeLogs
      .filter((l) => l.status === 'COMPLETED')
      .reduce((sum, l) => sum + (l.durationHours || 0), 0);

    const newLaborHours = totalJobHours > 0 ? totalJobHours : currentJob.laborHours;
    const newTotal = calculateJobBilling(
      currentJob.parts,
      newLaborHours,
      currentJob.laborRate,
      currentJob.operationalExpenses || [],
      currentJob.discount,
      currentJob.taxRate
    ).totalAmount;

    const updated = {
      ...currentJob,
      timeLogs: updatedTimeLogs,
      laborHours: newLaborHours,
      totalAmount: newTotal,
      updatedAt: new Date().toISOString(),
    };

    setCurrentJob(updated);
    onUpdateJob(updated);
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const searchedInventory = inventory.filter((item) =>
    item.name.toLowerCase().includes(partSearch.toLowerCase()) ||
    item.sku.toLowerCase().includes(partSearch.toLowerCase()) ||
    item.category.toLowerCase().includes(partSearch.toLowerCase())
  ).slice(0, 10);

  const recalculateTotal = (
    parts: JobPart[],
    laborHours: number,
    laborRate: number,
    discount: number,
    taxRate: number,
    operationalExpenses: OperationalExpense[] = currentJob.operationalExpenses || []
  ) => {
    return calculateJobBilling(
      parts,
      laborHours,
      laborRate,
      operationalExpenses,
      discount,
      taxRate
    ).totalAmount;
  };

  const handleStatusChange = (newStatus: JobStatus) => {
    const nowIso = new Date().toISOString();
    const prevHistory = currentJob.stageHistory || [
      { status: currentJob.status, enteredAt: currentJob.stageEnteredAt || currentJob.createdAt },
    ];
    const nextAudit = [
      ...(currentJob.auditLogs || []),
      {
        id: `aud-st-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: currentJob.technician || 'Bench Technician',
        userRole: 'Technician',
        action: 'STAGE_CHANGED',
        previousState: currentJob.status,
        newState: `Status: ${newStatus}`,
      },
    ];
    const updated: JobCard = {
      ...currentJob,
      status: newStatus,
      stageEnteredAt: currentJob.status === newStatus ? currentJob.stageEnteredAt : nowIso,
      stageHistory: currentJob.status === newStatus ? prevHistory : [...prevHistory, { status: newStatus, enteredAt: nowIso }],
      auditLogs: currentJob.status === newStatus ? currentJob.auditLogs : nextAudit,
      updatedAt: nowIso,
    };
    
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

  const handleReAdjudicateWarranty = () => {
    const nowIso = new Date().toISOString();
    const candidate: JobCard = {
      ...currentJob,
      tool: {
        ...currentJob.tool,
        serialNumber: serialDraft.trim() || currentJob.tool.serialNumber,
      },
    };
    const evaluated = adjudicateWarranty(candidate.tool, {
      grievanceCategory: candidate.serviceReq.grievanceCategory,
      detailedComplaint: candidate.serviceReq.detailedComplaint,
    });
    const adjudicatedJob = autoAdjudicateJobCard({
      ...candidate,
      tool: {
        ...candidate.tool,
        warrantyStatus: evaluated.recommendedWarrantyStatus,
      },
      auditLogs: [
        ...(currentJob.auditLogs || []),
        {
          id: `aud-war-${Date.now()}`,
          timestamp: nowIso.slice(0, 16).replace('T', ' '),
          userName: 'Warranty Adjudicator',
          userRole: 'Automated Helper',
          action: 'WARRANTY_ADJUDICATED',
          previousState: `${currentJob.tool.warrantyFlag || 'Unchecked'} (${currentJob.tool.serialNumber})`,
          newState: `${evaluated.flag} (${candidate.tool.serialNumber}) · Mfg ${evaluated.manufactureDate || 'Unknown'}`,
        },
      ],
      updatedAt: nowIso,
    });
    setCurrentJob(adjudicatedJob);
    onUpdateJob(adjudicatedJob);
  };

  // Append captured/uploaded image data URL to JobCard.attachments + PhotoEvidence metadata
  const attachImageToJobCard = (dataUrl: string, source: 'Device Camera' | 'File Upload') => {
    const nowIso = new Date().toISOString();
    const displayTs = nowIso.slice(0, 16).replace('T', ' ');
    const stageType = captureStage === 'Pre-Repair' ? 'Intake Inspection' : 'QC Final';
    const cleanCaption =
      photoCaption.trim() ||
      (captureStage === 'Pre-Repair'
        ? `Pre-repair condition (${source})`
        : `Post-repair QC verification (${source})`);

    const nextAttachments = [...(currentJob.attachments || []), dataUrl];
    const nextPhotos = [
      ...(currentJob.photos || []),
      {
        id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        caption: cleanCaption,
        stage: stageType as 'Intake Inspection' | 'QC Final',
        dataUrl,
        uploadedAt: displayTs,
      },
    ];
    const nextAudit = [
      ...(currentJob.auditLogs || []),
      {
        id: `aud-ph-${Date.now()}`,
        timestamp: displayTs,
        userName: currentJob.technician || 'Counter Operator',
        userRole: 'Technician',
        action: 'PHOTO_ATTACHMENT_CAPTURED',
        newState: `${captureStage}: ${cleanCaption}`,
      },
    ];

    const updated: JobCard = {
      ...currentJob,
      attachments: nextAttachments,
      photos: nextPhotos,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };

    setCurrentJob(updated);
    onUpdateJob(updated);
    setPhotoCaption('');
    setCaptureFeedback(`Saved ${captureStage} image (${nextAttachments.length} total attachments)`);
    setTimeout(() => setCaptureFeedback(null), 2800);
  };

  const handleOpenCamera = async (requestedFacing: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Live camera API is unavailable in this browser context. Use "Upload / Mobile Camera" to attach photos.');
      return;
    }

    stopCameraStream();

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: requestedFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setFacingMode(requestedFacing);
      setIsCameraOpen(true);
    } catch (err: any) {
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access in browser settings or use "Upload / Mobile Camera".'
          : `Unable to start device camera (${err?.message || 'no camera detected'}). Use "Upload / Mobile Camera" below.`
      );
    }
  };

  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    handleOpenCamera(nextMode);
  };

  const handleCaptureCameraFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera stream is still initializing. Wait a moment and try again.');
      return;
    }

    const maxWidth = 960;
    const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    attachImageToJobCard(dataUrl, 'Device Camera');
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const rawResult = typeof reader.result === 'string' ? reader.result : '';
        if (!rawResult) return;

        const img = new Image();
        img.onload = () => {
          const maxWidth = 960;
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            attachImageToJobCard(canvas.toDataURL('image/jpeg', 0.82), 'File Upload');
          } else {
            attachImageToJobCard(rawResult, 'File Upload');
          }
        };
        img.onerror = () => attachImageToJobCard(rawResult, 'File Upload');
        img.src = rawResult;
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleRemoveAttachment = (dataUrl: string, attachmentIndex: number) => {
    const nowIso = new Date().toISOString();
    const currentAttachments = [...(currentJob.attachments || [])];
    if (attachmentIndex >= 0 && attachmentIndex < currentAttachments.length) {
      currentAttachments.splice(attachmentIndex, 1);
    }

    const nextPhotos = (currentJob.photos || []).filter((p) => p.dataUrl !== dataUrl);
    const nextAudit = [
      ...(currentJob.auditLogs || []),
      {
        id: `aud-ph-del-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: currentJob.technician || 'Counter Operator',
        userRole: 'Technician',
        action: 'PHOTO_ATTACHMENT_REMOVED',
        newState: `Removed dispute evidence photo`,
      },
    ];

    const updated: JobCard = {
      ...currentJob,
      attachments: currentAttachments,
      photos: nextPhotos,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };

    setCurrentJob(updated);
    onUpdateJob(updated);
    if (lightboxItem && lightboxItem.dataUrl === dataUrl) {
      setLightboxItem(null);
    }
  };

  const formatRecordingClock = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const applyVoiceTranscriptToJob = (transcriptText: string, target: 'complaint' | 'notes') => {
    const trimmed = transcriptText.trim();
    if (!trimmed) return;

    const latestJob = currentJobRef.current;
    const nowIso = new Date().toISOString();
    const timeStamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const targetLabel = target === 'complaint' ? 'Detailed Complaint' : 'Internal Notes';

    const nextAudit = [
      ...(latestJob.auditLogs || []),
      {
        id: `aud-voice-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: latestJob.technician || 'Counter Operator',
        userRole: 'Technician',
        action: 'VOICE_NOTE_TRANSCRIBED',
        newState: `${targetLabel}: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? '...' : ''}"`,
      },
    ];

    let updated: JobCard;
    if (target === 'complaint') {
      const existingComplaint = (latestJob.serviceReq.detailedComplaint || '').trim();
      const combinedComplaint = existingComplaint
        ? `${existingComplaint}\n[Voice Note ${timeStamp}]: ${trimmed}`
        : trimmed;
      updated = {
        ...latestJob,
        serviceReq: {
          ...latestJob.serviceReq,
          detailedComplaint: combinedComplaint,
        },
        auditLogs: nextAudit,
        updatedAt: nowIso,
      };
    } else {
      const existingNotes = (latestJob.diagnosticNotes || '').trim();
      const combinedNotes = existingNotes
        ? `${existingNotes}\n\n[Voice Observation ${timeStamp}]: ${trimmed}`
        : `[Voice Observation ${timeStamp}]: ${trimmed}`;
      updated = {
        ...latestJob,
        diagnosticNotes: combinedNotes,
        auditLogs: nextAudit,
        updatedAt: nowIso,
      };
    }

    currentJobRef.current = updated;
    setCurrentJob(updated);
    onUpdateJob(updated);
    setVoiceFeedback(`Transcribed voice note appended to ${targetLabel}.`);
    window.setTimeout(() => setVoiceFeedback(null), 4000);
  };

  const handleStartVoiceNote = async (explicitTarget?: 'complaint' | 'notes') => {
    const activeTarget = explicitTarget || voiceTarget;
    if (explicitTarget) {
      setVoiceTarget(explicitTarget);
      voiceTargetRef.current = explicitTarget;
    } else {
      voiceTargetRef.current = voiceTarget;
    }

    if (isRecordingVoice || isTranscribingVoice) return;

    setVoiceError(null);
    setVoiceFeedback(null);
    setLiveSpeechPreview('');
    speechFinalTranscriptRef.current = '';
    audioChunksRef.current = [];
    voiceCancelledRef.current = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setVoiceError('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const supportedMimeType =
        typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
          ? preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || ''
          : '';

      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const wasCancelled = voiceCancelledRef.current;
        const mimeType = recorder.mimeType || supportedMimeType || 'audio/webm';
        const chunks = [...audioChunksRef.current];
        const speechFallback = speechFinalTranscriptRef.current.trim();
        const targetField = voiceTargetRef.current;

        cleanupVoiceResources();
        setIsRecordingVoice(false);

        if (wasCancelled) {
          audioChunksRef.current = [];
          setLiveSpeechPreview('');
          return;
        }

        const audioBlob = new Blob(chunks, { type: mimeType });
        if (audioBlob.size === 0 && !speechFallback) {
          setVoiceError('No audio was captured. Check your microphone input and try again.');
          return;
        }

        setIsTranscribingVoice(true);
        try {
          let finalTranscript = '';

          if (audioBlob.size > 0) {
            const base64Audio = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
              reader.onerror = () => reject(new Error('Failed to read recorded audio'));
              reader.readAsDataURL(audioBlob);
            });

            const response = await fetch('/api/ai/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64Audio,
                mimeType,
                targetField,
                toolContext: {
                  id: currentJobRef.current.id,
                  toolName: `${currentJobRef.current.tool.brand} ${currentJobRef.current.tool.modelNumber}`,
                },
              }),
            });

            if (response.ok) {
              const data = await response.json();
              finalTranscript = (data.transcript || '').trim();
            } else if (!speechFallback) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(errData.error || 'Voice transcription service returned an error.');
            }
          }

          const resolvedTranscript = finalTranscript || speechFallback;
          if (!resolvedTranscript) {
            setVoiceError('No speech detected in the recording. Please speak clearly and try again.');
          } else {
            applyVoiceTranscriptToJob(resolvedTranscript, targetField);
          }
        } catch (err: any) {
          if (speechFallback) {
            applyVoiceTranscriptToJob(speechFallback, targetField);
          } else {
            setVoiceError(err?.message || 'Unable to transcribe recorded voice note.');
          }
        } finally {
          setIsTranscribingVoice(false);
          setLiveSpeechPreview('');
          setRecordingSeconds(0);
          audioChunksRef.current = [];
        }
      };

      recorder.start(250);
      setRecordingSeconds(0);
      setIsRecordingVoice(true);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 119) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
            }
            return 120;
          }
          return prev + 1;
        });
      }, 1000);

      // Start optional browser Web Speech Recognition for live captioning & fallback
      const win = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
      };
      const SpeechRecCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechRecCtor) {
        try {
          const recognition = new SpeechRecCtor();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          recognition.onresult = (event: SpeechRecognitionEventLike) => {
            let interim = '';
            let finalized = speechFinalTranscriptRef.current;
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcriptPiece = event.results[i][0]?.transcript || '';
              if (event.results[i].isFinal) {
                finalized = `${finalized} ${transcriptPiece}`.trim();
              } else {
                interim += transcriptPiece;
              }
            }
            speechFinalTranscriptRef.current = finalized;
            setLiveSpeechPreview(`${finalized}${interim ? ` ${interim}` : ''}`.trim());
          };
          recognition.onerror = () => {
            // Silently rely on MediaRecorder + server Gemini transcription if SpeechRecognition fails
          };
          recognition.start();
          speechRecRef.current = recognition;
        } catch {
          // Live SpeechRecognition unavailable; MediaRecorder capture proceeds normally
        }
      }
    } catch (err: any) {
      cleanupVoiceResources();
      setIsRecordingVoice(false);
      setVoiceError(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow mic access in browser settings to record voice notes.'
          : 'Unable to access microphone device.'
      );
    }
  };

  const handleStopVoiceNote = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupVoiceResources();
      setIsRecordingVoice(false);
    }
  };

  const handleCancelVoiceNote = () => {
    voiceCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupVoiceResources();
      setIsRecordingVoice(false);
    }
    setRecordingSeconds(0);
    setLiveSpeechPreview('');
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

  const handleLinkSkuDirectly = (sku: string) => {
    const invItem = inventory.find(i => i.sku.toLowerCase() === sku.toLowerCase()) || inventory[0];
    if (!invItem) return;

    const existingIndex = currentJob.parts.findIndex(p => p.partId === invItem.id);
    let updatedParts: JobPart[];

    if (existingIndex >= 0) {
      updatedParts = [...currentJob.parts];
      const existing = updatedParts[existingIndex];
      const newQty = existing.quantity + 1;
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
        quantity: 1,
        total: invItem.unitPrice,
      };
      updatedParts = [...currentJob.parts, newPart];
    }

    const newTotal = recalculateTotal(updatedParts, currentJob.laborHours, currentJob.laborRate, currentJob.discount, currentJob.taxRate);
    const updatedJob = { ...currentJob, parts: updatedParts, totalAmount: newTotal, updatedAt: new Date().toISOString() };
    setCurrentJob(updatedJob);
    onUpdateJob(updatedJob);
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
    const updatedJob = { ...currentJob, laborHours: hours, totalAmount: newTotal, updatedAt: new Date().toISOString() };
    setCurrentJob(updatedJob);
    onUpdateJob(updatedJob);
  };

  const handleAddOperationalExpense = () => {
    const parsedAmount = parseFloat(expenseAmount);
    if (!expenseDescription.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) return;

    const nowIso = new Date().toISOString();
    const newExpense: OperationalExpense = {
      id: `exp-${Date.now()}`,
      category: expenseCategory,
      description: expenseDescription.trim(),
      vendor: expenseVendor.trim() || undefined,
      amount: Math.round(parsedAmount * 100) / 100,
      date: nowIso.slice(0, 10),
    };

    const updatedExpenses = [...(currentJob.operationalExpenses || []), newExpense];
    const newTotal = recalculateTotal(
      currentJob.parts,
      currentJob.laborHours,
      currentJob.laborRate,
      currentJob.discount,
      currentJob.taxRate,
      updatedExpenses
    );

    const nextAudit = [
      ...(currentJob.auditLogs || []),
      {
        id: `aud-exp-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: currentJob.technician || 'Counter Operator',
        userRole: 'Technician',
        action: 'OPERATIONAL_EXPENSE_ADDED',
        newState: `${newExpense.category}: ${newExpense.description} ($${newExpense.amount.toFixed(2)})`,
      },
    ];

    const updatedJob: JobCard = {
      ...currentJob,
      operationalExpenses: updatedExpenses,
      totalAmount: newTotal,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };

    setCurrentJob(updatedJob);
    onUpdateJob(updatedJob);
    setExpenseDescription('');
    setExpenseVendor('');
    setExpenseAmount('');
  };

  const handleRemoveOperationalExpense = (expenseId: string) => {
    const nowIso = new Date().toISOString();
    const existing = currentJob.operationalExpenses || [];
    const target = existing.find((e) => e.id === expenseId);
    const updatedExpenses = existing.filter((e) => e.id !== expenseId);
    const newTotal = recalculateTotal(
      currentJob.parts,
      currentJob.laborHours,
      currentJob.laborRate,
      currentJob.discount,
      currentJob.taxRate,
      updatedExpenses
    );

    const nextAudit = target
      ? [
          ...(currentJob.auditLogs || []),
          {
            id: `aud-exp-del-${Date.now()}`,
            timestamp: nowIso.slice(0, 16).replace('T', ' '),
            userName: currentJob.technician || 'Counter Operator',
            userRole: 'Technician',
            action: 'OPERATIONAL_EXPENSE_REMOVED',
            newState: `Removed ${target.category}: ${target.description} ($${target.amount.toFixed(2)})`,
          },
        ]
      : currentJob.auditLogs;

    const updatedJob: JobCard = {
      ...currentJob,
      operationalExpenses: updatedExpenses,
      totalAmount: newTotal,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };

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

  // AI Recommended Parts Analyzer (based on tool model + reported complaint)
  const handleAnalyzeRecommendedParts = async () => {
    setIsRecPartsLoading(true);
    setRecPartsError(null);

    try {
      const response = await fetch('/api/ai/recommend-parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: currentJob.tool,
          serviceReq: currentJob.serviceReq,
          diagnosticNotes: currentJob.diagnosticNotes,
          availableParts: inventory.map((i) => ({
            id: i.id,
            sku: i.sku,
            name: i.name,
            category: i.category,
            brand: i.brand,
            compatibleModels: i.compatibleModels,
            unitPrice: i.unitPrice,
            stockQty: i.stockQty,
            minStockThreshold: i.minStockThreshold,
            binLocation: i.binLocation,
          })),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to analyze recommended parts');
      }

      setRecPartsSummary(data.analysisSummary || null);
      setRecommendedParts(Array.isArray(data.recommendedParts) ? data.recommendedParts : []);
    } catch (err: any) {
      setRecPartsError(err?.message || 'Unable to generate part recommendations.');
    } finally {
      setIsRecPartsLoading(false);
    }
  };

  const handleAddRecommendedPart = (rec: RecommendedInventoryPart, qtyOverride?: number) => {
    const invItem =
      inventory.find((i) => i.id === rec.partId || i.sku.toLowerCase() === rec.sku.toLowerCase());
    if (!invItem) return;

    const addQty = Math.max(1, qtyOverride ?? rec.quantity ?? 1);
    const existingIndex = currentJob.parts.findIndex((p) => p.partId === invItem.id);
    let updatedParts: JobPart[];

    if (existingIndex >= 0) {
      updatedParts = [...currentJob.parts];
      const existing = updatedParts[existingIndex];
      const newQty = existing.quantity + addQty;
      updatedParts[existingIndex] = {
        ...existing,
        quantity: newQty,
        total: Math.round(newQty * existing.unitPrice * 100) / 100,
      };
    } else {
      const newPart: JobPart = {
        partId: invItem.id,
        sku: invItem.sku,
        name: invItem.name,
        unitPrice: invItem.unitPrice,
        quantity: addQty,
        total: Math.round(addQty * invItem.unitPrice * 100) / 100,
      };
      updatedParts = [...currentJob.parts, newPart];
    }

    const nowIso = new Date().toISOString();
    const newTotal = recalculateTotal(
      updatedParts,
      currentJob.laborHours,
      currentJob.laborRate,
      currentJob.discount,
      currentJob.taxRate
    );
    const nextAudit = [
      ...(currentJob.auditLogs || []),
      {
        id: `aud-rec-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: currentJob.technician || 'Bench Technician',
        userRole: 'Technician',
        action: 'AI_RECOMMENDED_PART_ADDED',
        newState: `Added ${invItem.sku} (${invItem.name}) x${addQty}`,
      },
    ];

    const updatedJob: JobCard = {
      ...currentJob,
      parts: updatedParts,
      totalAmount: newTotal,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };

    setCurrentJob(updatedJob);
    onUpdateJob(updatedJob);
  };

  const handleAddAllRecommendedParts = () => {
    const unlinked = recommendedParts.filter(
      (rec) => !currentJob.parts.some((p) => p.partId === rec.partId || p.sku === rec.sku)
    );
    if (unlinked.length === 0) return;

    let updatedParts = [...currentJob.parts];
    const addedLabels: string[] = [];

    unlinked.forEach((rec) => {
      const invItem = inventory.find(
        (i) => i.id === rec.partId || i.sku.toLowerCase() === rec.sku.toLowerCase()
      );
      if (!invItem) return;
      const addQty = Math.max(1, rec.quantity || 1);
      updatedParts.push({
        partId: invItem.id,
        sku: invItem.sku,
        name: invItem.name,
        unitPrice: invItem.unitPrice,
        quantity: addQty,
        total: Math.round(addQty * invItem.unitPrice * 100) / 100,
      });
      addedLabels.push(`${invItem.sku} x${addQty}`);
    });

    if (addedLabels.length === 0) return;

    const nowIso = new Date().toISOString();
    const newTotal = recalculateTotal(
      updatedParts,
      currentJob.laborHours,
      currentJob.laborRate,
      currentJob.discount,
      currentJob.taxRate
    );
    const nextAudit = [
      ...(currentJob.auditLogs || []),
      {
        id: `aud-rec-all-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: currentJob.technician || 'Bench Technician',
        userRole: 'Technician',
        action: 'AI_RECOMMENDED_PARTS_BATCH_ADDED',
        newState: `Added ${addedLabels.join(', ')}`,
      },
    ];

    const updatedJob: JobCard = {
      ...currentJob,
      parts: updatedParts,
      totalAmount: newTotal,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };

    setCurrentJob(updatedJob);
    onUpdateJob(updatedJob);
  };

  // Send Chat Message to Gemini Repair Chatbot
  const handleSendChatMessage = async (promptOverride?: string) => {
    const textToSend = promptOverride || chatInput.trim();
    if (!textToSend || isChatSending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsChatSending(true);

    try {
      const response = await fetch('/api/ai/repair-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, text: m.text })),
          jobCardContext: currentJob,
          availableParts: inventory.map(i => ({ id: i.id, sku: i.sku, name: i.name, unitPrice: i.unitPrice, binLocation: i.binLocation })),
        }),
      });

      if (!response.ok) throw new Error('Repair Chatbot service returned an error');
      const data = await response.json();

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: data.reply || 'No diagnostic response generated.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        text: `⚠️ Diagnostic Chat Error: ${err.message || 'Failed to connect to Gemini API'}. Please try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsChatSending(false);
    }
  };

  const handleCopyChatToDiagnosticNotes = (msgText: string, msgId: string) => {
    const existing = currentJob.diagnosticNotes ? `${currentJob.diagnosticNotes}\n\n` : '';
    const updated = {
      ...currentJob,
      diagnosticNotes: `${existing}[AI Chat Diagnostic Note]:\n${msgText}`,
      updatedAt: new Date().toISOString(),
    };
    setCurrentJob(updated);
    onUpdateJob(updated);

    setCopiedLogId(msgId);
    setTimeout(() => setCopiedLogId(null), 3000);
  };

  // Helper to extract SKUs mentioned in text
  const extractSkusFromText = (text: string) => {
    const matches: string[] = [];
    inventory.forEach((i) => {
      if (text.toUpperCase().includes(i.sku.toUpperCase())) {
        if (!matches.includes(i.sku)) matches.push(i.sku);
      }
    });
    return matches;
  };

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

  const statuses: JobStatus[] = ['Intake', 'Diagnosis', 'Awaiting Approval', 'Awaiting Parts', 'In Service', 'Ready for Pickup', 'Completed'];

  const activeAdjudication = currentJob.tool.warrantyAdjudication || (() => {
    const res = adjudicateWarranty(currentJob.tool, {
      grievanceCategory: currentJob.serviceReq.grievanceCategory,
      detailedComplaint: currentJob.serviceReq.detailedComplaint,
    });
    const { recommendedWarrantyStatus: _, ...adj } = res;
    return adj;
  })();

  const timeInStageLabel = (() => {
    const startStr = currentJob.stageEnteredAt || currentJob.updatedAt || currentJob.intakeDate;
    const startMs = new Date(startStr.includes('T') ? startStr : startStr.replace(' ', 'T')).getTime();
    if (Number.isNaN(startMs)) return 'Recently';
    const diffHours = Math.max(0, Math.floor((Date.now() - startMs) / (1000 * 60 * 60)));
    if (diffHours < 1) return '< 1h in stage';
    if (diffHours < 24) return `${diffHours}h in stage`;
    return `${Math.floor(diffHours / 24)}d ${diffHours % 24}h in stage`;
  })();

  const handleDownloadPdf = () => {
    const { doc, filename } = generateJobCardPdf(currentJob);
    doc.save(filename);

    const nowIso = new Date().toISOString();
    const nextAudit = [
      ...(currentJob.auditLogs || []),
      {
        id: `aud-pdf-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: currentJob.technician || 'Counter Operator',
        userRole: 'Counter / Technician',
        action: 'CUSTOMER_PDF_DOWNLOADED',
        newState: `Downloaded ${filename}`,
      },
    ];

    const updatedJob: JobCard = {
      ...currentJob,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };
    setCurrentJob(updatedJob);
    onUpdateJob(updatedJob);

    setPdfFeedback(`Saved ${filename}`);
    setTimeout(() => setPdfFeedback(null), 3500);
  };

  const handleCopyCustomerStatusLink = async () => {
    const link = buildCustomerPortalUrl(currentJob);
    try {
      await navigator.clipboard.writeText(link);
      setCustomerLinkCopied(true);
      setTimeout(() => setCustomerLinkCopied(false), 3000);
    } catch {
      setCustomerLinkCopied(false);
    }
  };

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
                <span
                  className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                    activeAdjudication.flag === 'In-Warranty'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                      : 'bg-amber-950/70 text-amber-300 border-amber-700/70'
                  }`}
                >
                  {activeAdjudication.flag === 'In-Warranty' ? (
                    <ShieldCheck className="w-3 h-3" />
                  ) : (
                    <ShieldAlert className="w-3 h-3" />
                  )}
                  <span>{activeAdjudication.flag}</span>
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                Model: <span className="text-white font-bold">{currentJob.tool.modelNumber}</span> (SN: {currentJob.tool.serialNumber}) · {timeInStageLabel}
                {currentJob.technicianSignature && (
                  <span className="text-emerald-400 font-semibold"> · Tech Signed Off</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto shrink-0">
            <button
              onClick={handleCopyCustomerStatusLink}
              className="px-3 py-2 text-xs font-bold text-zinc-200 bg-zinc-950 hover:bg-zinc-800 rounded-xl transition-all flex items-center gap-1.5 border border-zinc-800"
              title="Copy direct Customer Status Portal link"
            >
              {customerLinkCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{customerLinkCopied ? 'Link Copied' : 'Customer Link'}</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all flex items-center gap-1.5 shadow active:scale-95"
              title="Download branded customer PDF service record"
            >
              <Download className="w-4 h-4" />
              <span>{pdfFeedback ? 'PDF Downloaded' : 'Download PDF'}</span>
            </button>

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
            <span className="text-[11px] text-zinc-400">{timeInStageLabel} · Click a stage to update progress</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {statuses.map((st, idx) => {
              const effectiveCurrent = currentJob.status === 'In Repair' ? 'In Service' : currentJob.status;
              const isActive = effectiveCurrent === st;
              const isPast = statuses.indexOf(effectiveCurrent) > idx;
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
        
        {/* Left Column: Tool Specs & Gemini AI Diagnosis Chatbot */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Tool Specs Box */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-2 font-mono">
              <Wrench className="w-4 h-4 text-white" />
              <span>Bosch / Vendor Tool Specifications &amp; Customer</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
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

              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-1">
                <span className="text-zinc-500 text-[10px] font-bold uppercase mb-1 font-mono flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-white" />
                  <span>Assigned Technician</span>
                </span>
                <select
                  value={currentJob.technician || ''}
                  onChange={(e) => {
                    const updated = { ...currentJob, technician: e.target.value, updatedAt: new Date().toISOString() };
                    setCurrentJob(updated);
                    onUpdateJob(updated);
                  }}
                  className="w-full bg-zinc-900 border border-zinc-700 text-xs text-white rounded-lg px-2 py-1.5 focus:outline-none font-mono font-bold"
                >
                  <option value="">Unassigned Tech</option>
                  {SHOP_TECHNICIANS.map(t => (
                    <option key={t.id} value={t.name}>{t.name.split(' ')[0]} - {t.role}</option>
                  ))}
                </select>
                <div className="text-[10px] text-zinc-500 font-mono">
                  Current Tech: <span className="text-zinc-300 font-bold">{currentJob.technician || 'None'}</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-zinc-400 font-semibold block uppercase tracking-wider text-[10px] font-mono">
                    Customer Grievance &amp; Detailed Complaint
                  </span>
                  <div className="font-bold text-white text-xs mt-0.5">{currentJob.serviceReq.grievanceCategory}</div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    isRecordingVoice && voiceTarget === 'complaint'
                      ? handleStopVoiceNote()
                      : handleStartVoiceNote('complaint')
                  }
                  disabled={isTranscribingVoice || (isRecordingVoice && voiceTarget !== 'complaint')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 border transition-colors disabled:opacity-40 ${
                    isRecordingVoice && voiceTarget === 'complaint'
                      ? 'bg-rose-950 text-rose-200 border-rose-600 animate-pulse'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-700'
                  }`}
                >
                  {isRecordingVoice && voiceTarget === 'complaint' ? (
                    <>
                      <Square className="w-3 h-3 fill-rose-300" />
                      <span>Stop ({formatRecordingClock(recordingSeconds)})</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Record Voice Note</span>
                    </>
                  )}
                </button>
              </div>

              <textarea
                rows={3}
                value={currentJob.serviceReq.detailedComplaint}
                onChange={(e) => {
                  const updated = {
                    ...currentJob,
                    serviceReq: {
                      ...currentJob.serviceReq,
                      detailedComplaint: e.target.value,
                    },
                    updatedAt: new Date().toISOString(),
                  };
                  setCurrentJob(updated);
                  onUpdateJob(updated);
                }}
                placeholder="Enter or record voice observation for the detailed customer complaint..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 leading-relaxed font-mono focus:outline-none focus:border-zinc-600"
              />

              <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/80 font-mono flex justify-between">
                <span>Pre-approved repair limit: <span className="font-mono text-white font-bold">${currentJob.serviceReq.preApprovedLimit.toFixed(2)}</span></span>
                <span>Labor Hours: <span className="text-white font-bold">{currentJob.laborHours} hrs</span></span>
              </div>
            </div>

            {/* Internal Repair Notes & Voice Dictation Studio */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <h3 className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">
                      Internal Repair Notes &amp; Voice Dictation
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      Dictate bench observations directly into Detailed Complaint or Internal Notes
                    </p>
                  </div>
                </div>

                {/* Target Selector + Record Controls */}
                <div className="flex flex-wrap items-center gap-1.5 font-mono">
                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[10px]">
                    <button
                      type="button"
                      disabled={isRecordingVoice || isTranscribingVoice}
                      onClick={() => setVoiceTarget('complaint')}
                      className={`px-2 py-1 rounded-md font-bold transition-colors disabled:opacity-60 ${
                        voiceTarget === 'complaint'
                          ? 'bg-white text-zinc-950'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Detailed Complaint
                    </button>
                    <button
                      type="button"
                      disabled={isRecordingVoice || isTranscribingVoice}
                      onClick={() => setVoiceTarget('notes')}
                      className={`px-2 py-1 rounded-md font-bold transition-colors disabled:opacity-60 ${
                        voiceTarget === 'notes'
                          ? 'bg-white text-zinc-950'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Internal Notes
                    </button>
                  </div>

                  {!isRecordingVoice ? (
                    <button
                      type="button"
                      onClick={() => handleStartVoiceNote()}
                      disabled={isTranscribingVoice}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center gap-1.5 shadow active:scale-95 disabled:opacity-50"
                    >
                      {isTranscribingVoice ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Transcribing...</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          <span>Record Voice Note</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleStopVoiceNote}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 shadow animate-pulse"
                      >
                        <Square className="w-3 h-3 fill-white" />
                        <span>Stop &amp; Transcribe ({formatRecordingClock(recordingSeconds)})</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelVoiceNote}
                        className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700"
                        title="Discard recording"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Recording Status Banner */}
              {isRecordingVoice && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-700/70 space-y-1.5 font-mono">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-2 text-rose-300 font-bold">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                      Recording voice observation → Target:{' '}
                      <strong className="text-white">
                        {voiceTarget === 'complaint' ? 'Detailed Complaint' : 'Internal Notes'}
                      </strong>
                    </span>
                    <span className="text-rose-200 font-bold">{formatRecordingClock(recordingSeconds)}</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 italic">
                    {liveSpeechPreview
                      ? `Live transcript: "${liveSpeechPreview}"`
                      : 'Listening on device microphone... Speak your repair observation clearly.'}
                  </p>
                </div>
              )}

              {isTranscribingVoice && (
                <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-[11px] font-mono text-zinc-200 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
                  <span>Transcribing audio recording into {voiceTarget === 'complaint' ? 'Detailed Complaint' : 'Internal Notes'}...</span>
                </div>
              )}

              {voiceError && (
                <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-800/70 text-[11px] font-mono text-rose-200 flex items-center gap-2">
                  <MicOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{voiceError}</span>
                </div>
              )}

              {voiceFeedback && (
                <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-700/70 text-[11px] font-mono text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{voiceFeedback}</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                    Internal Notes &amp; Diagnostic Observations
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      isRecordingVoice && voiceTarget === 'notes'
                        ? handleStopVoiceNote()
                        : handleStartVoiceNote('notes')
                    }
                    disabled={isTranscribingVoice || (isRecordingVoice && voiceTarget !== 'notes')}
                    className="text-[10px] font-mono font-bold text-emerald-400 hover:text-emerald-300 disabled:opacity-40 flex items-center gap-1"
                  >
                    <Mic className="w-3 h-3" />
                    <span>{isRecordingVoice && voiceTarget === 'notes' ? 'Stop Recording' : 'Dictate Note'}</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={currentJob.diagnosticNotes || ''}
                  onChange={(e) => {
                    const updated = {
                      ...currentJob,
                      diagnosticNotes: e.target.value,
                      updatedAt: new Date().toISOString(),
                    };
                    setCurrentJob(updated);
                    onUpdateJob(updated);
                  }}
                  placeholder="Record a voice note or type internal bench observations, commutator/bearing wear checks, and repair findings..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 font-mono leading-relaxed"
                />
              </div>
            </div>

            {/* Warranty Adjudication Lookup & Serial Verification Panel */}
            <div
              className={`p-4 rounded-xl border space-y-3 text-xs font-mono ${
                activeAdjudication.flag === 'In-Warranty'
                  ? 'bg-emerald-950/20 border-emerald-700/60'
                  : 'bg-zinc-950 border-zinc-800'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {activeAdjudication.flag === 'In-Warranty' ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                    Warranty Adjudication Engine
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                      activeAdjudication.flag === 'In-Warranty'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-600/80'
                        : 'bg-amber-950/80 text-amber-300 border-amber-700/80'
                    }`}
                  >
                    {activeAdjudication.flag}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={serialDraft}
                    onChange={(e) => setSerialDraft(e.target.value)}
                    placeholder="Serial Number"
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-[11px] text-white font-mono w-36 focus:outline-none focus:border-white"
                  />
                  <button
                    type="button"
                    onClick={handleReAdjudicateWarranty}
                    className="px-2.5 py-1 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-lg text-[10px] flex items-center gap-1 shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Verify Serial</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="bg-zinc-900/70 p-2 rounded-lg border border-zinc-800">
                  <span className="text-zinc-500 block text-[9px] uppercase">Manufacture Date</span>
                  <span className="text-white font-bold">{activeAdjudication.manufactureDate || 'Unresolved'}</span>
                </div>
                <div className="bg-zinc-900/70 p-2 rounded-lg border border-zinc-800">
                  <span className="text-zinc-500 block text-[9px] uppercase">Warranty Expiry</span>
                  <span className="text-white font-bold">{activeAdjudication.expirationDate || 'N/A'}</span>
                </div>
                <div className="bg-zinc-900/70 p-2 rounded-lg border border-zinc-800">
                  <span className="text-zinc-500 block text-[9px] uppercase">Age vs Term</span>
                  <span className="text-white font-bold">
                    {activeAdjudication.ageMonths !== null ? `${activeAdjudication.ageMonths}m` : '—'} / {activeAdjudication.termMonths}m
                  </span>
                </div>
                <div className="bg-zinc-900/70 p-2 rounded-lg border border-zinc-800">
                  <span className="text-zinc-500 block text-[9px] uppercase">Decode Method</span>
                  <span className="text-zinc-200 truncate block">{activeAdjudication.decodedMethod}</span>
                </div>
              </div>

              <p className="text-[11px] text-zinc-300 font-sans">{activeAdjudication.reason}</p>

              {activeAdjudication.exclusionAdvisory && (
                <div className="px-2.5 py-1.5 bg-amber-950/60 border border-amber-700/70 rounded-lg text-[11px] text-amber-200 font-sans">
                  {activeAdjudication.exclusionAdvisory}
                </div>
              )}
            </div>
          </div>

          {/* Dispute Resolution Photo Gallery & Device Camera Section */}
          {(() => {
            const attachmentList = currentJob.attachments || [];
            const photoMetaByUrl = new Map((currentJob.photos || []).map((p) => [p.dataUrl, p]));

            const galleryItems = attachmentList.map((dataUrl, idx) => {
              const meta = photoMetaByUrl.get(dataUrl);
              const isPost = meta ? meta.stage === 'Repaired Workbench' || meta.stage === 'QC Final' : false;
              return {
                key: `${idx}-${dataUrl.slice(0, 32)}`,
                dataUrl,
                stageLabel: (isPost ? 'Post-Repair' : 'Pre-Repair') as 'Pre-Repair' | 'Post-Repair',
                caption: meta?.caption || `Captured Evidence #${idx + 1}`,
                uploadedAt: meta?.uploadedAt || currentJob.intakeDate,
                attachmentIndex: idx,
              };
            });

            // Also include any legacy PhotoEvidence entries not yet duplicated in attachments
            (currentJob.photos || []).forEach((ph, pIdx) => {
              if (!attachmentList.includes(ph.dataUrl)) {
                const isPost = ph.stage === 'Repaired Workbench' || ph.stage === 'QC Final';
                galleryItems.push({
                  key: `legacy-${ph.id || pIdx}`,
                  dataUrl: ph.dataUrl,
                  stageLabel: isPost ? 'Post-Repair' : 'Pre-Repair',
                  caption: ph.caption,
                  uploadedAt: ph.uploadedAt,
                  attachmentIndex: -1,
                });
              }
            });

            const preRepairItems = galleryItems.filter((g) => g.stageLabel === 'Pre-Repair');
            const postRepairItems = galleryItems.filter((g) => g.stageLabel === 'Post-Repair');
            const visibleItems =
              galleryFilter === 'All'
                ? galleryItems
                : galleryItems.filter((g) => g.stageLabel === galleryFilter);

            return (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-white">
                      <Camera className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Dispute Resolution Photo Gallery ({galleryItems.length})
                      </h2>
                      <p className="text-[10px] text-zinc-400">
                        Capture pre-repair intake &amp; post-repair QC images via device camera (stored in <span className="font-mono text-zinc-300">attachments[]</span>)
                      </p>
                    </div>
                  </div>

                  {/* Pre-Repair vs Post-Repair Capture Stage Toggle */}
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 self-start sm:self-auto font-mono">
                    {(['Pre-Repair', 'Post-Repair'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setCaptureStage(st)}
                        className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                          captureStage === st
                            ? st === 'Pre-Repair'
                              ? 'bg-amber-400 text-zinc-950 shadow'
                              : 'bg-emerald-400 text-zinc-950 shadow'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Capture Controls Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 font-mono">
                  <input
                    type="text"
                    value={photoCaption}
                    onChange={(e) => setPhotoCaption(e.target.value)}
                    placeholder={`Optional ${captureStage.toLowerCase()} note (e.g. Housing scratch, Chuck repaired)...`}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                  />

                  <div className="flex items-center gap-2 shrink-0">
                    {!isCameraOpen ? (
                      <button
                        type="button"
                        onClick={() => handleOpenCamera()}
                        className="px-3.5 py-2 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow active:scale-95"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Open Camera</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopCameraStream}
                        className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 border border-zinc-700"
                      >
                        <VideoOff className="w-3.5 h-3.5" />
                        <span>Close Camera</span>
                      </button>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-bold rounded-xl text-xs flex items-center gap-1.5"
                      title="Upload image or open native mobile camera"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload / Mobile Cam</span>
                    </button>
                  </div>
                </div>

                {cameraError && (
                  <div className="p-3 bg-amber-950/50 border border-amber-700/70 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-2 font-sans">
                    <span className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-300" />
                      <span>{cameraError}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCameraError(null)}
                      className="text-amber-300 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {captureFeedback && (
                  <div className="p-2.5 bg-emerald-950/60 border border-emerald-700/70 rounded-xl text-xs text-emerald-200 font-mono flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{captureFeedback}</span>
                  </div>
                )}

                {/* Live Device Camera Viewfinder */}
                {isCameraOpen && (
                  <div className="bg-zinc-950 border border-zinc-700 rounded-2xl p-3 space-y-3">
                    <div className="relative rounded-xl overflow-hidden bg-black border border-zinc-800 aspect-video max-h-72 flex items-center justify-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-zinc-950/85 border border-zinc-700 text-[10px] font-mono font-bold text-white flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full animate-pulse ${captureStage === 'Pre-Repair' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                        <span>LIVE · {captureStage.toUpperCase()} MODE</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                      <button
                        type="button"
                        onClick={handleToggleFacingMode}
                        className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-xl text-xs font-bold flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Switch Camera ({facingMode === 'environment' ? 'Rear' : 'Front'})</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCaptureCameraFrame}
                        className="px-5 py-2 bg-white hover:bg-zinc-200 text-zinc-950 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-lg active:scale-95"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Capture {captureStage} Photo</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Filter Tabs & Side-by-Side Comparison Summary */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono">
                  <div className="flex items-center gap-1.5">
                    {([
                      { id: 'All', label: 'All Evidence', count: galleryItems.length },
                      { id: 'Pre-Repair', label: 'Pre-Repair', count: preRepairItems.length },
                      { id: 'Post-Repair', label: 'Post-Repair', count: postRepairItems.length },
                    ] as const).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setGalleryFilter(tab.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                          galleryFilter === tab.id
                            ? 'bg-white text-zinc-950 border-white'
                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className={`px-1.5 rounded text-[10px] ${galleryFilter === tab.id ? 'bg-zinc-900 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  {preRepairItems.length > 0 && postRepairItems.length > 0 && (
                    <span className="text-[10px] text-emerald-300 bg-emerald-950/60 border border-emerald-700/60 px-2.5 py-1 rounded-lg font-bold">
                      ✓ Before &amp; After Proof Paired
                    </span>
                  )}
                </div>

                {/* Photo Gallery Grid */}
                {visibleItems.length === 0 ? (
                  <div className="p-6 bg-zinc-950 border border-dashed border-zinc-800 rounded-xl text-center space-y-1.5">
                    <ImageIcon className="w-6 h-6 text-zinc-600 mx-auto" />
                    <div className="text-xs font-mono text-zinc-400 font-bold">
                      No {galleryFilter === 'All' ? '' : `${galleryFilter} `}dispute photos attached yet
                    </div>
                    <p className="text-[11px] text-zinc-500 max-w-md mx-auto">
                      Use <strong>Open Camera</strong> or <strong>Upload / Mobile Cam</strong> above to capture intake condition and post-repair QC proof.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {visibleItems.map((item) => (
                      <div
                        key={item.key}
                        className="bg-zinc-950 border border-zinc-800 hover:border-zinc-600 rounded-xl overflow-hidden group transition-all flex flex-col"
                      >
                        <div className="relative aspect-video bg-zinc-900 overflow-hidden">
                          <img
                            src={item.dataUrl}
                            alt={item.caption}
                            onClick={() => setLightboxItem(item)}
                            className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-200"
                          />
                          <span
                            className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-mono font-extrabold uppercase border ${
                              item.stageLabel === 'Pre-Repair'
                                ? 'bg-amber-950/90 text-amber-300 border-amber-700/80'
                                : 'bg-emerald-950/90 text-emerald-300 border-emerald-700/80'
                            }`}
                          >
                            {item.stageLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() => setLightboxItem(item)}
                            title="Inspect Full Resolution"
                            className="absolute top-2 right-2 p-1 rounded bg-zinc-950/80 text-white border border-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="p-2.5 space-y-1 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="text-[11px] font-semibold text-white line-clamp-1">{item.caption}</div>
                            <div className="text-[9px] font-mono text-zinc-500">{item.uploadedAt}</div>
                          </div>

                          <div className="flex items-center justify-between pt-1.5 border-t border-zinc-900 text-[10px] font-mono">
                            <button
                              type="button"
                              onClick={() => setLightboxItem(item)}
                              className="text-zinc-300 hover:text-white underline font-semibold"
                            >
                              Inspect
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(item.dataUrl, item.attachmentIndex)}
                              className="text-zinc-500 hover:text-rose-400 flex items-center gap-0.5"
                              title="Remove Attachment"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Gemini AI Repair Diagnosis Chatbot & Diagnostics Panel */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
            
            {/* Header & Segmented Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-white">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Gemini AI Repair Assistant Chatbot
                  </h2>
                  <p className="text-[10px] text-zinc-400">Interactive troubleshooting, teardown steps &amp; SKU spare parts linking</p>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 self-start sm:self-auto">
                <button
                  onClick={() => setAiPanelTab('chatbot')}
                  className={`px-3 py-1 text-xs font-mono font-bold rounded-lg transition-all ${
                    aiPanelTab === 'chatbot' ? 'bg-white text-zinc-950 shadow' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  💬 AI Repair Chatbot
                </button>
                <button
                  onClick={() => setAiPanelTab('quick')}
                  className={`px-3 py-1 text-xs font-mono font-bold rounded-lg transition-all ${
                    aiPanelTab === 'quick' ? 'bg-white text-zinc-950 shadow' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  ⚡ Quick Auto Diagnosis
                </button>
              </div>
            </div>

            {/* TAB 1: INTERACTIVE AI REPAIR DIAGNOSIS CHATBOT */}
            {aiPanelTab === 'chatbot' && (
              <div className="space-y-4 font-mono">
                
                {/* Chat Message History */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 h-80 overflow-y-auto space-y-3">
                  {chatMessages.map((msg) => {
                    const isAi = msg.role === 'assistant';
                    const mentionedSkus = isAi ? extractSkusFromText(msg.text) : [];

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-zinc-500">
                          {isAi ? (
                            <>
                              <Bot className="w-3 h-3 text-white" />
                              <span className="text-zinc-300 font-bold">Gemini Diagnostic Assistant</span>
                            </>
                          ) : (
                            <span className="text-zinc-400 font-bold">Bench Technician</span>
                          )}
                          <span>· {msg.timestamp}</span>
                        </div>

                        <div
                          className={`max-w-[88%] p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                            isAi
                              ? 'bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-none'
                              : 'bg-white text-zinc-950 font-medium rounded-tr-none shadow'
                          }`}
                        >
                          {msg.text}

                          {/* 1-Click Link SKU Buttons inside AI Message */}
                          {isAi && mentionedSkus.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-zinc-800 space-y-1.5">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                                🔗 Mentioned Catalog Parts (1-Click Link):
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {mentionedSkus.map((sku) => {
                                  const item = inventory.find(i => i.sku.toLowerCase() === sku.toLowerCase());
                                  return (
                                    <button
                                      key={sku}
                                      onClick={() => handleLinkSkuDirectly(sku)}
                                      className="px-2.5 py-1 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-lg text-[10px] flex items-center gap-1 shadow active:scale-95"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Link {sku} (${item ? item.unitPrice.toFixed(2) : ''})</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 1-Click Copy Chat to Diagnostic Notes Log */}
                          {isAi && msg.id !== 'msg-init' && (
                            <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                              <button
                                onClick={() => handleCopyChatToDiagnosticNotes(msg.text, msg.id)}
                                className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 font-bold underline"
                              >
                                <Copy className="w-3 h-3" />
                                <span>{copiedLogId === msg.id ? '✓ Logged to Job Notes!' : 'Copy to Ticket Notes'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {isChatSending && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono py-2">
                      <Bot className="w-4 h-4 text-white animate-spin" />
                      <span>Gemini is analyzing tool symptoms &amp; parts catalog...</span>
                    </div>
                  )}

                  <div ref={chatBottomRef} />
                </div>

                {/* Quick Prompt Suggestion Chips */}
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Quick Diagnostic Prompts:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'What components cause this symptom?',
                      'How do I test switch & motor with multimeter?',
                      'What grease specification for gearbox repack?',
                      'Recommend required spare parts from catalog',
                    ].map((promptText, pIdx) => (
                      <button
                        key={pIdx}
                        onClick={() => handleSendChatMessage(promptText)}
                        disabled={isChatSending}
                        className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors disabled:opacity-50"
                      >
                        ⚡ {promptText}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Input Field */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChatMessage();
                      }
                    }}
                    placeholder="Ask Gemini AI troubleshooting steps, electrical specs, or component advice..."
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono"
                  />

                  <button
                    onClick={() => handleSendChatMessage()}
                    disabled={isChatSending || !chatInput.trim()}
                    className="px-4 py-2 bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-40 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: QUICK AUTO DIAGNOSIS & PARTS LINKING */}
            {aiPanelTab === 'quick' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase font-mono">
                    Instant 1-Click AI Fault Analysis Report
                  </h3>

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
                  <label className="block text-xs font-semibold text-zinc-400 mb-1 font-mono">Official Diagnostic Notes &amp; Findings</label>
                  <textarea
                    rows={4}
                    value={currentJob.diagnosticNotes || ''}
                    onChange={(e) => {
                      const updated = { ...currentJob, diagnosticNotes: e.target.value };
                      setCurrentJob(updated);
                      onUpdateJob(updated);
                    }}
                    placeholder="Click '✨ Run AI Diagnosis' above to generate an analysis with Gemini AI or type technical findings..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none font-mono leading-relaxed"
                  />
                </div>

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
              </div>
            )}

            {/* Inventory Spare Parts Search, AI Recommended Parts & Table */}
            <div className="space-y-4 pt-3 border-t border-zinc-800">
              {/* Recommended Parts (AI Model & Complaint Analysis) */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-start gap-2.5">
                    <Package className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-xs font-bold text-white tracking-tight">
                        Recommended Parts
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        AI analysis for {currentJob.tool.brand} {currentJob.tool.modelNumber} · {currentJob.serviceReq.grievanceCategory}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {recommendedParts.some(
                      (rec) => !currentJob.parts.some((p) => p.partId === rec.partId || p.sku === rec.sku)
                    ) && (
                      <button
                        type="button"
                        onClick={handleAddAllRecommendedParts}
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add All Unlinked</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleAnalyzeRecommendedParts}
                      disabled={isRecPartsLoading}
                      className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      {isRecPartsLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Analyzing Catalog...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{recommendedParts.length > 0 ? 'Refresh Recommendations' : 'Recommend Parts'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {recPartsError && (
                  <div className="p-3 bg-rose-950/30 border border-rose-800/70 rounded-lg text-xs text-rose-200 flex items-center justify-between gap-2 font-mono">
                    <span className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{recPartsError}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleAnalyzeRecommendedParts}
                      className="text-xs font-bold underline text-white shrink-0"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {recPartsSummary && !recPartsError && (
                  <p className="text-xs text-zinc-300 leading-relaxed border-b border-zinc-800/60 pb-2.5">
                    {recPartsSummary}
                  </p>
                )}

                {!isRecPartsLoading && !recPartsError && recommendedParts.length === 0 ? (
                  <div className="py-3 text-xs text-zinc-400 flex items-center justify-between gap-3">
                    <span>
                      Run AI analysis to match {currentJob.tool.modelNumber} failure symptoms against {inventory.length} inventory items.
                    </span>
                  </div>
                ) : null}

                {recommendedParts.length > 0 && (
                  <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-lg bg-zinc-900/40">
                    {recommendedParts.map((rec) => {
                      const liveItem = inventory.find(
                        (i) => i.id === rec.partId || i.sku.toLowerCase() === rec.sku.toLowerCase()
                      );
                      const liveStockQty = liveItem ? liveItem.stockQty : rec.stockQty;
                      const minThreshold = liveItem ? liveItem.minStockThreshold : (rec.minStockThreshold ?? 5);
                      const linkedPart = currentJob.parts.find(
                        (p) => p.partId === rec.partId || p.sku.toLowerCase() === rec.sku.toLowerCase()
                      );
                      const isLowStock = liveStockQty > 0 && liveStockQty <= minThreshold;
                      const isOutOfStock = liveStockQty <= 0;

                      return (
                        <div
                          key={rec.partId}
                          className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-white">{rec.name}</span>
                              <span className="text-[11px] font-mono text-zinc-400">
                                {rec.sku} · Bin {rec.binLocation || liveItem?.binLocation || 'N/A'} · {rec.confidence === 'HIGH' ? 'High Match' : 'Suggested Match'}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-300 leading-snug">{rec.reason}</p>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-zinc-400">
                              <span>Compatible: {rec.compatibleModels || liveItem?.compatibleModels || currentJob.tool.modelNumber}</span>
                              <span>·</span>
                              <span
                                className={
                                  isOutOfStock
                                    ? 'text-rose-400 font-semibold'
                                    : isLowStock
                                    ? 'text-amber-400 font-semibold'
                                    : 'text-emerald-400 font-semibold'
                                }
                              >
                                {isOutOfStock
                                  ? 'Out of Stock (0)'
                                  : isLowStock
                                  ? `Low Stock (${liveStockQty})`
                                  : `In Stock (${liveStockQty})`}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums self-end sm:self-center">
                            <div className="text-right">
                              <div className="text-xs font-bold text-white">${rec.unitPrice.toFixed(2)}</div>
                              <div className="text-[10px] text-zinc-400">Qty {rec.quantity}</div>
                            </div>

                            {linkedPart ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                                  <Check className="w-3.5 h-3.5" />
                                  Added (x{linkedPart.quantity})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAddRecommendedPart(rec, 1)}
                                  className="px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-white font-bold"
                                  title="Add 1 more"
                                >
                                  +1
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddRecommendedPart(rec)}
                                className="px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs flex items-center gap-1 whitespace-nowrap shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add to Job Card</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

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
                  className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 disabled:opacity-40 rounded-xl transition-colors shrink-0"
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
                          No replacement parts linked yet. Use search, chatbot, or AI diagnosis above.
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

            {/* Operational Expenses (Non-Part Costs) Ledger */}
            <div className="space-y-3 pt-4 border-t border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-amber-400" />
                  <span>Operational Expenses (Non-Part Costs)</span>
                </span>
                <span className="text-[11px] text-amber-400 font-bold">
                  Subtotal: $
                  {(currentJob.operationalExpenses || [])
                    .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0)
                    .toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 font-mono">
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value as OperationalExpenseCategory)}
                  className="sm:col-span-3 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="Outsourced Labor">Outsourced Labor</option>
                  <option value="Shipping & Freight">Shipping &amp; Freight</option>
                  <option value="Sublet Machining / Rewinding">Sublet Machining / Rewinding</option>
                  <option value="Diagnostics / Calibration Fee">Diagnostics / Calibration Fee</option>
                  <option value="Disposal / Hazmat">Disposal / Hazmat</option>
                  <option value="Other Operational Cost">Other Operational Cost</option>
                </select>

                <input
                  type="text"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder="Expense description (e.g., Inbound DHL freight, commutator turning)..."
                  className="sm:col-span-4 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />

                <input
                  type="text"
                  value={expenseVendor}
                  onChange={(e) => setExpenseVendor(e.target.value)}
                  placeholder="Vendor (optional)"
                  className="sm:col-span-2 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />

                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="$ Cost"
                  className="sm:col-span-2 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />

                <button
                  type="button"
                  onClick={handleAddOperationalExpense}
                  disabled={!expenseDescription.trim() || !(parseFloat(expenseAmount) > 0)}
                  className="sm:col-span-1 px-3 py-2 text-xs font-bold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 rounded-xl transition-colors flex items-center justify-center"
                  title="Add operational expense to job card"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {(currentJob.operationalExpenses || []).length > 0 ? (
                <div className="overflow-x-auto border border-zinc-800 rounded-xl">
                  <table className="w-full text-xs text-left font-mono">
                    <thead className="bg-zinc-950 text-zinc-400 text-[11px]">
                      <tr>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3">Vendor</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                        <th className="py-2 px-3 text-center">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-zinc-300">
                      {(currentJob.operationalExpenses || []).map((exp) => (
                        <tr key={exp.id} className="hover:bg-zinc-950/40">
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[10px] font-bold">
                              {exp.category}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-medium text-white">{exp.description}</td>
                          <td className="py-2 px-3 text-zinc-400">{exp.vendor || '—'}</td>
                          <td className="py-2 px-3 text-zinc-400">{exp.date}</td>
                          <td className="py-2 px-3 text-right font-bold text-amber-300">
                            ${Number(exp.amount).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveOperationalExpense(exp.id)}
                              className="text-zinc-500 hover:text-white"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-[11px] font-mono text-zinc-500 bg-zinc-950/60 border border-dashed border-zinc-800 rounded-xl p-3 text-center">
                  No non-part operational expenses recorded (outsourced labor, freight, sublet machining).
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Right Column: Billing Summary & Time Clock */}
        <div className="space-y-6 font-mono">

          {/* Technician Time Clock Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Timer className="w-4 h-4 text-white" />
                <span>Bench Time Clock</span>
              </h2>
              
              {currentJob.timeLogs && currentJob.timeLogs.some((l) => l.status === 'ACTIVE') && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-zinc-950 animate-pulse">
                  TIMER RUNNING
                </span>
              )}
            </div>

            {/* Active Session or Clock In Controls */}
            {(() => {
              const activeLog = (currentJob.timeLogs || []).find((l) => l.status === 'ACTIVE');
              if (activeLog) {
                return (
                  <div className="bg-zinc-950 border border-zinc-700 p-3.5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">{activeLog.technicianName}</span>
                      <span className="text-white font-extrabold">{formatElapsed(activeLog.clockInTime)}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-sans truncate">{activeLog.notes}</p>
                    <button
                      onClick={() => handleDetailClockOut(activeLog.id)}
                      className="w-full py-2 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 mt-2 active:scale-95 shadow"
                    >
                      <Square className="w-3.5 h-3.5 fill-zinc-950" />
                      <span>Clock Out Technician</span>
                    </button>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  <span className="text-[10px] text-zinc-400 block font-bold uppercase">Clock In Technician:</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={clockInTechId}
                      onChange={(e) => setClockInTechId(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      {SHOP_TECHNICIANS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name.split(' ')[0]} {t.name.split(' ')[1] || ''}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={handleDetailClockIn}
                      className="px-3.5 py-1.5 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-1 shrink-0 shadow active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-zinc-950" />
                      <span>Clock In</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Time Logs History on this Card */}
            {currentJob.timeLogs && currentJob.timeLogs.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Time Logs on Card ({currentJob.timeLogs.length}):</span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {currentJob.timeLogs.map((log) => (
                    <div key={log.id} className="p-2 bg-zinc-950 rounded-lg border border-zinc-800 text-[11px] flex justify-between items-center">
                      <div>
                        <span className="font-bold text-white block">{log.technicianName.split(' ')[0]}</span>
                        <span className="text-[10px] text-zinc-500">{new Date(log.clockInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <span className="font-bold text-white font-mono">
                        {log.status === 'ACTIVE' ? 'Running...' : `${log.durationHours || 0}h`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Labor & Service Cost Summary Card */}
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

              {(() => {
                const billing = calculateJobBilling(
                  currentJob.parts,
                  currentJob.laborHours,
                  currentJob.laborRate,
                  currentJob.operationalExpenses || [],
                  currentJob.discount,
                  currentJob.taxRate
                );
                return (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                    <div className="flex justify-between text-zinc-400">
                      <span>Parts Subtotal:</span>
                      <span className="text-zinc-200">${billing.partsSubtotal.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-zinc-400">
                      <span>Labor Subtotal ({currentJob.laborHours}h):</span>
                      <span className="text-zinc-200">${billing.laborSubtotal.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-zinc-400">
                      <span>Operational Expenses ({(currentJob.operationalExpenses || []).length}):</span>
                      <span className={billing.operationalExpensesSubtotal > 0 ? 'text-amber-400 font-bold' : 'text-zinc-200'}>
                        ${billing.operationalExpensesSubtotal.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between text-zinc-400">
                      <span>Sales Tax ({currentJob.taxRate}%):</span>
                      <span className="text-zinc-200">${billing.taxAmount.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-zinc-800 text-base font-extrabold text-white">
                      <span>Total Estimate</span>
                      <span className="text-lg">${currentJob.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Technician Digital Signature Pad & Job Finalization */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 gap-2">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <PenTool className="w-4 h-4 text-white" />
                <span>Technician Sign-Off &amp; Finalization</span>
              </h2>
              <span
                className={`text-[11px] font-semibold font-sans ${
                  currentJob.technicianSignature ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {currentJob.technicianSignature ? 'Signed & Verified' : 'Pending Sign-Off'}
              </span>
            </div>

            {signOffFeedback && (
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-700/70 text-[11px] font-sans text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{signOffFeedback}</span>
              </div>
            )}

            {signOffError && (
              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/70 text-[11px] font-sans text-rose-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{signOffError}</span>
              </div>
            )}

            {/* Signatory & Target Final Status */}
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1 uppercase font-bold">
                  Signing Technician
                </label>
                <select
                  value={signOffTechName}
                  onChange={(e) => setSignOffTechName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                >
                  {SHOP_TECHNICIANS.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                  {signOffTechName &&
                    !SHOP_TECHNICIANS.some((t) => t.name === signOffTechName) && (
                      <option value={signOffTechName}>{signOffTechName}</option>
                    )}
                </select>
              </div>

              {/* Final QC Verification Checkboxes */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div className="text-[10px] text-zinc-400 uppercase font-bold">
                  Final Bench QC Attestation
                </div>
                <div className="grid grid-cols-1 gap-1.5 text-[11px] font-sans text-zinc-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qcChecks.loadTested}
                      onChange={(e) =>
                        setQcChecks((prev) => ({ ...prev, loadTested: e.target.checked }))
                      }
                      className="rounded border-zinc-700 bg-zinc-900 text-white"
                    />
                    <span>Full-load bench run &amp; RPM check passed</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qcChecks.safetyGrounded}
                      onChange={(e) =>
                        setQcChecks((prev) => ({ ...prev, safetyGrounded: e.target.checked }))
                      }
                      className="rounded border-zinc-700 bg-zinc-900 text-white"
                    />
                    <span>Insulation resistance &amp; trigger safety verified</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qcChecks.partsVerified}
                      onChange={(e) =>
                        setQcChecks((prev) => ({ ...prev, partsVerified: e.target.checked }))
                      }
                      className="rounded border-zinc-700 bg-zinc-900 text-white"
                    />
                    <span>Replaced parts, torque &amp; accessories accounted for</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Saved Signature Preview OR Interactive HTML5 Canvas Pad */}
            {currentJob.technicianSignature && !isEditingSignature ? (
              <div className="space-y-2.5">
                <div className="bg-zinc-50 border border-zinc-700 rounded-xl p-3 flex flex-col items-center justify-center">
                  <img
                    src={currentJob.technicianSignature}
                    alt={`Technician signature by ${currentJob.technicianSignOffBy || currentJob.technician}`}
                    className="h-24 w-full object-contain"
                  />
                  <div className="w-full border-t border-zinc-300 mt-1.5 pt-1 flex items-center justify-between text-[10px] text-zinc-600 tabular-nums">
                    <span className="truncate font-semibold">
                      {currentJob.technicianSignOffBy || currentJob.technician}
                    </span>
                    <span className="shrink-0">
                      {currentJob.technicianSignOffAt
                        ? currentJob.technicianSignOffAt.slice(0, 16).replace('T', ' ')
                        : 'Verified'}
                    </span>
                  </div>
                </div>

                {currentJob.technicianSignOffNotes && (
                  <div className="text-[11px] font-sans text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                    <span className="text-zinc-500">Sign-off note: </span>
                    {currentJob.technicianSignOffNotes}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingSignature(true);
                      setHasSignOffStroke(false);
                      signOffStrokesRef.current = [];
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Re-Sign Pad</span>
                  </button>

                  {currentJob.status !== 'Completed' && (
                    <button
                      type="button"
                      onClick={() => handleCommitTechnicianSignOff('Completed')}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Finalize Completed</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleClearSavedSignOff}
                    title="Remove saved sign-off"
                    className="p-2 rounded-xl bg-zinc-950 hover:bg-rose-950/40 border border-zinc-800 text-zinc-400 hover:text-rose-300 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400 font-sans">
                    Draw technician signature below (mouse, touch, or stylus)
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleUndoSignOffStroke}
                      disabled={!hasSignOffStroke}
                      className="text-zinc-400 hover:text-white disabled:opacity-40 underline"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSignOffCanvas}
                      className="text-zinc-400 hover:text-white underline"
                    >
                      Clear
                    </button>
                    {currentJob.technicianSignature && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingSignature(false);
                          setSignOffError(null);
                        }}
                        className="text-zinc-400 hover:text-white underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Tactile Light-Paper Signature Canvas */}
                <div className="relative bg-zinc-50 border border-zinc-700 rounded-xl overflow-hidden">
                  <canvas
                    ref={signOffCanvasRef}
                    width={560}
                    height={180}
                    onPointerDown={handleSignaturePointerDown}
                    onPointerMove={handleSignaturePointerMove}
                    onPointerUp={handleSignaturePointerUp}
                    onPointerCancel={handleSignaturePointerUp}
                    aria-label="Technician digital signature pad"
                    className="w-full h-36 block touch-none cursor-crosshair relative z-10"
                  />
                  <div className="pointer-events-none absolute inset-x-4 bottom-4 border-b border-dashed border-zinc-300 flex items-center justify-between text-[10px] text-zinc-400 font-sans">
                    <span>{hasSignOffStroke ? 'Technician Sign-Off' : 'Sign above this line'}</span>
                    <span className="tabular-nums">{new Date().toISOString().slice(0, 10)}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1 uppercase font-bold">
                    Finalization Remarks (Optional)
                  </label>
                  <input
                    type="text"
                    value={signOffNotes}
                    onChange={(e) => setSignOffNotes(e.target.value)}
                    placeholder="e.g., Full load bench test passed; safety ground verified"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 font-sans focus:outline-none focus:border-zinc-600"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] font-sans">
                  <span className="text-zinc-400">Finalize status as:</span>
                  <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                    {(['Completed', 'Ready for Pickup'] as const).map((target) => (
                      <button
                        key={target}
                        type="button"
                        onClick={() => setFinalizationTargetStatus(target)}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                          finalizationTargetStatus === target
                            ? 'bg-white text-zinc-950'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {target}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCommitTechnicianSignOff()}
                    className="py-2 px-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 transition-colors whitespace-nowrap"
                  >
                    Save Sign-Off
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCommitTechnicianSignOff(finalizationTargetStatus)}
                    className="py-2 px-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Sign &amp; Finalize</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Append-Only Audit Trail Ledger Widget */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-white" />
                <span>Append-Only Audit Ledger</span>
              </span>
              <span className="text-[10px] text-zinc-400">
                {currentJob.auditLogs?.length || 1} Logs
              </span>
            </h2>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {(currentJob.auditLogs || [
                { id: 'aud-default', timestamp: currentJob.intakeDate, userName: 'Counter Operator', userRole: 'Receptionist', action: 'JOB_CARD_CREATED', newState: `Status: ${currentJob.status}` }
              ]).map((log) => (
                <div key={log.id} className="p-2.5 bg-zinc-950 rounded-xl border border-zinc-800 text-[11px] space-y-0.5">
                  <div className="flex justify-between items-center text-zinc-400 font-mono">
                    <span className="font-bold text-white">{log.action}</span>
                    <span className="text-[9px] text-zinc-500">{log.timestamp}</span>
                  </div>
                  <div className="text-zinc-300 font-sans text-[10px]">
                    By: <strong className="text-white">{log.userName}</strong> ({log.userRole})
                  </div>
                  {log.newState && (
                    <div className="text-[10px] font-mono text-emerald-400">{log.newState}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Fullscreen Photo Evidence Lightbox Modal */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur flex items-center justify-center p-4"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-3xl w-full p-4 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2 font-mono">
                <span
                  className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                    lightboxItem.stageLabel === 'Pre-Repair'
                      ? 'bg-amber-950 text-amber-300 border-amber-700'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  }`}
                >
                  {lightboxItem.stageLabel}
                </span>
                <span className="text-xs font-bold text-white">{lightboxItem.caption}</span>
                <span className="text-[10px] text-zinc-500">{lightboxItem.uploadedAt}</span>
              </div>

              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="p-1.5 rounded-lg bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-black rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center max-h-[65vh]">
              <img
                src={lightboxItem.dataUrl}
                alt={lightboxItem.caption}
                className="max-h-[65vh] w-auto object-contain"
              />
            </div>

            <div className="flex items-center justify-between pt-1 font-mono text-xs">
              <button
                type="button"
                onClick={() => handleRemoveAttachment(lightboxItem.dataUrl, lightboxItem.attachmentIndex)}
                className="px-3 py-1.5 rounded-xl bg-zinc-950 text-rose-400 hover:bg-rose-950/50 border border-zinc-800 flex items-center gap-1.5 font-bold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Evidence</span>
              </button>

              <a
                href={lightboxItem.dataUrl}
                download={`${currentJob.id}_${lightboxItem.stageLabel.toLowerCase()}.jpg`}
                className="px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Photo</span>
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
