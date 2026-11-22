const db = require('../config/db');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { inTransaction } = require('../utils/transaction');
const { dischargeAllocation } = require('../services/bedService');
const { requestAdmission, requestDischarge, closeRequest, assignBedForRequest } = require('../services/bedRequestService');
const { notifyUsers, notifyRoles } = require('../services/notificationService');

// Doctors ask; only the admin assigns beds and discharges (like blood requests).

// POST /api/beds/requests (doctor)
const createRequest = async (req, res, next) => {
  try {
    const { type, patientId, allocationId, wardType, urgency, reason } = req.body;
    const requestedBy = req.user.id;
    const id = type === 'admission'
      ? await requestAdmission(db, { patientId, requestedBy, wardType, urgency, reason })
      : await requestDischarge(db, { allocationId, requestedBy, urgency, reason });
    const [[r]] = await db.query('SELECT u.name FROM bed_requests b JOIN users u ON u.id = b.patient_id WHERE b.id = ?', [id]);
    const what = type === 'admission' ? 'Bed request' : 'Discharge request';
    await notifyRoles(['admin'], {
      type: 'bed', title: urgency === 'emergency' ? `Emergency ${what.toLowerCase()}` : what,
      message: `${what} for ${r.name}${urgency === 'routine' ? '' : ` (${urgency})`}.`, link: '/admin/beds',
    });
    res.status(201).json({ success: true, data: { id } });
  } catch (err) { next(err); }
};

// GET /api/beds/requests?status= (doctor: own requests; admin: all). Pending first, most urgent, oldest.
const listRequests = async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.status) { where.push('r.status = ?'); params.push(req.query.status); }
    if (req.user.role === 'doctor') { where.push('r.requested_by = ?'); params.push(req.user.id); }
    const [rows] = await db.query(
      `SELECT r.id, r.request_type, r.patient_id, r.requested_by, r.ward_type, r.allocation_id, r.emergency_case_id,
              r.urgency, r.status, r.reason, r.admin_notes, r.created_at, r.resolved_at,
              p.name AS patient_name, q.name AS requester_name, b.bed_number, w.name AS ward_name
       FROM bed_requests r
       JOIN users p ON p.id = r.patient_id
       LEFT JOIN users q ON q.id = r.requested_by
       LEFT JOIN bed_allocations a ON a.id = r.allocation_id
       LEFT JOIN beds b ON b.id = a.bed_id
       LEFT JOIN wards w ON w.id = b.ward_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.status = 'pending' DESC, FIELD(r.urgency, 'emergency', 'urgent', 'routine'),
                CASE WHEN r.status = 'pending' THEN r.created_at END ASC, r.created_at DESC, r.id DESC
       LIMIT 200`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/beds/requests/:id/fulfill (admin). Admission: { bedId } assigns that bed; discharge frees the bed.
const fulfill = async (req, res, next) => {
  try {
    const result = await inTransaction(async (conn) => {
      const [[r]] = await conn.query('SELECT * FROM bed_requests WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!r) throw new NotFoundError('Request not found.');
      if (r.status !== 'pending') throw new ConflictError(`This request is already ${r.status}.`);

      if (r.request_type === 'discharge') {
        await dischargeAllocation(conn, r.allocation_id, req.user.id);
        return { r };
      }
      if (!req.body.bedId) throw new ValidationError('Choose a bed for this admission.');
      const allocationId = await assignBedForRequest(conn, r, { bedId: req.body.bedId, adminId: req.user.id });
      const [[bed]] = await conn.query(
        'SELECT b.bed_number, w.name AS ward_name FROM beds b JOIN wards w ON w.id = b.ward_id WHERE b.id = ?', [req.body.bedId]
      );
      return { r, allocationId, bed };
    });

    const { r, bed } = result;
    const [[p]] = await db.query('SELECT name FROM users WHERE id = ?', [r.patient_id]);
    if (r.request_type === 'admission') {
      await notifyUsers([r.requested_by], {
        type: 'bed', title: 'Bed assigned', link: '/doctor/beds',
        message: `${p.name} was assigned bed ${bed.ward_name} / ${bed.bed_number}.`,
      });
      await notifyUsers([r.patient_id], { type: 'bed', title: 'Admitted', message: `You have been assigned bed ${bed.ward_name} / ${bed.bed_number}.` });
    } else {
      await notifyUsers([r.requested_by], { type: 'bed', title: 'Patient discharged', link: '/doctor/beds', message: `${p.name} was discharged.` });
      await notifyUsers([r.patient_id], { type: 'bed', title: 'Discharged', message: 'You have been discharged.' });
    }
    res.json({ success: true, data: { allocationId: result.allocationId ?? r.allocation_id } });
  } catch (err) { next(err); }
};

// PATCH /api/beds/requests/:id/reject (admin) { notes }
const reject = async (req, res, next) => {
  try {
    const r = await inTransaction((conn) => closeRequest(conn, req.params.id, { status: 'rejected', notes: req.body.notes, user: req.user }));
    const [[p]] = await db.query('SELECT name FROM users WHERE id = ?', [r.patient_id]);
    await notifyUsers([r.requested_by], {
      type: 'bed', title: `${r.request_type === 'admission' ? 'Bed' : 'Discharge'} request rejected`, link: '/doctor/beds',
      message: `Your request for ${p.name} was rejected${req.body.notes ? `: ${req.body.notes}` : '.'}`,
    });
    res.json({ success: true });
  } catch (err) { next(err); }
};

// PATCH /api/beds/requests/:id/cancel (the requesting doctor, or admin)
const cancel = async (req, res, next) => {
  try {
    await inTransaction((conn) => closeRequest(conn, req.params.id, { status: 'cancelled', user: req.user }));
    res.json({ success: true });
  } catch (err) { next(err); }
};

// GET /api/beds/my-patients (doctor): current admissions this doctor requested, with any pending discharge request.
const myPatients = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT a.id AS allocation_id, a.patient_id, u.name AS patient_name, a.admitted_at, a.reason,
              b.bed_number, w.name AS ward_name, w.ward_type, dr.id AS discharge_request_id
       FROM bed_allocations a
       JOIN users u ON u.id = a.patient_id
       JOIN beds b ON b.id = a.bed_id
       JOIN wards w ON w.id = b.ward_id
       LEFT JOIN bed_requests dr ON dr.open_key = CONCAT('discharge:', a.id)
       WHERE a.attending_doctor_id = ? AND a.discharged_at IS NULL
       ORDER BY a.admitted_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

module.exports = { createRequest, listRequests, fulfill, reject, cancel, myPatients };
