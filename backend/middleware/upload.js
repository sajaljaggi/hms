const multer = require('multer');
const { ValidationError } = require('../utils/errors');

// Uploads are kept in memory and saved to the database by the controller: the server's disk is
// wiped on restart (Render free plan), and files on disk were served publicly.

// The type comes from the file's first bytes, never from its name or the browser's claim.
const SIGNATURES = [
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

function detectMime(buffer) {
  const hit = SIGNATURES.find((s) => buffer.length >= 12 && s.test(buffer));
  return hit ? hit.mime : null;
}

// Multer middleware for one optional file in `field`, then checks its real type is in `allowed`.
// Sets req.upload = { mime, name, buffer } when a valid file was sent.
function singleFile(field, { maxBytes, allowed, label }) {
  const parse = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } }).single(field);
  return (req, res, next) => parse(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next();
    const mime = detectMime(req.file.buffer);
    if (!allowed.includes(mime)) return next(new ValidationError(`Only ${label} files are allowed.`));
    // Keep a safe display name only: no paths or odd characters.
    const name = (req.file.originalname || 'file').replace(/[^\w.\- ]+/g, '_').slice(-120);
    req.upload = { mime, name, buffer: req.file.buffer };
    next();
  });
}

const doctorImageUpload = singleFile('profileImage', {
  maxBytes: 2 * 1024 * 1024, allowed: ['image/jpeg', 'image/png', 'image/webp'], label: 'JPEG, PNG or WebP image',
});
const prescriptionUpload = singleFile('file', {
  maxBytes: 5 * 1024 * 1024, allowed: ['application/pdf', 'image/jpeg', 'image/png'], label: 'PDF, JPEG or PNG',
});

module.exports = { doctorImageUpload, prescriptionUpload, detectMime };
