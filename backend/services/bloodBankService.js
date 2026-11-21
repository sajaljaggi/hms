const { NotFoundError, ConflictError, ForbiddenError, ValidationError } = require('../utils/errors');
const { toDateStr } = require('../utils/dates');
const {
  compatibleDonorGroups, computeExpiry, daysBetween, DONATION_INTERVAL_DAYS,
} = require('../utils/bloodCompatibility');

// All functions run on the caller's connection INSIDE the caller's transaction (the controller owns
// begin/commit/rollback).
//
// LOCK ORDER: donation = donor row -> (insert unit). fulfill = request row -> unit rows.
// reject/cancel = request row. discard = unit row. We always lock a specific parent row first and
// never run FOR UPDATE / range UPDATEs over possibly-empty ranges (gap locks deadlock on INSERT).
// Stale-unit expiry is a separate autocommit statement (expireStaleUnits) run BEFORE the transaction,
// so it never holds index-range locks inside one.

async function expireStaleUnits(db) {
  await db.query("UPDATE blood_units SET status = 'expired' WHERE status = 'available' AND expires_on < CURDATE()");
}

async function recordDonation(conn, { donorId, component, volumeMl, collectedOn }) {
  const today = toDateStr(new Date());
  const collected = collectedOn || today;
  if (collected > today) throw new ValidationError('collectedOn cannot be in the future.');

  const [donors] = await conn.query('SELECT id, blood_group, last_donation_date FROM blood_donors WHERE id = ? FOR UPDATE', [donorId]);
  if (donors.length === 0) throw new NotFoundError('Donor not found.');
  const donor = donors[0];
  if (donor.last_donation_date && daysBetween(toDateStr(donor.last_donation_date), collected) < DONATION_INTERVAL_DAYS) {
    throw new ConflictError(`Donor must wait ${DONATION_INTERVAL_DAYS} days between donations.`);
  }

  const expiresOn = computeExpiry(collected, component);
  const [ins] = await conn.query(
    'INSERT INTO blood_units (donor_id, blood_group, component, volume_ml, collected_on, expires_on) VALUES (?, ?, ?, ?, ?, ?)',
    [donorId, donor.blood_group, component, volumeMl, collected, expiresOn]
  );
  await conn.query('UPDATE blood_donors SET last_donation_date = ? WHERE id = ?', [collected, donorId]);
  return { unitId: ins.insertId, expiresOn };
}

async function discardUnit(conn, unitId) {
  const [rows] = await conn.query('SELECT status FROM blood_units WHERE id = ? FOR UPDATE', [unitId]);
  if (rows.length === 0) throw new NotFoundError('Unit not found.');
  if (rows[0].status !== 'available') throw new ConflictError('Only available units can be discarded.');
  await conn.query("UPDATE blood_units SET status = 'discarded' WHERE id = ? AND status = 'available'", [unitId]);
}

async function fulfillRequest(conn, requestId) {
  const [reqs] = await conn.query('SELECT * FROM blood_requests WHERE id = ? FOR UPDATE', [requestId]);
  if (reqs.length === 0) throw new NotFoundError('Request not found.');
  const request = reqs[0];
  if (request.status !== 'pending') throw new ConflictError('Request is not pending.');

  const groups = compatibleDonorGroups(request.blood_group, request.component);
  // Exact group first, then first-expiry-first-out.
  const [units] = await conn.query(
    `SELECT id, blood_group FROM blood_units
     WHERE status = 'available' AND component = ? AND blood_group IN (?) AND expires_on >= CURDATE()
     ORDER BY (blood_group = ?) DESC, expires_on ASC, id ASC
     LIMIT ? FOR UPDATE`,
    [request.component, groups, request.blood_group, request.units_requested]
  );
  if (units.length < request.units_requested) throw new ConflictError('Insufficient compatible stock.');

  const ids = units.map((u) => u.id);
  const [upd] = await conn.query(
    "UPDATE blood_units SET status = 'issued', request_id = ? WHERE id IN (?) AND status = 'available'",
    [requestId, ids]
  );
  if (upd.affectedRows !== ids.length) throw new ConflictError('Insufficient compatible stock.');
  await conn.query("UPDATE blood_requests SET status = 'fulfilled', fulfilled_at = NOW() WHERE id = ? AND status = 'pending'", [requestId]);
  return { request, issuedUnitIds: ids, issuedGroups: [...new Set(units.map((u) => u.blood_group))] };
}

// reject (admin) / cancel (requester or admin): only a pending request can leave 'pending'.
async function closeRequest(conn, requestId, { status, notes, user }) {
  const [reqs] = await conn.query('SELECT * FROM blood_requests WHERE id = ? FOR UPDATE', [requestId]);
  if (reqs.length === 0) throw new NotFoundError('Request not found.');
  const request = reqs[0];
  if (status === 'cancelled' && user.role !== 'admin' && request.requested_by !== user.id) {
    throw new ForbiddenError('Only the requester or an admin can cancel this request.');
  }
  if (request.status !== 'pending') throw new ConflictError('Request is not pending.');
  await conn.query(
    'UPDATE blood_requests SET status = ?, notes = COALESCE(?, notes) WHERE id = ? AND status = \'pending\'',
    [status, notes ?? null, requestId]
  );
  return request;
}

module.exports = { expireStaleUnits, recordDonation, discardUnit, fulfillRequest, closeRequest };
