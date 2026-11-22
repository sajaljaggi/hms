-- Blood bank: donors, patient requests, and blood units (stock).
CREATE TABLE IF NOT EXISTS blood_donors (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  blood_group        ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  phone              VARCHAR(20) NOT NULL,
  email              VARCHAR(150) NULL,
  last_donation_date DATE NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_donor_group (blood_group)
);

CREATE TABLE IF NOT EXISTS blood_requests (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  patient_id      INT NOT NULL,
  requested_by    INT NULL,
  blood_group     ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  component       ENUM('whole_blood','packed_rbc','plasma','platelets') NOT NULL,
  units_requested INT NOT NULL,
  urgency         ENUM('routine','urgent','emergency') NOT NULL DEFAULT 'routine',
  status          ENUM('pending','fulfilled','rejected','cancelled') NOT NULL DEFAULT 'pending',
  notes           VARCHAR(500) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fulfilled_at    DATETIME NULL,
  INDEX idx_req_status (status, created_at),
  INDEX idx_req_patient (patient_id),
  INDEX idx_req_requester (requested_by),
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS blood_units (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  donor_id     INT NULL,
  blood_group  ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  component    ENUM('whole_blood','packed_rbc','plasma','platelets') NOT NULL,
  volume_ml    INT NOT NULL,
  collected_on DATE NOT NULL,
  expires_on   DATE NOT NULL,
  status       ENUM('available','issued','expired','discarded') NOT NULL DEFAULT 'available',
  request_id   INT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unit_stock (status, component, blood_group, expires_on),
  INDEX idx_unit_donor (donor_id),
  INDEX idx_unit_request (request_id),
  FOREIGN KEY (donor_id) REFERENCES blood_donors(id) ON DELETE SET NULL,
  FOREIGN KEY (request_id) REFERENCES blood_requests(id) ON DELETE SET NULL
);
