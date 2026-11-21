-- Bed management: wards, beds, and admission/discharge history.
CREATE TABLE IF NOT EXISTS wards (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  ward_type  ENUM('general','icu','emergency','maternity','pediatric','private') NOT NULL,
  floor      INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS beds (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  ward_id    INT NOT NULL,
  bed_number VARCHAR(20) NOT NULL,
  status     ENUM('available','occupied','maintenance','reserved') NOT NULL DEFAULT 'available',
  daily_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ward_bed (ward_id, bed_number),
  INDEX idx_bed_status (status),
  FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bed_allocations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  bed_id        INT NOT NULL,
  patient_id    INT NOT NULL,
  allocated_by  INT NULL,
  reason        VARCHAR(255) NULL,
  admitted_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  discharged_at DATETIME NULL,
  INDEX idx_alloc_bed_open (bed_id, discharged_at),
  INDEX idx_alloc_patient_open (patient_id, discharged_at),
  FOREIGN KEY (bed_id) REFERENCES beds(id),
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (allocated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT IGNORE INTO wards (name, ward_type, floor) VALUES
  ('General Ward A', 'general', 1),
  ('ICU', 'icu', 2),
  ('Emergency Bay', 'emergency', 0);

INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'GA-01', 1500 FROM wards WHERE name = 'General Ward A';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'GA-02', 1500 FROM wards WHERE name = 'General Ward A';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'GA-03', 1500 FROM wards WHERE name = 'General Ward A';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'GA-04', 1500 FROM wards WHERE name = 'General Ward A';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'GA-05', 1500 FROM wards WHERE name = 'General Ward A';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'GA-06', 1500 FROM wards WHERE name = 'General Ward A';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'GA-07', 1500 FROM wards WHERE name = 'General Ward A';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'GA-08', 1500 FROM wards WHERE name = 'General Ward A';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'GA-09', 1500 FROM wards WHERE name = 'General Ward A';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'GA-10', 1500 FROM wards WHERE name = 'General Ward A';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ICU-01', 6000 FROM wards WHERE name = 'ICU';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ICU-02', 6000 FROM wards WHERE name = 'ICU';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ICU-03', 6000 FROM wards WHERE name = 'ICU';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ICU-04', 6000 FROM wards WHERE name = 'ICU';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ICU-05', 6000 FROM wards WHERE name = 'ICU';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ICU-06', 6000 FROM wards WHERE name = 'ICU';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ER-01', 2500 FROM wards WHERE name = 'Emergency Bay';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ER-02', 2500 FROM wards WHERE name = 'Emergency Bay';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ER-03', 2500 FROM wards WHERE name = 'Emergency Bay';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ER-04', 2500 FROM wards WHERE name = 'Emergency Bay';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ER-05', 2500 FROM wards WHERE name = 'Emergency Bay';
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) SELECT id, 'ER-06', 2500 FROM wards WHERE name = 'Emergency Bay';
