-- Cancelling frees the slot. slot_id stops being unique; active_slot_id holds the slot (unique)
-- while the visit is not cancelled, and is NULL once it is.
ALTER TABLE appointments ADD COLUMN active_slot_id INT NULL;
ALTER TABLE appointments ADD INDEX idx_appt_slot (slot_id);
ALTER TABLE appointments DROP INDEX slot_id;
UPDATE appointments SET active_slot_id = slot_id WHERE status <> 'cancelled' AND active_slot_id IS NULL;
ALTER TABLE appointments ADD UNIQUE INDEX uq_appt_active_slot (active_slot_id);
-- Release slots still held by visits cancelled before this change.
UPDATE doctor_slots ds
  JOIN appointments a ON a.slot_id = ds.id AND a.status = 'cancelled'
  LEFT JOIN appointments live ON live.active_slot_id = ds.id
  SET ds.is_booked = 0
  WHERE ds.is_booked = 1 AND live.id IS NULL;

-- A paid visit that is cancelled waits for a refund.
ALTER TABLE payments MODIFY status ENUM('created','paid','failed','refund_due') NOT NULL DEFAULT 'created';

-- Payment records must outlive deletes: block deleting a paid appointment or its patient.
ALTER TABLE payments DROP FOREIGN KEY payments_ibfk_1;
ALTER TABLE payments DROP FOREIGN KEY payments_ibfk_2;
ALTER TABLE payments ADD CONSTRAINT fk_payments_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_payments_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT;

-- Uploaded files live in the database: the app server's disk is wiped on every restart (Render free plan).
CREATE TABLE IF NOT EXISTS prescription_files (
  prescription_id INT PRIMARY KEY,
  mime       VARCHAR(50)  NOT NULL,
  name       VARCHAR(255) NOT NULL,
  size_bytes INT          NOT NULL,
  data       MEDIUMBLOB   NOT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS doctor_images (
  doctor_id  INT PRIMARY KEY,
  mime       VARCHAR(50) NOT NULL,
  data       MEDIUMBLOB  NOT NULL,
  updated_at DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
);
-- Photos saved on the old disk are gone; show the initials placeholder instead of a broken image.
UPDATE doctors SET profile_image = NULL
  WHERE profile_image IS NOT NULL AND id NOT IN (SELECT doctor_id FROM doctor_images);
