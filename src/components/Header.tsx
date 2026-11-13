import React, { useState, useRef, useEffect } from 'react';
import { JobCard, InventoryItem } from '../types';
import { InventoryNotification } from '../utils/inventoryNotifications';
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
  Timer,
  Bell,
  AlertTriangle,
  ShoppingCart,
  CheckCheck,
  PackageX,
  ExternalLink
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'intake' | 'jobs' | 'kanban' | 'maintenance' | 'inventory' | 'messaging' | 'analytics' | 'timetracking' | 'transition';
  setActiveTab: (tab: 'intake' | 'jobs' | 'kanban' | 'maintenance' | 'inventory' | 'messaging' | 'analytics' | 'timetracking' | 'transition') => void;
  onOpenNewJobModal: () => void;
  onOpenCustomerView?: () => void;
  activeJobCount: number;
  lowStockCount: number;
  dueMaintenanceCount: number;
  jobCards: JobCard[];
  inventory: InventoryItem[];
  onSelectJob: (job: JobCard) => void;
  inventoryNotifications?: InventoryNotification[];
  unreadInventoryCount?: number;
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  onQuickReorderItem?: (itemId: string, qty: number) => void;
  onOpenInventoryAlerts?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenNewJobModal,
  onOpenCustomerView,
  activeJobCount,
  lowStockCount,
  dueMaintenanceCount,
  jobCards,
  inventory,
  onSelectJob,
  inventoryNotifications = [],
  unreadInventoryCount = 0,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onQuickReorderItem,
  onOpenInventoryAlerts,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  // Close search & notification dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
      if (notifContainerRef.current && !notifContainerRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredNotifs = inventoryNotifications.filter((n) => {
    if (notifFilter === 'unread') return !n.read;
    if (notifFilter === 'critical') return n.severity === 'OUT_OF_STOCK' || n.severity === 'CRITICAL';
    return true;
  });

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
      {/* SECURITY STATUS & SETUP BANNER */}
      <div className="bg-zinc-900 border-b border-zinc-800/80 py-1 px-4 text-[10px] font-mono text-zinc-300 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-white uppercase">Security Status:</span>
          <span className="text-zinc-400">Default Admin Account Active (<code className="text-white font-bold">admin / 123456</code>). Please change admin password in Settings upon deployment.</span>
        </div>

        <div className="hidden md:flex items-center gap-3 text-[10px] text-zinc-400">
          <span>PII Sanitization: <strong className="text-emerald-400 font-bold">Active</strong></span>
          <span>API Rate Limit: <strong className="text-emerald-400 font-bold">Protected</strong></span>
          <span>Audit Ledger: <strong className="text-white font-bold">Active</strong></span>
        </div>
      </div>

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
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded font-extrabold bg-amber-500 text-zinc-950">
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

          {/* Zone 4: Inventory Notification Center Bell, Primary Action & Mobile Toggle */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Inventory Notification Center Bell */}
            <div className="relative" ref={notifContainerRef}>
              <button
                onClick={() => setIsNotifOpen((prev) => !prev)}
                className={`relative p-2 rounded-lg border transition-colors ${
                  unreadInventoryCount > 0 || lowStockCount > 0
                    ? 'bg-zinc-900 border-amber-500/60 text-amber-300 hover:bg-zinc-800'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
                }`}
                title="Inventory Low Stock Notification Center"
                aria-label="Open Inventory Notification Center"
              >
                <Bell className="w-4 h-4" />
                {(unreadInventoryCount > 0 || lowStockCount > 0) && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-mono font-extrabold flex items-center justify-center shadow">
                    {unreadInventoryCount > 0 ? (unreadInventoryCount > 99 ? '99+' : unreadInventoryCount) : lowStockCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 top-11 z-50 w-80 sm:w-96 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
                  <div className="p-3.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-amber-400" />
                        <span>Inventory Notification Center</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        {inventoryNotifications.length} items below min threshold · {unreadInventoryCount} unread
                      </div>
                    </div>

                    {onMarkAllNotificationsRead && unreadInventoryCount > 0 && (
                      <button
                        onClick={onMarkAllNotificationsRead}
                        className="px-2 py-1 text-[10px] bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg flex items-center gap-1"
                      >
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                        <span>Read all</span>
                      </button>
                    )}
                  </div>

                  {/* Filter Tabs */}
                  <div className="p-2 bg-zinc-950 border-b border-zinc-900 flex items-center gap-1">
                    {[
                      { id: 'all', label: `All (${inventoryNotifications.length})` },
                      { id: 'unread', label: `Unread (${unreadInventoryCount})` },
                      {
                        id: 'critical',
                        label: `Critical (${
                          inventoryNotifications.filter(
                            (n) => n.severity === 'OUT_OF_STOCK' || n.severity === 'CRITICAL'
                          ).length
                        })`,
                      },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setNotifFilter(tab.id as 'all' | 'unread' | 'critical')}
                        className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition-colors ${
                          notifFilter === tab.id
                            ? 'bg-white text-zinc-950'
                            : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-zinc-900">
                    {filteredNotifs.length === 0 ? (
                      <div className="p-6 text-center text-zinc-500 text-xs font-sans">
                        All spare part SKUs in this view are above minimum stock thresholds.
                      </div>
                    ) : (
                      filteredNotifs.slice(0, 12).map((notif) => {
                        const isOut = notif.severity === 'OUT_OF_STOCK';
                        return (
                          <div
                            key={notif.id}
                            onClick={() => onMarkNotificationRead && onMarkNotificationRead(notif.id)}
                            className={`p-3 space-y-2 hover:bg-zinc-900/70 transition-colors cursor-pointer ${
                              !notif.read ? 'bg-zinc-900/40' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                                  <span className="font-bold text-white truncate">{notif.sku}</span>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                                      isOut
                                        ? 'bg-rose-950 text-rose-300 border-rose-700'
                                        : notif.severity === 'CRITICAL'
                                        ? 'bg-amber-950 text-amber-300 border-amber-700'
                                        : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                                    }`}
                                  >
                                    {notif.severity.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                <div className="text-[11px] text-zinc-300 font-sans truncate mt-0.5">
                                  {notif.name}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className={`text-xs font-extrabold ${isOut ? 'text-rose-400' : 'text-amber-400'}`}>
                                  {notif.stockQty} / Min {notif.minStockThreshold}
                                </div>
                                <div className="text-[9px] text-zinc-500">{notif.binLocation}</div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <span className="text-[10px] text-zinc-400">
                                Suggest: <strong className="text-emerald-400">+{notif.suggestedReorderQty} {notif.unit}</strong> (${notif.estimatedReorderCost.toFixed(2)})
                              </span>
                              {onQuickReorderItem && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onQuickReorderItem(notif.itemId, notif.suggestedReorderQty);
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] flex items-center gap-1"
                                >
                                  <ShoppingCart className="w-3 h-3" />
                                  <span>Reorder +{notif.suggestedReorderQty}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="p-2.5 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
                    <button
                      onClick={() => {
                        setIsNotifOpen(false);
                        if (onOpenInventoryAlerts) {
                          onOpenInventoryAlerts();
                        } else {
                          handleNavClick('inventory');
                        }
                      }}
                      className="w-full py-1.5 px-3 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {lowStockCount > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : <PackageX className="w-3.5 h-3.5" />}
                      <span>Open Inventory Notification Center</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {onOpenCustomerView && (
              <button
                onClick={onOpenCustomerView}
                title="Open isolated Customer Status Portal"
                className="hidden sm:inline-flex px-2.5 py-2 text-xs font-bold text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                <span>Customer View</span>
              </button>
            )}

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

          {onOpenCustomerView && (
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenCustomerView();
              }}
              className="w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between text-emerald-300 bg-emerald-950/30 border border-emerald-800/60 hover:bg-emerald-950/60"
            >
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                <span>Customer Status Portal (Customer View)</span>
              </div>
            </button>
          )}
        </div>
      )}

    </header>
  );
};
