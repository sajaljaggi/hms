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

-- Seeds run only while the table is empty, so rows an admin deletes stay deleted on later boots.
INSERT IGNORE INTO wards (name, ward_type, floor)
SELECT v.n, v.t, v.f FROM (
  SELECT 'General Ward A' n, 'general' t, 1 f
  UNION ALL SELECT 'ICU', 'icu', 2
  UNION ALL SELECT 'Emergency Bay', 'emergency', 0
) v JOIN (SELECT COUNT(*) c FROM wards) x ON x.c = 0;

INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate)
SELECT w.id, v.b, v.r FROM (
  SELECT 'General Ward A' w, 'GA-01' b, 1500 r
  UNION ALL SELECT 'General Ward A', 'GA-02', 1500
  UNION ALL SELECT 'General Ward A', 'GA-03', 1500
  UNION ALL SELECT 'General Ward A', 'GA-04', 1500
  UNION ALL SELECT 'General Ward A', 'GA-05', 1500
  UNION ALL SELECT 'General Ward A', 'GA-06', 1500
  UNION ALL SELECT 'General Ward A', 'GA-07', 1500
  UNION ALL SELECT 'General Ward A', 'GA-08', 1500
  UNION ALL SELECT 'General Ward A', 'GA-09', 1500
  UNION ALL SELECT 'General Ward A', 'GA-10', 1500
  UNION ALL SELECT 'ICU', 'ICU-01', 6000
  UNION ALL SELECT 'ICU', 'ICU-02', 6000
  UNION ALL SELECT 'ICU', 'ICU-03', 6000
  UNION ALL SELECT 'ICU', 'ICU-04', 6000
  UNION ALL SELECT 'ICU', 'ICU-05', 6000
  UNION ALL SELECT 'ICU', 'ICU-06', 6000
  UNION ALL SELECT 'Emergency Bay', 'ER-01', 2500
  UNION ALL SELECT 'Emergency Bay', 'ER-02', 2500
  UNION ALL SELECT 'Emergency Bay', 'ER-03', 2500
  UNION ALL SELECT 'Emergency Bay', 'ER-04', 2500
  UNION ALL SELECT 'Emergency Bay', 'ER-05', 2500
  UNION ALL SELECT 'Emergency Bay', 'ER-06', 2500
) v JOIN wards w ON w.name = v.w JOIN (SELECT COUNT(*) c FROM beds) x ON x.c = 0;
