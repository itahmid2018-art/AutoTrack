import { JobCard } from '../types';

export const INITIAL_JOB_CARDS: JobCard[] = [
  {
    id: 'BOSCH-2026-0041',
    customerName: 'Apex Industrial Construction Ltd',
    customerCompany: 'Apex Industrial',
    customerPhone: '+1 (555) 234-5678',
    customerEmail: 'service@apexconstruct.com',
    gstOrTaxId: 'TAX-8920194-US',
    tool: {
      brand: 'Bosch Professional',
      category: 'Rotary Hammer / SDS',
      modelNumber: 'GBH 2-26 DFR Professional',
      serialNumber: 'SN-3611B54300',
      voltageRating: '230V AC (800W)',
      warrantyStatus: 'Bosch Heavy Duty 3-Year Extended',
      physicalCondition: 'Heavy Jobsite Dust, Cable Scratched',
      accessoriesReceived: ['Auxiliary Handle', 'Depth Stop Rod', 'SDS Quick Change Chuck', 'Carrying Case'],
    },
    serviceReq: {
      grievanceCategory: 'Motor Sparking / Excessive Smoke',
      detailedComplaint: 'Heavily sparking inside motor housing under load. Intermittent hammer impact loss during overhead drilling.',
      serviceType: 'Diagnostic & Repair',
      preApprovedLimit: 75.0,
    },
    intakeDate: '2026-11-10 09:15',
    promisedCompletion: '2026-11-11 16:00',
    status: 'In Service',
    priority: 'Urgent',
    technician: 'David Miller (Bosch Master Certified)',
    diagnosticNotes: 'Armature commutator segments pitted and burnt. Carbon brushes worn past auto-stop limit line. SDS gearbox lubrication dried out.',
    recommendedActions: [
      'Replace Armature 230V Assembly (2604011211)',
      'Replace Auto-Stop Carbon Brush Pair (1607014176)',
      'Flush gearbox & repack with Bosch FT 1 V 4 grease',
      'Replace SDS Dust Rubber Seal Ring'
    ],
    laborHours: 1.5,
    laborRate: 50.0,
    discount: 5.0,
    taxRate: 10.0,
    parts: [
      {
        partId: 'item-1002',
        sku: 'BRSH-1002',
        name: 'Bosch GBH 2-26 Auto-Stop Carbon Brush Pair',
        unitPrice: 12.50,
        quantity: 1,
        total: 12.50
      },
      {
        partId: 'item-1009',
        sku: 'ARM-1009',
        name: 'Bosch GBH 2-26 DFR Armature Assembly 230V',
        unitPrice: 48.00,
        quantity: 1,
        total: 48.00
      },
      {
        partId: 'item-1014',
        sku: 'GER-1014',
        name: 'Bosch FT 1 V 4 Heavy Duty Grease Tube 100g',
        unitPrice: 9.50,
        quantity: 1,
        total: 9.50
      }
    ],
    totalAmount: 154.00,
    customerSignature: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><path d="M10 40 Q 50 10 90 40 T 170 30" stroke="%23ffffff" stroke-width="2" fill="none"/></svg>',
    messageLogs: [
      {
        id: 'msg-1',
        timestamp: '2026-11-10 09:20',
        type: 'Intake',
        recipientPhone: '+1 (555) 234-5678',
        text: 'Apex Industrial: Bosch GBH 2-26 DFR (SN-3611B54300) checked in for service under Job Card BOSCH-2026-0041. Bosch Service Center.',
        channel: 'WhatsApp',
        status: 'Delivered'
      }
    ],
    createdAt: '2026-11-10T09:15:00Z',
    updatedAt: '2026-11-11T07:10:00Z'
  },
  {
    id: 'BOSCH-2026-0042',
    customerName: 'Marcus Vance Mechanics',
    customerPhone: '+1 (555) 876-5432',
    tool: {
      brand: 'Bosch Professional',
      category: 'Angle Grinder',
      modelNumber: 'GWS 900-100 Professional',
      serialNumber: 'SN-3601C96000',
      voltageRating: '230V AC (900W)',
      warrantyStatus: 'Standard 1-Year',
      physicalCondition: 'Metal Shavings in Guard, Cord Pinched',
      accessoriesReceived: ['Grinding Guard 100mm', 'Pin Spanner Wrench', 'Flange Nut Set'],
    },
    serviceReq: {
      grievanceCategory: 'No Power / Dead Switch',
      detailedComplaint: 'Angle grinder does not turn on when switch is pushed. Cable strain relief is loose.',
      serviceType: 'Standard Overhaul',
      preApprovedLimit: 40.0,
    },
    intakeDate: '2026-11-11 08:30',
    promisedCompletion: '2026-11-11 14:00',
    status: 'Ready for Pickup',
    priority: 'Routine',
    technician: 'Alex Rivera (Power Tools Tech)',
    diagnosticNotes: 'Mains cable wire broken inside strain relief boot. On/Off toggle switch contacts oxidized.',
    recommendedActions: [
      'Install Heavy Duty 4m Rubber Power Cable 2x1.5mm',
      'Replace Switch Assembly & Strain Relief Sleeve'
    ],
    laborHours: 1.0,
    laborRate: 45.0,
    discount: 0,
    taxRate: 10.0,
    parts: [
      {
        partId: 'item-1004',
        sku: 'SWT-1004',
        name: 'Bosch GWS Angle Grinder Paddle Switch Assembly',
        unitPrice: 14.00,
        quantity: 1,
        total: 14.00
      },
      {
        partId: 'item-1018',
        sku: 'CRD-1018',
        name: 'Industrial Rubber Power Cord 2x1.5mm 4m',
        unitPrice: 11.50,
        quantity: 1,
        total: 11.50
      }
    ],
    totalAmount: 77.55,
    messageLogs: [
      {
        id: 'msg-2',
        timestamp: '2026-11-11 10:15',
        type: 'Ready',
        recipientPhone: '+1 (555) 876-5432',
        text: 'Marcus Vance: Your Bosch GWS 900-100 Angle Grinder (BOSCH-2026-0042) is READY FOR PICKUP. Total: $77.55. Bosch Service Center.',
        channel: 'WhatsApp',
        status: 'Sent'
      }
    ],
    createdAt: '2026-11-11T08:30:00Z',
    updatedAt: '2026-11-11T10:15:00Z'
  }
];
