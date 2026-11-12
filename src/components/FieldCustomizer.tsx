import React, { useState } from 'react';
import { CustomField, FieldDataType, FieldCategory } from '../types';
import { 
  Sliders, 
  Plus, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  Eye, 
  EyeOff, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  ListFilter
} from 'lucide-react';

interface FieldCustomizerProps {
  customFields: CustomField[];
  onUpdateFields: (newFields: CustomField[]) => void;
}

const CATEGORIES: FieldCategory[] = [
  'Customer Information',
  'Tool & Device Details',
  'Grievances & Service',
  'Workshop & Billing',
];

const DATA_TYPES: { type: FieldDataType; label: string; desc: string }[] = [
  { type: 'text', label: 'Text Input', desc: 'Short single-line string' },
  { type: 'number', label: 'Numeric Value', desc: 'Numbers, rates, limits' },
  { type: 'select', label: 'Dropdown Select', desc: 'Pick one option from a list' },
  { type: 'textarea', label: 'Long Textarea', desc: 'Multi-line notes or complaints' },
  { type: 'date', label: 'Date / Time', desc: 'Calendar date or timestamp' },
  { type: 'boolean', label: 'Checkbox (Yes/No)', desc: 'Toggle boolean mandate' },
];

export const FieldCustomizer: React.FC<FieldCustomizerProps> = ({
  customFields,
  onUpdateFields,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State for Add / Edit Modal
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldCategory, setFieldCategory] = useState<FieldCategory>('Tool & Device Details');
  const [fieldDataType, setFieldDataType] = useState<FieldDataType>('text');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldPlaceholder, setFieldPlaceholder] = useState('');
  const [fieldOptionsText, setFieldOptionsText] = useState('');

  const filteredFields = customFields.filter((f) => {
    return selectedCategory === 'All' || f.category === selectedCategory;
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenAddModal = () => {
    setEditingField(null);
    setFieldLabel('');
    setFieldCategory('Tool & Device Details');
    setFieldDataType('text');
    setFieldRequired(false);
    setFieldPlaceholder('');
    setFieldOptionsText('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (field: CustomField) => {
    setEditingField(field);
    setFieldLabel(field.label);
    setFieldCategory(field.category);
    setFieldDataType(field.dataType);
    setFieldRequired(field.required);
    setFieldPlaceholder(field.placeholder || '');
    setFieldOptionsText(field.options ? field.options.join(', ') : '');
    setIsModalOpen(true);
  };

  const handleSaveField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldLabel.trim()) return;

    const options = fieldDataType === 'select' && fieldOptionsText.trim()
      ? fieldOptionsText.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    if (editingField) {
      // Edit existing field
      const updated = customFields.map((f) => {
        if (f.id === editingField.id) {
          return {
            ...f,
            label: fieldLabel.trim(),
            category: fieldCategory,
            dataType: fieldDataType,
            required: fieldRequired,
            placeholder: fieldPlaceholder.trim() || undefined,
            options,
          };
        }
        return f;
      });
      onUpdateFields(updated);
      showToast(`Field "${fieldLabel}" updated successfully.`);
    } else {
      // Add new field
      const generatedKey = `custom_${fieldLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
      const newField: CustomField = {
        id: `f-${Date.now()}`,
        label: fieldLabel.trim(),
        key: generatedKey,
        dataType: fieldDataType,
        category: fieldCategory,
        required: fieldRequired,
        placeholder: fieldPlaceholder.trim() || undefined,
        options,
        isSystem: false,
        enabled: true,
      };
      onUpdateFields([...customFields, newField]);
      showToast(`Custom field "${fieldLabel}" added to intake form.`);
    }

    setIsModalOpen(false);
  };

  const handleToggleEnabled = (fieldId: string) => {
    const updated = customFields.map((f) => {
      if (f.id === fieldId) {
        return { ...f, enabled: !f.enabled };
      }
      return f;
    });
    onUpdateFields(updated);
  };

  const handleDeleteField = (field: CustomField) => {
    if (field.isSystem) {
      showToast('System core fields cannot be permanently deleted. You can disable them instead.');
      return;
    }
    const updated = customFields.filter((f) => f.id !== field.id);
    onUpdateFields(updated);
    showToast(`Removed custom field "${field.label}".`);
  };

  const getTypeBadgeClass = (type: FieldDataType) => {
    switch (type) {
      case 'select':
        return 'bg-purple-950/80 text-purple-300 border-purple-800';
      case 'number':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'textarea':
        return 'bg-blue-950/80 text-blue-300 border-blue-800';
      case 'date':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="space-y-6 font-mono">
      
      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-white">
              <Sliders className="w-5 h-5" />
            </span>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight uppercase">
              UI &amp; Intake Form Field Customization
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Configure built-in service intake fields, add custom customer/tool properties, set data types, and manage validation mandates.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-all shadow flex items-center gap-1.5 shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Custom Field</span>
        </button>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3 bg-zinc-900 border border-white/20 rounded-xl text-xs text-white flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Stats & Category Filter Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
            <span className="text-xs text-zinc-400 font-bold uppercase shrink-0 mr-1 flex items-center gap-1">
              <ListFilter className="w-3.5 h-3.5" />
              <span>Category Filter:</span>
            </span>

            <button
              onClick={() => setSelectedCategory('All')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all shrink-0 ${
                selectedCategory === 'All' ? 'bg-white text-zinc-950 shadow' : 'bg-zinc-950 text-zinc-400 hover:text-white'
              }`}
            >
              All Fields ({customFields.length})
            </button>

            {CATEGORIES.map((cat) => {
              const count = customFields.filter(f => f.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all shrink-0 ${
                    selectedCategory === cat ? 'bg-white text-zinc-950 shadow' : 'bg-zinc-950 text-zinc-400 hover:text-white'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-zinc-400 shrink-0">
            Active: <span className="text-white font-bold">{customFields.filter(f => f.enabled).length}</span> · Custom User Fields: <span className="text-white font-bold">{customFields.filter(f => !f.isSystem).length}</span>
          </div>
        </div>
      </div>

      {/* Fields List Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                <th className="py-3 px-4">Field Label &amp; Property Key</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Data Type</th>
                <th className="py-3 px-4 text-center">Mandatory</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
              {filteredFields.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500 text-xs">
                    No intake fields match the selected category filter.
                  </td>
                </tr>
              ) : (
                filteredFields.map((field) => (
                  <tr key={field.id} className="hover:bg-zinc-950/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{field.label}</span>
                        {field.isSystem ? (
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                            Built-in System
                          </span>
                        ) : (
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-white text-zinc-950 font-extrabold">
                            User Custom
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        Property Key: <span className="text-zinc-300">{field.key}</span>
                        {field.placeholder && <span> · Placeholder: &quot;{field.placeholder}&quot;</span>}
                      </div>
                      {field.options && (
                        <div className="text-[10px] text-zinc-400 mt-1 line-clamp-1">
                          Options: {field.options.join(' · ')}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-zinc-300 font-medium">
                      {field.category}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getTypeBadgeClass(field.dataType)}`}>
                        {field.dataType}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {field.required ? (
                        <span className="px-2 py-0.5 rounded bg-zinc-950 text-white border border-zinc-700 font-bold text-[10px]">
                          Required
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-[10px]">Optional</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleToggleEnabled(field.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 mx-auto ${
                          field.enabled
                            ? 'bg-zinc-950 text-white border-zinc-700'
                            : 'bg-zinc-950/40 text-zinc-600 border-zinc-900'
                        }`}
                        title={field.enabled ? 'Click to disable field from form' : 'Click to enable field on form'}
                      >
                        {field.enabled ? (
                          <>
                            <Eye className="w-3 h-3 text-white" />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3 text-zinc-600" />
                            <span>Disabled</span>
                          </>
                        )}
                      </button>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(field)}
                          title="Edit Field Configuration"
                          className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteField(field)}
                          title={field.isSystem ? 'System core fields cannot be deleted' : 'Delete Custom Field'}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            field.isSystem 
                              ? 'bg-zinc-950 text-zinc-700 border-zinc-900 cursor-not-allowed' 
                              : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Field Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-white">
                  <Sliders className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-white uppercase">
                  {editingField ? `Edit Field: "${editingField.label}"` : 'Add New Custom Form Field'}
                </h3>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveField} className="space-y-4 text-xs">
              
              <div>
                <label className="block text-zinc-400 font-bold mb-1 uppercase text-[10px]">Field Display Label *</label>
                <input
                  type="text"
                  required
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  placeholder="e.g. Battery Serial Number, Loaner Tool Barcode, Passcode..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-zinc-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-bold mb-1 uppercase text-[10px]">Section Category</label>
                  <select
                    value={fieldCategory}
                    onChange={(e) => setFieldCategory(e.target.value as FieldCategory)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none font-mono"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-bold mb-1 uppercase text-[10px]">Data Type</label>
                  <select
                    value={fieldDataType}
                    onChange={(e) => setFieldDataType(e.target.value as FieldDataType)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none font-mono"
                  >
                    {DATA_TYPES.map(d => (
                      <option key={d.type} value={d.type}>{d.label} ({d.type})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Options input if Select */}
              {fieldDataType === 'select' && (
                <div>
                  <label className="block text-zinc-400 font-bold mb-1 uppercase text-[10px]">Dropdown Options (Comma Separated) *</label>
                  <input
                    type="text"
                    required
                    value={fieldOptionsText}
                    onChange={(e) => setFieldOptionsText(e.target.value)}
                    placeholder="e.g. Option 1, Option 2, Option 3..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none font-mono"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">Separate dropdown choices with commas.</p>
                </div>
              )}

              <div>
                <label className="block text-zinc-400 font-bold mb-1 uppercase text-[10px]">Placeholder / Helper Text</label>
                <input
                  type="text"
                  value={fieldPlaceholder}
                  onChange={(e) => setFieldPlaceholder(e.target.value)}
                  placeholder="e.g. Enter serial number printed on housing..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none font-mono"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 p-3 bg-zinc-900 rounded-xl border border-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fieldRequired}
                    onChange={(e) => setFieldRequired(e.target.checked)}
                    className="w-4 h-4 accent-white rounded"
                  />
                  <div>
                    <span className="font-bold text-white block">Make Mandatory / Required Field</span>
                    <span className="text-[10px] text-zinc-400">Intake form cannot be submitted without completing this field.</span>
                  </div>
                </label>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold rounded-xl hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-white text-zinc-950 font-bold rounded-xl hover:bg-zinc-200 shadow"
                >
                  {editingField ? 'Save Field Changes' : 'Create Custom Field'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
