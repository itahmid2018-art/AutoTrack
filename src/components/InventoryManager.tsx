import React, { useState, useEffect, useMemo } from 'react';
import { InventoryItem, JobCard, BusinessSettings, RecurringMaintenance, CustomField } from '../types';
import { generateMySqlDump } from '../utils/mysqlExport';
import {
  InventoryNotification,
  analyzeInventoryReorderPoints,
  computeReorderSuggestion,
  isItemBelowThreshold,
  syncInventoryNotifications,
} from '../utils/inventoryNotifications';
import { generatePurchaseOrderPdf } from '../utils/generatePdf';
import { AiReorderRecommendations } from './AiReorderRecommendations';
import { SerialBarcodeScannerModal } from './SerialBarcodeScannerModal';
import { InventoryBulkImportModal } from './InventoryBulkImportModal';
import {
  BarcodeScanResult,
  ToolHistoryMatch,
  findMatchingInventoryItem,
  findMatchingToolHistory,
  parseProductQrPayload,
} from '../utils/barcodeSerialParser';
import { 
  Search, Plus, Package, AlertTriangle, Download, Barcode, 
  RefreshCw, Database, CheckCircle2, ShoppingCart, BrainCircuit,
  Bell, CheckCheck, Minus, PackageX, ChevronDown, ChevronUp, QrCode, History, ExternalLink, Camera, FileSpreadsheet, FileText
} from 'lucide-react';

