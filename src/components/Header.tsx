import React, { useState, useRef, useEffect } from 'react';
import { JobCard, InventoryItem } from '../types';
import { InventoryNotification } from '../utils/inventoryNotifications';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Wrench,
  PlusCircle,
  Clock,
  Menu,
  X,
  MessageSquare,
  Package,
  FileText,
  LayoutGrid,
  BarChart3,
  Search,
  ChevronRight,
  ChevronDown,
  User,
  Timer,
  Bell,
  AlertTriangle,
  ShoppingCart,
  CheckCheck,
  PackageX,
  ExternalLink,
  Settings,
  QrCode,
  LogIn,
  LogOut,
  Sun,
  Moon,
  History,
  CloudOff,
} from 'lucide-react';
import { AppTheme } from '../utils/theme';
import {
  normalizeJobPriority,
  getPriorityBadgeClasses,
} from '../utils/priority';
import {
  loadRecentJobIds,
  saveRecentJobIds,
  recordRecentJobId,
  removeRecentJobId,
} from '../utils/recentSearches';

export type AppTab =
  | 'intake'
  | 'jobs'
  | 'kanban'
  | 'maintenance'
  | 'inventory'
  | 'messaging'
  | 'notifications'
  | 'analytics'
  | 'timetracking'
  | 'transition';

type MenuGroupId = 'jobs' | 'inventory' | 'messaging' | 'analytics' | 'tools';

interface MenuItemConfig {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  active?: boolean;
  badgeText?: string;
  badgeTone?: 'neutral' | 'warning' | 'accent';
  onSelect: () => void;
}

interface MenuGroupConfig {
  id: MenuGroupId;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badgeCount?: number;
  badgeTone?: 'neutral' | 'warning';
  items: MenuItemConfig[];
}

interface HeaderProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
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
  onOpenGlobalScanner?: () => void;
  pendingSyncCount?: number;
  totalNotificationCount?: number;
  authUser?: { uid: string; displayName: string | null; email: string | null } | null;
  authLoading?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
  theme?: AppTheme;
  onToggleTheme?: () => void;
}

