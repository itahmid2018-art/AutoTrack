import React, { useState, useEffect } from 'react';
import { InventoryItem, JobCard, BusinessSettings } from '../types';
import { generateMySqlDump } from '../utils/mysqlExport';
import {
  InventoryNotification,
  computeReorderSuggestion,
  isItemBelowThreshold,
  syncInventoryNotifications,
} from '../utils/inventoryNotifications';
import { AiReorderRecommendations } from './AiReorderRecommendations';
import { 
  Search, Plus, Package, AlertTriangle, Download, Barcode, 
  RefreshCw, Database, FileCode, CheckCircle2, ShoppingCart, ShieldAlert, Sparkles, BrainCircuit,
  Bell, CheckCheck, Minus, PackageX, ChevronDown, ChevronUp
} from 'lucide-react';

interface InventoryManagerProps {
  inventory: InventoryItem[];
  onUpdateInventory: (newInv: InventoryItem[]) => void;
  onOpenAddItemModal: () => void;
  jobCards?: JobCard[];
  settings?: BusinessSettings;
  notifications?: InventoryNotification[];
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  initialShowLowStockOnly?: boolean;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  inventory,
  onUpdateInventory,
  onOpenAddItemModal,
  jobCards = [],
  settings = {
    centerName: 'BOSCH Authorised Service Center',
    address: 'Industrial Estate, Bay 4',
    phone: '+1 (555) 019-2831',
    email: 'service@boschtools.com',
    taxRate: 10.0,
    laborRate: 45.0,
    jobCardPrefix: 'BOSCH-2026-',
    currencySymbol: '$',
    WhatsAppTemplateIntake: '',
    WhatsAppTemplateReady: '',
    WhatsAppTemplateEstimate: '',
    deductStockOn: 'InService',
    requireSignature: true,
  },
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  initialShowLowStockOnly = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'All' | 'LowStock' | 'InStock'>(
    initialShowLowStockOnly ? 'LowStock' : 'All'
  );
  const [showReorderPanel, setShowReorderPanel] = useState(initialShowLowStockOnly);
  const [showAiReorders, setShowAiReorders] = useState(true);
  const [showNotificationCenter, setShowNotificationCenter] = useState(true);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [restockFeedback, setRestockFeedback] = useState<string | null>(null);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    if (initialShowLowStockOnly) {
      setStockFilter('LowStock');
      setShowNotificationCenter(true);
      setCurrentPage(1);
    }
  }, [initialShowLowStockOnly]);

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scannedSku, setScannedSku] = useState('');
  const [scanResult, setScanResult] = useState<InventoryItem | null>(null);

  const categories = ['All', ...Array.from(new Set(inventory.map((i) => i.category)))];

  const lowStockItems = inventory.filter(isItemBelowThreshold);
  const activeNotifications = notifications || syncInventoryNotifications(inventory);
  const unreadNotifCount = activeNotifications.filter((n) => !n.read).length;
  const outOfStockCount = activeNotifications.filter((n) => n.severity === 'OUT_OF_STOCK').length;
  const criticalNotifCount = activeNotifications.filter(
    (n) => n.severity === 'OUT_OF_STOCK' || n.severity === 'CRITICAL'
  ).length;
  const totalEstimatedReorderBudget = activeNotifications.reduce(
    (sum, n) => sum + n.estimatedReorderCost,
    0
  );

  const visibleNotifications = activeNotifications.filter((n) => {
    if (notifFilter === 'unread') return !n.read;
    if (notifFilter === 'critical') return n.severity === 'OUT_OF_STOCK' || n.severity === 'CRITICAL';
    return true;
  });

  const filteredItems = inventory.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.barcode.includes(searchTerm) ||
      item.binLocation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.brand.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesStock =
      stockFilter === 'All' ||
      (stockFilter === 'LowStock' && isItemBelowThreshold(item)) ||
      (stockFilter === 'InStock' && !isItemBelowThreshold(item));

    return matchesSearch && matchesCategory && matchesStock;
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleQuickRestock = (itemId: string, addQty: number = 10) => {
    const target = inventory.find((i) => i.id === itemId);
    const updated = inventory.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          stockQty: item.stockQty + addQty,
          lastRestocked: new Date().toISOString().split('T')[0],
        };
      }
      return item;
    });
    onUpdateInventory(updated);
    if (target) {
      setRestockFeedback(`Reordered +${addQty} ${target.unit} of ${target.sku} (${target.name}). Stock replenished.`);
      setTimeout(() => setRestockFeedback(null), 4000);
    }
  };

  const handleAdjustStock = (itemId: string, delta: number) => {
    const updated = inventory.map((item) => {
      if (item.id === itemId) {
        const nextQty = Math.max(0, item.stockQty + delta);
        return {
          ...item,
          stockQty: nextQty,
          lastRestocked: delta > 0 ? new Date().toISOString().split('T')[0] : item.lastRestocked,
        };
      }
      return item;
    });
    onUpdateInventory(updated);
  };

  const handleBulkReorderCritical = () => {
    const criticalItems = activeNotifications
      .filter((n) => n.severity === 'OUT_OF_STOCK' || n.severity === 'CRITICAL')
      .slice(0, 10);
    if (criticalItems.length === 0) return;

    const reorderMap = new Map(criticalItems.map((c) => [c.itemId, c.suggestedReorderQty]));
    const today = new Date().toISOString().split('T')[0];

    const updated = inventory.map((item) => {
      const addQty = reorderMap.get(item.id);
      if (!addQty) return item;
      return {
        ...item,
        stockQty: item.stockQty + addQty,
        lastRestocked: today,
      };
    });
    onUpdateInventory(updated);
    setRestockFeedback(
      `Batch reordered ${criticalItems.length} critical spare part SKUs back above safety thresholds.`
    );
    setTimeout(() => setRestockFeedback(null), 4500);
  };

  const handleSimulateScan = () => {
    const found = inventory.find(
      (i) => i.sku.toLowerCase() === scannedSku.toLowerCase() || i.barcode === scannedSku
    );
    setScanResult(found || null);
  };

  const handleDownloadSqlDump = () => {
    const sqlDump = generateMySqlDump(jobCards, inventory, settings);
    const blob = new Blob([sqlDump], { type: 'text/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bosch_service_db_local_deploy_${new Date().toISOString().split('T')[0]}.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadReorderCsv = () => {
    const headers = ['SKU', 'Part Name', 'Category', 'Current Stock', 'Min Threshold', 'Suggested Reorder Qty', 'Cost Per Unit', 'Estimated Reorder Total'];
    const rows = lowStockItems.map(i => [
      i.sku,
      `"${i.name}"`,
      `"${i.category}"`,
      i.stockQty,
      i.minStockThreshold,
      (i.minStockThreshold * 2) - i.stockQty,
      i.costPrice,
      (((i.minStockThreshold * 2) - i.stockQty) * i.costPrice).toFixed(2)
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `Low_Stock_Reorder_PO_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-mono">
      
      {/* Header Controls & Metrics */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white tracking-tight uppercase">Bosch Spare Parts Catalog</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-zinc-950 text-white border border-zinc-700">
                {inventory.length} Total SKUs
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-sans">
              Transactional inventory database for Bosch, Makita, DeWalt &amp; Hilti power tool replacement parts.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={() => setShowAiReorders(!showAiReorders)}
              className="px-3.5 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-all shadow flex items-center gap-1.5 active:scale-95"
            >
              <BrainCircuit className="w-4 h-4 text-zinc-950" />
              <span>{showAiReorders ? 'Hide AI Reorder Analysis' : '✨ AI Reorder Recommendations'}</span>
            </button>

            <button
              onClick={() => setShowSqlModal(true)}
              className="px-3 py-2 text-xs font-bold text-zinc-200 bg-zinc-950 hover:bg-zinc-800 rounded-xl transition-all border border-zinc-800 flex items-center gap-1.5"
            >
              <Database className="w-4 h-4" />
              <span>Export MySQL DB</span>
            </button>

            <button
              onClick={() => setScanModalOpen(true)}
              className="px-3 py-2 text-xs font-bold text-zinc-200 bg-zinc-950 hover:bg-zinc-800 rounded-xl transition-all border border-zinc-800 flex items-center gap-1.5"
            >
              <Barcode className="w-4 h-4 text-white" />
              <span>Barcode Scanner</span>
            </button>

            <button
              onClick={onOpenAddItemModal}
              className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl shadow transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Part SKU</span>
            </button>
          </div>
        </div>

        {/* DEDICATED INVENTORY NOTIFICATION CENTER */}
        <div className="mt-5 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-inner">
          <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800/80">
            <div className="flex items-start sm:items-center gap-3">
              <div
                className={`p-2.5 rounded-xl font-bold shrink-0 border ${
                  lowStockItems.length > 0
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                }`}
              >
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Inventory Notification Center
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                      lowStockItems.length > 0
                        ? 'bg-rose-950 text-rose-300 border-rose-700'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    }`}
                  >
                    {lowStockItems.length} BELOW MIN THRESHOLD
                  </span>
                  {unreadNotifCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-extrabold font-mono">
                      {unreadNotifCount} UNREAD
                    </span>
                  )}
                  {outOfStockCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold font-mono">
                      {outOfStockCount} OUT OF STOCK
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
                  Real-time threshold monitor &amp; direct reorder suggestions. Est. PO value for queued alerts:{' '}
                  <strong className="text-white font-mono">${totalEstimatedReorderBudget.toFixed(2)}</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onMarkAllNotificationsRead && unreadNotifCount > 0 && (
                <button
                  onClick={onMarkAllNotificationsRead}
                  className="px-3 py-1.5 text-[11px] font-bold text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mark All Read</span>
                </button>
              )}

              {criticalNotifCount > 0 && (
                <button
                  onClick={handleBulkReorderCritical}
                  className="px-3 py-1.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl flex items-center gap-1.5 transition-colors active:scale-95"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Reorder Critical ({Math.min(10, criticalNotifCount)})</span>
                </button>
              )}

              <button
                onClick={() => {
                  setStockFilter('LowStock');
                  setShowReorderPanel(true);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 text-[11px] font-bold text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Manual PO Sheet</span>
              </button>

              <button
                onClick={() => setShowNotificationCenter((prev) => !prev)}
                className="px-2.5 py-1.5 text-[11px] font-bold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-1"
              >
                {showNotificationCenter ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>{showNotificationCenter ? 'Collapse' : 'Expand'}</span>
              </button>
            </div>
          </div>

          {restockFeedback && (
            <div className="px-4 py-2.5 bg-emerald-950/70 border-b border-emerald-800/70 text-emerald-300 text-xs flex items-center gap-2 font-sans">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{restockFeedback}</span>
            </div>
          )}

          {showNotificationCenter && (
            <div className="p-4 space-y-3">
              {/* Filter Tabs inside Notification Center */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                  {[
                    { id: 'all', label: `All Below Threshold (${activeNotifications.length})` },
                    { id: 'unread', label: `Unread (${unreadNotifCount})` },
                    { id: 'critical', label: `Critical / Stockout (${criticalNotifCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setNotifFilter(tab.id as 'all' | 'unread' | 'critical')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                        notifFilter === tab.id
                          ? 'bg-white text-zinc-950'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleDownloadReorderCsv}
                  disabled={lowStockItems.length === 0}
                  className="px-3 py-1.5 text-[11px] font-bold text-zinc-950 bg-white hover:bg-zinc-200 disabled:opacity-40 rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Reorder PO CSV</span>
                </button>
              </div>

              {visibleNotifications.length === 0 ? (
                <div className="p-4 bg-zinc-900/60 border border-dashed border-zinc-800 rounded-xl text-center text-xs text-zinc-400 font-sans">
                  No inventory threshold alerts in this filter view. All tracked spare parts meet minimum stock levels.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
                  {visibleNotifications.slice(0, 18).map((notif) => {
                    const isOut = notif.severity === 'OUT_OF_STOCK';
                    return (
                      <div
                        key={notif.id}
                        onClick={() => onMarkNotificationRead && onMarkNotificationRead(notif.id)}
                        className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 cursor-pointer ${
                          isOut
                            ? 'bg-rose-950/20 border-rose-800/70 hover:border-rose-600'
                            : !notif.read
                            ? 'bg-amber-950/20 border-amber-700/70 hover:border-amber-500'
                            : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {!notif.read && (
                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Unread alert" />
                              )}
                              <span className="font-bold text-white text-xs truncate">{notif.sku}</span>
                            </div>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold border shrink-0 ${
                                isOut
                                  ? 'bg-rose-950 text-rose-300 border-rose-700'
                                  : notif.severity === 'CRITICAL'
                                  ? 'bg-amber-950 text-amber-300 border-amber-700'
                                  : 'bg-zinc-950 text-zinc-300 border-zinc-700'
                              }`}
                            >
                              {isOut ? 'OUT OF STOCK' : notif.severity}
                            </span>
                          </div>

                          <div className="text-xs font-semibold text-zinc-200 font-sans truncate" title={notif.name}>
                            {notif.name}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
                            <span>Bin: {notif.binLocation}</span>
                            <span className={isOut ? 'text-rose-400 font-bold' : 'text-amber-400 font-bold'}>
                              Stock: {notif.stockQty} / Min {notif.minStockThreshold}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                          <div className="text-[10px]">
                            <span className="text-zinc-400 block">Reorder Suggestion:</span>
                            <strong className="text-emerald-400">
                              +{notif.suggestedReorderQty} {notif.unit} (${notif.estimatedReorderCost.toFixed(2)})
                            </strong>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickRestock(notif.itemId, notif.suggestedReorderQty);
                            }}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 shrink-0 active:scale-95"
                          >
                            <ShoppingCart className="w-3 h-3" />
                            <span>Reorder +{notif.suggestedReorderQty}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-zinc-800">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search 1,000 parts by SKU, Name, Bin..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-500 font-medium"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                Category: {c}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => { setStockFilter('All'); setCurrentPage(1); setShowReorderPanel(false); }}
              className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors ${stockFilter === 'All' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400 hover:text-white'}`}
            >
              All ({inventory.length})
            </button>
            <button
              onClick={() => { setStockFilter('LowStock'); setCurrentPage(1); setShowReorderPanel(true); }}
              className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1 ${stockFilter === 'LowStock' ? 'bg-white text-zinc-950 font-bold' : 'text-zinc-400 hover:text-white'}`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Low Stock Alert ({lowStockItems.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* AI PREDICTIVE REORDER ENGINE PANEL */}
      {showAiReorders && (
        <AiReorderRecommendations
          inventory={inventory}
          jobCards={jobCards}
          onUpdateInventory={onUpdateInventory}
        />
      )}

      {/* REORDER PLANNING PANEL (If open) */}
      {showReorderPanel && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-white" />
              <h2 className="text-base font-bold text-white uppercase">Supplier Reorder Planning Sheet</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadReorderCsv}
                className="px-3 py-1.5 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-lg flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Reorder CSV</span>
              </button>

              <button onClick={() => setShowReorderPanel(false)} className="text-xs text-zinc-500 hover:text-white">
                Close Panel
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-zinc-800 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-950 text-zinc-400 text-[11px]">
                <tr>
                  <th className="p-2.5">SKU</th>
                  <th className="p-2.5">Part Name</th>
                  <th className="p-2.5 text-center">Current Stock</th>
                  <th className="p-2.5 text-center">Min Threshold</th>
                  <th className="p-2.5 text-center">Suggested PO Qty</th>
                  <th className="p-2.5 text-right">Cost / Unit</th>
                  <th className="p-2.5 text-right">Total Reorder Cost</th>
                  <th className="p-2.5 text-center">Quick Restock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 text-zinc-300">
                {lowStockItems.map((item) => {
                  const reorderQty = Math.max(10, (item.minStockThreshold * 2) - item.stockQty);
                  return (
                    <tr key={item.id} className="hover:bg-zinc-950/40">
                      <td className="p-2.5 font-bold text-white">{item.sku}</td>
                      <td className="p-2.5">{item.name}</td>
                      <td className="p-2.5 text-center font-bold text-white bg-zinc-950">{item.stockQty} {item.unit}</td>
                      <td className="p-2.5 text-center text-zinc-400">{item.minStockThreshold}</td>
                      <td className="p-2.5 text-center font-bold text-white">{reorderQty}</td>
                      <td className="p-2.5 text-right">${item.costPrice.toFixed(2)}</td>
                      <td className="p-2.5 text-right font-bold text-white">${(reorderQty * item.costPrice).toFixed(2)}</td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleQuickRestock(item.id, reorderQty)}
                          className="px-2 py-1 bg-white hover:bg-zinc-200 text-zinc-950 text-[10px] font-bold rounded"
                        >
                          + Receive Restock
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-zinc-950 text-zinc-400 font-mono text-[11px] uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="py-3 px-4">SKU / Barcode</th>
                <th className="py-3 px-4">Part Description &amp; Compatible Tool</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Bin Location</th>
                <th className="py-3 px-4 text-right">Unit Price</th>
                <th className="py-3 px-4 text-center">Stock Level Status</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500 font-sans">
                    No spare parts matched your search parameters.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const isLow = isItemBelowThreshold(item);
                  const isOut = item.stockQty <= 0;
                  const reorderSpec = isLow ? computeReorderSuggestion(item) : null;
                  return (
                    <tr key={item.id} className={`hover:bg-zinc-950/40 transition-colors ${isLow ? 'bg-zinc-950/60' : ''}`}>
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-white">{item.sku}</div>
                        <div className="text-[10px] text-zinc-500">{item.barcode}</div>
                      </td>

                      <td className="py-3 px-4 font-sans">
                        <div className="font-bold text-white">{item.name}</div>
                        <div className="text-[11px] text-zinc-400">{item.brand} · <span className="font-mono text-zinc-500">{item.compatibleModels}</span></div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300">
                          {item.category}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-zinc-300 font-semibold">
                        {item.binLocation}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-white">
                        ${item.unitPrice.toFixed(2)}
                      </td>

                      {/* VISUAL ALERT BADGE & REORDER SUGGESTION COLUMN */}
                      <td className="py-3 px-4 text-center font-mono">
                        {isLow && reorderSpec ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[11px] border shadow ${
                                isOut
                                  ? 'bg-rose-950 text-rose-200 border-rose-600'
                                  : 'bg-amber-500 text-zinc-950 border-amber-400'
                              }`}
                            >
                              {isOut ? <PackageX className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                              <span>
                                {isOut ? 'OUT OF STOCK' : 'LOW STOCK'}: {item.stockQty} / Min {item.minStockThreshold}
                              </span>
                            </span>
                            <span className="text-[10px] text-emerald-400 font-semibold">
                              Suggest Reorder: +{reorderSpec.suggestedReorderQty} {item.unit} ($
                              {reorderSpec.estimatedReorderCost.toFixed(2)})
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium text-xs bg-zinc-950 text-zinc-300 border border-zinc-800">
                            {item.stockQty} {item.unit}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleAdjustStock(item.id, -1)}
                            disabled={item.stockQty <= 0}
                            title="Issue / deduct 1 unit from stock"
                            className="px-2 py-1 text-[11px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-30 bg-zinc-950 rounded-lg border border-zinc-800 transition-colors inline-flex items-center"
                          >
                            <Minus className="w-3 h-3" />
                            <span>1</span>
                          </button>

                          {isLow && reorderSpec ? (
                            <button
                              onClick={() => handleQuickRestock(item.id, reorderSpec.suggestedReorderQty)}
                              title={`Order suggested ${reorderSpec.suggestedReorderQty} ${item.unit}`}
                              className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <ShoppingCart className="w-3 h-3" />
                              <span>Order +{reorderSpec.suggestedReorderQty}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleQuickRestock(item.id, 10)}
                              className="px-2.5 py-1 text-[11px] font-bold text-white hover:bg-zinc-800 bg-zinc-950 rounded-lg border border-zinc-800 transition-colors inline-flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>+10</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400 font-mono">
            <div>
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} SKUs
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg disabled:opacity-40 hover:bg-zinc-800 text-white font-medium"
              >
                Previous
              </button>

              <span className="text-zinc-300">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg disabled:opacity-40 hover:bg-zinc-800 text-white font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SQL EXPORT MODAL FOR LOCAL MYSQL DEPLOYMENT */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-white" />
                <h3 className="text-base font-bold text-white uppercase">Deployable MySQL Database Export</h3>
              </div>
              <button onClick={() => setShowSqlModal(false)} className="text-zinc-500 hover:text-white text-xs">
                Close
              </button>
            </div>

            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
              This system compiles all transactional Job Cards, Tool Specifications, Service Requirements, and ~1,000 Inventory SKUs into standard MySQL DDL &amp; DML statements for local deployment on MySQL 8.0+ or MariaDB.
            </p>

            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 text-xs">
              <span className="text-zinc-400 font-bold block text-[10px] uppercase">Export SQL Script Details:</span>
              <ul className="text-zinc-300 space-y-1 text-[11px] list-disc list-inside">
                <li>Database: <code className="text-white">bosch_service_db</code></li>
                <li>Tables: <code className="text-white">job_cards</code>, <code className="text-white">inventory_items</code>, <code className="text-white">job_card_parts</code>, <code className="text-white">message_logs</code></li>
                <li>Includes <strong className="text-white">{inventory.length} Inventory Inserts</strong> and <strong className="text-white">{jobCards.length} Job Card Inserts</strong></li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Close
              </button>
              <button
                onClick={handleDownloadSqlDump}
                className="px-5 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl flex items-center gap-1.5 shadow"
              >
                <Download className="w-4 h-4" />
                <span>Download MySQL .sql Script</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {scanModalOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2 font-mono">
                <Barcode className="w-5 h-5 text-white" />
                <span>Barcode / SKU Scanner</span>
              </h3>
              <button onClick={() => setScanModalOpen(false)} className="text-zinc-500 hover:text-white text-xs">
                Close
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={scannedSku}
                onChange={(e) => setScannedSku(e.target.value)}
                placeholder="Scan SKU (e.g. BRSH-1002)..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
              />
              <button
                onClick={handleSimulateScan}
                className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl"
              >
                Scan
              </button>
            </div>

            {scanResult && (
              <div className="p-4 bg-zinc-950 border border-zinc-700 rounded-xl space-y-2 text-xs">
                <div className="font-bold text-white text-sm">{scanResult.name}</div>
                <div className="text-zinc-400 font-mono">SKU: {scanResult.sku} · Barcode: {scanResult.barcode}</div>
                <div className="text-zinc-200 font-bold">Location: {scanResult.binLocation}</div>
                <div className="text-white font-bold font-mono">Price: ${scanResult.unitPrice.toFixed(2)}</div>
                <div className="text-zinc-400">Stock: {scanResult.stockQty} {scanResult.unit}</div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