interface InventoryManagerProps {
  inventory: InventoryItem[];
  onUpdateInventory: (newInv: InventoryItem[]) => void;
  onOpenAddItemModal: () => void;
  jobCards?: JobCard[];
  schedules?: RecurringMaintenance[];
  customFields?: CustomField[];
  settings?: BusinessSettings;
  notifications?: InventoryNotification[];
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  initialShowLowStockOnly?: boolean;
  onSelectJobCard?: (job: JobCard) => void;
  externalLookupCode?: { code: string; nonce: number } | null;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  inventory,
  onUpdateInventory,
  onOpenAddItemModal,
  jobCards = [],
  schedules = [],
  customFields = [],
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
  onSelectJobCard,
  externalLookupCode,
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
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);
  const [cameraQrScannerOpen, setCameraQrScannerOpen] = useState(false);
  const [scannedSku, setScannedSku] = useState('');
  const [scanResult, setScanResult] = useState<InventoryItem | null>(null);
  const [scanToolHistory, setScanToolHistory] = useState<ToolHistoryMatch | null>(null);
  const [lastScanMeta, setLastScanMeta] = useState<{ code: string; format: string; method: string } | null>(null);

  useEffect(() => {
    if (externalLookupCode?.code) {
      setSearchTerm(externalLookupCode.code);
      setCurrentPage(1);
      performCodeLookup(externalLookupCode.code, {
        format: 'Global Scanner',
        method: 'Header QR / Barcode Lookup',
      });
    }
  }, [externalLookupCode?.nonce]);

  const categories = ['All', ...Array.from(new Set(inventory.map((i) => i.category)))];

  const reorderAnalysis = useMemo(
    () => analyzeInventoryReorderPoints(inventory, jobCards),
    [inventory, jobCards]
  );
  const analysisByItemId = useMemo(
    () => new Map(reorderAnalysis.items.map((entry) => [entry.itemId, entry])),
    [reorderAnalysis]
  );
  const automatedReorderItems = reorderAnalysis.belowThresholdItems;

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
    const isBelowAuto = Boolean(analysisByItemId.get(item.id)?.belowAutomatedThreshold);
    const matchesStock =
      stockFilter === 'All' ||
      (stockFilter === 'LowStock' && (isItemBelowThreshold(item) || isBelowAuto)) ||
      (stockFilter === 'InStock' && !isItemBelowThreshold(item) && !isBelowAuto);

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

  const performCodeLookup = (
    rawCode: string,
    meta: { format: string; method: string } = { format: 'Manual Input', method: 'SKU / Barcode Lookup' }
  ) => {
    const parsed = parseProductQrPayload(rawCode);
    const found = findMatchingInventoryItem(rawCode, inventory);
    const history = findMatchingToolHistory(rawCode, jobCards, schedules, found?.sku);
    const displayCode =
      found?.sku ||
      parsed.sku ||
      parsed.serialNumber ||
      parsed.jobId ||
      parsed.barcode ||
      rawCode.trim();

    setScannedSku(displayCode);
    setScanResult(found || null);
    setScanToolHistory(history);
    setLastScanMeta({
      code: displayCode,
      format: meta.format,
      method: meta.method,
    });
    setScanModalOpen(true);
  };

  const handleSimulateScan = () => {
    performCodeLookup(scannedSku);
  };

  const handleCameraQrDetected = (result: BarcodeScanResult) => {
    setCameraQrScannerOpen(false);
    performCodeLookup(result.rawValue || result.detectedSku || result.serialNumber, {
      format: result.format,
      method: result.method,
    });
  };

  const handleDownloadSqlDump = () => {
    const sqlDump = generateMySqlDump(jobCards, inventory, settings, schedules, customFields);
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
    const sourceItems =
      automatedReorderItems.length > 0
        ? automatedReorderItems
        : lowStockItems.map((i) => {
            const qty = Math.max(10, i.minStockThreshold * 2 - i.stockQty);
            return {
              sku: i.sku,
              name: i.name,
              item: i,
              currentStock: i.stockQty,
              suggestedReorderPoint: i.minStockThreshold,
              avgMonthlyConsumptionRate: 0,
              suggestedOrderQty: qty,
              estimatedOrderCost: qty * i.costPrice,
            };
          });

    const headers = [
      'SKU',
      'Part Name',
      'Category',
      'Current Stock',
      'Avg Monthly Consumption',
      'Automated Reorder Point',
      'Suggested Reorder Qty',
      'Cost Per Unit',
      'Estimated Reorder Total',
    ];
    const rows = sourceItems.map((entry) => [
      entry.sku,
      `"${entry.name}"`,
      `"${entry.item.category}"`,
      entry.currentStock,
      entry.avgMonthlyConsumptionRate.toFixed(2),
      entry.suggestedReorderPoint,
      entry.suggestedOrderQty,
      entry.item.costPrice,
      entry.estimatedOrderCost.toFixed(2),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `Low_Stock_Reorder_PO_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadDraftPoPdf = () => {
    if (automatedReorderItems.length === 0) return;
    const poItems = automatedReorderItems.map((entry) => ({
      sku: entry.sku,
      name: entry.name,
      currentStock: entry.currentStock,
      minStockThreshold: entry.suggestedReorderPoint,
      suggestedReorderQty: entry.suggestedOrderQty,
      costPrice: entry.item.costPrice,
      estimatedTotalCost: entry.estimatedOrderCost,
      suggestedSupplier: entry.suggestedSupplier,
      urgency: entry.urgency,
    }));
    const { doc, filename } = generatePurchaseOrderPdf(poItems, {
      centerName: settings.centerName,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      currencySymbol: settings.currencySymbol,
    });
    doc.save(filename);
    setRestockFeedback(
      `Generated Draft PO PDF (${filename}) for ${poItems.length} parts below automated consumption reorder points.`
    );
    setTimeout(() => setRestockFeedback(null), 4500);
  };

  return (
    <div className="space-y-6 font-mono">
      
      {/* Header Controls & Metrics */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-zinc-950 dark:text-white tracking-tight uppercase">Bosch Spare Parts Catalog</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-white border border-zinc-400 dark:border-zinc-700">
                {inventory.length} Total SKUs
              </span>
            </div>
            <p className="text-xs text-zinc-700 dark:text-zinc-400 mt-1 font-sans">
              Transactional inventory database for Bosch, Makita, DeWalt &amp; Hilti power tool replacement parts.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={() => setShowAiReorders(!showAiReorders)}
              className="px-3.5 py-2 text-xs font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl transition-all shadow flex items-center gap-1.5 active:scale-95"
            >
              <BrainCircuit className="w-4 h-4 text-zinc-950" />
              <span>{showAiReorders ? 'Hide AI Reorder Analysis' : '✨ AI Reorder Recommendations'}</span>
            </button>

            <button
              onClick={() => setShowSqlModal(true)}
              className="px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-all border border-zinc-300 dark:border-zinc-800 flex items-center gap-1.5"
            >
              <Database className="w-4 h-4" />
              <span>Export MySQL DB</span>
            </button>

            <button
              onClick={() => setCameraQrScannerOpen(true)}
              className="px-3 py-2 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow flex items-center gap-1.5 active:scale-95"
              title="Open device camera to scan product QR codes or inventory barcodes"
            >
              <QrCode className="w-4 h-4" />
              <span>QR / Barcode Scanner</span>
            </button>

            <button
              onClick={() => setScanModalOpen(true)}
              className="px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-all border border-zinc-300 dark:border-zinc-800 flex items-center gap-1.5"
            >
              <Barcode className="w-4 h-4 text-zinc-950 dark:text-white" />
              <span>Lookup / Barcode</span>
            </button>

            <button
              onClick={onOpenAddItemModal}
              className="px-4 py-2 text-xs font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl shadow transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Part SKU</span>
            </button>

            <button
              type="button"
              onClick={() => setBulkImportModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold text-zinc-950 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
              title="Paste Excel or CSV rows to seed or update inventory SKUs"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Bulk Import Excel / CSV</span>
            </button>
          </div>
        </div>

        {/* DEDICATED INVENTORY NOTIFICATION CENTER */}
        <div className="mt-5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl overflow-hidden shadow-inner">
          <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-300/80 dark:border-zinc-800/80">
            <div className="flex items-start sm:items-center gap-3">
              <div
                className={`p-2.5 rounded-xl font-bold shrink-0 border ${
                  lowStockItems.length > 0
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                }`}
              >
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                    Inventory Notification Center
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                      automatedReorderItems.length > 0
                        ? 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                        : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    }`}
                  >
                    {automatedReorderItems.length} BELOW AUTO REORDER PT
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
                <p className="text-[11px] text-zinc-700 dark:text-zinc-400 font-sans mt-0.5">
                  Analyzed {reorderAnalysis.analyzedJobCount} job cards ({reorderAnalysis.observedMonths} mo span) for consumption reorder points. Est. PO value:{' '}
                  <strong className="text-zinc-950 dark:text-white font-mono">${reorderAnalysis.totalEstimatedOrderCost.toFixed(2)}</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onMarkAllNotificationsRead && unreadNotifCount > 0 && (
                <button
                  onClick={onMarkAllNotificationsRead}
                  className="px-3 py-1.5 text-[11px] font-bold text-zinc-800 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
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
                onClick={handleDownloadDraftPoPdf}
                disabled={automatedReorderItems.length === 0}
                className="px-3 py-1.5 text-[11px] font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 rounded-xl flex items-center gap-1.5 transition-colors active:scale-95"
                title="Generate Draft Purchase Order PDF for items below automated reorder point thresholds"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Download Draft PO PDF ({automatedReorderItems.length})</span>
              </button>

              <button
                onClick={() => {
                  setStockFilter('LowStock');
                  setShowReorderPanel(true);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 text-[11px] font-bold text-zinc-950 dark:text-white bg-white dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Reorder Point Sheet</span>
              </button>

              <button
                onClick={() => setShowNotificationCenter((prev) => !prev)}
                className="px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl flex items-center gap-1"
              >
                {showNotificationCenter ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>{showNotificationCenter ? 'Collapse' : 'Expand'}</span>
              </button>
            </div>
          </div>

          {restockFeedback && (
            <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/70 border-b border-emerald-300 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 font-sans">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
              <span>{restockFeedback}</span>
            </div>
          )}

          {showNotificationCenter && (
            <div className="p-4 space-y-3">
              {/* Filter Tabs inside Notification Center */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-300 dark:border-zinc-800">
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
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950'
                          : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadDraftPoPdf}
                    disabled={automatedReorderItems.length === 0}
                    className="px-3 py-1.5 text-[11px] font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 rounded-lg flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Draft PO PDF</span>
                  </button>
                  <button
                    onClick={handleDownloadReorderCsv}
                    disabled={automatedReorderItems.length === 0}
                    className="px-3 py-1.5 text-[11px] font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 rounded-lg flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Reorder PO CSV</span>
                  </button>
                </div>
              </div>

              {visibleNotifications.length === 0 ? (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl text-center text-xs text-zinc-700 dark:text-zinc-400 font-sans">
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
                            ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800/70 hover:border-rose-600'
                            : !notif.read
                            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/70 hover:border-amber-500'
                            : 'bg-white/95 dark:bg-zinc-900/80 border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {!notif.read && (
                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Unread alert" />
                              )}
                              <span className="font-bold text-zinc-950 dark:text-white text-xs truncate">{notif.sku}</span>
                            </div>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold border shrink-0 ${
                                isOut
                                  ? 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                                  : notif.severity === 'CRITICAL'
                                  ? 'bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                                  : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-300 border-zinc-400 dark:border-zinc-700'
                              }`}
                            >
                              {isOut ? 'OUT OF STOCK' : notif.severity}
                            </span>
                          </div>

                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 font-sans truncate" title={notif.name}>
                            {notif.name}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-zinc-700 dark:text-zinc-400 pt-0.5">
                            <span>Bin: {notif.binLocation}</span>
                            <span className={isOut ? 'text-rose-700 dark:text-rose-400 font-bold' : 'text-amber-700 dark:text-amber-400 font-bold'}>
                              Stock: {notif.stockQty} / Min {notif.minStockThreshold}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-zinc-300/80 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                          <div className="text-[10px]">
                            <span className="text-zinc-700 dark:text-zinc-400 block">Reorder Suggestion:</span>
                            <strong className="text-emerald-700 dark:text-emerald-400">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-zinc-300 dark:border-zinc-800">
          <div className="flex items-stretch gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-zinc-600 dark:text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search 1,000 parts by SKU, Barcode, Name, Bin..."
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-950 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-600 focus:outline-none focus:border-zinc-700 dark:focus:border-zinc-500 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => setCameraQrScannerOpen(true)}
              title="Scan SKU barcode or QR code with camera"
              aria-label="Scan SKU barcode or QR code with camera"
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-emerald-700 dark:text-emerald-400 hover:text-emerald-950 dark:hover:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 rounded-xl font-mono text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Scan</span>
            </button>
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-700 dark:focus:border-zinc-500 font-medium"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                Category: {c}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-300 dark:border-zinc-800">
            <button
              onClick={() => { setStockFilter('All'); setCurrentPage(1); setShowReorderPanel(false); }}
              className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors ${stockFilter === 'All' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-white font-bold' : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'}`}
            >
              All ({inventory.length})
            </button>
            <button
              onClick={() => { setStockFilter('LowStock'); setCurrentPage(1); setShowReorderPanel(true); }}
              className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1 ${stockFilter === 'LowStock' ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold' : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'}`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Reorder Alerts ({automatedReorderItems.length})</span>
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

      {/* REORDER PLANNING PANEL (Automated Monthly Consumption Reorder Points) */}
      {showReorderPanel && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-300 dark:border-zinc-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-zinc-950 dark:text-white" />
                <h2 className="text-base font-bold text-zinc-950 dark:text-white uppercase">
                  Automated Reorder Point &amp; Draft PO Sheet
                </h2>
              </div>
              <p className="text-[11px] text-zinc-700 dark:text-zinc-400 font-sans mt-0.5">
                Suggested reorder points derived from average monthly job card consumption ({reorderAnalysis.observedMonths} mo window across {reorderAnalysis.analyzedJobCount} active tickets).
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleDownloadDraftPoPdf}
                disabled={automatedReorderItems.length === 0}
                className="px-3 py-1.5 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 rounded-lg flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Download Draft PO PDF</span>
              </button>

              <button
                onClick={handleDownloadReorderCsv}
                disabled={automatedReorderItems.length === 0}
                className="px-3 py-1.5 text-xs font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 rounded-lg flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Reorder CSV</span>
              </button>

              <button onClick={() => setShowReorderPanel(false)} className="text-xs text-zinc-600 dark:text-zinc-500 hover:text-zinc-950 dark:hover:text-white">
                Close Panel
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-zinc-300 dark:border-zinc-800 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-400 text-[11px]">
                <tr>
                  <th className="p-2.5">SKU</th>
                  <th className="p-2.5">Part Name</th>
                  <th className="p-2.5 text-center">Current Stock</th>
                  <th className="p-2.5 text-center">Avg / Mo Burn</th>
                  <th className="p-2.5 text-center">Auto Reorder Pt</th>
                  <th className="p-2.5 text-center">Suggested PO Qty</th>
                  <th className="p-2.5 text-right">Cost / Unit</th>
                  <th className="p-2.5 text-right">Total Reorder Cost</th>
                  <th className="p-2.5 text-center">Quick Restock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-300">
                {automatedReorderItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-4 text-center text-zinc-600 dark:text-zinc-500 font-sans">
                      All spare part SKUs currently meet or exceed automated monthly consumption reorder points.
                    </td>
                  </tr>
                ) : (
                  automatedReorderItems.map((entry) => (
                    <tr key={entry.itemId} className="hover:bg-zinc-100 dark:hover:bg-zinc-950/40">
                      <td className="p-2.5 font-bold text-zinc-950 dark:text-white">{entry.sku}</td>
                      <td className="p-2.5">
                        <div>{entry.name}</div>
                        <div className="text-[10px] text-zinc-600 dark:text-zinc-500">
                          {entry.totalUnitsConsumed > 0
                            ? `${entry.totalUnitsConsumed} units across ${entry.jobUsageCount} job(s)`
                            : 'Static threshold baseline'}
                        </div>
                      </td>
                      <td className="p-2.5 text-center font-bold text-zinc-950 dark:text-white bg-zinc-50 dark:bg-zinc-950">
                        {entry.currentStock} {entry.item.unit}
                      </td>
                      <td className="p-2.5 text-center text-emerald-700 dark:text-emerald-400 font-bold">
                        {entry.avgMonthlyConsumptionRate.toFixed(1)}/mo
                      </td>
                      <td className="p-2.5 text-center text-amber-900 dark:text-amber-300 font-bold">
                        {entry.suggestedReorderPoint}
                        {entry.suggestedReorderPoint > entry.staticMinThreshold && (
                          <span className="block text-[9px] text-zinc-600 dark:text-zinc-500 font-normal">
                            Static: {entry.staticMinThreshold}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-bold text-zinc-950 dark:text-white">{entry.suggestedOrderQty}</td>
                      <td className="p-2.5 text-right">${entry.item.costPrice.toFixed(2)}</td>
                      <td className="p-2.5 text-right font-bold text-zinc-950 dark:text-white">
                        ${entry.estimatedOrderCost.toFixed(2)}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleQuickRestock(entry.itemId, entry.suggestedOrderQty)}
                          className="px-2 py-1 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-[10px] font-bold rounded"
                        >
                          + Receive Restock
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-400 font-mono text-[11px] uppercase tracking-wider border-b border-zinc-300 dark:border-zinc-800">
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
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-300">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-600 dark:text-zinc-500 font-sans">
                    No spare parts matched your search parameters.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const analysisItem = analysisByItemId.get(item.id);
                  const isLow = isItemBelowThreshold(item) || Boolean(analysisItem?.belowAutomatedThreshold);
                  const isOut = item.stockQty <= 0;
                  const reorderSpec = isLow ? computeReorderSuggestion(item) : null;
                  const reorderQty = analysisItem?.belowAutomatedThreshold
                    ? analysisItem.suggestedOrderQty
                    : reorderSpec?.suggestedReorderQty || 10;
                  const reorderCost = analysisItem?.belowAutomatedThreshold
                    ? analysisItem.estimatedOrderCost
                    : reorderSpec?.estimatedReorderCost || reorderQty * item.costPrice;
                  const activeThreshold = analysisItem?.suggestedReorderPoint ?? item.minStockThreshold;
                  return (
                    <tr key={item.id} className={`hover:bg-zinc-100 dark:hover:bg-zinc-950/40 transition-colors ${isLow ? 'bg-zinc-100/80 dark:bg-zinc-950/60' : ''}`}>
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-zinc-950 dark:text-white">{item.sku}</div>
                        <div className="text-[10px] text-zinc-600 dark:text-zinc-500">{item.barcode}</div>
                      </td>

                      <td className="py-3 px-4 font-sans">
                        <div className="font-bold text-zinc-950 dark:text-white">{item.name}</div>
                        <div className="text-[11px] text-zinc-700 dark:text-zinc-400">{item.brand} · <span className="font-mono text-zinc-600 dark:text-zinc-500">{item.compatibleModels}</span></div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-[11px] text-zinc-800 dark:text-zinc-300">
                          {item.category}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-zinc-800 dark:text-zinc-300 font-semibold">
                        {item.binLocation}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-zinc-950 dark:text-white">
                        ${item.unitPrice.toFixed(2)}
                      </td>

                      {/* VISUAL ALERT BADGE & AUTOMATED REORDER POINT COLUMN */}
                      <td className="py-3 px-4 text-center font-mono">
                        {isLow ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[11px] border shadow ${
                                isOut
                                  ? 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-500 dark:border-rose-600'
                                  : 'bg-amber-500 text-zinc-950 border-amber-400'
                              }`}
                            >
                              {isOut ? <PackageX className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                              <span>
                                {isOut ? 'OUT OF STOCK' : 'LOW STOCK'}: {item.stockQty} / Pt {activeThreshold}
                              </span>
                            </span>
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                              Suggest Reorder: +{reorderQty} {item.unit} (${reorderCost.toFixed(2)})
                              {analysisItem && analysisItem.avgMonthlyConsumptionRate > 0
                                ? ` · ${analysisItem.avgMonthlyConsumptionRate.toFixed(1)}/mo`
                                : ''}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-800">
                              {item.stockQty} {item.unit}
                            </span>
                            {analysisItem && analysisItem.avgMonthlyConsumptionRate > 0 && (
                              <span className="text-[10px] text-zinc-600 dark:text-zinc-500">
                                Auto Pt {analysisItem.suggestedReorderPoint} ({analysisItem.avgMonthlyConsumptionRate.toFixed(1)}/mo)
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleAdjustStock(item.id, -1)}
                            disabled={item.stockQty <= 0}
                            title="Issue / deduct 1 unit from stock"
                            className="px-2 py-1 text-[11px] font-bold text-zinc-800 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-300 dark:border-zinc-800 transition-colors inline-flex items-center"
                          >
                            <Minus className="w-3 h-3" />
                            <span>1</span>
                          </button>

                          {isLow ? (
                            <button
                              onClick={() => handleQuickRestock(item.id, reorderQty)}
                              title={`Order suggested ${reorderQty} ${item.unit}`}
                              className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <ShoppingCart className="w-3 h-3" />
                              <span>Order +{reorderQty}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleQuickRestock(item.id, 10)}
                              className="px-2.5 py-1 text-[11px] font-bold text-zinc-950 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-300 dark:border-zinc-800 transition-colors inline-flex items-center gap-1"
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
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-300 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-400 font-mono">
            <div>
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} SKUs
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg disabled:opacity-40 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-950 dark:text-white font-medium"
              >
                Previous
              </button>

              <span className="text-zinc-800 dark:text-zinc-300">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg disabled:opacity-40 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-950 dark:text-white font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SQL EXPORT MODAL FOR LOCAL MYSQL DEPLOYMENT */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 dark:bg-zinc-950/85 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl font-mono">
            <div className="flex items-center justify-between border-b border-zinc-300 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-zinc-950 dark:text-white" />
                <h3 className="text-base font-bold text-zinc-950 dark:text-white uppercase">Deployable MySQL Database Export</h3>
              </div>
              <button onClick={() => setShowSqlModal(false)} className="text-zinc-600 dark:text-zinc-500 hover:text-zinc-950 dark:hover:text-white text-xs">
                Close
              </button>
            </div>

            <p className="text-xs text-zinc-800 dark:text-zinc-300 font-sans leading-relaxed">
              This system compiles all transactional Job Cards, Tool Specifications, Service Requirements, and ~1,000 Inventory SKUs into standard MySQL DDL &amp; DML statements for local deployment on MySQL 8.0+ or MariaDB.
            </p>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl space-y-2 text-xs">
              <span className="text-zinc-700 dark:text-zinc-400 font-bold block text-[10px] uppercase">Export SQL Script Details:</span>
              <ul className="text-zinc-800 dark:text-zinc-300 space-y-1 text-[11px] list-disc list-inside">
                <li>Database: <code className="text-zinc-950 dark:text-white">bosch_service_db</code></li>
                <li>Tables: <code className="text-zinc-950 dark:text-white">job_cards</code>, <code className="text-zinc-950 dark:text-white">inventory_items</code>, <code className="text-zinc-950 dark:text-white">job_card_parts</code>, <code className="text-zinc-950 dark:text-white">message_logs</code></li>
                <li>Includes <strong className="text-zinc-950 dark:text-white">{inventory.length} Inventory Inserts</strong> and <strong className="text-zinc-950 dark:text-white">{jobCards.length} Job Card Inserts</strong></li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-300 dark:border-zinc-800">
              <button
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
              >
                Close
              </button>
              <button
                onClick={handleDownloadSqlDump}
                className="px-5 py-2 text-xs font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl flex items-center gap-1.5 shadow"
              >
                <Download className="w-4 h-4" />
                <span>Download MySQL .sql Script</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR / Barcode Lookup Modal */}
      {scanModalOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 dark:bg-zinc-950/80 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-300 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-zinc-950 dark:text-white flex items-center gap-2 font-mono">
                <QrCode className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                <span>Product QR &amp; Barcode Lookup</span>
              </h3>
              <button onClick={() => setScanModalOpen(false)} className="text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white text-xs font-bold">
                Close
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={scannedSku}
                onChange={(e) => setScannedSku(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSimulateScan();
                }}
                placeholder="Scan or type SKU (BRSH-1002), Barcode, or Tool Serial..."
                className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:border-zinc-700 dark:focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={handleSimulateScan}
                className="px-4 py-2 text-xs font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl"
              >
                Lookup
              </button>
              <button
                type="button"
                onClick={() => {
                  setScanModalOpen(false);
                  setCameraQrScannerOpen(true);
                }}
                className="px-3.5 py-2 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Camera QR</span>
              </button>
            </div>

            {lastScanMeta && (
              <div className="text-[10px] font-mono text-zinc-700 dark:text-zinc-400 flex flex-wrap items-center justify-between gap-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 px-3 py-1.5 rounded-lg">
                <span>
                  Query: <strong className="text-zinc-950 dark:text-white">{lastScanMeta.code || '—'}</strong>
                </span>
                <span>
                  {lastScanMeta.format} · {lastScanMeta.method}
                </span>
              </div>
            )}

            {scanResult ? (
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-emerald-300 dark:border-emerald-700/60 rounded-xl space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 mb-0.5">
                      Matched Inventory Item
                    </div>
                    <div className="font-bold text-zinc-950 dark:text-white text-sm font-sans">{scanResult.name}</div>
                    <div className="text-zinc-700 dark:text-zinc-400 font-mono mt-0.5">
                      SKU: {scanResult.sku} · Barcode: {scanResult.barcode}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      isItemBelowThreshold(scanResult)
                        ? 'bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                        : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    }`}
                  >
                    {scanResult.stockQty} {scanResult.unit}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-zinc-300/80 dark:border-zinc-800/80">
                  <div>
                    <span className="text-zinc-600 dark:text-zinc-500 block text-[10px]">Bin Location</span>
                    <span className="text-zinc-950 dark:text-zinc-100 font-bold">{scanResult.binLocation}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600 dark:text-zinc-500 block text-[10px]">Unit Price / Cost</span>
                    <span className="text-zinc-950 dark:text-white font-bold">
                      ${scanResult.unitPrice.toFixed(2)} / ${scanResult.costPrice.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-700 dark:text-zinc-400 font-sans">
                  Compatible tools: <span className="text-zinc-900 dark:text-zinc-200">{scanResult.compatibleModels}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm(scanResult.sku);
                      setCurrentPage(1);
                      setScanModalOpen(false);
                    }}
                    className="px-3 py-1.5 text-[11px] font-bold bg-white dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 text-zinc-950 dark:text-white rounded-lg"
                  >
                    Filter Table to SKU
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleQuickRestock(scanResult.id, 10);
                      setScanResult({ ...scanResult, stockQty: scanResult.stockQty + 10 });
                    }}
                    className="px-3 py-1.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Restock +10 {scanResult.unit}</span>
                  </button>
                </div>
              </div>
            ) : (
              lastScanMeta && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl text-xs text-zinc-700 dark:text-zinc-400 font-sans flex flex-wrap items-center justify-between gap-2">
                  <span>No exact spare part SKU or barcode matched &quot;{lastScanMeta.code}&quot;.</span>
                  {lastScanMeta.code && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm(lastScanMeta.code);
                        setCurrentPage(1);
                        setScanModalOpen(false);
                      }}
                      className="text-[11px] font-mono font-bold text-zinc-950 dark:text-white underline"
                    >
                      Search in Catalog
                    </button>
                  )}
                </div>
              )
            )}

            {/* Matched Tool History & Spare Part Usage in Job Cards */}
            {scanToolHistory && (scanToolHistory.matchingJobs.length > 0 || scanToolHistory.matchingSchedules.length > 0) && (
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-950 dark:text-white uppercase flex items-center gap-1.5">
                    <History className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>Tool &amp; Part Service History ({scanToolHistory.matchingJobs.length})</span>
                  </span>
                </div>

                {scanToolHistory.matchingJobs.length > 0 && (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {scanToolHistory.matchingJobs.slice(0, 5).map((job) => (
                      <div
                        key={job.id}
                        className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-zinc-950 dark:text-white">{job.id}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-400 dark:border-zinc-700 text-zinc-800 dark:text-zinc-300">
                              {job.status}
                            </span>
                            <span className="text-[10px] text-zinc-700 dark:text-zinc-400">{job.intakeDate}</span>
                          </div>
                          <div className="text-[11px] text-zinc-800 dark:text-zinc-300 font-sans truncate mt-0.5">
                            {job.tool.brand} {job.tool.modelNumber} ({job.tool.serialNumber}) · Client: {job.customerName}
                          </div>
                        </div>

                        {onSelectJobCard && (
                          <button
                            type="button"
                            onClick={() => {
                              setScanModalOpen(false);
                              onSelectJobCard(job);
                            }}
                            className="px-2.5 py-1 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 text-emerald-800 dark:text-emerald-300 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {scanToolHistory.matchingSchedules.length > 0 && (
                  <div className="pt-2 border-t border-zinc-300 dark:border-zinc-800 text-[11px] text-zinc-800 dark:text-zinc-300 font-sans">
                    Maintenance plan: <strong className="text-zinc-950 dark:text-white">{scanToolHistory.matchingSchedules[0].customerName}</strong> · Next due{' '}
                    <span className="text-emerald-800 dark:text-emerald-300 font-mono font-bold">
                      {scanToolHistory.matchingSchedules[0].nextDueDate}
                    </span>{' '}
                    ({scanToolHistory.matchingSchedules[0].status})
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {cameraQrScannerOpen && (
        <SerialBarcodeScannerModal
          title="Scan Product QR or Inventory Barcode"
          subtitle="Point camera at a spare part QR label, EAN barcode, or tool serial tag"
          prioritizeQr
          onDetected={handleCameraQrDetected}
          onClose={() => setCameraQrScannerOpen(false)}
        />
      )}

      {bulkImportModalOpen && (
        <InventoryBulkImportModal
          inventory={inventory}
          onClose={() => setBulkImportModalOpen(false)}
          onCommitInventory={(nextInventory, { addedCount, updatedCount, skippedCount }) => {
            onUpdateInventory(nextInventory);
            setBulkImportModalOpen(false);
            setCurrentPage(1);
            setRestockFeedback(
              `Bulk import complete: ${addedCount} new SKUs added, ${updatedCount} existing SKUs updated${
                skippedCount > 0 ? `, ${skippedCount} skipped` : ''
              }.`
            );
            setTimeout(() => setRestockFeedback(null), 5000);
          }}
        />
      )}

    </div>
  );
};
