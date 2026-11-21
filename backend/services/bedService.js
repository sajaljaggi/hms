const { NotFoundError, ConflictError } = require('../utils/errors');

// Both functions run on the caller's connection INSIDE the caller's transaction.
// They never begin/commit/rollback - the controller owns that.
//
// LOCK ORDER (everyone must follow it, incl. emergency): bed -> patient user row -> allocation.
// The user-row lock serializes per patient, so the open-allocation check is a plain read
// (a FOR UPDATE on a not-yet-existing row takes a gap lock and deadlocks under concurrency).

async function allocateBed(conn, { bedId, patientId, reason, allocatedBy }) {
  const [beds] = await conn.query('SELECT id, ward_id, status FROM beds WHERE id = ? FOR UPDATE', [bedId]);
  if (beds.length === 0) throw new NotFoundError('Bed not found.');
  if (beds[0].status !== 'available') throw new ConflictError('Bed is not available.');

  const [patients] = await conn.query("SELECT id FROM users WHERE id = ? AND role = 'patient' FOR UPDATE", [patientId]);
  if (patients.length === 0) throw new NotFoundError('Patient not found.');

  const [open] = await conn.query(
    'SELECT id FROM bed_allocations WHERE patient_id = ? AND discharged_at IS NULL',
    [patientId]
  );
  if (open.length > 0) throw new ConflictError('Patient already admitted.');

  const [ins] = await conn.query(
    'INSERT INTO bed_allocations (bed_id, patient_id, allocated_by, reason) VALUES (?, ?, ?, ?)',
    [bedId, patientId, allocatedBy ?? null, reason ?? null]
  );
  // Guarded: flips only from 'available' (never silently overwrites another state).
  const [upd] = await conn.query("UPDATE beds SET status = 'occupied' WHERE id = ? AND status = 'available'", [bedId]);
  if (upd.affectedRows !== 1) throw new ConflictError('Bed is not available.');
  return { allocationId: ins.insertId, bedId, wardId: beds[0].ward_id };
}

async function dischargeAllocation(conn, allocationId) {
  // Plain read to learn the bed, so we can lock in the global order (bed first).
  const [found] = await conn.query('SELECT bed_id FROM bed_allocations WHERE id = ?', [allocationId]);
  if (found.length === 0) throw new NotFoundError('Allocation not found.');
  const bedId = found[0].bed_id;

  const [beds] = await conn.query('SELECT status FROM beds WHERE id = ? FOR UPDATE', [bedId]);
  if (beds.length === 0) throw new NotFoundError('Bed not found.');

  const [rows] = await conn.query(
    'SELECT patient_id, discharged_at FROM bed_allocations WHERE id = ? AND bed_id = ? FOR UPDATE',
    [allocationId, bedId]
  );
  if (rows.length === 0) throw new NotFoundError('Allocation not found.');
  if (rows[0].discharged_at) throw new ConflictError('Patient already discharged.');
  // Refuse rather than overwrite a bed that is not 'occupied' (inconsistent state needs a human).
  if (beds[0].status !== 'occupied') throw new ConflictError('Bed is not in occupied state.');

  await conn.query('UPDATE bed_allocations SET discharged_at = NOW() WHERE id = ?', [allocationId]);
  await conn.query("UPDATE beds SET status = 'available' WHERE id = ?", [bedId]);
  return { bedId, patientId: rows[0].patient_id };
}

module.exports = { allocateBed, dischargeAllocation };
