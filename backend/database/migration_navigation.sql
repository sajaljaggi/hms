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

INSERT IGNORE INTO nav_locations (code, name, category, floor, description) VALUES
('MAIN_ENTRANCE', 'Main Entrance', 'entrance', 0, 'Main hospital entrance'),
('RECEPTION', 'Reception', 'reception', 0, 'Registration and enquiries'),
('EMERGENCY', 'Emergency Department', 'department', 0, 'Emergency care, open 24 hours'),
('PHARMACY', 'Pharmacy', 'facility', 0, 'In-house pharmacy'),
('RADIOLOGY', 'Radiology', 'department', 0, 'X-ray, CT and ultrasound'),
('LIFT_G', 'Lift (Ground)', 'elevator', 0, 'Lift lobby, ground floor'),
('STAIRS_G', 'Stairs (Ground)', 'stairs', 0, 'Staircase, ground floor'),
('JUNCTION_G', 'Ground Floor Junction', 'junction', 0, 'Central corridor junction'),
('LIFT_1', 'Lift (Floor 1)', 'elevator', 1, 'Lift lobby, first floor'),
('STAIRS_1', 'Stairs (Floor 1)', 'stairs', 1, 'Staircase, first floor'),
('GENERAL_MEDICINE', 'General Medicine', 'department', 1, 'General medicine outpatient clinic'),
('CARDIOLOGY', 'Cardiology', 'department', 1, 'Heart care clinic'),
('ORTHOPEDICS', 'Orthopedics', 'department', 1, 'Bone and joint clinic'),
('GENERAL_WARD_A', 'General Ward A', 'ward', 1, 'General inpatient ward'),
('BLOOD_BANK', 'Blood Bank', 'facility', 1, 'Blood donation and issue'),
('LIFT_2', 'Lift (Floor 2)', 'elevator', 2, 'Lift lobby, second floor'),
('STAIRS_2', 'Stairs (Floor 2)', 'stairs', 2, 'Staircase, second floor'),
('NEUROLOGY', 'Neurology', 'department', 2, 'Brain and nerve clinic'),
('DERMATOLOGY', 'Dermatology', 'department', 2, 'Skin clinic'),
('ICU', 'Intensive Care Unit', 'ward', 2, 'Intensive care, restricted access');

INSERT IGNORE INTO nav_edges (from_location_id, to_location_id, distance_m, instruction, reverse_instruction, `accessible`)
SELECT a.id, b.id, e.d, e.i, e.r, e.acc FROM (
  SELECT 'MAIN_ENTRANCE' f, 'RECEPTION' t, 20 d, 'Walk straight to the reception desk' i, 'Walk back to the main entrance' r, 1 acc
  UNION ALL SELECT 'MAIN_ENTRANCE', 'JUNCTION_G', 15, 'Walk ahead to the central junction', 'Walk back to the main entrance', 1
  UNION ALL SELECT 'RECEPTION', 'PHARMACY', 15, 'Walk along the corridor to the pharmacy', 'Walk back to the reception desk', 1
  UNION ALL SELECT 'JUNCTION_G', 'EMERGENCY', 25, 'Turn left and follow the red signs to Emergency', 'Walk back to the central junction', 1
  UNION ALL SELECT 'JUNCTION_G', 'PHARMACY', 20, 'Turn right to the pharmacy', 'Walk back to the central junction', 1
  UNION ALL SELECT 'JUNCTION_G', 'RADIOLOGY', 30, 'Continue straight to Radiology', 'Walk back to the central junction', 1
  UNION ALL SELECT 'JUNCTION_G', 'LIFT_G', 40, 'Follow the corridor to the lift lobby', 'Walk back to the central junction', 1
  UNION ALL SELECT 'JUNCTION_G', 'STAIRS_G', 10, 'Take the short passage to the staircase', 'Walk back to the central junction', 0
  UNION ALL SELECT 'LIFT_G', 'LIFT_1', 25, 'Take the lift up to floor 1', 'Take the lift down to the ground floor', 1
  UNION ALL SELECT 'LIFT_1', 'LIFT_2', 25, 'Take the lift up to floor 2', 'Take the lift down to floor 1', 1
  UNION ALL SELECT 'STAIRS_G', 'STAIRS_1', 15, 'Take the stairs up to floor 1', 'Take the stairs down to the ground floor', 0
  UNION ALL SELECT 'STAIRS_1', 'STAIRS_2', 15, 'Take the stairs up to floor 2', 'Take the stairs down to floor 1', 0
  UNION ALL SELECT 'LIFT_1', 'STAIRS_1', 20, 'Walk along the corridor to the staircase', 'Walk along the corridor to the lift lobby', 1
  UNION ALL SELECT 'LIFT_1', 'GENERAL_MEDICINE', 10, 'Exit the lift and go straight to General Medicine', 'Walk back to the lift lobby', 1
  UNION ALL SELECT 'LIFT_1', 'CARDIOLOGY', 20, 'Exit the lift and turn right to Cardiology', 'Walk back to the lift lobby', 1
  UNION ALL SELECT 'STAIRS_1', 'ORTHOPEDICS', 10, 'Leave the stairs and walk to Orthopedics', 'Walk back to the staircase', 1
  UNION ALL SELECT 'STAIRS_1', 'GENERAL_MEDICINE', 12, 'Leave the stairs and turn left to General Medicine', 'Walk back to the staircase', 1
  UNION ALL SELECT 'GENERAL_MEDICINE', 'GENERAL_WARD_A', 15, 'Continue down the corridor to General Ward A', 'Walk back to General Medicine', 1
  UNION ALL SELECT 'CARDIOLOGY', 'BLOOD_BANK', 12, 'Walk past Cardiology to the Blood Bank', 'Walk back to Cardiology', 1
  UNION ALL SELECT 'LIFT_2', 'NEUROLOGY', 10, 'Exit the lift and go straight to Neurology', 'Walk back to the lift lobby', 1
  UNION ALL SELECT 'LIFT_2', 'ICU', 15, 'Exit the lift and turn left to the ICU', 'Walk back to the lift lobby', 1
  UNION ALL SELECT 'LIFT_2', 'STAIRS_2', 20, 'Walk along the corridor to the staircase', 'Walk along the corridor to the lift lobby', 1
  UNION ALL SELECT 'STAIRS_2', 'NEUROLOGY', 12, 'Leave the stairs and walk to Neurology', 'Walk back to the staircase', 1
  UNION ALL SELECT 'STAIRS_2', 'DERMATOLOGY', 10, 'Leave the stairs and turn right to Dermatology', 'Walk back to the staircase', 1
) e JOIN nav_locations a ON a.code = e.f JOIN nav_locations b ON b.code = e.t;
