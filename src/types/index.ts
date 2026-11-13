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
  | 'Awaiting Parts'
  | 'In Repair'
  | 'In Service' 
  | 'Ready for Pickup' 
  | 'Completed' 
  | 'Cancelled';

export type JobPriority = 'Routine' | 'Urgent' | 'Emergency';

export type WarrantyFlag = 'In-Warranty' | 'Out-of-Warranty';

export interface WarrantyAdjudication {
  flag: WarrantyFlag;
  serialNumberValid: boolean;
  manufactureDate: string | null; // YYYY-MM
  expirationDate: string | null;  // YYYY-MM
  ageMonths: number | null;
  termMonths: number;
  decodedMethod: string;
  reason: string;
  exclusionAdvisory?: string;
  evaluatedAt: string;
}

export interface ToolDetails {
  brand: ToolBrand;
  category: ToolCategory;
  modelNumber: string;
  serialNumber: string;
  voltageRating: string;
  warrantyStatus: 'Standard 1-Year' | 'Bosch Heavy Duty 3-Year Extended' | 'Out of Warranty' | 'Unconfirmed';
  warrantyFlag?: WarrantyFlag;
  warrantyAdjudication?: WarrantyAdjudication;
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

export interface TimeLog {
  id: string;
  jobCardId: string;
  technicianId: string;
  technicianName: string;
  clockInTime: string; // ISO string timestamp
  clockOutTime?: string; // ISO string timestamp
  durationMinutes?: number;
  durationHours?: number;
  notes?: string;
  status: 'ACTIVE' | 'COMPLETED';
}

export type ShiftType = 'Full Shift' | 'Morning Half' | 'Afternoon Half' | 'Overtime' | 'Off';

export interface TechnicianShift {
  id: string;
  technicianId: string;
  date: string; // YYYY-MM-DD
  startHour: number; // e.g., 8 = 08:00, 8.5 = 08:30
  endHour: number; // e.g., 16 = 16:00
  shiftType: ShiftType;
  bay?: string;
  notes?: string;
}

export interface ScheduledJobSlot {
  id: string;
  jobCardId: string;
  technicianId: string;
  date: string; // YYYY-MM-DD
  startHour: number; // e.g., 9 = 09:00
  durationHours: number; // e.g., 1.5
  notes?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userName: string;
  userRole: string;
  action: string;
  previousState?: string;
  newState?: string;
}

export interface PhotoEvidence {
  id: string;
  caption: string;
  stage: 'Intake Inspection' | 'Teardown / Fault' | 'Repaired Workbench' | 'QC Final';
  dataUrl: string;
  uploadedAt: string;
}

export interface SubletRecord {
  id: string;
  vendorName: string;
  serviceScope: string;
  subletCost: number;
  expectedReturnDate: string;
  status: 'Out at Vendor' | 'Returned & Inspected' | 'Invoiced';
  notes?: string;
}

export type OperationalExpenseCategory =
  | 'Outsourced Labor'
  | 'Shipping & Freight'
  | 'Sublet Machining / Rewinding'
  | 'Diagnostics / Calibration Fee'
  | 'Disposal / Hazmat'
  | 'Other Operational Cost';

export interface OperationalExpense {
  id: string;
  category: OperationalExpenseCategory;
  description: string;
  vendor?: string;
  amount: number;
  date: string;
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
  operationalExpenses?: OperationalExpense[];
  totalAmount: number;

  customerSignature?: string;
  technicianSignature?: string;
  technicianSignOffBy?: string;
  technicianSignOffAt?: string;
  technicianSignOffNotes?: string;
  attachments?: string[];
  messageLogs: MessageLog[];
  timeLogs?: TimeLog[];
  auditLogs?: AuditLogEntry[];
  photos?: PhotoEvidence[];
  subletRecords?: SubletRecord[];
  publicAccessToken?: string;

  stageEnteredAt?: string;
  stageHistory?: { status: JobStatus; enteredAt: string }[];

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
  autoDailyBackupEnabled?: boolean;
  autoDailyBackupDestination?: 'localStorage' | 'downloadJson' | 'both';
  lastAutoBackupDate?: string;
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

export type FieldDataType = 'text' | 'number' | 'select' | 'date' | 'boolean' | 'textarea';
export type FieldCategory = 'Customer Information' | 'Tool & Device Details' | 'Grievances & Service' | 'Workshop & Billing';

export interface CustomField {
  id: string;
  label: string;
  key: string;
  dataType: FieldDataType;
  category: FieldCategory;
  required: boolean;
  placeholder?: string;
  options?: string[];
  isSystem?: boolean;
  enabled: boolean;
}
