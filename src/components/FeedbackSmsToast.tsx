import React, { useState } from 'react';
import { MessageSquare, Check, Copy, ExternalLink, Send, X } from 'lucide-react';

export interface FeedbackSmsDispatchNotice {
  id: string;
  jobId: string;
  customerName: string;
  customerPhone: string;
  feedbackUrl: string;
  smsMessage: string;
  fallbackSmsHref: string;
  sentViaTwilio: boolean;
  providerLabel: string;
  sid?: string;
}

interface FeedbackSmsToastProps {
  notices: FeedbackSmsDispatchNotice[];
  onDismiss: (id: string) => void;
  onOpenSurvey: (notice: FeedbackSmsDispatchNotice) => void;
}

export const FeedbackSmsToast: React.FC<FeedbackSmsToastProps> = ({
  notices,
  onDismiss,
  onOpenSurvey,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (notices.length === 0) return null;

  const handleCopyUrl = async (notice: FeedbackSmsDispatchNotice) => {
    try {
      await navigator.clipboard.writeText(notice.feedbackUrl);
      setCopiedId(notice.id);
      setTimeout(() => setCopiedId((curr) => (curr === notice.id ? null : curr)), 2200);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <div
      className="fixed bottom-5 left-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none no-print"
      aria-live="polite"
    >
      {notices.slice(0, 2).map((notice) => (
        <div
          key={notice.id}
          className="pointer-events-auto rounded-2xl border border-emerald-500 dark:border-emerald-600/80 bg-white/95 dark:bg-zinc-950/95 p-4 shadow-2xl backdrop-blur font-mono space-y-2.5 animate-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg border bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700">
                <MessageSquare className="w-4 h-4" />
              </span>
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
                  {notice.sentViaTwilio ? 'Feedback SMS Dispatched' : 'Feedback SMS Queued'}
                </div>
                <div className="text-[10px] text-zinc-700 dark:text-zinc-400">
                  Ticket <strong className="text-zinc-950 dark:text-white">{notice.jobId}</strong> · {notice.customerPhone}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(notice.id)}
              className="text-zinc-600 dark:text-zinc-500 hover:text-zinc-950 dark:hover:text-white p-0.5"
              aria-label="Dismiss feedback SMS notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-zinc-900 dark:text-zinc-200 font-sans leading-snug">
            Automated rating survey sent to <strong className="text-zinc-950 dark:text-white">{notice.customerName}</strong> ({notice.providerLabel}
            {notice.sid ? ` · SID ${notice.sid}` : ''}).
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl px-3 py-2 text-[11px] text-zinc-800 dark:text-zinc-300 font-sans leading-relaxed line-clamp-3">
            {notice.smsMessage}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onOpenSurvey(notice)}
              className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Survey Form</span>
            </button>

            <button
              type="button"
              onClick={() => handleCopyUrl(notice)}
              className="py-1.5 px-2.5 bg-white dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-200 border border-zinc-400 dark:border-zinc-700 font-bold rounded-xl text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Copy customer feedback link"
            >
              {copiedId === notice.id ? (
                <>
                  <Check className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Link</span>
                </>
              )}
            </button>

            {!notice.sentViaTwilio && (
              <a
                href={notice.fallbackSmsHref}
                className="py-1.5 px-2.5 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-xl text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
                title="Open native SMS composer"
              >
                <Send className="w-3 h-3" />
                <span>SMS App</span>
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
