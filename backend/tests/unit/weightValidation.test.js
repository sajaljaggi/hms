const { registerSchema } = require('../../validators/authValidators');
const { updateProfileSchema } = require('../../validators/patientValidators');

// Regression test for a real deploy failure: the frontend's weight field is
// a range <select> ("15-20 kg"), never a plain number, but the validator
// required a clean numeric coercion and hard-rejected registration/profile
// updates entirely. Before this validation layer existed, an unparseable
// weight was silently dropped (stored as null) rather than blocking the
// request — these preprocessors restore that leniency.
describe('weight field accepts a range-select value without failing', () => {
  const baseRegister = {
    name: 'Guddu', email: 'guddu@example.com', password: 'password123',
  };

  test('registerSchema: a range string like "15-20 kg" is dropped, not rejected', () => {
    const result = registerSchema.safeParse({ ...baseRegister, weight: '15-20 kg' });
    expect(result.success).toBe(true);
    expect(result.data.weight).toBeUndefined();
  });

  test('registerSchema: a real numeric weight still validates normally', () => {
    const result = registerSchema.safeParse({ ...baseRegister, weight: '62.5' });
    expect(result.success).toBe(true);
    expect(result.data.weight).toBe(62.5);
  });

  test('registerSchema: registration succeeds overall with a range weight (the exact failing case)', () => {
    const result = registerSchema.safeParse({
      ...baseRegister,
      age: '12', weight: '15-20 kg', gender: 'male',
      phone: '+918800107298', address: 'bkcnkc', city: 'knck', guardian_name: 'hello',
    });
    expect(result.success).toBe(true);
  });

  test('updateProfileSchema: a range string is dropped to null, not rejected', () => {
    const result = updateProfileSchema.safeParse({ weight: '15-20 kg' });
    expect(result.success).toBe(true);
    expect(result.data.weight).toBeNull();
  });

  test('updateProfileSchema: a real numeric weight still validates normally', () => {
    const result = updateProfileSchema.safeParse({ weight: '62.5' });
    expect(result.success).toBe(true);
    expect(result.data.weight).toBe(62.5);
  });
});
