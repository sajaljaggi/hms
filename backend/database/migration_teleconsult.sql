-- Teleconsultation: video appointments get an unguessable Jitsi room name.
ALTER TABLE appointments ADD COLUMN consultation_type ENUM('in_person','video') NOT NULL DEFAULT 'in_person';
ALTER TABLE appointments ADD COLUMN video_room VARCHAR(64) NULL;
CREATE UNIQUE INDEX uq_appt_video_room ON appointments (video_room);
