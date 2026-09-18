-- Migration: Add profile_image column to doctors table
-- This stores the filename of the uploaded doctor photo (e.g. "1713700000000-photo.jpg")
-- The full URL is constructed as: /uploads/doctors/<filename>

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS profile_image VARCHAR(255) DEFAULT NULL AFTER rating_count;
