-- Teleconsultation: video appointments get an unguessable Jitsi room name.
ALTER TABLE appointments ADD COLUMN consultation_type ENUM('in_person','video') NOT NULL DEFAULT 'in_person';
ALTER TABLE appointments ADD COLUMN video_room VARCHAR(64) NULL;
CREATE UNIQUE INDEX uq_appt_video_room ON appointments (video_room);
-- Waiting room: the patient's last poll while waiting, and when the doctor let them in.
ALTER TABLE appointments ADD COLUMN video_waiting_at DATETIME NULL;
ALTER TABLE appointments ADD COLUMN video_admitted_at DATETIME NULL;
