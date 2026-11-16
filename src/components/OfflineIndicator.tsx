import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  cachedJobCount: number;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ cachedJobCount }) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-mono font-bold text-zinc-950 shadow-2xl border border-amber-400"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        Offline Mode · {cachedJobCount} Cached Job Cards Readable
      </span>
    </div>
  );
};
