import { JobCard, InventoryItem, BusinessSettings, CriticalQuestionnaire, MessageLog, CustomField, RecurringMaintenance, TechnicianShift, ScheduledJobSlot } from '../types';

const STORAGE_KEYS = {
  JOB_CARDS: 'autotrack_db_job_cards_v1',
  INVENTORY: 'autotrack_db_inventory_v1',
  SETTINGS: 'autotrack_db_settings_v1',
  QUESTIONNAIRE: 'autotrack_db_questionnaire_v1',
  CUSTOM_FIELDS: 'autotrack_db_custom_fields_v1',
  TECH_SHIFTS: 'autotrack_db_tech_shifts_v1',
  SCHEDULED_SLOTS: 'autotrack_db_scheduled_slots_v1',
  DAILY_SNAPSHOT_PREFIX: 'autotrack_daily_snapshot_',
};

const escapeCsv = (val: any): string => {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
};

export const TransactionalDb = {
  // Save all job cards
  saveJobCards(jobCards: JobCard[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.JOB_CARDS, JSON.stringify(jobCards));
    } catch (e) {
      console.error('Failed to persist job cards to storage:', e);
    }
  },

  // Load job cards
  loadJobCards(fallback: JobCard[]): JobCard[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.JOB_CARDS);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error('Failed to load job cards from storage:', e);
      return fallback;
    }
  },

  // Save inventory items
  saveInventory(inventory: InventoryItem[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
    } catch (e) {
      console.error('Failed to persist inventory to storage:', e);
    }
  },

  // Load inventory
  loadInventory(fallback: InventoryItem[]): InventoryItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.INVENTORY);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error('Failed to load inventory from storage:', e);
      return fallback;
    }
  },

  // Save settings
  saveSettings(settings: BusinessSettings) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to persist settings:', e);
    }
  },

  // Load settings
  loadSettings(fallback: BusinessSettings): BusinessSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  // Save Custom Fields Configuration
  saveCustomFields(customFields: CustomField[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_FIELDS, JSON.stringify(customFields));
    } catch (e) {
      console.error('Failed to persist custom fields:', e);
    }
  },

  // Load Custom Fields Configuration
  loadCustomFields(fallback: CustomField[]): CustomField[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_FIELDS);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  // Save Technician Shifts
  saveTechShifts(shifts: TechnicianShift[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.TECH_SHIFTS, JSON.stringify(shifts));
    } catch (e) {
      console.error('Failed to persist technician shifts:', e);
    }
  },

  // Load Technician Shifts
  loadTechShifts(fallbackFactory: () => TechnicianShift[]): TechnicianShift[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TECH_SHIFTS);
      return data ? JSON.parse(data) : fallbackFactory();
    } catch (e) {
      return fallbackFactory();
    }
  },

  // Save Scheduled Job Slots
  saveScheduledSlots(slots: ScheduledJobSlot[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.SCHEDULED_SLOTS, JSON.stringify(slots));
    } catch (e) {
      console.error('Failed to persist scheduled job slots:', e);
    }
  },

  // Load Scheduled Job Slots
  loadScheduledSlots(fallbackFactory: () => ScheduledJobSlot[]): ScheduledJobSlot[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SCHEDULED_SLOTS);
      return data ? JSON.parse(data) : fallbackFactory();
    } catch (e) {
      return fallbackFactory();
    }
  },

  // 1-Click Export CSV for Job Cards
  exportJobCardsCsv(jobCards: JobCard[]) {
    const headers = [
      'Job ID',
      'Intake Date',
      'Status',
      'Priority',
      'Customer Name',
      'Company',
      'Customer Phone',
      'Customer Email',
      'Tool Brand',
      'Tool Category',
      'Model Number',
      'Serial Number',
      'Voltage Rating',
      'Warranty Status',
      'Grievance Category',
      'Detailed Complaint',
      'Technician',
      'Labor Hours',
      'Labor Rate ($)',
      'Parts Count',
      'Parts Subtotal ($)',
      'Tax Rate (%)',
      'Total Amount ($)',
      'Created At',
      'Updated At',
    ];

    const rows = jobCards.map((j) => {
      const partsSubtotal = j.parts ? j.parts.reduce((sum, p) => sum + p.total, 0) : 0;
      return [
        escapeCsv(j.id),
        escapeCsv(j.intakeDate),
        escapeCsv(j.status),
        escapeCsv(j.priority),
        escapeCsv(j.customerName),
        escapeCsv(j.customerCompany || ''),
        escapeCsv(j.customerPhone),
        escapeCsv(j.customerEmail || ''),
        escapeCsv(j.tool.brand),
        escapeCsv(j.tool.category),
        escapeCsv(j.tool.modelNumber),
        escapeCsv(j.tool.serialNumber),
        escapeCsv(j.tool.voltageRating),
        escapeCsv(j.tool.warrantyStatus),
        escapeCsv(j.serviceReq.grievanceCategory),
        escapeCsv(j.serviceReq.detailedComplaint),
        escapeCsv(j.technician || 'Unassigned'),
        escapeCsv(j.laborHours),
        escapeCsv(j.laborRate),
        escapeCsv(j.parts ? j.parts.length : 0),
        escapeCsv(partsSubtotal.toFixed(2)),
        escapeCsv(j.taxRate),
        escapeCsv(j.totalAmount.toFixed(2)),
        escapeCsv(j.createdAt),
        escapeCsv(j.updatedAt),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = `bosch_job_cards_report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // 1-Click Export CSV for Parts Inventory
  exportInventoryCsv(inventory: InventoryItem[]) {
    const headers = [
      'SKU',
      'Barcode',
      'Part Name',
      'Category',
      'Brand',
      'Compatible Models',
      'Unit Cost Price ($)',
      'Selling Price ($)',
      'Stock Qty',
      'Min Stock Threshold',
      'Unit',
      'Bin Location',
      'Stock Alert Status',
      'Last Restocked',
    ];

    const rows = inventory.map((item) => {
      const isLow = item.stockQty <= item.minStockThreshold;
      return [
        escapeCsv(item.sku),
        escapeCsv(item.barcode),
        escapeCsv(item.name),
        escapeCsv(item.category),
        escapeCsv(item.brand),
        escapeCsv(item.compatibleModels),
        escapeCsv(item.costPrice.toFixed(2)),
        escapeCsv(item.unitPrice.toFixed(2)),
        escapeCsv(item.stockQty),
        escapeCsv(item.minStockThreshold),
        escapeCsv(item.unit),
        escapeCsv(item.binLocation),
        escapeCsv(isLow ? 'LOW STOCK ALERT' : 'OK'),
        escapeCsv(item.lastRestocked),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = `bosch_parts_inventory_report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Full Database JSON Backup Export
  exportFullBackupJson(jobCards: JobCard[], inventory: InventoryItem[], settings: BusinessSettings, customFields: CustomField[], schedules: RecurringMaintenance[]) {
    const backupObj = {
      backupVersion: '1.0',
      timestamp: new Date().toISOString(),
      serviceCenter: settings.centerName,
      data: {
        jobCards,
        inventory,
        settings,
        customFields,
        schedules,
      },
    };

    const jsonStr = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = `bosch_service_hub_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return backupObj;
  },

  // Check and run automatic daily backup
  checkAndRunDailyAutoBackup(
    jobCards: JobCard[],
    inventory: InventoryItem[],
    settings: BusinessSettings,
    customFields: CustomField[],
    schedules: RecurringMaintenance[],
    onUpdateSettings: (newSettings: BusinessSettings) => void
  ) {
    if (!settings.autoDailyBackupEnabled) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    if (settings.lastAutoBackupDate === todayStr) return; // Already backed up today

    try {
      const backupObj = {
        backupDate: todayStr,
        timestamp: new Date().toISOString(),
        data: {
          jobCards,
          inventory,
          settings,
          customFields,
          schedules,
        },
      };

      // 1. Save daily snapshot to localStorage
      const snapshotKey = `${STORAGE_KEYS.DAILY_SNAPSHOT_PREFIX}${todayStr}`;
      localStorage.setItem(snapshotKey, JSON.stringify(backupObj));

      // 2. If download destination is JSON file or both, trigger download
      if (settings.autoDailyBackupDestination === 'downloadJson' || settings.autoDailyBackupDestination === 'both') {
        const jsonStr = JSON.stringify(backupObj, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `autobackup_bosch_hub_${todayStr}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      // Update last backup date in settings
      const updatedSettings = {
        ...settings,
        lastAutoBackupDate: todayStr,
      };
      onUpdateSettings(updatedSettings);
    } catch (e) {
      console.error('Failed to run daily auto backup:', e);
    }
  },
};
