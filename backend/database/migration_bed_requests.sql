-- Doctors request a bed (admission) or a discharge; the admin assigns the bed or discharges. Same
-- lifecycle as blood_requests. open_key holds 'admission:<patient>' or 'discharge:<allocation>' while
-- pending (NULL after), so the unique key allows one pending request of each kind at a time.
CREATE TABLE IF NOT EXISTS bed_requests (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  request_type      ENUM('admission','discharge') NOT NULL,
  patient_id        INT NOT NULL,
  requested_by      INT NULL,
  ward_type         ENUM('general','icu','emergency','maternity','pediatric','private') NULL,
  allocation_id     INT NULL,
  emergency_case_id INT NULL,
  urgency           ENUM('routine','urgent','emergency') NOT NULL DEFAULT 'routine',
  status            ENUM('pending','fulfilled','rejected','cancelled') NOT NULL DEFAULT 'pending',
  reason            VARCHAR(500) NULL,
  admin_notes       VARCHAR(500) NULL,
  open_key          VARCHAR(40) NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at       DATETIME NULL,
  resolved_by       INT NULL,
  UNIQUE KEY uq_bedreq_open (open_key),
  INDEX idx_bedreq_status (status, created_at),
  INDEX idx_bedreq_requester (requested_by),
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (allocation_id) REFERENCES bed_allocations(id) ON DELETE SET NULL,
  FOREIGN KEY (emergency_case_id) REFERENCES emergency_cases(id) ON DELETE SET NULL
);

-- The doctor whose request led to an admission: they see that bed and may request the discharge.
ALTER TABLE bed_allocations ADD COLUMN attending_doctor_id INT NULL;
ALTER TABLE bed_allocations ADD INDEX idx_alloc_attending (attending_doctor_id, discharged_at);
ALTER TABLE bed_allocations ADD CONSTRAINT fk_alloc_attending FOREIGN KEY (attending_doctor_id) REFERENCES users(id) ON DELETE SET NULL;
