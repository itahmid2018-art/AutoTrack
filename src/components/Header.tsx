import React from 'react';
import { Wrench, PlusCircle, HelpCircle, Clock } from 'lucide-react';

interface HeaderProps {
  activeTab: 'intake' | 'jobs' | 'maintenance' | 'inventory' | 'messaging' | 'analytics' | 'transition';
  setActiveTab: (tab: 'intake' | 'jobs' | 'maintenance' | 'inventory' | 'messaging' | 'analytics' | 'transition') => void;
  onOpenNewJobModal: () => void;
  activeJobCount: number;
  lowStockCount: number;
  dueMaintenanceCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenNewJobModal,
  activeJobCount,
  lowStockCount,
  dueMaintenanceCount,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-8">
          
          {/* Zone 1: Single text element wordmark */}
          <button 
            onClick={() => setActiveTab('intake')}
            className="flex items-center gap-2.5 text-left focus:outline-none group shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white group-hover:bg-zinc-800 transition-colors">
              <Wrench className="w-4 h-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap font-mono uppercase">
              BOSCH <span className="text-zinc-400 font-normal">Service Hub</span>
            </span>
          </button>

          {/* Zone 2: 4–5 clean single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveTab('intake')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'intake'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              + Intake Form
            </button>

            <button
              onClick={() => setActiveTab('jobs')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-2 ${
                activeTab === 'jobs'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span>Service Cards</span>
              {activeJobCount > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] font-mono rounded font-bold ${activeTab === 'jobs' ? 'bg-zinc-950 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                  {activeJobCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('maintenance')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-2 ${
                activeTab === 'maintenance'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Recurring Servicing</span>
              {dueMaintenanceCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded font-bold bg-white text-zinc-950 border border-white">
                  {dueMaintenanceCount} due
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-2 ${
                activeTab === 'inventory'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span>1,000 Tool Parts</span>
              {lowStockCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded font-bold bg-zinc-800 text-zinc-300">
                  {lowStockCount} low
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('messaging')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'messaging'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              WhatsApp Dispatch
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenNewJobModal}
              className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-lg shadow transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ New Intake</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
