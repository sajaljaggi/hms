const { z } = require('zod');
const { idParam, emptyToUndefined } = require('./common');

const opt = (schema) => emptyToUndefined(schema.optional());
const vitals = {
  heartRate: opt(z.coerce.number().int().min(0).max(300)),
  respRate: opt(z.coerce.number().int().min(0).max(100)),
  bpSystolic: opt(z.coerce.number().int().min(0).max(350)),
  bpDiastolic: opt(z.coerce.number().int().min(0).max(250)),
  spo2: opt(z.coerce.number().int().min(0).max(100)),
  temperature: opt(z.coerce.number().min(20).max(50)),
};
const triageLevel = z.coerce.number().int().min(1).max(5);

const idParamsSchema = z.object({ id: idParam });

const createCaseSchema = z.object({
  patientId: opt(idParam),
  patientName: opt(z.string().trim().min(1).max(100)),
  age: opt(z.coerce.number().int().min(0).max(150)),
  gender: opt(z.enum(['male', 'female', 'other'])),
  contactPhone: opt(z.string().trim().max(20)),
  chiefComplaint: z.string().trim().min(1).max(500),
  arrivalMode: opt(z.enum(['walk_in', 'ambulance', 'referral'])),
  requiresImmediateIntervention: z.boolean().default(false),
  highRisk: z.boolean().default(false),
  expectedResources: z.coerce.number().int().min(0).max(10).default(0),
  triageLevel: opt(triageLevel),
  ...vitals,
}).refine((b) => b.patientId || b.patientName, { message: 'patientName is required', path: ['patientName'] });

// 'admitted' is only reachable through POST /cases/:id/admit.
const updateCaseSchema = z.object({
  status: opt(z.enum(['waiting', 'in_treatment', 'discharged', 'transferred'])),
  triageLevel: opt(triageLevel),
  assignedDoctorId: opt(idParam),
  ...vitals,
}).refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'At least one field is required' });

const listCasesQuerySchema = z.object({
  status: z.enum(['active', 'closed', 'all']).default('active'),
});

const admitSchema = z.object({ bedId: idParam });
const requestBedSchema = z.object({
  wardType: emptyToUndefined(z.enum(['general', 'icu', 'emergency', 'maternity', 'pediatric', 'private']).optional()),
  reason: emptyToUndefined(z.string().trim().max(500).optional()),
});

module.exports = { idParamsSchema, createCaseSchema, updateCaseSchema, listCasesQuerySchema, admitSchema, requestBedSchema };
