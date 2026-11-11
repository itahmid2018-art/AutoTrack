import React, { useState } from 'react';
import { InventoryItem } from '../types';
import { X, Plus, Package } from 'lucide-react';

interface AddInventoryModalProps {
  onClose: () => void;
  onAddItem: (item: InventoryItem) => void;
  existingCount: number;
}

export const AddInventoryModal: React.FC<AddInventoryModalProps> = ({
  onClose,
  onAddItem,
  existingCount,
}) => {
  const autoSku = `SKU-${1000 + existingCount + 1}`;
  const autoBarcode = `316514${Math.floor(100000000 + Math.random() * 900000000)}`;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Carbon Brushes & Caps');
  const [brand, setBrand] = useState('Bosch Genuine Spare Parts');
  const [compatibleModels, setCompatibleModels] = useState('Bosch GBH 2-26, GWS 900');
  const [unitPrice, setUnitPrice] = useState(15.0);
  const [costPrice, setCostPrice] = useState(9.0);
  const [stockQty, setStockQty] = useState(20);
  const [minStockThreshold, setMinStockThreshold] = useState(5);
  const [unit, setUnit] = useState<'pcs' | 'sets' | 'bottles' | 'boxes' | 'pairs' | 'meters'>('sets');
  const [binLocation, setBinLocation] = useState('Bin A-01');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const newItem: InventoryItem = {
      id: `item-${Date.now()}`,
      sku: autoSku,
      barcode: autoBarcode,
      name,
      category,
      brand,
      compatibleModels,
      unitPrice: Number(unitPrice),
      costPrice: Number(costPrice),
      stockQty: Number(stockQty),
      minStockThreshold: Number(minStockThreshold),
      unit,
      binLocation,
      lastRestocked: new Date().toISOString().split('T')[0],
    };

    onAddItem(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-white" />
            <h2 className="text-base font-bold text-white font-mono">Add New Tool Spare Part SKU</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1 font-mono">Generated SKU</label>
              <input
                type="text"
                disabled
                value={autoSku}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1 font-mono">Barcode EAN</label>
              <input
                type="text"
                disabled
                value={autoBarcode}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Part / Component Title *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bosch GBH 2-26 Auto-Stop Carbon Brush Pair"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
              >
                <option value="Carbon Brushes & Caps">Carbon Brushes &amp; Caps</option>
                <option value="Armatures & Rotors 230V/18V">Armatures &amp; Rotors 230V/18V</option>
                <option value="Stators & Field Coils">Stators &amp; Field Coils</option>
                <option value="Switches & Speed Modules">Switches &amp; Speed Modules</option>
                <option value="SDS Chucks & Tool Holders">SDS Chucks &amp; Tool Holders</option>
                <option value="Bearings & Bushings">Bearings &amp; Bushings</option>
                <option value="Gears, Pinions & Grease">Gears, Pinions &amp; Grease</option>
                <option value="Batteries & Chargers">Batteries &amp; Chargers</option>
                <option value="Power Cords & Strain Relief">Power Cords &amp; Strain Relief</option>
                <option value="Housing Covers & Handles">Housing Covers &amp; Handles</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Brand Name</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Bosch Genuine, Makita OEM..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 font-mono">
            <div>
              <label className="block text-zinc-400 mb-1">Cost ($)</label>
              <input
                type="number"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Selling ($)</label>
              <input
                type="number"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-bold focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Stock Qty</label>
              <input
                type="number"
                value={stockQty}
                onChange={(e) => setStockQty(parseInt(e.target.value) || 0)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1">Bin Location</label>
              <input
                type="text"
                value={binLocation}
                onChange={(e) => setBinLocation(e.target.value)}
                placeholder="e.g. Bin A-12"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Min Threshold</label>
              <input
                type="number"
                value={minStockThreshold}
                onChange={(e) => setMinStockThreshold(parseInt(e.target.value) || 0)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-zinc-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white">
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl font-mono"
            >
              Add Part
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