const ACTIVE_TAB_LABELS: Record<AppTab, string> = {
  intake: 'Tool Intake Form',
  jobs: 'Service Cards',
  kanban: 'Kanban Board',
  maintenance: 'Recurring Servicing',
  inventory: 'Spare Parts Catalog',
  messaging: 'WhatsApp & SMS Center',
  notifications: 'Notifications Center',
  analytics: 'Analytics & Forecast',
  timetracking: 'Time Tracking & Shifts',
  transition: 'Settings & Setup',
};

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
  onOpenGlobalScanner,
  pendingSyncCount = 0,
  totalNotificationCount = 0,
  authUser,
  authLoading,
  onSignIn,
  onSignOut,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuGroupId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [recentJobIds, setRecentJobIds] = useState<string[]>(() => loadRecentJobIds());
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const notifContainerRef = useRef<HTMLDivElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setIsSearchOpen(false);
      }
      if (notifContainerRef.current && !notifContainerRef.current.contains(target)) {
        setIsNotifOpen(false);
      }
      if (menuBarRef.current && !menuBarRef.current.contains(target)) {
        setOpenMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setIsSearchOpen(false);
        setIsNotifOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const filteredNotifs = inventoryNotifications.filter((n) => {
    if (notifFilter === 'unread') return !n.read;
    if (notifFilter === 'critical') return n.severity === 'OUT_OF_STOCK' || n.severity === 'CRITICAL';
    return true;
  });

  const handleNavClick = (tab: AppTab) => {
    setActiveTab(tab);
    setOpenMenu(null);
    setMobileMenuOpen(false);
    setIsSearchOpen(false);
  };

  // Global Search Filtering
  const query = searchQuery.trim().toLowerCase();

  const matchingJobs = query
    ? jobCards
        .filter(
          (j) =>
            j.id.toLowerCase().includes(query) ||
            j.customerName.toLowerCase().includes(query) ||
            j.customerPhone.includes(query) ||
            (j.customerCompany && j.customerCompany.toLowerCase().includes(query)) ||
            j.tool.modelNumber.toLowerCase().includes(query) ||
            j.tool.serialNumber.toLowerCase().includes(query) ||
            j.serviceReq.grievanceCategory.toLowerCase().includes(query)
        )
        .slice(0, 5)
    : [];

  const matchingInventory = query
    ? inventory
        .filter(
          (i) =>
            i.sku.toLowerCase().includes(query) ||
            i.barcode.toLowerCase().includes(query) ||
            i.name.toLowerCase().includes(query) ||
            i.category.toLowerCase().includes(query) ||
            i.compatibleModels.toLowerCase().includes(query)
        )
        .slice(0, 5)
    : [];

  const hasResults = matchingJobs.length > 0 || matchingInventory.length > 0;
  const recentJobEntries = recentJobIds.map((id) => ({
    id,
    job: jobCards.find((j) => j.id === id) || null,
  }));

  const handleSelectJobResult = (job: JobCard) => {
    setRecentJobIds((prev) => saveRecentJobIds(recordRecentJobId(prev, job.id)));
    onSelectJob(job);
    setActiveTab('jobs');
    setSearchQuery('');
    setIsSearchOpen(false);
    setOpenMenu(null);
    setMobileMenuOpen(false);
  };

  const handleRemoveRecentJobId = (jobId: string) => {
    setRecentJobIds((prev) => saveRecentJobIds(removeRecentJobId(prev, jobId)));
  };

  const handleClearRecentJobIds = () => {
    setRecentJobIds(saveRecentJobIds([]));
  };

  const handleSelectInventoryResult = (_item: InventoryItem) => {
    setActiveTab('inventory');
    setSearchQuery('');
    setIsSearchOpen(false);
    setOpenMenu(null);
    setMobileMenuOpen(false);
  };

  const inventoryAttentionCount = lowStockCount + dueMaintenanceCount;

  const menuGroups: MenuGroupConfig[] = [
    {
      id: 'jobs',
      label: 'Jobs & Intake',
      icon: <Wrench className="w-3.5 h-3.5" />,
      active: activeTab === 'intake' || activeTab === 'jobs' || activeTab === 'kanban',
      badgeCount: activeJobCount > 0 ? activeJobCount : undefined,
      badgeTone: 'neutral',
      items: [
        {
          id: 'intake-form',
          label: 'New Tool Intake Form',
          description: 'Full check-in, serial warranty check, custom fields & voice intake',
          icon: <FileText className="w-4 h-4" />,
          active: activeTab === 'intake',
          onSelect: () => handleNavClick('intake'),
        },
        {
          id: 'quick-intake',
          label: 'Quick Intake Modal',
          description: 'Fast counter ticket dialog without leaving current screen',
          icon: <PlusCircle className="w-4 h-4" />,
          onSelect: () => {
            setOpenMenu(null);
            setMobileMenuOpen(false);
            onOpenNewJobModal();
          },
        },
        {
          id: 'jobs-list',
          label: 'Service Cards',
          description: 'Filter cards, bulk-update statuses, print tags & send PDFs',
          icon: <Wrench className="w-4 h-4" />,
          active: activeTab === 'jobs',
          badgeText:
            pendingSyncCount > 0
              ? `${pendingSyncCount} unsynced`
              : activeJobCount > 0
              ? `${activeJobCount} active`
              : undefined,
          badgeTone: pendingSyncCount > 0 ? 'warning' : 'neutral',
          onSelect: () => handleNavClick('jobs'),
        },
        {
          id: 'kanban-board',
          label: 'Kanban Board',
          description: 'Drag-and-drop workshop repair stage pipeline',
          icon: <LayoutGrid className="w-4 h-4" />,
          active: activeTab === 'kanban',
          onSelect: () => handleNavClick('kanban'),
        },
        ...(pendingSyncCount > 0
          ? [
              {
                id: 'jobs-sync-alerts',
                label: 'Offline Sync Queue',
                description: 'Review pending jobs & retry cloud upload in Notifications',
                icon: <CloudOff className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
                badgeText: `${pendingSyncCount} pending`,
                badgeTone: 'warning' as const,
                onSelect: () => handleNavClick('notifications'),
              },
            ]
          : []),
      ],
    },
    {
      id: 'inventory',
      label: 'Inventory & Servicing',
      icon: <Package className="w-3.5 h-3.5" />,
      active: activeTab === 'inventory' || activeTab === 'maintenance',
      badgeCount: inventoryAttentionCount > 0 ? inventoryAttentionCount : undefined,
      badgeTone: lowStockCount > 0 ? 'warning' : 'neutral',
      items: [
        {
          id: 'parts-catalog',
          label: 'Spare Parts Catalog',
          description: '1,000 SKUs, bulk CSV/Excel import & barcode lookup',
          icon: <Package className="w-4 h-4" />,
          active: activeTab === 'inventory',
          badgeText: lowStockCount > 0 ? `${lowStockCount} low` : undefined,
          badgeTone: 'warning',
          onSelect: () => handleNavClick('inventory'),
        },
        {
          id: 'stock-alerts',
          label: 'Low-Stock Alerts',
          description: 'Review parts below minimum threshold & quick reorder',
          icon: <AlertTriangle className="w-4 h-4" />,
          badgeText: unreadInventoryCount > 0 ? `${unreadInventoryCount} unread` : undefined,
          badgeTone: 'warning',
          onSelect: () => {
            setOpenMenu(null);
            setMobileMenuOpen(false);
            if (onOpenInventoryAlerts) {
              onOpenInventoryAlerts();
            } else {
              handleNavClick('inventory');
            }
          },
        },
        {
          id: 'recurring-maintenance',
          label: 'Recurring Servicing',
          description: 'Preventative maintenance schedules, CSV import & job generation',
          icon: <Clock className="w-4 h-4" />,
          active: activeTab === 'maintenance',
          badgeText: dueMaintenanceCount > 0 ? `${dueMaintenanceCount} due` : undefined,
          badgeTone: 'accent',
          onSelect: () => handleNavClick('maintenance'),
        },
      ],
    },
    {
      id: 'messaging',
      label: 'Messaging & Portal',
      icon: <MessageSquare className="w-3.5 h-3.5" />,
      active: activeTab === 'messaging',
      items: [
        {
          id: 'messaging-center',
          label: 'WhatsApp & SMS Dispatch',
          description: 'Send estimates, ready notices, feedback links & view logs',
          icon: <MessageSquare className="w-4 h-4" />,
          active: activeTab === 'messaging',
          onSelect: () => handleNavClick('messaging'),
        },
        ...(onOpenCustomerView
          ? [
              {
                id: 'client-portal',
                label: 'Client Status Portal',
                description: 'Isolated status tracker, receipt PDF download & ratings',
                icon: <ExternalLink className="w-4 h-4" />,
                onSelect: () => {
                  setOpenMenu(null);
                  setMobileMenuOpen(false);
                  onOpenCustomerView();
                },
              },
            ]
          : []),
      ],
    },
    {
      id: 'analytics',
      label: 'Analytics & Team',
      icon: <BarChart3 className="w-3.5 h-3.5" />,
      active: activeTab === 'analytics' || activeTab === 'timetracking',
      items: [
        {
          id: 'analytics-dashboard',
          label: 'Analytics & Revenue Forecast',
          description: 'Workshop KPIs, technician efficiency & seasonal revenue chart',
          icon: <BarChart3 className="w-4 h-4" />,
          active: activeTab === 'analytics',
          onSelect: () => handleNavClick('analytics'),
        },
        {
          id: 'time-tracking',
          label: 'Time Tracking & Shifts',
          description: 'Technician clock-in/out timer, shift roster & bay calendar',
          icon: <Timer className="w-4 h-4" />,
          active: activeTab === 'timetracking',
          onSelect: () => handleNavClick('timetracking'),
        },
      ],
    },
    {
      id: 'tools',
      label: 'Settings & Tools',
      icon: <Settings className="w-3.5 h-3.5" />,
      active: activeTab === 'transition',
      items: [
        ...(onOpenGlobalScanner
          ? [
              {
                id: 'global-scanner',
                label: 'QR & Barcode Scanner',
                description: 'Scan job tags, serial plates, or spare part barcodes',
                icon: <QrCode className="w-4 h-4" />,
                onSelect: () => {
                  setOpenMenu(null);
                  setMobileMenuOpen(false);
                  onOpenGlobalScanner();
                },
              },
            ]
          : []),
        {
          id: 'business-settings',
          label: 'Business Settings & Custom Fields',
          description: 'Rates, stock policy, custom intake fields & SQL/JSON export',
          icon: <Settings className="w-4 h-4" />,
          active: activeTab === 'transition',
          onSelect: () => handleNavClick('transition'),
        },
      ],
    },
  ];

  const getBadgeClasses = (tone: MenuItemConfig['badgeTone']) => {
    if (tone === 'warning') {
      return 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-400 dark:border-amber-500/40';
    }
    if (tone === 'accent') {
      return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-400 dark:border-emerald-500/40';
    }
    return 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-300 border border-zinc-400 dark:border-zinc-700';
  };

  const isDarkTheme = theme === 'dark';

  return (
    <>
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-300 dark:border-zinc-800 transition-colors no-print">
      {/* Row 1: Wordmark and Essential Operator Utilities */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3 sm:gap-5">
          {/* Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleNavClick('intake')}
            className="flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/60 dark:focus-visible:ring-white/60 rounded-lg group shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-950 dark:bg-zinc-900 border border-zinc-950 dark:border-zinc-700 flex items-center justify-center text-white group-hover:bg-zinc-800 transition-colors">
              <Wrench className="w-4 h-4" />
            </div>
            <span className="text-sm sm:text-base font-bold tracking-tight text-zinc-950 dark:text-white whitespace-nowrap font-mono uppercase">
              BOSCH <span className="text-zinc-600 dark:text-zinc-400 font-normal hidden xs:inline sm:inline">Service Hub</span>
            </span>
          </button>

          {/* Right Essential Utilities + Primary Intake Action */}
          <div className="flex items-center gap-2 shrink-0">
            {/* High-Contrast Light / Dark Theme Toggle */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={isDarkTheme ? 'Switch to high-contrast light theme' : 'Switch to dark theme'}
                aria-pressed={!isDarkTheme}
                data-testid="theme-toggle"
                title={
                  isDarkTheme
                    ? 'Dark theme active — click for high-contrast light theme'
                    : 'High-contrast light theme active — click for dark theme'
                }
                className="px-2.5 py-2 rounded-lg border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-950 dark:text-zinc-100 transition-colors inline-flex items-center gap-1.5 text-xs font-mono font-bold whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-white"
              >
                {isDarkTheme ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-zinc-950" />
                )}
                <span className="hidden xl:inline">{isDarkTheme ? 'Light' : 'Dark'}</span>
              </button>
            )}

            {/* Inventory Notification Center Bell */}
            <div className="relative" ref={notifContainerRef}>
              <button
                type="button"
                onClick={() => {
                  setIsNotifOpen((prev) => !prev);
                  setOpenMenu(null);
                }}
                className={`relative p-2 rounded-lg border transition-colors ${
                  unreadInventoryCount > 0 || lowStockCount > 0
                    ? 'bg-amber-50 dark:bg-zinc-900 border-amber-500 dark:border-amber-500/60 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-zinc-800'
                    : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-400 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800'
                }`}
                title="Inventory Low Stock Notification Center"
                aria-label="Open Inventory Notification Center"
              >
                <Bell className="w-4 h-4" />
                {(unreadInventoryCount > 0 || lowStockCount > 0) && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 dark:bg-rose-500 text-white text-[9px] font-mono font-extrabold flex items-center justify-center shadow tabular-nums">
                    {unreadInventoryCount > 0
                      ? unreadInventoryCount > 99
                        ? '99+'
                        : unreadInventoryCount
                      : lowStockCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 top-11 z-50 w-80 sm:w-96 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
                  <div className="p-3.5 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-300 dark:border-zinc-800 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-zinc-950 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                        <span>Inventory Notification Center</span>
                      </div>
                      <div className="text-[10px] text-zinc-700 dark:text-zinc-400 mt-0.5 tabular-nums">
                        {inventoryNotifications.length} items below min threshold · {unreadInventoryCount} unread
                      </div>
                    </div>

                    {onMarkAllNotificationsRead && unreadInventoryCount > 0 && (
                      <button
                        type="button"
                        onClick={onMarkAllNotificationsRead}
                        className="px-2 py-1 text-[10px] bg-white dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 text-zinc-900 dark:text-zinc-300 rounded-lg flex items-center gap-1"
                      >
                        <CheckCheck className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                        <span>Read all</span>
                      </button>
                    )}
                  </div>

                  {/* Filter Tabs */}
                  <div className="p-2 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-900 flex items-center gap-1">
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
                        type="button"
                        onClick={() => setNotifFilter(tab.id as 'all' | 'unread' | 'critical')}
                        className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition-colors ${
                          notifFilter === tab.id
                            ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                            : 'text-zinc-700 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-900 hover:text-zinc-950 dark:hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-900">
                    {filteredNotifs.length === 0 ? (
                      <div className="p-6 text-center text-zinc-600 dark:text-zinc-500 text-xs font-sans">
                        All spare part SKUs in this view are above minimum stock thresholds.
                      </div>
                    ) : (
                      filteredNotifs.slice(0, 12).map((notif) => {
                        const isOut = notif.severity === 'OUT_OF_STOCK';
                        return (
                          <div
                            key={notif.id}
                            onClick={() => onMarkNotificationRead && onMarkNotificationRead(notif.id)}
                            className={`p-3 space-y-2 hover:bg-zinc-100 dark:hover:bg-zinc-900/70 transition-colors cursor-pointer ${
                              !notif.read ? 'bg-zinc-50 dark:bg-zinc-900/40' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-zinc-950 dark:text-white truncate">{notif.sku}</span>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                                      isOut
                                        ? 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                                        : notif.severity === 'CRITICAL'
                                        ? 'bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border-amber-400 dark:border-amber-700'
                                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700'
                                    }`}
                                  >
                                    {notif.severity.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                <div className="text-[11px] text-zinc-800 dark:text-zinc-300 font-sans truncate mt-0.5">
                                  {notif.name}
                                </div>
                              </div>

                              <div className="text-right shrink-0 tabular-nums">
                                <div className={`text-xs font-extrabold ${isOut ? 'text-rose-700 dark:text-rose-400' : 'text-amber-800 dark:text-amber-400'}`}>
                                  {notif.stockQty} / Min {notif.minStockThreshold}
                                </div>
                                <div className="text-[9px] text-zinc-600 dark:text-zinc-500">{notif.binLocation}</div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <span className="text-[10px] text-zinc-700 dark:text-zinc-400 tabular-nums">
                                Suggest:{' '}
                                <strong className="text-emerald-800 dark:text-emerald-400">
                                  +{notif.suggestedReorderQty} {notif.unit}
                                </strong>{' '}
                                (${notif.estimatedReorderCost.toFixed(2)})
                              </span>
                              {onQuickReorderItem && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onQuickReorderItem(notif.itemId, notif.suggestedReorderQty);
                                  }}
                                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] flex items-center gap-1"
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

                  <div className="p-2.5 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-300 dark:border-zinc-800 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNotifOpen(false);
                        handleNavClick('notifications');
                      }}
                      className="w-full py-1.5 px-3 bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Open Notifications Page</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNotifOpen(false);
                        if (onOpenInventoryAlerts) {
                          onOpenInventoryAlerts();
                        } else {
                          handleNavClick('inventory');
                        }
                      }}
                      className="w-full py-1.5 px-3 bg-white hover:bg-zinc-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-200 border border-zinc-400 dark:border-zinc-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {lowStockCount > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : <PackageX className="w-3.5 h-3.5" />}
                      <span>Filter Low-Stock Catalog</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {onOpenCustomerView && (
              <button
                type="button"
                onClick={onOpenCustomerView}
                title="Open isolated Client Status Portal"
                className="hidden md:inline-flex px-2.5 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-lg transition-colors items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                <span>Client Portal</span>
              </button>
            )}

            {!authLoading &&
              (authUser
                ? onSignOut && (
                    <button
                      type="button"
                      onClick={onSignOut}
                      title={`Signed in as ${authUser.email || authUser.displayName || 'Operator'} — Click to sign out`}
                      aria-label="Sign out operator account"
                      className="hidden sm:inline-flex px-2.5 py-2 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-lg transition-colors items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <User className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                      <span className="max-w-[96px] truncate">
                        {authUser.displayName?.split(' ')[0] || authUser.email?.split('@')[0] || 'Operator'}
                      </span>
                      <LogOut className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                    </button>
                  )
                : onSignIn && (
                    <button
                      type="button"
                      onClick={onSignIn}
                      title="Sign in with Google to sync workshop tickets across devices"
                      aria-label="Sign in with Google"
                      className="hidden sm:inline-flex px-2.5 py-2 text-xs font-bold text-zinc-950 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-lg transition-colors items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <LogIn className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                      <span>Sign In</span>
                    </button>
                  ))}

            <PWAInstallButton />

            <button
              type="button"
              onClick={onOpenNewJobModal}
              className="px-3 sm:px-3.5 py-2 text-xs font-bold text-white dark:text-zinc-950 bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 rounded-lg shadow transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ New Intake</span>
            </button>

            {/* Mobile / Tablet Drawer Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-800 text-zinc-900 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white focus:outline-none"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Organized Dropdown Menus Directly Under the Search Bar (Desktop) */}
      <div className="hidden lg:block border-t border-zinc-300 dark:border-zinc-800/80 bg-zinc-50/95 dark:bg-zinc-950/90" ref={menuBarRef}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-11 flex items-center justify-between gap-4">
          <nav className="flex items-center gap-1.5" aria-label="Workshop Feature Menus">
            {menuGroups.map((group) => {
              const isOpen = openMenu === group.id;
              return (
                <div key={group.id} className="relative">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-haspopup="menu"
                    onClick={() => {
                      setIsNotifOpen(false);
                      setIsSearchOpen(false);
                      setOpenMenu((curr) => (curr === group.id ? null : group.id));
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      group.active || isOpen
                        ? 'bg-zinc-950 text-white border border-zinc-950 dark:bg-zinc-800 dark:text-white dark:border-zinc-700'
                        : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900 border border-transparent'
                    }`}
                  >
                    {group.icon}
                    <span>{group.label}</span>
                    {typeof group.badgeCount === 'number' && group.badgeCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums ${
                          group.badgeTone === 'warning'
                            ? 'bg-amber-400 dark:bg-amber-500 text-zinc-950'
                            : group.active || isOpen
                            ? 'bg-zinc-800 text-white dark:bg-zinc-950 dark:text-zinc-200 border border-zinc-700'
                            : 'bg-zinc-200 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-200 border border-zinc-400 dark:border-zinc-700'
                        }`}
                      >
                        {group.badgeCount}
                      </span>
                    )}
                    {group.id === 'jobs' && pendingSyncCount > 0 && (
                      <span
                        data-testid="jobs-sync-badge"
                        title={`${pendingSyncCount} job card(s) failed or pending cloud sync while offline — check connectivity`}
                        aria-label={`${pendingSyncCount} pending offline sync jobs`}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold tabular-nums bg-rose-600 dark:bg-rose-500 text-white inline-flex items-center gap-1"
                      >
                        <CloudOff className="w-3 h-3 shrink-0" />
                        <span>{pendingSyncCount}</span>
                      </span>
                    )}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-150 ${
                        group.active || isOpen
                          ? 'text-white'
                          : 'text-zinc-600 dark:text-zinc-400'
                      } ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <div
                      role="menu"
                      aria-label={group.label}
                      className="absolute left-0 top-10 z-50 w-80 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-2xl shadow-2xl p-1.5 space-y-1"
                    >
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          onClick={item.onSelect}
                          className={`w-full text-left px-3 py-2.5 rounded-xl flex items-start gap-3 transition-colors ${
                            item.active
                              ? 'bg-zinc-950 text-white border border-zinc-950 dark:bg-zinc-800/90 dark:text-white dark:border-zinc-700'
                              : 'text-zinc-800 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-950 dark:hover:text-white border border-transparent'
                          }`}
                        >
                          <div
                            className={`mt-0.5 shrink-0 ${
                              item.active
                                ? 'text-emerald-300 dark:text-emerald-400'
                                : 'text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            {item.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold truncate">{item.label}</span>
                              {item.badgeText && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 tabular-nums ${getBadgeClasses(
                                    item.badgeTone
                                  )}`}
                                >
                                  {item.badgeText}
                                </span>
                              )}
                            </div>
                            <p
                              className={`text-[11px] leading-snug mt-0.5 ${
                                item.active
                                  ? 'text-zinc-300 dark:text-zinc-400'
                                  : 'text-zinc-600 dark:text-zinc-400'
                              }`}
                            >
                              {item.description}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => handleNavClick('notifications')}
              data-testid="nav-notifications-tab"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'notifications'
                  ? 'bg-zinc-950 text-white border border-zinc-950 dark:bg-zinc-800 dark:text-white dark:border-zinc-700'
                  : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900 border border-transparent'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Notifications</span>
              {totalNotificationCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums ${
                    pendingSyncCount > 0
                      ? 'bg-rose-600 dark:bg-rose-500 text-white'
                      : activeTab === 'notifications'
                      ? 'bg-zinc-800 text-white dark:bg-zinc-950 dark:text-zinc-200 border border-zinc-700'
                      : 'bg-amber-400 dark:bg-amber-500 text-zinc-950'
                  }`}
                >
                  {totalNotificationCount > 99 ? '99+' : totalNotificationCount}
                </span>
              )}
            </button>
          </nav>

          {/* Subtle Current View Indicator */}
          <div className="text-[11px] font-mono text-zinc-700 dark:text-zinc-400 whitespace-nowrap shrink-0 flex items-center gap-1.5">
            <span>View:</span>
            <span className="text-zinc-950 dark:text-zinc-200 font-semibold">{ACTIVE_TAB_LABELS[activeTab]}</span>
          </div>
        </div>
      </div>

      {/* Responsive Mobile / Tablet Categorized Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white dark:bg-zinc-950 border-t border-zinc-300 dark:border-zinc-800 px-4 py-4 space-y-4 max-h-[80vh] overflow-y-auto shadow-2xl font-mono text-xs">
          {menuGroups.map((group) => (
            <div key={group.id} className="space-y-1.5">
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-400 flex items-center justify-between">
                <span>{group.label}</span>
                {typeof group.badgeCount === 'number' && group.badgeCount > 0 && (
                  <span className="text-zinc-900 dark:text-zinc-300 tabular-nums">{group.badgeCount}</span>
                )}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.onSelect}
                    className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between gap-2 ${
                      item.active
                        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                        : 'text-zinc-900 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="shrink-0">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badgeText && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 tabular-nums ${
                          item.active
                            ? 'bg-white text-zinc-950 dark:bg-zinc-950 dark:text-white'
                            : getBadgeClasses(item.badgeTone)
                        }`}
                      >
                        {item.badgeText}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-1.5">
            <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-400 flex items-center justify-between">
              <span>Notifications &amp; Sync</span>
              {totalNotificationCount > 0 && (
                <span className="text-zinc-900 dark:text-zinc-300 tabular-nums">{totalNotificationCount}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleNavClick('notifications')}
              className={`w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between gap-2 ${
                activeTab === 'notifications'
                  ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                  : 'text-zinc-900 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Bell className="w-4 h-4 shrink-0" />
                <span className="truncate">Notifications Center</span>
              </div>
              {pendingSyncCount > 0 ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold shrink-0 tabular-nums bg-rose-600 text-white">
                  {pendingSyncCount} offline sync
                </span>
              ) : totalNotificationCount > 0 ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold shrink-0 tabular-nums bg-amber-400 text-zinc-950">
                  {totalNotificationCount}
                </span>
              ) : null}
            </button>
          </div>

          {!authLoading &&
            (authUser
              ? onSignOut && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between text-zinc-900 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                      <span>Sign Out ({authUser.displayName || authUser.email || 'Operator'})</span>
                    </div>
                    <LogOut className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                  </button>
                )
              : onSignIn && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onSignIn();
                    }}
                    className="w-full p-2.5 rounded-xl font-bold text-left flex items-center justify-between text-zinc-950 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <div className="flex items-center gap-2">
                      <LogIn className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                      <span>Operator Sign In (Google)</span>
                    </div>
                  </button>
                ))}
        </div>
      )}
    </header>

    {/* Full-Width Global Search Bar Directly Under Top Header */}
    <section
      aria-label="Global workshop search"
      className="relative z-30 w-full bg-white/95 dark:bg-zinc-950/90 border-b border-zinc-300 dark:border-zinc-800 transition-colors no-print"
    >
      <div className="w-full px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="relative w-full" ref={searchContainerRef}>
          <div className="relative w-full">
            <Search className="w-4 h-4 text-zinc-600 dark:text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query && matchingJobs.length > 0) {
                  e.preventDefault();
                  handleSelectJobResult(matchingJobs[0]);
                }
              }}
              placeholder="Search job cards, client name, phone, SKU, or serial..."
              aria-label="Global workshop search"
              data-testid="global-search-input"
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-700 hover:border-zinc-600 dark:hover:border-zinc-600 focus:border-zinc-950 dark:focus:border-white rounded-xl pl-10 pr-20 py-2.5 text-xs sm:text-sm text-zinc-950 dark:text-white placeholder-zinc-500 focus:outline-none font-mono shadow-xs transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search query"
                className={`absolute top-1/2 -translate-y-1/2 p-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white text-xs font-bold ${
                  onOpenGlobalScanner ? 'right-10' : 'right-3'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {onOpenGlobalScanner && (
              <button
                type="button"
                onClick={onOpenGlobalScanner}
                title="Scan QR or Barcode"
                aria-label="Scan QR and Barcode"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                <QrCode className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Recent Searches Dropdown (Last 5 Searched Job IDs when Search Focused Empty) */}
          {isSearchOpen && !query && (
            <div
              data-testid="recent-searches-dropdown"
              className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs"
            >
              <div className="px-3.5 py-2 bg-zinc-50 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-700 dark:text-zinc-400 uppercase tracking-wider">
                  <History className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-400" />
                  <span>Recent Searches (Last {recentJobEntries.length}/5 Job IDs)</span>
                </div>
                {recentJobEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearRecentJobIds}
                    className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors"
                  >
                    Clear history
                  </button>
                )}
              </div>

              {recentJobEntries.length === 0 ? (
                <div className="p-4 text-center text-zinc-600 dark:text-zinc-500 font-sans text-xs">
                  No recent job IDs yet. Select a job card from search to pin your last 5 records here.
                </div>
              ) : (
                <div className="p-2 space-y-1 divide-y divide-zinc-200/70 dark:divide-zinc-900">
                  {recentJobEntries.map((entry) => {
                    if (entry.job) {
                      const priority = normalizeJobPriority(entry.job.priority);
                      return (
                      <div
                        key={entry.id}
                        className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors flex items-center justify-between gap-2 group"
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectJobResult(entry.job!)}
                          className="flex-1 min-w-0 text-left flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-zinc-950 dark:text-white bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-800 text-[11px] shrink-0">
                                {entry.job.id}
                              </span>
                              <span
                                data-testid={`recent-priority-badge-${entry.job.id}`}
                                aria-label={`Priority: ${priority}`}
                                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${getPriorityBadgeClasses(
                                  priority
                                )}`}
                              >
                                {priority}
                              </span>
                              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200 truncate">
                                {entry.job.customerName}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-700 dark:text-zinc-400 mt-0.5 flex items-center gap-2">
                              <span>{entry.job.customerPhone}</span>
                              <span aria-hidden="true">·</span>
                              <span className="text-zinc-800 dark:text-zinc-300 font-medium truncate">
                                {entry.job.tool.brand} {entry.job.tool.modelNumber}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-zinc-800 dark:text-zinc-300 font-medium">
                              {entry.job.status}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-600 group-hover:text-zinc-950 dark:group-hover:text-white transition-colors" />
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveRecentJobId(entry.id);
                          }}
                          aria-label={`Remove ${entry.id} from recent searches`}
                          className="p-1 rounded-lg text-zinc-500 dark:text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      );
                    }
                    return (
                      <div
                        key={entry.id}
                        className="p-2 rounded-xl flex items-center justify-between gap-2 text-zinc-600 dark:text-zinc-500"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-800 text-[11px]">
                            {entry.id}
                          </span>
                          <span className="text-[11px] font-sans truncate">Record no longer in active workshop list</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecentJobId(entry.id)}
                          aria-label={`Remove ${entry.id} from recent searches`}
                          className="p-1 rounded-lg hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Full-Width Global Search Results Dropdown */}
          {isSearchOpen && query && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
              {!hasResults ? (
                <div className="p-4 text-center text-zinc-600 dark:text-zinc-500">
                  No job cards or inventory matches for &quot;{searchQuery}&quot;
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-900">
                  {matchingJobs.length > 0 && (
                    <div className="p-2 space-y-1">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-700 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Job Cards ({matchingJobs.length})</span>
                        <span>Select to open</span>
                      </div>
                      {matchingJobs.map((job) => {
                        const priority = normalizeJobPriority(job.priority);
                        return (
                        <div
                          key={job.id}
                          onClick={() => handleSelectJobResult(job)}
                          className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors flex items-center justify-between gap-2 group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-zinc-950 dark:text-white bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-800 text-[11px] shrink-0">
                                {job.id}
                              </span>
                              <span
                                data-testid={`search-priority-badge-${job.id}`}
                                aria-label={`Priority: ${priority}`}
                                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${getPriorityBadgeClasses(
                                  priority
                                )}`}
                              >
                                {priority}
                              </span>
                              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200 truncate">{job.customerName}</span>
                            </div>
                            <div className="text-[10px] text-zinc-700 dark:text-zinc-400 mt-0.5 flex items-center gap-2">
                              <span>{job.customerPhone}</span>
                              <span aria-hidden="true">·</span>
                              <span className="text-zinc-800 dark:text-zinc-300 font-medium">
                                {job.tool.brand} {job.tool.modelNumber}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-zinc-800 dark:text-zinc-300 font-medium">{job.status}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-600 group-hover:text-zinc-950 dark:group-hover:text-white transition-colors" />
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {matchingInventory.length > 0 && (
                    <div className="p-2 space-y-1">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-700 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Parts Inventory SKUs ({matchingInventory.length})</span>
                        <span>Select to view catalog</span>
                      </div>
                      {matchingInventory.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleSelectInventoryResult(item)}
                          className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors flex items-center justify-between gap-2 group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-950 dark:text-white bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-800 text-[11px]">
                                {item.sku}
                              </span>
                              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200 truncate">{item.name}</span>
                            </div>
                            <div className="text-[10px] text-zinc-700 dark:text-zinc-400 mt-0.5">
                              Category: {item.category} · Bin: {item.binLocation}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 text-right">
                            <div>
                              <div className="text-xs font-bold text-zinc-950 dark:text-white tabular-nums">
                                ${item.unitPrice.toFixed(2)}
                              </div>
                              <div className="text-[9px] text-zinc-700 dark:text-zinc-400 tabular-nums">
                                {item.stockQty} in stock
                              </div>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-600 group-hover:text-zinc-950 dark:group-hover:text-white transition-colors" />
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
      </div>
    </section>
    </>
  );
};
