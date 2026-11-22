const db = require('../config/db');
const { escapeLike } = require('../utils/sql');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { allocateBed, dischargeAllocation } = require('../services/bedService');
const { notifyUsers } = require('../services/notificationService');
const { inTransaction } = require('../utils/transaction');

const COUNTS = `COUNT(b.id) AS total,
  COALESCE(SUM(b.status = 'available'), 0) AS available,
  COALESCE(SUM(b.status = 'occupied'), 0) AS occupied,
  COALESCE(SUM(b.status = 'maintenance'), 0) AS maintenance,
  COALESCE(SUM(b.status = 'reserved'), 0) AS reserved`;

// GET /api/beds/wards
const listWards = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT w.id, w.name, w.ward_type, w.floor, ${COUNTS}
       FROM wards w LEFT JOIN beds b ON b.ward_id = w.id
       GROUP BY w.id ORDER BY w.floor, w.name`
    );
    res.json({ success: true, data: rows.map((r) => ({
      ...r, total: +r.total, available: +r.available, occupied: +r.occupied, maintenance: +r.maintenance, reserved: +r.reserved,
    })) });
  } catch (err) { next(err); }
};

// POST /api/beds/wards
const createWard = async (req, res, next) => {
  try {
    const { name, wardType, floor } = req.body;
    const [r] = await db.query('INSERT INTO wards (name, ward_type, floor) VALUES (?, ?, ?)', [name, wardType, floor]);
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) { next(err); }
};

// GET /api/beds?wardId=&status=
const listBeds = async (req, res, next) => {
  try {
    const { wardId, status } = req.query;
    const where = [];
    const params = [];
    if (wardId) { where.push('b.ward_id = ?'); params.push(wardId); }
    if (status) { where.push('b.status = ?'); params.push(status); }
    const [rows] = await db.query(
      `SELECT b.id, b.ward_id, b.bed_number, b.status, b.daily_rate, w.name AS ward_name,
              a.id AS allocation_id, a.patient_id, u.name AS patient_name, a.admitted_at
       FROM beds b
       JOIN wards w ON w.id = b.ward_id
       LEFT JOIN bed_allocations a ON a.bed_id = b.id AND a.discharged_at IS NULL
       LEFT JOIN users u ON u.id = a.patient_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY w.name, b.bed_number`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/beds
const createBed = async (req, res, next) => {
  try {
    const { wardId, bedNumber, dailyRate } = req.body;
    // An unknown wardId surfaces as ER_NO_REFERENCED_ROW_2 -> 400 via errorHandler.
    const [r] = await db.query('INSERT INTO beds (ward_id, bed_number, daily_rate) VALUES (?, ?, ?)', [wardId, bedNumber, dailyRate]);
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) { next(err); }
};

// PATCH /api/beds/:id/status
const updateBedStatus = async (req, res, next) => {
  try {
    await inTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT status FROM beds WHERE id = ? FOR UPDATE', [req.params.id]);
      if (rows.length === 0) throw new NotFoundError('Bed not found.');
      if (rows[0].status === 'occupied') throw new ConflictError('Bed is occupied. Discharge the patient first.');
      await conn.query('UPDATE beds SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    });
    res.json({ success: true });
  } catch (err) { next(err); }
};

// POST /api/beds/:id/allocate
const allocate = async (req, res, next) => {
  try {
    const { patientId, reason } = req.body;
    const { allocationId } = await inTransaction((conn) =>
      allocateBed(conn, { bedId: req.params.id, patientId, reason, allocatedBy: req.user.id })
    );
    await notifyUsers([patientId], {
      type: 'bed', title: 'Admitted', message: 'A bed has been allocated to you.',
    });
    res.status(201).json({ success: true, data: { allocationId } });
  } catch (err) { next(err); }
};

// POST /api/beds/allocations/:id/discharge
const discharge = async (req, res, next) => {
  try {
    await inTransaction((conn) => dischargeAllocation(conn, req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
};

// GET /api/beds/stats
const stats = async (req, res, next) => {
  try {
    const [[r]] = await db.query(`SELECT ${COUNTS} FROM beds b`);
    const total = +r.total;
    const occupied = +r.occupied;
    res.json({ success: true, data: {
      total, available: +r.available, occupied, maintenance: +r.maintenance, reserved: +r.reserved,
      occupancyRate: total === 0 ? 0 : Math.round((occupied / total) * 1000) / 10,
    } });
  } catch (err) { next(err); }
};

// GET /api/beds/patients/search?q=
const searchPatients = async (req, res, next) => {
  try {
    const like = `%${escapeLike(req.query.q)}%`;
    const [rows] = await db.query(
      `SELECT id, name, email, phone FROM users
       WHERE role = 'patient' AND (name LIKE ? OR email LIKE ?)
       ORDER BY name LIMIT 20`,
      [like, like]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

module.exports = { listWards, createWard, listBeds, createBed, updateBedStatus, allocate, discharge, stats, searchPatients };
