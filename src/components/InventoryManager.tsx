import React, { useState } from 'react';
import { InventoryItem, JobCard, BusinessSettings } from '../types';
import { generateMySqlDump } from '../utils/mysqlExport';
import { 
  Search, Plus, Package, AlertTriangle, Download, Barcode, 
  RefreshCw, Database, FileCode, CheckCircle2, ShoppingCart, ShieldAlert 
} from 'lucide-react';

interface InventoryManagerProps {
  inventory: InventoryItem[];
  onUpdateInventory: (newInv: InventoryItem[]) => void;
  onOpenAddItemModal: () => void;
  jobCards?: JobCard[];
  settings?: BusinessSettings;
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
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'All' | 'LowStock' | 'InStock'>('All');
  const [showReorderPanel, setShowReorderPanel] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scannedSku, setScannedSku] = useState('');
  const [scanResult, setScanResult] = useState<InventoryItem | null>(null);

  const categories = ['All', ...Array.from(new Set(inventory.map((i) => i.category)))];

  const lowStockItems = inventory.filter((i) => i.stockQty <= i.minStockThreshold);

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
      (stockFilter === 'LowStock' && item.stockQty <= item.minStockThreshold) ||
      (stockFilter === 'InStock' && item.stockQty > item.minStockThreshold);

    return matchesSearch && matchesCategory && matchesStock;
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleQuickRestock = (itemId: string, addQty: number = 10) => {
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
              onClick={() => setShowSqlModal(true)}
              className="px-3 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-all shadow flex items-center gap-1.5"
            >
              <Database className="w-4 h-4" />
              <span>Export Local MySQL DB (.sql)</span>
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

        {/* 🚨 VISUAL ALERT & NOTIFICATION BADGE BAR FOR LOW STOCK THRESHOLDS */}
        <div className="mt-5 p-4 bg-zinc-950 border border-zinc-700 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white text-zinc-950 font-bold shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase">LOW STOCK THRESHOLD NOTIFICATION</span>
                <span className="px-2 py-0.2 rounded-full bg-white text-zinc-950 text-xs font-bold font-mono">
                  {lowStockItems.length} SKUs ALERT
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
                {lowStockItems.length} items have fallen below their safety reorder threshold. Reorder planning recommended.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setStockFilter('LowStock');
                setShowReorderPanel(true);
              }}
              className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Quick Reorder Planning</span>
            </button>
          </div>
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
                  const isLow = item.stockQty <= item.minStockThreshold;
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

                      {/* VISUAL ALERT BADGE COLUMN */}
                      <td className="py-3 px-4 text-center font-mono">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[11px] bg-white text-zinc-950 border border-white shadow">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>LOW STOCK: {item.stockQty} / Min {item.minStockThreshold}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium text-xs bg-zinc-950 text-zinc-300 border border-zinc-800">
                            {item.stockQty} {item.unit}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleQuickRestock(item.id, 10)}
                          className="px-2.5 py-1 text-[11px] font-bold text-white hover:bg-zinc-800 bg-zinc-950 rounded-lg border border-zinc-800 transition-colors inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>+10</span>
                        </button>
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
