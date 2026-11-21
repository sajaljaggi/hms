import type { EmergencyStatus, TriageLevel } from '../types/modules';

// Mirror of backend/utils/triage.js (ESI v4). Keep the two in sync.
export interface TriageInput {
  requiresImmediateIntervention?: boolean;
  highRisk?: boolean;
  expectedResources?: number;
  heartRate?: number | null;
  respRate?: number | null;
  spo2?: number | null;
}

export function suggestEsiLevel({
  requiresImmediateIntervention, highRisk, expectedResources = 0, heartRate, respRate, spo2,
}: TriageInput = {}): TriageLevel {
  if (requiresImmediateIntervention) return 1;
  if (highRisk) return 2;
  if (expectedResources >= 2) {
    const danger = (heartRate != null && heartRate > 100) || (respRate != null && respRate > 20) || (spo2 != null && spo2 < 92);
    return danger ? 2 : 3;
  }
  return expectedResources === 1 ? 4 : 5;
}

export const ALLOWED_TRANSITIONS: Record<EmergencyStatus, EmergencyStatus[]> = {
  waiting: ['in_treatment', 'transferred', 'discharged'],
  in_treatment: ['admitted', 'discharged', 'transferred'],
  admitted: [],
  discharged: [],
  transferred: [],
};

export const canTransition = (from: EmergencyStatus, to: EmergencyStatus) => (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
