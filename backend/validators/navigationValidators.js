const { z } = require('zod');
const { idParam } = require('./common');

const CATEGORIES = ['entrance', 'reception', 'department', 'ward', 'facility', 'elevator', 'stairs', 'junction'];

const listLocationsQuerySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  q: z.string().trim().max(100).optional(),
});

const routeQuerySchema = z.object({
  from: idParam,
  to: idParam,
  accessible: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const createLocationSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]{1,30}$/),
  name: z.string().trim().min(1).max(100),
  category: z.enum(CATEGORIES),
  building: z.string().trim().min(1).max(50).optional(),
  floor: z.number().int().min(-10).max(100),
  description: z.string().trim().max(255).optional(),
});

const createEdgeSchema = z.object({
  fromLocationId: z.number().int().positive(),
  toLocationId: z.number().int().positive(),
  distanceM: z.number().int().min(1).max(2000),
  instruction: z.string().trim().min(1).max(255),
  reverseInstruction: z.string().trim().min(1).max(255),
  accessible: z.boolean().default(true),
}).refine((d) => d.fromLocationId !== d.toLocationId, { message: 'Locations must differ', path: ['toLocationId'] });

const idParamsSchema = z.object({ id: idParam });

module.exports = { listLocationsQuerySchema, routeQuerySchema, createLocationSchema, createEdgeSchema, idParamsSchema };
