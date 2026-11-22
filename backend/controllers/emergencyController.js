const db = require('../config/db');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { allocateBed } = require('../services/bedService');
const { requestAdmission } = require('../services/bedRequestService');
const { notifyUsers, notifyRoles } = require('../services/notificationService');
const { inTransaction } = require('../utils/transaction');
const { suggestEsiLevel, canTransition } = require('../utils/triage');

const VITAL_COLS = { heartRate: 'heart_rate', respRate: 'resp_rate', bpSystolic: 'bp_systolic', bpDiastolic: 'bp_diastolic', spo2: 'spo2', temperature: 'temperature' };

// POST /api/emergency/cases
const createCase = async (req, res, next) => {
  try {
    const b = req.body;
    let name = b.patientName;
    if (b.patientId) {
      const [u] = await db.query("SELECT name FROM users WHERE id = ? AND role = 'patient'", [b.patientId]);
      if (u.length === 0) throw new NotFoundError('Patient not found.');
      name = name || u[0].name;
    }
    const suggestedLevel = suggestEsiLevel(b);
    const level = b.triageLevel ?? suggestedLevel;
    const [r] = await db.query(
      `INSERT INTO emergency_cases (patient_id, patient_name, age, gender, contact_phone, chief_complaint, arrival_mode,
         triage_level, heart_rate, resp_rate, bp_systolic, bp_diastolic, spo2, temperature, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.patientId ?? null, name, b.age ?? null, b.gender ?? null, b.contactPhone ?? null, b.chiefComplaint, b.arrivalMode ?? 'walk_in',
        level, b.heartRate ?? null, b.respRate ?? null, b.bpSystolic ?? null, b.bpDiastolic ?? null, b.spo2 ?? null, b.temperature ?? null, req.user.id]
    );
    if (level <= 2) {
      const payload = { type: 'emergency', title: `ESI ${level} emergency arrival`, message: `${name}: ${b.chiefComplaint}`.slice(0, 500) };
      await notifyRoles(['admin'], { ...payload, link: '/admin/emergency' });
      await notifyRoles(['doctor'], { ...payload, link: '/doctor/emergency' });
    }
    res.status(201).json({ success: true, data: { id: r.insertId, triageLevel: level, suggestedLevel } });
  } catch (err) { next(err); }
};

const SELECT_CASE = `SELECT e.*, du.name AS assigned_doctor_name,
    (SELECT br.id FROM bed_requests br WHERE br.emergency_case_id = e.id AND br.status = 'pending' LIMIT 1) AS bed_request_id,
    TIMESTAMPDIFF(MINUTE, e.arrived_at, COALESCE(e.closed_at, NOW())) AS wait_minutes
  FROM emergency_cases e
  LEFT JOIN doctors d ON d.id = e.assigned_doctor_id
  LEFT JOIN users du ON du.id = d.user_id`;

// GET /api/emergency/cases?status=
const listCases = async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = { active: "WHERE e.status IN ('waiting','in_treatment')", closed: "WHERE e.status NOT IN ('waiting','in_treatment')", all: '' }[status];
    const [rows] = await db.query(`${SELECT_CASE} ${where} ORDER BY e.triage_level ASC, e.arrived_at ASC LIMIT 200`);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// GET /api/emergency/cases/:id
const getCase = async (req, res, next) => {
  try {
    const [rows] = await db.query(`${SELECT_CASE} WHERE e.id = ?`, [req.params.id]);
    if (rows.length === 0) throw new NotFoundError('Emergency case not found.');
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// PATCH /api/emergency/cases/:id
const updateCase = async (req, res, next) => {
  try {
    const { status, triageLevel, assignedDoctorId } = req.body;
    const doctorUserId = await inTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT status FROM emergency_cases WHERE id = ? FOR UPDATE', [req.params.id]);
      if (rows.length === 0) throw new NotFoundError('Emergency case not found.');
      if (!['waiting', 'in_treatment'].includes(rows[0].status)) throw new ConflictError(`Case is ${rows[0].status} and can no longer be changed.`);
      const sets = [];
      const params = [];
      if (status !== undefined) {
        if (!canTransition(rows[0].status, status)) throw new ConflictError(`Cannot change status from ${rows[0].status} to ${status}.`);
        sets.push('status = ?');
        params.push(status);
        if (status === 'discharged' || status === 'transferred') sets.push('closed_at = NOW()');
      }
      if (triageLevel !== undefined) { sets.push('triage_level = ?'); params.push(triageLevel); }
      let userId = null;
      if (assignedDoctorId !== undefined) {
        const [d] = await conn.query('SELECT user_id FROM doctors WHERE id = ?', [assignedDoctorId]);
        if (d.length === 0) throw new NotFoundError('Doctor not found.');
        userId = d[0].user_id;
        sets.push('assigned_doctor_id = ?');
        params.push(assignedDoctorId);
      }
      for (const [key, col] of Object.entries(VITAL_COLS)) {
        if (req.body[key] !== undefined) { sets.push(`${col} = ?`); params.push(req.body[key]); }
      }
      await conn.query(`UPDATE emergency_cases SET ${sets.join(', ')} WHERE id = ?`, [...params, req.params.id]);
      if (status === 'discharged' || status === 'transferred') {
        await conn.query(
          `UPDATE bed_requests SET status = 'cancelled', open_key = NULL, resolved_at = NOW(), resolved_by = ?,
             admin_notes = 'Emergency case closed.' WHERE emergency_case_id = ? AND status = 'pending'`,
          [req.user.id, req.params.id]
        );
      }
      return userId;
    });
    if (doctorUserId) {
      await notifyUsers([doctorUserId], {
        type: 'emergency', title: 'Emergency case assigned', message: `You were assigned emergency case #${req.params.id}.`, link: '/doctor/emergency',
      });
    }
    res.json({ success: true });
  } catch (err) { next(err); }
};

