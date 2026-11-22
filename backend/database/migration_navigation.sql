-- Hospital navigation: locations (nodes) and walkable connections (edges).
CREATE TABLE IF NOT EXISTS nav_locations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(30) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  category    ENUM('entrance','reception','department','ward','facility','elevator','stairs','junction') NOT NULL,
  building    VARCHAR(50) NOT NULL DEFAULT 'Main',
  floor       INT NOT NULL DEFAULT 0,
  description VARCHAR(255) NULL,
  INDEX idx_nav_loc_category (category)
);

CREATE TABLE IF NOT EXISTS nav_edges (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  from_location_id     INT NOT NULL,
  to_location_id       INT NOT NULL,
  distance_m           INT NOT NULL,
  instruction          VARCHAR(255) NOT NULL,
  reverse_instruction  VARCHAR(255) NOT NULL,
  `accessible`         TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_edge (from_location_id, to_location_id),
  INDEX idx_nav_edge_to (to_location_id),
  FOREIGN KEY (from_location_id) REFERENCES nav_locations(id) ON DELETE CASCADE,
  FOREIGN KEY (to_location_id) REFERENCES nav_locations(id) ON DELETE CASCADE
);

-- Seeds run only while the table is empty, so rows an admin deletes stay deleted on later boots.
INSERT IGNORE INTO nav_locations (code, name, category, floor, description)
SELECT v.code, v.name, v.category, v.floor, v.description FROM (
  SELECT 'MAIN_ENTRANCE' code, 'Main Entrance' name, 'entrance' category, 0 floor, 'Main hospital entrance' description
  UNION ALL SELECT 'RECEPTION', 'Reception', 'reception', 0, 'Registration and enquiries'
  UNION ALL SELECT 'EMERGENCY', 'Emergency Department', 'department', 0, 'Emergency care, open 24 hours'
  UNION ALL SELECT 'PHARMACY', 'Pharmacy', 'facility', 0, 'In-house pharmacy'
  UNION ALL SELECT 'RADIOLOGY', 'Radiology', 'department', 0, 'X-ray, CT and ultrasound'
  UNION ALL SELECT 'LIFT_G', 'Lift (Ground)', 'elevator', 0, 'Lift lobby, ground floor'
  UNION ALL SELECT 'STAIRS_G', 'Stairs (Ground)', 'stairs', 0, 'Staircase, ground floor'
  UNION ALL SELECT 'JUNCTION_G', 'Ground Floor Junction', 'junction', 0, 'Central corridor junction'
  UNION ALL SELECT 'LIFT_1', 'Lift (Floor 1)', 'elevator', 1, 'Lift lobby, first floor'
  UNION ALL SELECT 'STAIRS_1', 'Stairs (Floor 1)', 'stairs', 1, 'Staircase, first floor'
  UNION ALL SELECT 'GENERAL_MEDICINE', 'General Medicine', 'department', 1, 'General medicine outpatient clinic'
  UNION ALL SELECT 'CARDIOLOGY', 'Cardiology', 'department', 1, 'Heart care clinic'
  UNION ALL SELECT 'ORTHOPEDICS', 'Orthopedics', 'department', 1, 'Bone and joint clinic'
  UNION ALL SELECT 'GENERAL_WARD_A', 'General Ward A', 'ward', 1, 'General inpatient ward'
  UNION ALL SELECT 'BLOOD_BANK', 'Blood Bank', 'facility', 1, 'Blood donation and issue'
  UNION ALL SELECT 'LIFT_2', 'Lift (Floor 2)', 'elevator', 2, 'Lift lobby, second floor'
  UNION ALL SELECT 'STAIRS_2', 'Stairs (Floor 2)', 'stairs', 2, 'Staircase, second floor'
  UNION ALL SELECT 'NEUROLOGY', 'Neurology', 'department', 2, 'Brain and nerve clinic'
  UNION ALL SELECT 'DERMATOLOGY', 'Dermatology', 'department', 2, 'Skin clinic'
  UNION ALL SELECT 'ICU', 'Intensive Care Unit', 'ward', 2, 'Intensive care, restricted access'
) v JOIN (SELECT COUNT(*) c FROM nav_locations) x ON x.c = 0;

