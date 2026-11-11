import { InventoryItem } from '../types';

export function generateMockInventory(): InventoryItem[] {
  const categories = [
    { name: 'Carbon Brushes & Caps', prefix: 'BRSH', unit: 'sets' },
    { name: 'Armatures & Rotors 230V/18V', prefix: 'ARM', unit: 'pcs' },
    { name: 'Stators & Field Coils', prefix: 'FLD', unit: 'pcs' },
    { name: 'Switches & Speed Modules', prefix: 'SWT', unit: 'pcs' },
    { name: 'SDS Chucks & Tool Holders', prefix: 'CHK', unit: 'pcs' },
    { name: 'Bearings & Bushings', prefix: 'BRG', unit: 'pcs' },
    { name: 'Gears, Pinions & Grease', prefix: 'GER', unit: 'pcs' },
    { name: 'Batteries & Chargers', prefix: 'BAT', unit: 'pcs' },
    { name: 'Power Cords & Strain Relief', prefix: 'CRD', unit: 'pcs' },
    { name: 'Housing Covers & Handles', prefix: 'HSG', unit: 'pcs' },
  ];

  const brands = [
    'Bosch Genuine Spare Parts',
    'Bosch Heavy Duty OEM',
    'Makita Genuine Parts',
    'DeWalt Service Parts',
    'Milwaukee Tool OEM',
    'Metabo Service Parts',
    'Hilti Replacement Parts',
    'SKF Bearings',
  ];

  const partTemplates: Record<string, string[]> = {
    'Carbon Brushes & Caps': [
      'Carbon Brush Set Auto-Stop (Pair)',
      'Heavy Duty Carbon Brush Set w/ Spring',
      'Bosch GBH 2-26 Carbon Brush Pair',
      'Bosch GWS 900 Carbon Brush Pair',
      'Carbon Brush Cap Holder Plastic',
      'Self-Cutting Carbon Brush 1607014176',
      'Makita CB-325 Carbon Brushes',
      'DeWalt N031214 Carbon Brush Set',
    ],
    'Armatures & Rotors 230V/18V': [
      'Armature Assembly 230V w/ Fan',
      'Armature Assembly 110V Site Grade',
      'Bosch GBH 2-26 DFR Armature 2604011211',
      'Bosch GWS 7-115 Angle Grinder Armature',
      'Bosch GSH 11 E Demolition Breaker Armature',
      'Brushless Rotor Assembly 18V Cordless',
      'Makita HR2470 Armature 240V',
      'DeWalt D28134 Angle Grinder Armature',
    ],
    'Stators & Field Coils': [
      'Field Coil Stator 230V Insulated',
      'Field Coil Stator 110V Heavy Duty',
      'Bosch GBH 2-26 Field Coil Stator',
      'Bosch GWS 900-100 Field Coil',
      'Brushless Stator Module 18V',
      'Stator Insulation Sleeve Set',
    ],
    'Switches & Speed Modules': [
      'On/Off Toggle Switch Lock-On Type',
      'Variable Speed Trigger Switch Assembly',
      'Bosch GBH 2-26 Trigger Switch 1617200077',
      'Bosch GWS Angle Grinder Paddle Switch',
      'Electronic Speed Control Dial Board',
      'Forward/Reverse Selector Lever',
    ],
    'SDS Chucks & Tool Holders': [
      'SDS-Plus Quick Change Chuck Assembly',
      'SDS-Max Tool Holder Sleeve Kit',
      'Bosch GBH 2-26 DFR Quick Change Chuck',
      'SDS Rubber Dust Cap Cover 1610508008',
      'Steel Ball & Locking Ring Repair Set',
      'Keyless Drill Chuck 13mm All-Metal',
    ],
    'Bearings & Bushings': [
      'Deep Groove Ball Bearing 608 2RS',
      'Armature Bearing Front 6201 Z',
      'Armature Bearing Rear 607 2RS',
      'Needle Roller Bearing Gearbox',
      'Bronze Sintered Sleeve Bushing',
      'Rubber Bearing Seat Boot Ring',
    ],
    'Gears, Pinions & Grease': [
      'Bevel Gear & Pinion Set 9T/32T',
      'Spiral Bevel Gear Set Hardened Steel',
      'Piston & Striker Assembly SDS Hammer',
      'Bosch FT 1 V 4 Heavy Duty Grease Tube 100g',
      'Special Lithium Gearbox Grease 250g',
      'O-Ring & Lip Seal Overhaul Kit',
    ],
    'Batteries & Chargers': [
      'Bosch ProCORE18V 4.0Ah Li-Ion Battery',
      'Bosch ProCORE18V 8.0Ah High Performance',
      'Bosch GAL 18V-40 Fast Charger 230V',
      'Makita BL1850B 18V 5.0Ah LXT Battery',
      'DeWalt DCB184 18V XR 5.0Ah Battery Pack',
      'Battery Connector Flex Board BMS',
    ],
    'Power Cords & Strain Relief': [
      'Heavy Duty Rubber Cable 2x1.5mm 4m',
      'Industrial Rubber Power Cord 3x2.5mm 5m',
      'Cord Strain Relief Sleeve Boot',
      'Cord Clamp Screw Set Internal',
    ],
    'Housing Covers & Handles': [
      'Auxiliary Side Handle Assembly M10',
      'Vibration Control Auxiliary Handle M12',
      'Gear Housing Cover Aluminum',
      'Depth Stop Rod Steel 210mm',
      'Plastic Carrying Case Inlay Assembly',
    ],
  };

  const items: InventoryItem[] = [];
  let count = 1001;

  for (let i = 0; i < 1000; i++) {
    const catObj = categories[i % categories.length];
    const categoryName = catObj.name;
    const templates = partTemplates[categoryName] || ['Universal Power Tool Spare Part'];
    const baseName = templates[i % templates.length];
    const brand = brands[(i * 3) % brands.length];

    const sku = `${catObj.prefix}-${count}`;
    const barcode = `316514${count}${1000 + (i * 7) % 8999}`;
    const costPrice = Math.round((4.5 + (i % 30) * 2.8 + (i % 6) * 8.5) * 100) / 100;
    const unitPrice = Math.round((costPrice * 1.45) * 100) / 100;

    let stockQty = (i * 13) % 40;
    if (i % 11 === 0) stockQty = Math.floor(Math.random() * 3);
    const minStockThreshold = 4 + (i % 5);

    const shelf = String.fromCharCode(65 + (i % 6));
    const binNumber = 1 + (i % 30);
    const binLocation = `Bin ${shelf}-${binNumber < 10 ? '0' : ''}${binNumber}`;

    items.push({
      id: `item-${count}`,
      sku,
      barcode,
      name: `${baseName} ${i > 150 ? `#${Math.floor(i / 15)}` : ''}`.trim(),
      category: categoryName,
      brand,
      compatibleModels: i % 2 === 0 ? 'Bosch GBH 2-26, GBH 2-28, GWS 900' : 'Bosch GWS 7-115, Makita HR2470, DeWalt D28134',
      unitPrice,
      costPrice,
      stockQty,
      minStockThreshold,
      unit: catObj.unit as any,
      binLocation,
      lastRestocked: '2026-11-05',
    });
    count++;
  }

  return items;
}

export const INITIAL_INVENTORY = generateMockInventory();
