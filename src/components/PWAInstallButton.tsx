import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        title="Install AutoTrack Service Hub for offline access"
        className="px-2.5 py-2 text-xs font-mono font-bold text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5 text-emerald-400" />
        <span className="hidden xl:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="px-2.5 py-2 text-xs font-mono font-bold text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden xl:inline">Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur p-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-white font-mono">
                Install on iPhone / iPad
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                1. Tap the <strong className="text-white">Share</strong> button in the Safari toolbar.
                <br />
                2. Scroll down and select <strong className="text-white">Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-white hover:bg-zinc-200 py-2 text-xs font-bold text-zinc-950 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
