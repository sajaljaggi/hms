-- Consultation fee payments (Razorpay, or mock mode outside production).
ALTER TABLE appointments ADD COLUMN payment_status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid';

CREATE TABLE IF NOT EXISTS payments (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id      INT NOT NULL UNIQUE,
  patient_id          INT NOT NULL,
  amount_paise        INT NOT NULL,
  currency            CHAR(3) NOT NULL DEFAULT 'INR',
  provider            ENUM('razorpay','mock') NOT NULL,
  provider_order_id   VARCHAR(64) NOT NULL UNIQUE,
  provider_payment_id VARCHAR(64) NULL UNIQUE,
  status              ENUM('created','paid','failed') NOT NULL DEFAULT 'created',
  paid_at             DATETIME NULL,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pay_patient (patient_id, created_at),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Razorpay delivers webhooks at least once, so each event id is processed only once.
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  event_id    VARCHAR(100) NOT NULL UNIQUE,
  event_type  VARCHAR(60) NOT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
