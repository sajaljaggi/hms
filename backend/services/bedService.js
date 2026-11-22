const { NotFoundError, ConflictError } = require('../utils/errors');

// Both functions run on the caller's connection INSIDE the caller's transaction.
// They never begin/commit/rollback - the controller owns that.
//
// LOCK ORDER (everyone must follow it, incl. emergency): [bed request -> emergency case ->] bed -> patient user row
// -> allocation -> the request rows they resolve.
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

  // A doctor's pending bed request for this patient is answered by this admission, however the admin
  // assigned the bed; that doctor becomes the attending doctor. Plain read: it is a unique-key lookup.
  const [[request]] = await conn.query(
    "SELECT id, requested_by, reason FROM bed_requests WHERE open_key = ?", [`admission:${patientId}`]
  );

  // open_* back the unique keys that make a second open allocation impossible at the DB level.
  let ins;
  try {
    [ins] = await conn.query(
      `INSERT INTO bed_allocations (bed_id, patient_id, allocated_by, attending_doctor_id, reason, open_patient_id, open_bed_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [bedId, patientId, allocatedBy ?? null, request ? request.requested_by : null, reason ?? request?.reason ?? null, patientId, bedId]
    );
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
    throw new ConflictError(/uq_alloc_open_bed/.test(err.message) ? 'Bed is not available.' : 'Patient already admitted.');
  }
  // Guarded: flips only from 'available' (never silently overwrites another state).
  const [upd] = await conn.query("UPDATE beds SET status = 'occupied' WHERE id = ? AND status = 'available'", [bedId]);
  if (upd.affectedRows !== 1) throw new ConflictError('Bed is not available.');
  if (request) await resolveRequest(conn, request.id, { allocationId: ins.insertId, resolvedBy: allocatedBy });
  return { allocationId: ins.insertId, bedId, wardId: beds[0].ward_id, request: request || null };
}

// Marks a pending request fulfilled and frees its open_key.
async function resolveRequest(conn, requestId, { allocationId = null, resolvedBy = null } = {}) {
  await conn.query(
    `UPDATE bed_requests SET status = 'fulfilled', open_key = NULL, resolved_at = NOW(), resolved_by = ?,
       allocation_id = COALESCE(?, allocation_id)
     WHERE id = ? AND status = 'pending'`,
    [resolvedBy ?? null, allocationId, requestId]
  );
}

async function dischargeAllocation(conn, allocationId, dischargedBy = null) {
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

  await conn.query('UPDATE bed_allocations SET discharged_at = NOW(), open_patient_id = NULL, open_bed_id = NULL WHERE id = ?', [allocationId]);
  await conn.query("UPDATE beds SET status = 'available' WHERE id = ?", [bedId]);
  // A doctor's pending discharge request for this admission is answered by it.
  const [[request]] = await conn.query('SELECT id, requested_by FROM bed_requests WHERE open_key = ?', [`discharge:${allocationId}`]);
  if (request) await resolveRequest(conn, request.id, { resolvedBy: dischargedBy });
  return { bedId, patientId: rows[0].patient_id, request: request || null };
}

module.exports = { allocateBed, dischargeAllocation };
