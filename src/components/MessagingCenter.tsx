import React, { useState } from 'react';
import { JobCard, MessageLog, BusinessSettings } from '../types';
import { getEffectiveJobBilling } from '../utils/billing';
import { buildCustomerPortalUrl } from '../utils/customerPortalUrl';
import {
  MessageSquare,
  Copy,
  Check,
  User,
  Clock,
  ArrowUpRight,
  Sparkles,
  Bot,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface AiReplyVariant {
  label: string;
  text: string;
}

interface AiAssistantResult {
  recommendedReply: string;
  alternateReplies: AiReplyVariant[];
  keyFactsCited: string[];
}

const COMMON_CUSTOMER_INQUIRIES = [
  {
    id: 'status',
    label: 'Repair Status & ETA',
    prompt: 'When will my power tool be ready for pickup and what stage of repair is it in right now?',
  },
  {
    id: 'pricing',
    label: 'Pricing & Cost Breakdown',
    prompt: 'Why does the repair estimate cost this amount? Please break down parts, labor, and any other charges.',
  },
  {
    id: 'warranty',
    label: 'Warranty Coverage',
    prompt: 'Is this repair covered under warranty, or why is it billed as out-of-warranty?',
  },
  {
    id: 'parts',
    label: 'Parts & Repair Findings',
    prompt: 'What fault did the technician find and which replacement parts are needed?',
  },
  {
    id: 'pickup',
    label: 'Pickup & Portal Link',
    prompt: 'Can you share my live status tracking link and pickup instructions / balance due?',
  },
];

interface MessagingCenterProps {
  jobCards: JobCard[];
  selectedJob: JobCard | null;
  onSelectJob: (job: JobCard) => void;
  settings: BusinessSettings;
  onLogMessageSent: (jobId: string, log: MessageLog) => void;
}

export const MessagingCenter: React.FC<MessagingCenterProps> = ({
  jobCards,
  selectedJob,
  onSelectJob,
  settings,
  onLogMessageSent,
}) => {
  const activeJob = selectedJob || jobCards[0] || null;
  
  const [templateType, setTemplateType] = useState<'Intake' | 'Estimate' | 'Ready' | 'Invoice'>('Intake');
  const [customMessage, setCustomMessage] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiLanguage, setAiLanguage] = useState('English');
  const [aiTone, setAiTone] = useState('Professional & Direct');
  const [isSending, setIsSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // AI Response Assistant State
  const [customerInquiryInput, setCustomerInquiryInput] = useState('');
  const [preferredChannel, setPreferredChannel] = useState<'WhatsApp' | 'SMS'>('WhatsApp');
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantResult, setAssistantResult] = useState<AiAssistantResult | null>(null);
  const [copiedVariantKey, setCopiedVariantKey] = useState<string | null>(null);

  const [apiStatus, setApiStatus] = useState<{
    twilioSmsConfigured: boolean;
    twilioWhatsAppConfigured: boolean;
    metaWhatsAppConfigured: boolean;
    twilioPhoneNumber: string | null;
    twilioWhatsAppNumber: string | null;
    activeMode: string;
  }>({
    twilioSmsConfigured: false,
    twilioWhatsAppConfigured: false,
    metaWhatsAppConfigured: false,
    twilioPhoneNumber: null,
    twilioWhatsAppNumber: null,
    activeMode: 'Checking credentials...',
  });

  React.useEffect(() => {
    fetch('/api/messaging/status')
      .then((res) => res.json())
      .then((data) => setApiStatus(data))
      .catch((err) => console.error('Failed to fetch messaging API status:', err));
  }, []);

  const getDefaultMessage = (type: string, job: JobCard | null) => {
    if (!job) return '';
    const toolName = `${job.tool?.brand || 'Bosch'} ${job.tool?.modelNumber || 'Tool'}`;
    const serial = job.tool?.serialNumber || 'N/A';

    switch (type) {
      case 'Intake':
        return `Hi ${job.customerName}, your ${toolName} (SN: ${serial}) is checked in under Job Card ${job.id}. We will notify you once diagnostic inspection is complete. Bosch Service Center.`;
      case 'Estimate':
        return `Hi ${job.customerName}, estimate for Job Card ${job.id} (${toolName}) is ready: $${job.totalAmount.toFixed(2)}. Includes spare parts & labor. Reply YES to approve.`;
      case 'Ready':
        return `Great news ${job.customerName}! Your ${toolName} (Job Card ${job.id}) is READY FOR PICKUP. Total: $${job.totalAmount.toFixed(2)}. Bosch Service Bay.`;
      case 'Invoice':
        return `Hi ${job.customerName}, thank you for choosing Bosch Service! Receipt for Job Card ${job.id}. Total Paid: $${job.totalAmount.toFixed(2)}. Work safe!`;
      default:
        return '';
    }
  };

  const messageText = customMessage || getDefaultMessage(templateType, activeJob);

  const handleAiPolish = async () => {
    if (!activeJob) return;
    setIsAiGenerating(true);

    try {
      const res = await fetch('/api/ai/generate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobCard: activeJob,
          messageType: templateType,
          language: aiLanguage,
          tone: aiTone,
        }),
      });
      const data = await res.json();
      if (data.message) {
        setCustomMessage(data.message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateAssistantReplies = async (inquiryOverride?: string) => {
    if (!activeJob) return;
    const inquiry = (inquiryOverride ?? customerInquiryInput).trim();
    if (!inquiry) {
      setAssistantError('Enter a customer inquiry or pick a common topic above.');
      return;
    }

    if (inquiryOverride) {
      setCustomerInquiryInput(inquiryOverride);
    }

    setIsAssistantLoading(true);
    setAssistantError(null);

    try {
      const billingSummary = getEffectiveJobBilling(activeJob);
      const portalUrl = buildCustomerPortalUrl(activeJob);

      const res = await fetch('/api/ai/response-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobCard: activeJob,
          customerInquiry: inquiry,
          channel: preferredChannel,
          language: aiLanguage,
          tone: aiTone,
          portalUrl,
          billingSummary,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.details || 'Failed to generate AI response suggestions');
      }

      setAssistantResult({
        recommendedReply: data.recommendedReply || '',
        alternateReplies: Array.isArray(data.alternateReplies) ? data.alternateReplies : [],
        keyFactsCited: Array.isArray(data.keyFactsCited) ? data.keyFactsCited : [],
      });
    } catch (err: any) {
      setAssistantError(err?.message || 'Unable to generate suggested customer replies.');
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const handleUseSuggestedReply = (replyText: string) => {
    setCustomMessage(replyText);
    setSendFeedback({
      type: 'info',
      text: 'Loaded AI suggested reply into the dispatch composer below.',
    });
    setTimeout(() => setSendFeedback(null), 3000);
  };

  const handleCopySuggestedReply = async (replyText: string, key: string) => {
    try {
      await navigator.clipboard.writeText(replyText);
      setCopiedVariantKey(key);
      setTimeout(() => setCopiedVariantKey(null), 2000);
    } catch {
      setCopiedVariantKey(null);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!activeJob) return;
    setIsSending(true);
    setSendFeedback(null);

    const cleanPhone = activeJob.customerPhone.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(messageText);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;

    try {
      const res = await fetch('/api/messaging/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeJob.customerPhone,
          message: messageText,
          jobId: activeJob.id,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSendFeedback({
          type: 'success',
          text: `WhatsApp Sent via ${data.provider}! ${data.sid ? `(SID: ${data.sid})` : ''}`,
        });
      } else {
        setSendFeedback({
          type: 'info',
          text: `Opening 1-click WhatsApp Web deep link (${data.message || 'API fallback'})`,
        });
        window.open(data.fallbackUrl || whatsappUrl, '_blank');
      }

      const log: MessageLog = {
        id: `msg-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        type: templateType,
        recipientPhone: activeJob.customerPhone,
        text: messageText,
        channel: 'WhatsApp',
        status: data.success ? 'Sent' : 'Sent',
      };
      onLogMessageSent(activeJob.id, log);
    } catch (err: any) {
      console.error(err);
      window.open(whatsappUrl, '_blank');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendSMS = async () => {
    if (!activeJob) return;
    setIsSending(true);
    setSendFeedback(null);

    const encoded = encodeURIComponent(messageText);
    const smsUrl = `sms:${activeJob.customerPhone}?body=${encoded}`;

    try {
      const res = await fetch('/api/messaging/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeJob.customerPhone,
          message: messageText,
          jobId: activeJob.id,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSendFeedback({
          type: 'success',
          text: `Twilio SMS Dispatched! SID: ${data.sid}`,
        });
      } else {
        setSendFeedback({
          type: 'info',
          text: `Opening native device SMS app (${data.message || 'API credentials optional'})`,
        });
        window.location.href = data.fallbackUrl || smsUrl;
      }

      const log: MessageLog = {
        id: `msg-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        type: templateType,
        recipientPhone: activeJob.customerPhone,
        text: messageText,
        channel: 'SMS',
        status: data.success ? 'Sent' : 'Sent',
      };
      onLogMessageSent(activeJob.id, log);
    } catch (err: any) {
      console.error(err);
      window.location.href = smsUrl;
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2 font-mono uppercase">
                <MessageSquare className="w-5 h-5 text-white" />
                <span>WhatsApp &amp; SMS Customer Dispatch</span>
              </h1>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Automated API delivery &amp; 1-click WhatsApp web dispatch for power tool intake, estimates &amp; pickup notices.
            </p>
          </div>

          {/* API Credentials Integration Badges */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <div className={`px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
              apiStatus.twilioSmsConfigured 
                ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300' 
                : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${apiStatus.twilioSmsConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
              <span>Twilio SMS API: {apiStatus.twilioSmsConfigured ? 'Configured' : 'Optional (.env)'}</span>
            </div>

            <div className={`px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
              apiStatus.twilioWhatsAppConfigured || apiStatus.metaWhatsAppConfigured
                ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300' 
                : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${apiStatus.twilioWhatsAppConfigured || apiStatus.metaWhatsAppConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
              <span>WhatsApp API: {apiStatus.twilioWhatsAppConfigured || apiStatus.metaWhatsAppConfigured ? 'Configured' : 'Optional (.env)'}</span>
            </div>
          </div>
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Job Card Selector List */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 font-mono">
            Select Service Card ({jobCards.length})
          </h2>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 divide-y divide-zinc-800/40">
            {jobCards.map((job) => (
              <div
                key={job.id}
                onClick={() => {
                  onSelectJob(job);
                  setCustomMessage('');
                  setAssistantResult(null);
                  setAssistantError(null);
                }}
                className={`p-3 rounded-xl cursor-pointer transition-all border ${
                  activeJob?.id === job.id
                    ? 'bg-zinc-950 border-white shadow'
                    : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-mono font-bold text-white">{job.id}</span>
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono">
                    {job.status}
                  </span>
                </div>

                <div className="text-xs font-bold text-white truncate">{job.customerName}</div>
                <div className="text-[11px] text-zinc-400 truncate">{job.tool?.brand} {job.tool?.modelNumber}</div>
                <div className="text-[10px] text-zinc-500 font-mono mt-1">{job.customerPhone}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: AI Response Assistant & Template Composer */}
        {activeJob && (
          <div className="lg:col-span-2 space-y-6">
            
            {/* AI Response Assistant Panel */}
            <section
              aria-labelledby="ai-response-assistant-heading"
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-emerald-400 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 id="ai-response-assistant-heading" className="text-sm font-bold text-white tracking-tight">
                      AI Response Assistant
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5 font-mono tabular-nums">
                      {activeJob.id} · {activeJob.tool?.brand} {activeJob.tool?.modelNumber} · {activeJob.status} · ${getEffectiveJobBilling(activeJob).totalAmount.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Channel Preference Toggle */}
                <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg self-start sm:self-auto font-mono">
                  {(['WhatsApp', 'SMS'] as const).map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => setPreferredChannel(channel)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        preferredChannel === channel
                          ? 'bg-white text-zinc-950'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {channel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Common Customer Inquiry Buttons */}
              <div className="space-y-1.5">
                <span className="block text-[11px] font-semibold text-zinc-400 font-mono">
                  Common Customer Inquiries (1-Click Draft):
                </span>
                <div className="flex flex-wrap gap-2">
                  {COMMON_CUSTOMER_INQUIRIES.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isAssistantLoading}
                      onClick={() => handleGenerateAssistantReplies(preset.prompt)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs font-medium text-zinc-200 hover:text-white transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Customer Question Input */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={customerInquiryInput}
                  onChange={(e) => setCustomerInquiryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleGenerateAssistantReplies();
                    }
                  }}
                  placeholder="Paste customer question (e.g. 'Why is the armature replacement $48?' or 'Can I pick it up today?')..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />

                <button
                  type="button"
                  onClick={() => handleGenerateAssistantReplies()}
                  disabled={isAssistantLoading || !customerInquiryInput.trim()}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-40 text-zinc-950 text-xs font-mono font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  {isAssistantLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Drafting...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Suggest Replies</span>
                    </>
                  )}
                </button>
              </div>

              {assistantError && (
                <div className="p-3 bg-rose-950/30 border border-rose-800/70 rounded-xl text-xs font-mono text-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{assistantError}</span>
                </div>
              )}

              {/* Suggested Context-Aware Replies */}
              {assistantResult && (
                <div className="space-y-3 pt-2 border-t border-zinc-800">
                  {assistantResult.keyFactsCited.length > 0 && (
                    <div className="text-[11px] font-mono text-zinc-400">
                      Ticket facts used: {assistantResult.keyFactsCited.join(' · ')}
                    </div>
                  )}

                  {/* Primary Recommended Reply */}
                  {assistantResult.recommendedReply && (
                    <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-emerald-400">
                          Recommended {preferredChannel} Reply
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleCopySuggestedReply(assistantResult.recommendedReply, 'primary')
                            }
                            className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300 hover:text-white flex items-center gap-1"
                          >
                            {copiedVariantKey === 'primary' ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUseSuggestedReply(assistantResult.recommendedReply)}
                            className="px-3 py-1 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 text-[11px] font-mono font-bold whitespace-nowrap"
                          >
                            Use in Composer
                          </button>
                        </div>
                      </div>
                      <p className="text-xs font-mono text-zinc-100 leading-relaxed whitespace-pre-wrap">
                        {assistantResult.recommendedReply}
                      </p>
                    </div>
                  )}

                  {/* Alternate Reply Options */}
                  {assistantResult.alternateReplies.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {assistantResult.alternateReplies.map((variant, idx) => {
                        const copyKey = `alt-${idx}`;
                        return (
                          <div
                            key={copyKey}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between gap-2.5"
                          >
                            <div className="space-y-1.5">
                              <div className="text-[11px] font-semibold text-zinc-400">
                                {variant.label || `Option ${idx + 1}`}
                              </div>
                              <p className="text-xs font-mono text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                {variant.text}
                              </p>
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
                              <button
                                type="button"
                                onClick={() => handleCopySuggestedReply(variant.text, copyKey)}
                                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300 hover:text-white flex items-center gap-1"
                              >
                                {copiedVariantKey === copyKey ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUseSuggestedReply(variant.text)}
                                className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-[11px] font-mono font-bold whitespace-nowrap"
                              >
                                Use Reply
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
              
              <div className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-3 text-xs">
                  <User className="w-4 h-4 text-white shrink-0" />
                  <div>
                    <span className="font-bold text-white">{activeJob.customerName}</span>
                    <span className="text-zinc-500 mx-1.5">·</span>
                    <span className="font-mono text-zinc-300">{activeJob.customerPhone}</span>
                  </div>
                </div>

                <div className="text-xs font-mono font-bold text-white">
                  {activeJob.id} (${activeJob.totalAmount.toFixed(2)})
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 font-mono">Milestone Template</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'Intake', label: '1. Intake Received' },
                    { id: 'Estimate', label: '2. Estimate Ready' },
                    { id: 'Ready', label: '3. Ready for Pickup' },
                    { id: 'Invoice', label: '4. Service Invoice' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTemplateType(t.id as any);
                        setCustomMessage('');
                      }}
                      className={`py-2 px-3 text-xs font-bold rounded-xl transition-all border ${
                        templateType === t.id
                          ? 'bg-white text-zinc-950 border-white shadow'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <select
                    value={aiLanguage}
                    onChange={(e) => setAiLanguage(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-2.5 py-1.5 font-medium focus:outline-none"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                  </select>
                </div>

                <button
                  onClick={handleAiPolish}
                  disabled={isAiGenerating}
                  className="px-3 py-1.5 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-lg shadow transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                  <span>{isAiGenerating ? 'Generating...' : '✨ AI Polish'}</span>
                </button>
              </div>

              <div>
                <textarea
                  rows={4}
                  value={messageText}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-zinc-500"
                />
              </div>

              {sendFeedback && (
                <div className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${
                  sendFeedback.type === 'success' 
                    ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300' 
                    : sendFeedback.type === 'error'
                    ? 'bg-red-950/60 border-red-700 text-red-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300'
                }`}>
                  <span className="font-bold uppercase font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700">
                    {sendFeedback.type}
                  </span>
                  <span>{sendFeedback.text}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800">
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 text-xs font-bold text-zinc-300 bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copied!' : 'Copy Text'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendSMS}
                    disabled={isSending}
                    className="flex-1 sm:flex-none px-4 py-2 text-xs font-bold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition-all disabled:opacity-50"
                  >
                    <span>{isSending ? 'Sending...' : (apiStatus.twilioSmsConfigured ? 'Send Twilio SMS API' : 'Send SMS')}</span>
                  </button>

                  <button
                    onClick={handleSendWhatsApp}
                    disabled={isSending}
                    className="flex-1 sm:flex-none px-5 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>{isSending ? 'Sending...' : (apiStatus.twilioWhatsAppConfigured || apiStatus.metaWhatsAppConfigured ? 'Send WhatsApp API' : 'Open WhatsApp Web')}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>

            {/* Logs */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2 font-mono">
                <Clock className="w-4 h-4 text-white" />
                <span>Message History Logs ({activeJob.messageLogs.length})</span>
              </h3>

              {activeJob.messageLogs.length === 0 ? (
                <p className="text-xs text-zinc-500 py-2 text-center font-mono">No messages sent yet.</p>
              ) : (
                <div className="space-y-2">
                  {activeJob.messageLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-xs space-y-1">
                      <div className="flex items-center justify-between text-zinc-400 font-mono">
                        <span className="font-bold text-white">{log.channel} ({log.type})</span>
                        <span className="text-[11px] text-zinc-500">{log.timestamp}</span>
                      </div>
                      <p className="text-zinc-300 leading-relaxed text-[11px] font-mono">{log.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
