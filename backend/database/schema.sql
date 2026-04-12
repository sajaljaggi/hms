-- ============================================================
-- HMS Database Schema
-- Run this file in phpMyAdmin or MySQL CLI to set up tables
-- ============================================================

CREATE DATABASE IF NOT EXISTS hms_db;
USE hms_db;

-- -----------------------------------------------
-- Table: users (patients, doctors, admin accounts)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  guardian_name VARCHAR(150) DEFAULT NULL,
  gender       ENUM('male', 'female', 'other') DEFAULT NULL,
  age          INT DEFAULT NULL,
  weight       DECIMAL(5,2) DEFAULT NULL,
  medical_history TEXT DEFAULT NULL,
  phone        VARCHAR(20) DEFAULT NULL,
  email        VARCHAR(150) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  address      TEXT DEFAULT NULL,
  city         VARCHAR(100) DEFAULT NULL,
  role         ENUM('patient', 'doctor', 'admin') NOT NULL DEFAULT 'patient',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (password: admin123)
INSERT IGNORE INTO users (name, email, password, role)
VALUES ('Admin', 'admin@hms.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- -----------------------------------------------
-- Table: doctors
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS doctors (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL UNIQUE,
  specialization VARCHAR(100) NOT NULL,
  fees           DECIMAL(10,2) NOT NULL DEFAULT 0,
  rating         DECIMAL(3,2) NOT NULL DEFAULT 0,
  rating_count   INT NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------
-- Table: doctor_slots
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_slots (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id  INT NOT NULL,
  date       DATE NOT NULL,
  time       TIME NOT NULL,
  is_booked  TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  UNIQUE KEY unique_slot (doctor_id, date, time)
);

-- -----------------------------------------------
-- Table: appointments
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  patient_id  INT NOT NULL,
  doctor_id   INT NOT NULL,
  slot_id     INT NOT NULL UNIQUE,
  status      ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  reason      VARCHAR(255) DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  FOREIGN KEY (slot_id) REFERENCES doctor_slots(id) ON DELETE CASCADE
);

-- -----------------------------------------------
-- Table: prescriptions
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL UNIQUE,
  doctor_id      INT NOT NULL,
  patient_id     INT NOT NULL,
  notes          TEXT DEFAULT NULL,
  file_url       VARCHAR(500) DEFAULT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------
-- Table: ratings (doctor feedback from patients)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS ratings (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL UNIQUE,
  doctor_id      INT NOT NULL,
  patient_id     INT NOT NULL,
  stars          TINYINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id)      REFERENCES doctors(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id)     REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------
-- Sample data: doctors
-- -----------------------------------------------
-- Insert doctor users (password: password123)
INSERT IGNORE INTO users (name, email, password, role) VALUES
  ('Dr. Sarah Johnson', 'sarah@hms.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor'),
  ('Dr. Michael Chen',  'michael@hms.com','$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor'),
  ('Dr. Emily Davis',   'emily@hms.com',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor'),
  ('Dr. James Wilson',  'james@hms.com',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor'),
  ('Dr. Robert Smith',  'robert@hms.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor');

INSERT IGNORE INTO doctors (user_id, specialization, fees)
SELECT id, specialization, fees
FROM (
  SELECT u.id,
    CASE u.email
      WHEN 'sarah@hms.com'   THEN 'Cardiology'
      WHEN 'michael@hms.com' THEN 'Neurology'
      WHEN 'emily@hms.com'   THEN 'Dermatology'
      WHEN 'james@hms.com'   THEN 'Orthopedics'
      WHEN 'robert@hms.com'  THEN 'General Medicine'
    END AS specialization,
    CASE u.email
      WHEN 'sarah@hms.com'   THEN 1500.00
      WHEN 'michael@hms.com' THEN 2000.00
      WHEN 'emily@hms.com'   THEN 1200.00
      WHEN 'james@hms.com'   THEN 1800.00
      WHEN 'robert@hms.com'  THEN 1000.00
    END AS fees
  FROM users u
  WHERE u.email IN ('sarah@hms.com','michael@hms.com','emily@hms.com','james@hms.com','robert@hms.com')
) tmp;
