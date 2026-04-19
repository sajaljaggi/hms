-- ============================================================
-- Migration: Add is_available column to doctor_slots
-- ============================================================
USE hms_db;

ALTER TABLE doctor_slots
  ADD COLUMN IF NOT EXISTS is_available TINYINT(1) NOT NULL DEFAULT 1 AFTER is_booked;

-- Optional: MySQL scheduled event to clean past unbooked slots daily
-- Requires: SET GLOBAL event_scheduler = ON; (run manually as root/DBA)
-- CREATE EVENT IF NOT EXISTS cleanup_past_slots
--   ON SCHEDULE EVERY 1 DAY
--   STARTS CURRENT_TIMESTAMP
--   DO
--     DELETE FROM doctor_slots WHERE date < CURDATE() AND is_booked = 0;
