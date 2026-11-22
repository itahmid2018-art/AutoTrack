import React from 'react';
import { Wrench, Shield, Lock, ExternalLink, Sun, Moon, LogIn } from 'lucide-react';
import type { AppTheme } from '../utils/theme';

interface StaffLoginScreenProps {
  centerName: string;
  centerPhone: string;
  centerEmail: string;
  onSignIn: () => void;
  onBypassSignIn?: () => void;
  onOpenCustomerView: () => void;
  theme?: AppTheme;
  onToggleTheme?: () => void;
}

export const StaffLoginScreen: React.FC<StaffLoginScreenProps> = ({
  centerName,
  centerPhone,
  centerEmail,
  onSignIn,
  onBypassSignIn,
  onOpenCustomerView,
  theme = 'dark',
  onToggleTheme,
}) => {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-100 flex flex-col justify-between font-sans selection:bg-zinc-950 selection:text-white dark:selection:bg-white dark:selection:text-zinc-950">
      {/* Top Bar */}
      <header className="bg-white/95 dark:bg-zinc-950/95 border-b border-zinc-300 dark:border-zinc-800 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center font-bold">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-950 dark:text-white font-mono uppercase tracking-tight">
                {centerName}
              </div>
              <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono">
                Internal Staff &amp; Workshop Administration Portal
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label="Toggle theme"
                className="px-3 py-1.5 text-xs font-bold font-mono text-zinc-900 dark:text-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-zinc-900" />}
                <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenCustomerView}
              className="px-3.5 py-1.5 text-xs font-bold font-mono text-zinc-900 dark:text-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>Open Client Portal</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Login Card Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-8 shadow-2xl space-y-6 font-sans">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center mx-auto shadow-lg">
              <Shield className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-extrabold text-zinc-950 dark:text-white font-mono uppercase tracking-tight">
              Organization Staff Sign-In
            </h1>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Internal team members must authenticate with their verified organization credentials or Google Workspace SSO to access workshop operations, spare parts inventory, and billing.
            </p>
          </div>

          <div className="space-y-3 pt-2 font-mono">
            <button
              type="button"
              onClick={onSignIn}
              className="w-full py-3 px-4 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2.5 transition-all shadow-lg active:scale-95"
            >
              <LogIn className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
              <span>Sign in with Google Workspace / SSO</span>
            </button>

            {onBypassSignIn && (
              <button
                type="button"
                onClick={onBypassSignIn}
                className="w-full py-2.5 px-4 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-300 border border-zinc-400 dark:border-zinc-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <span>Continue in Local Workshop Mode</span>
              </button>
            )}
          </div>

          <div className="pt-4 border-t border-zinc-300 dark:border-zinc-800 text-center text-[11px] text-zinc-600 dark:text-zinc-400 font-mono space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-emerald-800 dark:text-emerald-400 font-semibold">
              <Lock className="w-3.5 h-3.5" />
              <span>Secure Role-Based Access Control</span>
            </div>
            <p className="font-sans text-[11px] text-zinc-500">
              Support contact: {centerPhone} · {centerEmail}
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-300 dark:border-zinc-900 bg-white dark:bg-zinc-950 py-4 text-center text-xs text-zinc-600 dark:text-zinc-500 font-mono">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>{centerName} · Internal Administration</span>
          <button
            type="button"
            onClick={onOpenCustomerView}
            className="text-zinc-900 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white underline font-bold"
          >
            Customer Service Ticket &amp; QR Tracking Portal
          </button>
        </div>
      </footer>
    </div>
  );
};
