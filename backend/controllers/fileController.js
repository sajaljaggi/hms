const db = require('../config/db');
const { NotFoundError } = require('../utils/errors');

// Files come from our own DB with a type we detected at upload; nosniff stops browsers guessing otherwise.
function sendFile(res, { mime, data, name }, { cache }) {
  res.set({
    'Content-Type': mime,
    'Content-Length': data.length,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': cache,
    ...(name && { 'Content-Disposition': `inline; filename="${name.replace(/"/g, '')}"` }),
  });
  res.end(data);
}

// GET /api/files/prescriptions/:id — only the patient it belongs to and the doctor who wrote it.
// Anyone else gets 404, so the file's existence is not revealed.
const getPrescriptionFile = async (req, res, next) => {
  try {
    const [[f]] = await db.query(
      `SELECT pf.mime, pf.name, pf.data
       FROM prescription_files pf
       JOIN prescriptions p ON p.id = pf.prescription_id
       JOIN doctors d ON d.id = p.doctor_id
       WHERE pf.prescription_id = ? AND (p.patient_id = ? OR d.user_id = ?)`,
      [req.params.id, req.user.id, req.user.id]
    );
    if (!f) throw new NotFoundError('File not found.');
    sendFile(res, f, { cache: 'private, no-store' });
  } catch (err) { next(err); }
};

// GET /api/files/doctors/:id/image — public: shown on the booking page. The URL carries ?v=<version>.
const getDoctorImage = async (req, res, next) => {
  try {
    const [[f]] = await db.query('SELECT mime, data FROM doctor_images WHERE doctor_id = ?', [req.params.id]);
    if (!f) throw new NotFoundError('Image not found.');
    sendFile(res, f, { cache: 'public, max-age=86400' });
  } catch (err) { next(err); }
};

module.exports = { getPrescriptionFile, getDoctorImage };
