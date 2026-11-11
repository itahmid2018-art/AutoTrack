export type ToolCategory = 
  | 'Rotary Hammer / SDS'
  | 'Angle Grinder'
  | 'Cordless Drill / Driver'
  | 'Impact Wrench / Driver'
  | 'Circular / Miter Saw'
  | 'Demolition Breaker'
  | 'Heat Gun / Blower'
  | 'High Pressure Washer'
  | 'Laser & Measuring'
  | 'Lawn & Garden / Outdoor';

export type ToolBrand = 
  | 'Bosch Professional'
  | 'Bosch DIY (Green)'
  | 'Makita'
  | 'DeWalt'
  | 'Milwaukee'
  | 'Hilti'
  | 'Metabo'
  | 'Festool'
  | 'Stihl'
  | 'Other Vendor';

export type GrievanceCategory = 
  | 'Motor Sparking / Excessive Smoke'
  | 'No Power / Dead Switch'
  | 'Chuck / SDS Lock Mechanism Jammed'
  | 'Low Impact / No Hammering Action'
  | 'Gearbox Noise / Excessive Heat'
  | 'Battery Not Charging / Fast Drain'
  | 'Cable Cut / Strain Relief Damaged'
  | 'Routine Maintenance / Carbon Brush Check';

export type JobStatus = 
  | 'Intake' 
  | 'Diagnosis' 
  | 'Awaiting Approval' 
  | 'In Service' 
  | 'Ready for Pickup' 
  | 'Completed' 
  | 'Cancelled';

export type JobPriority = 'Routine' | 'Urgent' | 'Emergency';

export interface ToolDetails {
  brand: ToolBrand;
  category: ToolCategory;
  modelNumber: string;
  serialNumber: string;
  voltageRating: string;
  warrantyStatus: 'Standard 1-Year' | 'Bosch Heavy Duty 3-Year Extended' | 'Out of Warranty' | 'Unconfirmed';
  physicalCondition: string;
  accessoriesReceived: string[];
}

export interface GrievanceAndService {
  grievanceCategory: GrievanceCategory;
  detailedComplaint: string;
  serviceType: 'Diagnostic & Repair' | 'Standard Overhaul' | 'Carbon Brush & Maintenance' | 'Armature Replacement' | 'Warranty Claim';
  preApprovedLimit: number;
}

export interface JobPart {
  partId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface MessageLog {
  id: string;
  timestamp: string;
  type: 'Intake' | 'Estimate' | 'In Progress' | 'Ready' | 'Invoice' | 'Recurring Reminder' | 'Custom';
  recipientPhone: string;
  text: string;
  channel: 'WhatsApp' | 'SMS';
  status: 'Sent' | 'Delivered' | 'Pending';
}

export interface JobCard {
  id: string;
  customerName: string;
  customerCompany?: string;
  customerPhone: string;
  customerEmail?: string;
  gstOrTaxId?: string;
  
  tool: ToolDetails;
  serviceReq: GrievanceAndService;

  intakeDate: string;
  promisedCompletion: string;
  status: JobStatus;
  priority: JobPriority;
  technician: string;

  diagnosticNotes?: string;
  recommendedActions?: string[];

  laborHours: number;
  laborRate: number;
  discount: number;
  taxRate: number;

  parts: JobPart[];
  totalAmount: number;

  customerSignature?: string;
  messageLogs: MessageLog[];

  createdAt: string;
  updatedAt: string;
}

export interface RecurringMaintenance {
  id: string;
  customerName: string;
  customerCompany?: string;
  customerPhone: string;
  customerEmail?: string;
  
  toolBrand: ToolBrand;
  toolCategory: ToolCategory;
  modelNumber: string;
  serialNumber: string;
  
  intervalMonths: number; // e.g. 3, 6, 12
  lastServiceDate: string; // YYYY-MM-DD
  nextDueDate: string; // YYYY-MM-DD
  status: 'Upcoming' | 'Due Soon' | 'Overdue' | 'Serviced';
  
  recommendedServiceScope: string; // e.g. "Carbon Brush Check & SDS Gearbox Repack"
  notes?: string;
  queuedReminders: MessageLog[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  brand: string;
  compatibleModels: string;
  unitPrice: number;
  costPrice: number;
  stockQty: number;
  minStockThreshold: number;
  unit: 'pcs' | 'sets' | 'bottles' | 'boxes' | 'pairs' | 'meters';
  binLocation: string;
  lastRestocked: string;
}

export interface BusinessSettings {
  centerName: string;
  address: string;
  phone: string;
  email: string;
  taxRate: number;
  laborRate: number;
  jobCardPrefix: string;
  currencySymbol: string;
  WhatsAppTemplateIntake: string;
  WhatsAppTemplateReady: string;
  WhatsAppTemplateEstimate: string;
  deductStockOn: 'Approval' | 'InService' | 'Completion';
  requireSignature: boolean;
}

export interface CriticalQuestionnaire {
  serviceType: string;
  numberingFormat: string;
  messagingChannel: string;
  stockDeductionPolicy: string;
  laborPricingModel: string;
  signatureMandate: string;
  notes: string;
}
