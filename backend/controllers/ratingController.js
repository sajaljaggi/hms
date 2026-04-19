const db = require('../config/db');

// ─── POST /api/ratings ─────────────────────────────────────────────────────
// Patient submits a rating (1-5) for a completed appointment
const submitRating = async (req, res, next) => {
  try {
    const patientId = req.user.id;
    const { appointmentId, rating } = req.body;

    if (!appointmentId || !rating) {
      return res.status(400).json({ success: false, message: 'appointmentId and rating are required.' });
    }
    if (rating < 1 || rating > 5 || !Number.isInteger(Number(rating))) {
      return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5.' });
    }

    // Verify the appointment exists, belongs to this patient, and is completed
    const [apptRows] = await db.query(
      `SELECT a.id, a.doctor_id, a.status
       FROM appointments a
       WHERE a.id = ? AND a.patient_id = ?`,
      [appointmentId, patientId]
    );

    if (apptRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }
    if (apptRows[0].status !== 'completed') {
      return res.status(400).json({ success: false, message: 'You can only rate completed appointments.' });
    }

    const doctorId = apptRows[0].doctor_id;

    // Insert (will fail if already rated due to UNIQUE on appointment_id)
    try {
      await db.query(
        `INSERT INTO doctor_ratings (appointment_id, doctor_id, patient_id, rating)
         VALUES (?, ?, ?, ?)`,
        [appointmentId, doctorId, patientId, rating]
      );
    } catch (dupErr) {
      if (dupErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'You have already rated this appointment.' });
      }
      throw dupErr;
    }

    // Return updated average
    const [[{ avg_rating, rating_count }]] = await db.query(
      `SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS rating_count
       FROM doctor_ratings WHERE doctor_id = ?`,
      [doctorId]
    );

    res.status(201).json({
      success: true,
      message: 'Rating submitted successfully.',
      avg_rating,
      rating_count,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/ratings/check/:appointmentId ──────────────────────────────────
// Returns whether the patient already rated this appointment (and the rating value)
const checkRating = async (req, res, next) => {
  try {
    const patientId = req.user.id;
    const { appointmentId } = req.params;

    const [rows] = await db.query(
      `SELECT rating FROM doctor_ratings
       WHERE appointment_id = ? AND patient_id = ?`,
      [appointmentId, patientId]
    );

    if (rows.length === 0) {
      return res.json({ success: true, rated: false, rating: null });
    }

    res.json({ success: true, rated: true, rating: rows[0].rating });
  } catch (err) {
    next(err);
  }
};

module.exports = { submitRating, checkRating };
