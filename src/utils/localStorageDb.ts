import { JobCard, InventoryItem, BusinessSettings, CriticalQuestionnaire, MessageLog } from '../types';

const STORAGE_KEYS = {
  JOB_CARDS: 'autotrack_db_job_cards_v1',
  INVENTORY: 'autotrack_db_inventory_v1',
  SETTINGS: 'autotrack_db_settings_v1',
  QUESTIONNAIRE: 'autotrack_db_questionnaire_v1',
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
};
