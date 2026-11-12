export interface Technician {
  id: string;
  name: string;
  role: string;
  specialization: string;
  avatarColor: string;
  phone: string;
  activeStatus: 'On Duty' | 'In Workshop' | 'On Field Call';
  experienceYears: number;
}

export const SHOP_TECHNICIANS: Technician[] = [
  {
    id: 'tech-1',
    name: 'David Miller (Bosch Master Certified)',
    role: 'Senior Master Technician',
    specialization: 'SDS-Max Hammers, Demolition Breakers & Heavy Gearboxes',
    avatarColor: 'bg-zinc-100 text-zinc-950',
    phone: '+1 (555) 901-2244',
    activeStatus: 'On Duty',
    experienceYears: 12,
  },
  {
    id: 'tech-2',
    name: 'Marcus Vance (Electrical Specialist)',
    role: 'Electrical & Motor Rewinder',
    specialization: 'Stator Field Coils, Armatures & Speed Controllers',
    avatarColor: 'bg-zinc-800 text-white',
    phone: '+1 (555) 901-3355',
    activeStatus: 'In Workshop',
    experienceYears: 9,
  },
  {
    id: 'tech-3',
    name: 'Sarah Connor (Pneumatic & SDS Tech)',
    role: 'Pneumatic System Specialist',
    specialization: 'SDS Quick Chucks, Impact Wrenches & Oil Seals',
    avatarColor: 'bg-zinc-900 text-zinc-200 border border-zinc-700',
    phone: '+1 (555) 901-4466',
    activeStatus: 'On Duty',
    experienceYears: 7,
  },
  {
    id: 'tech-4',
    name: 'Alex Rivera (Power Tools Tech)',
    role: 'Cordless & Portable Tools Tech',
    specialization: 'Cordless Li-Ion Systems, Brushless Motors & Switches',
    avatarColor: 'bg-zinc-700 text-white',
    phone: '+1 (555) 901-5577',
    activeStatus: 'In Workshop',
    experienceYears: 6,
  },
];
