import type { BedUrgency } from '../types/modules';

export const URGENCY_STYLE: Record<BedUrgency, string> = {
  routine: 'bg-gray-100 text-gray-700', urgent: 'bg-amber-100 text-amber-800', emergency: 'bg-red-100 text-red-800',
};
