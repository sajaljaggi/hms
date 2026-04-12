-- ============================================================
-- Migration: Doctor Rating & Feedback System
-- Run this on the existing hms_db database
-- ============================================================

USE hms_db;

-- Add rating columns to doctors table
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INT NOT NULL DEFAULT 0;

-- Create ratings table for individual feedback
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
