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

-- One statement so the beds-empty guard holds for all of it. Table columns are compared only with
-- plain literals (never with derived-table strings) to avoid MySQL 8 collation-mix errors.
INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate)
SELECT w.id,
  CONCAT(CASE WHEN w.name = 'General Ward A' THEN 'GA' WHEN w.name = 'ICU' THEN 'ICU' ELSE 'ER' END, '-', LPAD(n.n, 2, '0')),
  CASE WHEN w.name = 'General Ward A' THEN 1500 WHEN w.name = 'ICU' THEN 6000 ELSE 2500 END
FROM wards w
JOIN (
  SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
) n
JOIN (SELECT COUNT(*) c FROM beds) x ON x.c = 0
WHERE (w.name = 'General Ward A' AND n.n <= 10)
   OR (w.name = 'ICU' AND n.n <= 6)
   OR (w.name = 'Emergency Bay' AND n.n <= 6);

-- Database guard for one open allocation per patient and per bed. The app sets open_patient_id and
-- open_bed_id on admission and clears both on discharge. Unique keys ignore NULLs, so closed rows never
-- clash. Plain columns rather than generated ones: MySQL 8 forbids stored generated columns over
-- patient_id because its foreign key cascades.
ALTER TABLE bed_allocations ADD COLUMN open_patient_id INT NULL;
ALTER TABLE bed_allocations ADD COLUMN open_bed_id INT NULL;
UPDATE bed_allocations SET open_patient_id = patient_id, open_bed_id = bed_id
WHERE discharged_at IS NULL AND open_patient_id IS NULL;
ALTER TABLE bed_allocations ADD UNIQUE INDEX uq_alloc_open_patient (open_patient_id);
ALTER TABLE bed_allocations ADD UNIQUE INDEX uq_alloc_open_bed (open_bed_id);
