const { NotFoundError, ConflictError } = require('../utils/errors');

// Runs on the caller's connection (a transaction, or the pool for single statements).
// One pending admission request per patient and one pending discharge request per admission:
// the unique open_key makes a duplicate fail at the DB, which becomes a 409 here.
async function insertRequest(q, fields, duplicateMessage) {
  const cols = Object.keys(fields);
  try {
    const [r] = await q.query(
      `INSERT INTO bed_requests (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => fields[c])
    );
    return r.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new ConflictError(duplicateMessage);
    throw err;
  }
}

async function requestAdmission(q, { patientId, requestedBy, wardType, urgency, reason, emergencyCaseId = null }) {
  const [[p]] = await q.query("SELECT id FROM users WHERE id = ? AND role = 'patient'", [patientId]);
  if (!p) throw new NotFoundError('Patient not found.');
  const [[open]] = await q.query('SELECT id FROM bed_allocations WHERE patient_id = ? AND discharged_at IS NULL', [patientId]);
  if (open) throw new ConflictError('Patient is already admitted.');
  return insertRequest(q, {
    request_type: 'admission', patient_id: patientId, requested_by: requestedBy, ward_type: wardType ?? null,
    urgency, reason: reason ?? null, emergency_case_id: emergencyCaseId, open_key: `admission:${patientId}`,
  }, 'A bed request for this patient is already pending.');
}

// A doctor may request the discharge only of admissions they are the attending doctor for.
async function requestDischarge(q, { allocationId, requestedBy, urgency, reason }) {
  const [[a]] = await q.query(
    'SELECT id, patient_id FROM bed_allocations WHERE id = ? AND discharged_at IS NULL AND attending_doctor_id = ?',
    [allocationId, requestedBy]
  );
  if (!a) throw new NotFoundError('Admission not found.');
  return insertRequest(q, {
    request_type: 'discharge', patient_id: a.patient_id, requested_by: requestedBy, allocation_id: a.id,
    urgency, reason: reason ?? null, open_key: `discharge:${a.id}`,
  }, 'A discharge request for this patient is already pending.');
}

// Rejected by the admin or cancelled by the requester (or admin). Only a pending request can close.
async function closeRequest(conn, requestId, { status, notes = null, user }) {
  const [[r]] = await conn.query('SELECT * FROM bed_requests WHERE id = ? FOR UPDATE', [requestId]);
  const mayCancel = r && (user.role === 'admin' || r.requested_by === user.id);
  if (!r || (status === 'cancelled' && !mayCancel)) throw new NotFoundError('Request not found.');
  if (r.status !== 'pending') throw new ConflictError(`This request is already ${r.status}.`);
  await conn.query(
    `UPDATE bed_requests SET status = ?, open_key = NULL, resolved_at = NOW(), resolved_by = ?, admin_notes = ?
     WHERE id = ?`,
    [status, user.id, notes, requestId]
  );
  return r;
}

module.exports = { requestAdmission, requestDischarge, closeRequest };
