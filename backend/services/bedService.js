const { NotFoundError, ConflictError } = require('../utils/errors');

// Both functions run on the caller's connection INSIDE the caller's transaction.
// They never begin/commit/rollback - the controller owns that.

async function allocateBed(conn, { bedId, patientId, reason, allocatedBy }) {
  const [beds] = await conn.query('SELECT id, ward_id, status FROM beds WHERE id = ? FOR UPDATE', [bedId]);
  if (beds.length === 0) throw new NotFoundError('Bed not found.');
  if (beds[0].status !== 'available') throw new ConflictError('Bed is not available.');

  const [patients] = await conn.query("SELECT id FROM users WHERE id = ? AND role = 'patient'", [patientId]);
  if (patients.length === 0) throw new NotFoundError('Patient not found.');

  const [open] = await conn.query(
    'SELECT id FROM bed_allocations WHERE patient_id = ? AND discharged_at IS NULL FOR UPDATE',
    [patientId]
  );
  if (open.length > 0) throw new ConflictError('Patient already admitted.');

  const [ins] = await conn.query(
    'INSERT INTO bed_allocations (bed_id, patient_id, allocated_by, reason) VALUES (?, ?, ?, ?)',
    [bedId, patientId, allocatedBy ?? null, reason ?? null]
  );
  await conn.query("UPDATE beds SET status = 'occupied' WHERE id = ?", [bedId]);
  return { allocationId: ins.insertId, bedId, wardId: beds[0].ward_id };
}

async function dischargeAllocation(conn, allocationId) {
  const [rows] = await conn.query(
    'SELECT id, bed_id, patient_id, discharged_at FROM bed_allocations WHERE id = ? FOR UPDATE',
    [allocationId]
  );
  if (rows.length === 0) throw new NotFoundError('Allocation not found.');
  if (rows[0].discharged_at) throw new ConflictError('Patient already discharged.');

  await conn.query('UPDATE bed_allocations SET discharged_at = NOW() WHERE id = ?', [allocationId]);
  await conn.query("UPDATE beds SET status = 'available' WHERE id = ?", [rows[0].bed_id]);
  return { bedId: rows[0].bed_id, patientId: rows[0].patient_id };
}

module.exports = { allocateBed, dischargeAllocation };
