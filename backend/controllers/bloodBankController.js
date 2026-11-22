const db = require('../config/db');
const { escapeLike } = require('../utils/sql');
const { NotFoundError } = require('../utils/errors');
const { inTransaction } = require('../utils/transaction');
const svc = require('../services/bloodBankService');
const { notifyUsers, notifyRoles } = require('../services/notificationService');
const { GROUPS, COMPONENTS } = require('../validators/bloodBankValidators');
const { LOW_STOCK_THRESHOLD } = require('../utils/bloodCompatibility');

const label = (c) => c.replace('_', ' ');

// GET /api/blood/inventory
const inventory = async (req, res, next) => {
  try {
    await svc.expireStaleUnits(db);
    const [rows] = await db.query(
      `SELECT blood_group, component, COUNT(*) AS available,
              SUM(expires_on <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)) AS expiring_soon
       FROM blood_units WHERE status = 'available' GROUP BY blood_group, component`
    );
    const found = new Map(rows.map((r) => [`${r.blood_group}|${r.component}`, r]));
    const data = [];
    for (const blood_group of GROUPS) {
      for (const component of COMPONENTS) {
        const r = found.get(`${blood_group}|${component}`);
        data.push({ blood_group, component, available: r ? +r.available : 0, expiring_soon: r ? +r.expiring_soon : 0 });
      }
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// GET /api/blood/donors?bloodGroup=&q=
const listDonors = async (req, res, next) => {
  try {
    const { bloodGroup, q } = req.query;
    const where = [];
    const params = [];
    if (bloodGroup) { where.push('blood_group = ?'); params.push(bloodGroup); }
    if (q) {
      const like = `%${escapeLike(q)}%`;
      where.push('(name LIKE ? OR phone LIKE ?)');
      params.push(like, like);
    }
    const [rows] = await db.query(
      `SELECT id, name, blood_group, phone, email, last_donation_date, created_at FROM blood_donors
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY name LIMIT 200`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/blood/donors
const createDonor = async (req, res, next) => {
  try {
    const { name, bloodGroup, phone, email } = req.body;
    const [r] = await db.query(
      'INSERT INTO blood_donors (name, blood_group, phone, email) VALUES (?, ?, ?, ?)',
      [name, bloodGroup, phone, email ?? null]
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) { next(err); }
};

// POST /api/blood/donations
const donate = async (req, res, next) => {
  try {
    const data = await inTransaction((conn) => svc.recordDonation(conn, req.body));
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

// GET /api/blood/units
const listUnits = async (req, res, next) => {
  try {
    const { bloodGroup, component, status } = req.query;
    const where = [];
    const params = [];
    if (bloodGroup) { where.push('blood_group = ?'); params.push(bloodGroup); }
    if (component) { where.push('component = ?'); params.push(component); }
    if (status) { where.push('status = ?'); params.push(status); }
    const [rows] = await db.query(
      `SELECT id, donor_id, blood_group, component, volume_ml, collected_on, expires_on, status, request_id, created_at
       FROM blood_units ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 200`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// PATCH /api/blood/units/:id/discard
const discardUnit = async (req, res, next) => {
  try {
    await inTransaction((conn) => svc.discardUnit(conn, req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
};

// POST /api/blood/requests
const createRequest = async (req, res, next) => {
  try {
    const { patientId, bloodGroup, component, unitsRequested, urgency, notes } = req.body;
    const [patients] = await db.query("SELECT id FROM users WHERE id = ? AND role = 'patient'", [patientId]);
    if (patients.length === 0) throw new NotFoundError('Patient not found.');
    const [r] = await db.query(
      `INSERT INTO blood_requests (patient_id, requested_by, blood_group, component, units_requested, urgency, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [patientId, req.user.id, bloodGroup, component, unitsRequested, urgency, notes ?? null]
    );
    if (urgency === 'emergency') {
      await notifyRoles(['admin'], {
        type: 'blood', title: 'Emergency blood request',
        message: `${unitsRequested} unit(s) of ${bloodGroup} ${label(component)} needed urgently.`,
      });
    }
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) { next(err); }
};

// GET /api/blood/requests?status=
const listRequests = async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.status) { where.push('r.status = ?'); params.push(req.query.status); }
    if (req.user.role === 'doctor') { where.push('r.requested_by = ?'); params.push(req.user.id); }
    const [rows] = await db.query(
      `SELECT r.id, r.patient_id, r.requested_by, r.blood_group, r.component, r.units_requested, r.urgency,
              r.status, r.notes, r.created_at, r.fulfilled_at, p.name AS patient_name, q.name AS requester_name
       FROM blood_requests r
       JOIN users p ON p.id = r.patient_id
       LEFT JOIN users q ON q.id = r.requested_by
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.created_at DESC, r.id DESC LIMIT 200`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/blood/requests/:id/fulfill
const fulfill = async (req, res, next) => {
  try {
    await svc.expireStaleUnits(db);
    const { request, issuedUnitIds, issuedGroups } = await inTransaction((conn) => svc.fulfillRequest(conn, req.params.id));
    const what = `${request.units_requested} unit(s) of ${label(request.component)}`;
    await notifyUsers([request.requested_by, request.patient_id], {
      type: 'blood', title: 'Blood request fulfilled', message: `${what} have been issued.`,
    });
    const [stock] = await db.query(
      `SELECT blood_group, COUNT(*) AS c FROM blood_units
       WHERE status = 'available' AND component = ? AND blood_group IN (?) AND expires_on >= CURDATE()
       GROUP BY blood_group`,
      [request.component, issuedGroups]
    );
    const left = new Map(stock.map((s) => [s.blood_group, +s.c]));
    for (const g of issuedGroups) {
      const n = left.get(g) || 0;
      if (n < LOW_STOCK_THRESHOLD) {
        await notifyRoles(['admin'], {
          type: 'blood', title: 'Low blood stock', message: `Only ${n} unit(s) of ${g} ${label(request.component)} left.`,
        });
      }
    }
    res.json({ success: true, data: { issuedUnitIds } });
  } catch (err) { next(err); }
};

// PATCH /api/blood/requests/:id/reject
const reject = async (req, res, next) => {
  try {
    await inTransaction((conn) =>
      svc.closeRequest(conn, req.params.id, { status: 'rejected', notes: req.body.notes, user: req.user }));
    res.json({ success: true });
  } catch (err) { next(err); }
};

// PATCH /api/blood/requests/:id/cancel
const cancel = async (req, res, next) => {
  try {
    await inTransaction((conn) => svc.closeRequest(conn, req.params.id, { status: 'cancelled', user: req.user }));
    res.json({ success: true });
  } catch (err) { next(err); }
};

module.exports = {
  inventory, listDonors, createDonor, donate, listUnits, discardUnit,
  createRequest, listRequests, fulfill, reject, cancel,
};
