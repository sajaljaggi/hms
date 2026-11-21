// ESI v4 (Emergency Severity Index), pure functions.
function suggestEsiLevel({ requiresImmediateIntervention, highRisk, expectedResources = 0, heartRate, respRate, spo2 } = {}) {
  if (requiresImmediateIntervention) return 1;
  if (highRisk) return 2;
  if (expectedResources >= 2) {
    const danger = (heartRate != null && heartRate > 100) || (respRate != null && respRate > 20) || (spo2 != null && spo2 < 92);
    return danger ? 2 : 3;
  }
  return expectedResources === 1 ? 4 : 5;
}

const ALLOWED_TRANSITIONS = {
  waiting: ['in_treatment', 'transferred', 'discharged'],
  in_treatment: ['admitted', 'discharged', 'transferred'],
  admitted: [],
  discharged: [],
  transferred: [],
};

const canTransition = (from, to) => (ALLOWED_TRANSITIONS[from] || []).includes(to);

module.exports = { suggestEsiLevel, ALLOWED_TRANSITIONS, canTransition };