// POST /api/emergency/cases/:id/admit
// Lock order: case -> (bedService) bed -> patient user -> allocation.
const admit = async (req, res, next) => {
  try {
    const allocationId = await inTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT status, patient_id, chief_complaint FROM emergency_cases WHERE id = ? FOR UPDATE', [req.params.id]);
      if (rows.length === 0) throw new NotFoundError('Emergency case not found.');
      const c = rows[0];
      if (c.status !== 'waiting' && c.status !== 'in_treatment') throw new ConflictError(`Case is already ${c.status}.`);
      if (!c.patient_id) throw new ValidationError('Register the patient before admission.');
      const { allocationId: id } = await allocateBed(conn, {
        bedId: req.body.bedId, patientId: c.patient_id, reason: `Emergency: ${c.chief_complaint.slice(0, 200)}`, allocatedBy: req.user.id,
      });
      await conn.query("UPDATE emergency_cases SET status = 'admitted', bed_allocation_id = ?, closed_at = NOW() WHERE id = ?", [id, req.params.id]);
      return id;
    });
    res.json({ success: true, data: { allocationId } });
  } catch (err) { next(err); }
};

// POST /api/emergency/cases/:id/request-bed (doctor): an emergency-urgency bed request for the case's patient.
// The admin assigns the bed from the bed requests list, which also marks the case admitted.
const requestBed = async (req, res, next) => {
  try {
    const name = await inTransaction(async (conn) => {
      const [[c]] = await conn.query('SELECT status, patient_id, patient_name, chief_complaint FROM emergency_cases WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!c) throw new NotFoundError('Emergency case not found.');
      if (c.status !== 'waiting' && c.status !== 'in_treatment') throw new ConflictError(`Case is already ${c.status}.`);
      if (!c.patient_id) throw new ValidationError('Register the patient before requesting a bed.');
      await requestAdmission(conn, {
        patientId: c.patient_id, requestedBy: req.user.id, wardType: req.body.wardType, urgency: 'emergency',
        reason: req.body.reason || `Emergency: ${c.chief_complaint.slice(0, 200)}`, emergencyCaseId: Number(req.params.id),
      });
      return c.patient_name;
    });
    await notifyRoles(['admin'], {
      type: 'bed', title: 'Emergency bed request', message: `A bed is needed for emergency case #${req.params.id}${name ? ` (${name})` : ''}.`, link: '/admin/beds',
    });
    res.status(201).json({ success: true });
  } catch (err) { next(err); }
};

// GET /api/emergency/stats
const stats = async (req, res, next) => {
  try {
    const [[r]] = await db.query(
      `SELECT COALESCE(SUM(status = 'waiting'), 0) AS waiting,
              COALESCE(SUM(status = 'in_treatment'), 0) AS in_treatment,
              COALESCE(SUM(status IN ('waiting','in_treatment') AND triage_level = 1), 0) AS l1,
              COALESCE(SUM(status IN ('waiting','in_treatment') AND triage_level = 2), 0) AS l2,
              COALESCE(SUM(status IN ('waiting','in_treatment') AND triage_level = 3), 0) AS l3,
              COALESCE(SUM(status IN ('waiting','in_treatment') AND triage_level = 4), 0) AS l4,
              COALESCE(SUM(status IN ('waiting','in_treatment') AND triage_level = 5), 0) AS l5,
              AVG(CASE WHEN status = 'waiting' THEN TIMESTAMPDIFF(MINUTE, arrived_at, NOW()) END) AS avg_wait,
              COALESCE(SUM(status = 'admitted' AND DATE(closed_at) = CURDATE()), 0) AS admitted_today
       FROM emergency_cases`
    );
    const waiting = +r.waiting;
    const inTreatment = +r.in_treatment;
    res.json({ success: true, data: {
      active: waiting + inTreatment, waiting, inTreatment,
      byTriageLevel: { 1: +r.l1, 2: +r.l2, 3: +r.l3, 4: +r.l4, 5: +r.l5 },
      avgWaitMinutes: r.avg_wait == null ? 0 : Math.round(+r.avg_wait),
      admittedToday: +r.admitted_today,
    } });
  } catch (err) { next(err); }
};

module.exports = { requestBed, createCase, listCases, getCase, updateCase, admit, stats };