-- One statement so the edges-empty guard holds for all of it. Edge k maps to its endpoint codes in the
-- WHERE clause: table columns are compared only with plain literals (never with derived-table strings)
-- to avoid MySQL 8 collation-mix errors.
INSERT IGNORE INTO nav_edges (from_location_id, to_location_id, distance_m, instruction, reverse_instruction, `accessible`)
SELECT a.id, b.id, e.d, e.i, e.r, e.acc FROM (
  SELECT 1 k, 20 d, 'Walk straight to the reception desk' i, 'Walk back to the main entrance' r, 1 acc
  UNION ALL SELECT 2, 15, 'Walk ahead to the central junction', 'Walk back to the main entrance', 1
  UNION ALL SELECT 3, 15, 'Walk along the corridor to the pharmacy', 'Walk back to the reception desk', 1
  UNION ALL SELECT 4, 25, 'Turn left and follow the red signs to Emergency', 'Walk back to the central junction', 1
  UNION ALL SELECT 5, 20, 'Turn right to the pharmacy', 'Walk back to the central junction', 1
  UNION ALL SELECT 6, 30, 'Continue straight to Radiology', 'Walk back to the central junction', 1
  UNION ALL SELECT 7, 40, 'Follow the corridor to the lift lobby', 'Walk back to the central junction', 1
  UNION ALL SELECT 8, 10, 'Take the short passage to the staircase', 'Walk back to the central junction', 0
  UNION ALL SELECT 9, 25, 'Take the lift up to floor 1', 'Take the lift down to the ground floor', 1
  UNION ALL SELECT 10, 25, 'Take the lift up to floor 2', 'Take the lift down to floor 1', 1
  UNION ALL SELECT 11, 15, 'Take the stairs up to floor 1', 'Take the stairs down to the ground floor', 0
  UNION ALL SELECT 12, 15, 'Take the stairs up to floor 2', 'Take the stairs down to floor 1', 0
  UNION ALL SELECT 13, 20, 'Walk along the corridor to the staircase', 'Walk along the corridor to the lift lobby', 1
  UNION ALL SELECT 14, 10, 'Exit the lift and go straight to General Medicine', 'Walk back to the lift lobby', 1
  UNION ALL SELECT 15, 20, 'Exit the lift and turn right to Cardiology', 'Walk back to the lift lobby', 1
  UNION ALL SELECT 16, 10, 'Leave the stairs and walk to Orthopedics', 'Walk back to the staircase', 1
  UNION ALL SELECT 17, 12, 'Leave the stairs and turn left to General Medicine', 'Walk back to the staircase', 1
  UNION ALL SELECT 18, 15, 'Continue down the corridor to General Ward A', 'Walk back to General Medicine', 1
  UNION ALL SELECT 19, 12, 'Walk past Cardiology to the Blood Bank', 'Walk back to Cardiology', 1
  UNION ALL SELECT 20, 10, 'Exit the lift and go straight to Neurology', 'Walk back to the lift lobby', 1
  UNION ALL SELECT 21, 15, 'Exit the lift and turn left to the ICU', 'Walk back to the lift lobby', 1
  UNION ALL SELECT 22, 20, 'Walk along the corridor to the staircase', 'Walk along the corridor to the lift lobby', 1
  UNION ALL SELECT 23, 12, 'Leave the stairs and walk to Neurology', 'Walk back to the staircase', 1
  UNION ALL SELECT 24, 10, 'Leave the stairs and turn right to Dermatology', 'Walk back to the staircase', 1
) e
JOIN nav_locations a
JOIN nav_locations b
JOIN (SELECT COUNT(*) c FROM nav_edges) x ON x.c = 0
WHERE (e.k = 1 AND a.code = 'MAIN_ENTRANCE' AND b.code = 'RECEPTION')
   OR (e.k = 2 AND a.code = 'MAIN_ENTRANCE' AND b.code = 'JUNCTION_G')
   OR (e.k = 3 AND a.code = 'RECEPTION' AND b.code = 'PHARMACY')
   OR (e.k = 4 AND a.code = 'JUNCTION_G' AND b.code = 'EMERGENCY')
   OR (e.k = 5 AND a.code = 'JUNCTION_G' AND b.code = 'PHARMACY')
   OR (e.k = 6 AND a.code = 'JUNCTION_G' AND b.code = 'RADIOLOGY')
   OR (e.k = 7 AND a.code = 'JUNCTION_G' AND b.code = 'LIFT_G')
   OR (e.k = 8 AND a.code = 'JUNCTION_G' AND b.code = 'STAIRS_G')
   OR (e.k = 9 AND a.code = 'LIFT_G' AND b.code = 'LIFT_1')
   OR (e.k = 10 AND a.code = 'LIFT_1' AND b.code = 'LIFT_2')
   OR (e.k = 11 AND a.code = 'STAIRS_G' AND b.code = 'STAIRS_1')
   OR (e.k = 12 AND a.code = 'STAIRS_1' AND b.code = 'STAIRS_2')
   OR (e.k = 13 AND a.code = 'LIFT_1' AND b.code = 'STAIRS_1')
   OR (e.k = 14 AND a.code = 'LIFT_1' AND b.code = 'GENERAL_MEDICINE')
   OR (e.k = 15 AND a.code = 'LIFT_1' AND b.code = 'CARDIOLOGY')
   OR (e.k = 16 AND a.code = 'STAIRS_1' AND b.code = 'ORTHOPEDICS')
   OR (e.k = 17 AND a.code = 'STAIRS_1' AND b.code = 'GENERAL_MEDICINE')
   OR (e.k = 18 AND a.code = 'GENERAL_MEDICINE' AND b.code = 'GENERAL_WARD_A')
   OR (e.k = 19 AND a.code = 'CARDIOLOGY' AND b.code = 'BLOOD_BANK')
   OR (e.k = 20 AND a.code = 'LIFT_2' AND b.code = 'NEUROLOGY')
   OR (e.k = 21 AND a.code = 'LIFT_2' AND b.code = 'ICU')
   OR (e.k = 22 AND a.code = 'LIFT_2' AND b.code = 'STAIRS_2')
   OR (e.k = 23 AND a.code = 'STAIRS_2' AND b.code = 'NEUROLOGY')
   OR (e.k = 24 AND a.code = 'STAIRS_2' AND b.code = 'DERMATOLOGY');
