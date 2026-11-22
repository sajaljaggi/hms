const { suggestEsiLevel, canTransition, ALLOWED_TRANSITIONS } = require('../../utils/triage');

describe('suggestEsiLevel', () => {
  test('immediate intervention -> 1 (beats highRisk)', () => {
    expect(suggestEsiLevel({ requiresImmediateIntervention: true, highRisk: true })).toBe(1);
  });
  test('high risk -> 2', () => {
    expect(suggestEsiLevel({ highRisk: true, expectedResources: 0 })).toBe(2);
  });
  test.each([[0, 5], [1, 4], [2, 3], [7, 3]])('resources %i -> %i', (r, lvl) => {
    expect(suggestEsiLevel({ expectedResources: r })).toBe(lvl);
  });
  test.each([[{ heartRate: 101 }], [{ respRate: 21 }], [{ spo2: 91 }]])('danger zone %j upgrades 3 to 2', (v) => {
    expect(suggestEsiLevel({ expectedResources: 2, ...v })).toBe(2);
  });
  test('boundary vitals and missing vitals do not upgrade', () => {
    expect(suggestEsiLevel({ expectedResources: 2, heartRate: 100, respRate: 20, spo2: 92 })).toBe(3);
    expect(suggestEsiLevel({ expectedResources: 2 })).toBe(3);
  });
  test('danger vitals do not change levels 4 and 5', () => {
    expect(suggestEsiLevel({ expectedResources: 1, heartRate: 130 })).toBe(4);
    expect(suggestEsiLevel({ expectedResources: 0, spo2: 80 })).toBe(5);
  });
});

describe('canTransition', () => {
  test('allowed and forbidden moves', () => {
    expect(canTransition('waiting', 'in_treatment')).toBe(true);
    expect(canTransition('in_treatment', 'admitted')).toBe(true);
    expect(canTransition('waiting', 'admitted')).toBe(false);
    expect(canTransition('discharged', 'waiting')).toBe(false);
    expect(canTransition('bogus', 'waiting')).toBe(false);
    expect(ALLOWED_TRANSITIONS.admitted).toEqual([]);
  });
});
