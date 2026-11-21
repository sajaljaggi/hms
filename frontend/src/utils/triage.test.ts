import { describe, it, expect } from 'vitest';
import { suggestEsiLevel, canTransition } from './triage';

describe('suggestEsiLevel', () => {
  it('level 1 for immediate intervention, even when high risk', () => {
    expect(suggestEsiLevel({ requiresImmediateIntervention: true, highRisk: true })).toBe(1);
  });
  it('level 2 for high risk', () => expect(suggestEsiLevel({ highRisk: true })).toBe(2));
  it('maps resources 0/1/2+ to 5/4/3', () => {
    expect(suggestEsiLevel({})).toBe(5);
    expect(suggestEsiLevel({ expectedResources: 1 })).toBe(4);
    expect(suggestEsiLevel({ expectedResources: 2 })).toBe(3);
    expect(suggestEsiLevel({ expectedResources: 5 })).toBe(3);
  });
  it('upgrades level 3 to 2 on danger-zone vitals only', () => {
    expect(suggestEsiLevel({ expectedResources: 2, heartRate: 101 })).toBe(2);
    expect(suggestEsiLevel({ expectedResources: 2, respRate: 21 })).toBe(2);
    expect(suggestEsiLevel({ expectedResources: 2, spo2: 91 })).toBe(2);
    expect(suggestEsiLevel({ expectedResources: 2, heartRate: 100, respRate: 20, spo2: 92 })).toBe(3);
  });
  it('ignores vitals below 2 resources', () => {
    expect(suggestEsiLevel({ expectedResources: 1, heartRate: 130 })).toBe(4);
  });
  it('treats null vitals as absent', () => {
    expect(suggestEsiLevel({ expectedResources: 2, heartRate: null, spo2: null })).toBe(3);
  });
});

describe('canTransition', () => {
  it('follows the backend table', () => {
    expect(canTransition('waiting', 'in_treatment')).toBe(true);
    expect(canTransition('waiting', 'admitted')).toBe(false);
    expect(canTransition('in_treatment', 'admitted')).toBe(true);
    expect(canTransition('admitted', 'discharged')).toBe(false);
  });
});
