const { z } = require('zod');
const { idParam, emptyToUndefined, isoDate } = require('./common');

const GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS = ['whole_blood', 'packed_rbc', 'plasma', 'platelets'];
const group = z.enum(GROUPS);
const component = z.enum(COMPONENTS);

const idParamsSchema = z.object({ id: idParam });

const createDonorSchema = z.object({
  name: z.string().trim().min(1).max(100),
  bloodGroup: group,
  phone: z.string().trim().min(5).max(20),
  email: emptyToUndefined(z.string().trim().email().max(150).optional()),
});

const listDonorsQuerySchema = z.object({
  bloodGroup: emptyToUndefined(group.optional()),
  q: emptyToUndefined(z.string().trim().max(100).optional()),
});

const donationSchema = z.object({
  donorId: idParam,
  component,
  volumeMl: z.coerce.number().int().min(100).max(600),
  collectedOn: emptyToUndefined(isoDate.optional()),
});

const listUnitsQuerySchema = z.object({
  bloodGroup: emptyToUndefined(group.optional()),
  component: emptyToUndefined(component.optional()),
  status: emptyToUndefined(z.enum(['available', 'issued', 'expired', 'discarded']).optional()),
});

const createRequestSchema = z.object({
  patientId: idParam,
  bloodGroup: group,
  component,
  unitsRequested: z.coerce.number().int().min(1).max(10),
  urgency: z.enum(['routine', 'urgent', 'emergency']).default('routine'),
  notes: emptyToUndefined(z.string().trim().max(500).optional()),
});

const listRequestsQuerySchema = z.object({
  status: emptyToUndefined(z.enum(['pending', 'fulfilled', 'rejected', 'cancelled']).optional()),
});

const rejectSchema = z.object({ notes: emptyToUndefined(z.string().trim().max(500).optional()) });

module.exports = {
  GROUPS, COMPONENTS, idParamsSchema, createDonorSchema, listDonorsQuerySchema, donationSchema,
  listUnitsQuerySchema, createRequestSchema, listRequestsQuerySchema, rejectSchema,
};
