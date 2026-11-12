import React, { useState } from 'react';
import { JobCard, MessageLog, BusinessSettings } from '../types';
import { MessageSquare, Copy, Check, User, Clock, ArrowUpRight, Sparkles } from 'lucide-react';

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

        {/* Right Column: Template Composer */}
        {activeJob && (
          <div className="lg:col-span-2 space-y-6">
            
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
                    <option value="French font-mono">French</option>
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
