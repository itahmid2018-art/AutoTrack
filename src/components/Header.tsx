import React, { useState, useRef, useEffect } from 'react';
import { JobCard, InventoryItem } from '../types';
import { 
  Wrench, 
  PlusCircle, 
  HelpCircle, 
  Clock, 
  Menu, 
  X, 
  MessageSquare, 
  Package, 
  FileText, 
  LayoutGrid, 
  BarChart3, 
  UserCheck,
  Search,
  ChevronRight,
  User,
  Tag,
  Timer
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'intake' | 'jobs' | 'kanban' | 'maintenance' | 'inventory' | 'messaging' | 'analytics' | 'timetracking' | 'transition';
  setActiveTab: (tab: 'intake' | 'jobs' | 'kanban' | 'maintenance' | 'inventory' | 'messaging' | 'analytics' | 'timetracking' | 'transition') => void;
  onOpenNewJobModal: () => void;
  activeJobCount: number;
  lowStockCount: number;
  dueMaintenanceCount: number;
  jobCards: JobCard[];
  inventory: InventoryItem[];
  onSelectJob: (job: JobCard) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenNewJobModal,
  activeJobCount,
  lowStockCount,
  dueMaintenanceCount,
  jobCards,
  inventory,
  onSelectJob,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavClick = (tab: 'intake' | 'jobs' | 'kanban' | 'maintenance' | 'inventory' | 'messaging' | 'analytics' | 'timetracking' | 'transition') => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setIsSearchOpen(false);
  };

  // Global Search Filtering
  const query = searchQuery.trim().toLowerCase();
  
  const matchingJobs = query ? jobCards.filter(j => 
    j.id.toLowerCase().includes(query) ||
    j.customerName.toLowerCase().includes(query) ||
    j.customerPhone.includes(query) ||
    (j.customerCompany && j.customerCompany.toLowerCase().includes(query)) ||
    j.tool.modelNumber.toLowerCase().includes(query) ||
    j.tool.serialNumber.toLowerCase().includes(query) ||
    j.serviceReq.grievanceCategory.toLowerCase().includes(query)
  ).slice(0, 5) : [];

  const matchingInventory = query ? inventory.filter(i =>
    i.sku.toLowerCase().includes(query) ||
    i.barcode.toLowerCase().includes(query) ||
    i.name.toLowerCase().includes(query) ||
    i.category.toLowerCase().includes(query) ||
    i.compatibleModels.toLowerCase().includes(query)
  ).slice(0, 5) : [];

  const hasResults = matchingJobs.length > 0 || matchingInventory.length > 0;

  const handleSelectJobResult = (job: JobCard) => {
    onSelectJob(job);
    setActiveTab('jobs');
    setSearchQuery('');
    setIsSearchOpen(false);
    setMobileMenuOpen(false);
  };

  const handleSelectInventoryResult = (item: InventoryItem) => {
    setActiveTab('inventory');
    setSearchQuery('');
    setIsSearchOpen(false);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 lg:gap-4">
          
          {/* Zone 1: Wordmark */}
          <button 
            onClick={() => handleNavClick('intake')}
            className="flex items-center gap-2 text-left focus:outline-none group shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white group-hover:bg-zinc-800 transition-colors">
              <Wrench className="w-4 h-4" />
            </div>
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap font-mono uppercase hidden sm:inline">
              BOSCH <span className="text-zinc-400 font-normal">Service Hub</span>
            </span>
          </button>

          {/* Zone 2: Global Search Bar */}
          <div className="relative flex-1 max-w-xs sm:max-w-sm md:max-w-md mx-1 sm:mx-2" ref={searchContainerRef}>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Global search: Customer, Phone, SKU (BRSH-1002), Job ID..."
                className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-white rounded-xl pl-8 pr-8 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none font-mono transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-zinc-500 hover:text-white text-xs font-bold"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Global Search Interactive Results Overlay */}
            {isSearchOpen && query && (
              <div className="absolute left-0 right-0 top-11 z-50 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs animate-in fade-in duration-150">
                {!hasResults ? (
                  <div className="p-4 text-center text-zinc-500">
                    No job cards or SKU inventory matches for &quot;{searchQuery}&quot;
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto divide-y divide-zinc-900">
                    
                    {/* Job Cards Matches */}
                    {matchingJobs.length > 0 && (
                      <div className="p-2 space-y-1">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Job Cards ({matchingJobs.length})</span>
                          <span className="text-zinc-400">Click to view</span>
                        </div>
                        {matchingJobs.map((job) => (
                          <div
                            key={job.id}
                            onClick={() => handleSelectJobResult(job)}
                            className="p-2.5 rounded-xl hover:bg-zinc-900 cursor-pointer transition-colors flex items-center justify-between gap-2 group"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-[11px]">
                                  {job.id}
                                </span>
                                <span className="text-xs font-bold text-zinc-200 truncate">{job.customerName}</span>
                              </div>
                              <div className="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-2">
                                <span>{job.customerPhone}</span>
                                <span>·</span>
                                <span className="text-zinc-300 font-medium">{job.tool.brand} {job.tool.modelNumber}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800">
                                {job.status}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-white transition-colors" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Inventory Spare Parts Matches */}
                    {matchingInventory.length > 0 && (
                      <div className="p-2 space-y-1">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Parts Inventory SKUs ({matchingInventory.length})</span>
                          <span className="text-zinc-400">Click to open catalog</span>
                        </div>
                        {matchingInventory.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => handleSelectInventoryResult(item)}
                            className="p-2.5 rounded-xl hover:bg-zinc-900 cursor-pointer transition-colors flex items-center justify-between gap-2 group"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-[11px]">
                                  {item.sku}
                                </span>
                                <span className="text-xs font-bold text-zinc-200 truncate">{item.name}</span>
                              </div>
                              <div className="text-[10px] text-zinc-400 mt-0.5">
                                Category: {item.category} · Bin: {item.binLocation}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-right">
                              <div>
                                <div className="text-xs font-bold text-white">${item.unitPrice.toFixed(2)}</div>
                                <div className="text-[9px] text-zinc-400">{item.stockQty} in stock</div>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-white transition-colors" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}
          </div>

          {/* Zone 3: Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => handleNavClick('intake')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'intake'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              + Intake Form
            </button>

            <button
              onClick={() => handleNavClick('jobs')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
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
              onClick={() => handleNavClick('kanban')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'kanban'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>

            <button
              onClick={() => handleNavClick('maintenance')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'maintenance'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Servicing</span>
              {dueMaintenanceCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded font-bold bg-white text-zinc-950 border border-white">
                  {dueMaintenanceCount}
                </span>
              )}
            </button>

            <button
              onClick={() => handleNavClick('inventory')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'inventory'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span>1,000 SKUs</span>
              {lowStockCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded font-bold bg-zinc-800 text-zinc-300">
                  {lowStockCount}
                </span>
              )}
            </button>

            <button
              onClick={() => handleNavClick('messaging')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'messaging'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              WhatsApp
            </button>

            <button
              onClick={() => handleNavClick('analytics')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'analytics'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics</span>
            </button>

            <button
              onClick={() => handleNavClick('timetracking')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'timetracking'
                  ? 'bg-white text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              <span>Time Tracking</span>
            </button>
          </nav>

          {/* Zone 4: Primary Action & Mobile Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={onOpenNewJobModal}
              className="px-3 sm:px-3.5 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-lg shadow transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden xs:inline">+ New Intake</span>
              <span className="xs:hidden">+ Intake</span>
            </button>

            {/* Mobile / Tablet Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white focus:outline-none"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Responsive Mobile / Tablet Navigation Panel */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-zinc-950 border-b border-zinc-800 px-4 py-3 space-y-1.5 shadow-2xl animate-in slide-in-from-top duration-200 font-mono text-xs">
          <button
            onClick={() => handleNavClick('intake')}
            className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between ${
              activeTab === 'intake' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span>+ New Tool Intake Form</span>
            </div>
          </button>

          <button
            onClick={() => handleNavClick('jobs')}
            className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between ${
              activeTab === 'jobs' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              <span>Service Job Cards</span>
            </div>
            {activeJobCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-white">
                {activeJobCount} Active
              </span>
            )}
          </button>

          <button
            onClick={() => handleNavClick('kanban')}
            className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between ${
              activeTab === 'kanban' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              <span>Kanban Board (Drag &amp; Drop)</span>
            </div>
          </button>

          <button
            onClick={() => handleNavClick('maintenance')}
            className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between ${
              activeTab === 'maintenance' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Recurring Tool Maintenance</span>
            </div>
            {dueMaintenanceCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-white text-zinc-950 font-extrabold">
                {dueMaintenanceCount} Due
              </span>
            )}
          </button>

          <button
            onClick={() => handleNavClick('inventory')}
            className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between ${
              activeTab === 'inventory' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              <span>1,000 Tool Spare Parts Catalog</span>
            </div>
            {lowStockCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                {lowStockCount} Low
              </span>
            )}
          </button>

          <button
            onClick={() => handleNavClick('messaging')}
            className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between ${
              activeTab === 'messaging' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span>WhatsApp &amp; SMS Dispatch</span>
            </div>
          </button>

          <button
            onClick={() => handleNavClick('analytics')}
            className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between ${
              activeTab === 'analytics' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              <span>Technician Efficiency &amp; Analytics</span>
            </div>
          </button>

          <button
            onClick={() => handleNavClick('timetracking')}
            className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between ${
              activeTab === 'timetracking' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4" />
              <span>Employee Time-Tracking &amp; Clock-In</span>
            </div>
          </button>

          <button
            onClick={() => handleNavClick('transition')}
            className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between ${
              activeTab === 'transition' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              <span>Business Setup Questions</span>
            </div>
          </button>
        </div>
      )}

    </header>
  );
};
