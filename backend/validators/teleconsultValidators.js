const { z } = require('zod');
const { idParam } = require('./common');

const appointmentIdParamsSchema = z.object({ appointmentId: idParam });

module.exports = { appointmentIdParamsSchema };
