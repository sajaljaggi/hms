const { z } = require('zod');
const { idParam, emptyToUndefined } = require('./common');

const idParamsSchema = z.object({ id: idParam });

const createWardSchema = z.object({
  name: z.string().trim().min(1).max(100),
  wardType: z.enum(['general', 'icu', 'emergency', 'maternity', 'pediatric', 'private']),
  floor: z.coerce.number().int().default(0),
});

const createBedSchema = z.object({
  wardId: idParam,
  bedNumber: z.string().trim().min(1).max(20),
  dailyRate: z.coerce.number().min(0).max(99999999).default(0),
});

const listBedsQuerySchema = z.object({
  wardId: emptyToUndefined(idParam.optional()),
  status: emptyToUndefined(z.enum(['available', 'occupied', 'maintenance', 'reserved']).optional()),
});

// 'occupied' is set only by allocation, never directly.
const bedStatusSchema = z.object({ status: z.enum(['available', 'maintenance', 'reserved']) });

const allocateBedSchema = z.object({
  patientId: idParam,
  reason: emptyToUndefined(z.string().trim().max(255).optional()),
});

const patientSearchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });

module.exports = {
  idParamsSchema, createWardSchema, createBedSchema, listBedsQuerySchema,
  bedStatusSchema, allocateBedSchema, patientSearchQuerySchema,
};
