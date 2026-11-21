# HMS Module Expansion — Spec & Plan

Seven new modules for the HMS (Express 5 + MySQL backend, React 19 + TS + Tailwind frontend):
blood bank, beds, emergency, teleconsultation, notifications/alerts, hospital navigation,
and payments. Each one gets unit, integration and E2E tests.

## References (professional logic adopted)

- **Payments**: Razorpay Orders API plus the checkout signature check, `HMAC_SHA256(order_id + "|" + payment_id, key_secret)`. Webhooks are verified with HMAC over the *raw* body using a separate webhook secret, and deduped on the `x-razorpay-event-id` header (Razorpay delivers at least once). Docs: razorpay.com/docs/webhooks/best-practices, razorpay.com/docs/webhooks/validate-test.
- **Emergency**: Emergency Severity Index (ESI v4) 5-level triage. Level 1 means an immediate life-saving intervention is needed. Level 2 covers high-risk, confused or severe-pain cases. Otherwise the level comes from the resources needed (0 → 5, 1 → 4, ≥2 → 3), and a level-3 patient goes up to 2 when adult vitals are in the "danger zone" (HR > 100, RR > 20, SpO2 < 92). The queue orders by acuity, then by arrival (as in MIMIC-IV ED triage acuity).
- **Blood bank**: ABO/Rh compatibility matrices (red cells versus plasma), FEFO issuing (first-expiry-first-out), and AABB shelf lives (whole blood CPDA-1 35 d, packed RBC with additive 42 d, frozen plasma 365 d, platelets 5 d). The donor deferral interval is 56 days.
- **Teleconsultation**: Jitsi Meet IFrame API (`https://<domain>/external_api.js`, `new JitsiMeetExternalAPI(domain, {roomName, parentNode, userInfo})`). Each appointment gets an unguessable room name, and only that appointment's patient or doctor can obtain it.
- **Navigation**: wayfinding as a weighted graph (locations = nodes, corridors/lifts/stairs = edges with turn-by-turn instructions). Dijkstra's algorithm finds the shortest path, and an "accessible only" mode drops the stairs edges.
- **Beds**: ward → bed → allocation (admission/discharge history). A bed has at most one open allocation, and so does a patient. Allocation takes a row lock.

## Global Constraints

1. Backend follows existing patterns: CommonJS. The DB is `require('../config/db')`, a mysql2 promise pool (`db.query`, `db.getConnection()`). Zod schemas live in `backend/validators/<module>Validators.js` and use `validate(schema, source)` from `middleware/validate.js`. Errors are `AppError` subclasses from `utils/errors.js`, passed to `next(err)`. Success responses are `{ success: true, data, ...}`. Routes go in `backend/routes/<module>Routes.js` and are mounted in `backend/app.js`. Auth is `auth` + `requireRole(...)`.
2. Schema changes go ONLY into new files `backend/database/migration_<module>.sql`, appended to `SQL_FILES` in `backend/database/applySchema.js`. They must be idempotent under that runner: `CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`, `ALTER TABLE ... ADD COLUMN` (a duplicate column is ignored), `CREATE INDEX` (a duplicate key name is ignored). No stored procedures, triggers or DELIMITER. **Never put a `;` inside a comment or string literal** (the runner splits on `;`).
3. Every foreign-key/filter column used in WHERE/JOIN gets an index. No N+1 queries: list endpoints use one JOIN/GROUP BY query.
4. Any check-then-write on shared state (bed allocation, blood unit issue, payment marking, status transitions) runs inside a transaction with `SELECT ... FOR UPDATE` on the rows involved. It does `rollback` on error and `release` in `finally` (same as `bookAppointment`).
5. Never trust client-supplied money amounts, user IDs or roles. Ownership comes from `req.user.id`.
6. Notifications go through `backend/services/notificationService.js` (Task 1). Callers use them AFTER commit. Those functions never throw.
7. Tests: unit tests in `backend/tests/unit/*.test.js` (mock `config/db` like `tests/unit/booking.controller.test.js`). Integration tests in `backend/tests/integration/*.routes.test.js` (supertest + real test DB, set up by `node database/setupTestDb.js`). They use the shared helpers in `backend/tests/helpers/session.js` (Task 1). Run jest as `node node_modules/jest/bin/jest.js <paths> --runInBand` from `backend/`. Integration tests clean up the rows they create. Test output stays free of unexpected noise.
8. Frontend follows existing patterns: services in `frontend/src/services/<module>Service.ts` using `api` from `./api`. Pages are lazy-loaded in `App.tsx`. Sidebar entries go in `components/Layout.tsx`. Use lucide-react icons, the teal palette and Tailwind classes like the existing pages, and `utils/getErrorMessage.ts` for error text. `npx tsc -b` and `npm run lint` must pass.
9. Git: commit with explicit paths (`git add <files>`). NEVER stage `backend/.env.test`, `.github/workflows/keep-alive.yml`, `backend/.env`, `coverage/`, or `backend/uploads/`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
10. Shared API contract (camelCase in request bodies, snake_case DB columns are returned as-is in response rows, like existing endpoints).

---

### Task 1: Notification & alert system (backend) + shared test helpers

Files: `backend/database/migration_notifications.sql`, `backend/services/notificationService.js`, `backend/controllers/notificationController.js`, `backend/routes/notificationRoutes.js`, `backend/validators/notificationValidators.js`, `backend/app.js`, `backend/database/applySchema.js`, `backend/controllers/appointmentController.js` (booking hook), `backend/tests/helpers/session.js`, tests.

Schema `notifications`: `id INT AI PK, user_id INT NOT NULL FK users(id) ON DELETE CASCADE, type ENUM('appointment','payment','emergency','blood','bed','teleconsult','system') NOT NULL, title VARCHAR(150) NOT NULL, message VARCHAR(500) NOT NULL, link VARCHAR(255) NULL, is_read TINYINT(1) NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_notif_user_read (user_id, is_read, created_at)`.

Service (`notificationService.js`):
- `notifyUsers(userIds, { type, title, message, link })` dedupes the ids, drops falsy ones, and does ONE multi-row INSERT. It returns the inserted count. It never throws: on error it `console.error`s and returns 0.
- `notifyRoles(roles, payload)` does one `INSERT ... SELECT` from users where role IN (roles). Same never-throw contract.

Endpoints (all `auth`, any role, scoped to `req.user.id`):
- `GET /api/notifications?unreadOnly=true|false&limit=1..50 (default 20)` → `{ success, data: [rows newest first], unreadCount }`
- `PATCH /api/notifications/:id/read` → 404 if the row isn't the user's, otherwise `{ success: true }`
- `PATCH /api/notifications/read-all` → `{ success: true, updated: n }` (register this route BEFORE `/:id/read`)

Booking hook: after a successful commit in `bookAppointment`, notify the patient ("Appointment booked") and the doctor's user ("New appointment"). Fetch the doctor's `user_id` and send both in one `notifyUsers` call per recipient group (no extra round trip per row). Link: patient `/patient/history`, doctor `/doctor/appointments`. Update `tests/unit/booking.controller.test.js` mocks accordingly.

Test helper `tests/helpers/session.js` exports:
- `csrfFrom(res)`
- `createUserSession(role, overrides)`: inserts a user with a bcrypt hash of `password123` (bcryptjs, cost 4) directly into `users`. For `doctor` it also inserts a `doctors` row (specialization 'General Medicine', fees 500). It logs in through `POST /api/auth/login` and returns `{ userId, doctorId?, email, cookies, csrfToken }`.
- `authed(agentMethod, url, session)`: sets Cookie + X-CSRF-Token.
- `cleanupUsers(ids)`
The existing integration tests stay untouched.

Tests: unit tests for the service (dedupe/empty list/no-throw on DB error) and the controller. Integration tests for list/unread count/mark read/read-all/other user's notification → 404/unauthenticated → 401, plus booking producing notifications.

### Task 2: Bed management (backend)

Files: `migration_beds.sql`, `services/bedService.js`, `controllers/bedController.js`, `routes/bedRoutes.js`, `validators/bedValidators.js`, app.js, applySchema.js, tests.

Schema:
- `wards`: `id, name VARCHAR(100) UNIQUE NOT NULL, ward_type ENUM('general','icu','emergency','maternity','pediatric','private') NOT NULL, floor INT NOT NULL DEFAULT 0, created_at`
- `beds`: `id, ward_id FK wards ON DELETE CASCADE, bed_number VARCHAR(20) NOT NULL, status ENUM('available','occupied','maintenance','reserved') NOT NULL DEFAULT 'available', daily_rate DECIMAL(10,2) NOT NULL DEFAULT 0, created_at, UNIQUE KEY uq_ward_bed (ward_id, bed_number), INDEX idx_bed_status (status)`
- `bed_allocations`: `id, bed_id FK beds, patient_id FK users ON DELETE CASCADE, allocated_by FK users NULL ON DELETE SET NULL, reason VARCHAR(255) NULL, admitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, discharged_at DATETIME NULL, INDEX idx_alloc_bed_open (bed_id, discharged_at), INDEX idx_alloc_patient_open (patient_id, discharged_at)`
- Seed (INSERT IGNORE): wards `General Ward A` (general, floor 1), `ICU` (icu, floor 2), `Emergency Bay` (emergency, floor 0). Beds: GA-01..GA-10 (rate 1500), ICU-01..ICU-06 (rate 6000), ER-01..ER-06 (rate 2500). Insert beds via `INSERT IGNORE ... SELECT` keyed by ward name.

Service `bedService.js`:
- `allocateBed(conn, { bedId, patientId, reason, allocatedBy })` must be called inside the caller's transaction. It locks the bed `FOR UPDATE` (404 NotFoundError if missing; 409 ConflictError if status ≠ 'available'). It verifies the patient exists with role 'patient' (404). It locks open allocations for the patient `FOR UPDATE` (409 "Patient already admitted"). Then it inserts the allocation, sets the bed to 'occupied', and returns `{ allocationId, bedId, wardId }`.
- `dischargeAllocation(conn, allocationId)` locks the allocation (404), returns 409 if already discharged, sets `discharged_at = NOW()` and the bed to 'available', and returns `{ bedId, patientId }`.

Endpoints, mounted at `/api/beds`, all `auth`:
- `GET /wards` (admin, doctor) → wards with `total, available, occupied, maintenance, reserved` counts (ONE grouped query)
- `POST /wards` (admin) `{ name, wardType, floor }` → 201 `{ data: { id } }`. Duplicate name → 409 (existing ER_DUP_ENTRY mapping).
- `GET /?wardId=&status=` (admin, doctor) → beds with `ward_name`, plus the current open allocation's `allocation_id, patient_id, patient_name, admitted_at` (LEFT JOIN on open allocation)
- `POST /` (admin) `{ wardId, bedNumber, dailyRate? }` → 201
- `PATCH /:id/status` (admin) `{ status: 'available'|'maintenance'|'reserved' }`: the row is locked. An occupied bed → 409. 'occupied' is not accepted by the validator.
- `POST /:id/allocate` (admin, doctor) `{ patientId, reason? }` → 201 `{ data: { allocationId } }`. Then it notifies the patient (type 'bed').
- `POST /allocations/:id/discharge` (admin, doctor) → 200
- `GET /stats` (admin, doctor) → `{ total, available, occupied, maintenance, reserved, occupancyRate }` (occupancyRate = occupied/total rounded to 1 decimal, as a percent; 0 when total = 0)
- `GET /patients/search?q=` (admin, doctor) → up to 20 patients `{id, name, email, phone}` matching name/email LIKE (used by allocation, emergency and blood UIs; `q` min 2 chars)

Tests: unit tests for bedService (each conflict path, using a mocked conn) and integration tests (full allocate → double allocate 409 → patient already admitted 409 → discharge → re-allocate OK; status change on occupied 409; role checks: patient → 403).

### Task 3: Blood bank management (backend)

Files: `migration_blood_bank.sql`, `utils/bloodCompatibility.js`, `services/bloodBankService.js`, `controllers/bloodBankController.js`, `routes/bloodBankRoutes.js`, `validators/bloodBankValidators.js`, app.js, applySchema.js, tests.

Blood groups: `'A+','A-','B+','B-','AB+','AB-','O+','O-'`. Components: `'whole_blood','packed_rbc','plasma','platelets'`.

Schema:
- `blood_donors`: `id, name VARCHAR(100) NOT NULL, blood_group ENUM(...) NOT NULL, phone VARCHAR(20) NOT NULL, email VARCHAR(150) NULL, last_donation_date DATE NULL, created_at, INDEX(blood_group)`
- `blood_requests`: `id, patient_id FK users ON DELETE CASCADE, requested_by FK users NULL ON DELETE SET NULL, blood_group ENUM, component ENUM, units_requested INT NOT NULL, urgency ENUM('routine','urgent','emergency') NOT NULL DEFAULT 'routine', status ENUM('pending','fulfilled','rejected','cancelled') NOT NULL DEFAULT 'pending', notes VARCHAR(500) NULL, created_at, fulfilled_at DATETIME NULL, INDEX(status, created_at)`
- `blood_units`: `id, donor_id FK blood_donors NULL ON DELETE SET NULL, blood_group ENUM, component ENUM, volume_ml INT NOT NULL, collected_on DATE NOT NULL, expires_on DATE NOT NULL, status ENUM('available','issued','expired','discarded') NOT NULL DEFAULT 'available', request_id FK blood_requests NULL ON DELETE SET NULL, created_at, INDEX idx_unit_stock (status, component, blood_group, expires_on)`

`utils/bloodCompatibility.js` (pure):
- `SHELF_LIFE_DAYS = { whole_blood: 35, packed_rbc: 42, plasma: 365, platelets: 5 }`
- `compatibleDonorGroups(recipientGroup, component)` returns the donor groups, exact match first.
  - Red cells (whole_blood, packed_rbc), ABO: O←[O]. A←[A,O]. B←[B,O]. AB←[AB,A,B,O]. Rh: a negative recipient takes only negative donors, a positive recipient takes either.
  - Plasma, ABO: O←[O,A,B,AB]. A←[A,AB]. B←[B,AB]. AB←[AB]. Rh ignored.
  - Platelets: plasma ABO rule plus the red-cell Rh rule.
- `computeExpiry(collectedOn 'YYYY-MM-DD', component)` → 'YYYY-MM-DD'. Use UTC date math, no timezone drift.
- `DONATION_INTERVAL_DAYS = 56`, `LOW_STOCK_THRESHOLD = 5`

Endpoints `/api/blood`, all `auth`:
- `GET /inventory` (admin, doctor): first expires stale units (`UPDATE ... SET status='expired' WHERE status='available' AND expires_on < CURDATE()`). Returns all 8×4 group/component combos (zero-filled) `{ blood_group, component, available, expiring_soon }`, where expiring_soon is within 7 days. ONE grouped query.
- `GET /donors?bloodGroup=&q=` (admin). `POST /donors` (admin) `{ name, bloodGroup, phone, email? }` → 201
- `POST /donations` (admin) `{ donorId, component, volumeMl (100..600), collectedOn? (≤ today, default today) }`: transaction. Lock the donor (404). If `last_donation_date` is within 56 days of collectedOn → 409. Insert a unit with the donor's group and the computed expiry, and update last_donation_date. → 201 `{ data: { unitId, expiresOn } }`
- `GET /units?bloodGroup=&component=&status=` (admin), newest first, max 200
- `PATCH /units/:id/discard` (admin): locks the unit. Only 'available' can be discarded (409 otherwise).
- `POST /requests` (admin, doctor) `{ patientId, bloodGroup, component, unitsRequested 1..10, urgency, notes? }`: the patient must exist with role patient (404). → 201. Urgency 'emergency' → `notifyRoles(['admin'])` type 'blood'.
- `GET /requests?status=` (admin, doctor; doctors see only requests they made) with patient name and requester name
- `POST /requests/:id/fulfill` (admin): transaction. Lock the request (must be pending, else 409). Expire stale units. `SELECT ... FOR UPDATE` available compatible units of that component with `expires_on >= CURDATE()`, ordered exact-group-first then `expires_on ASC` (FEFO), `LIMIT units_requested`. If fewer are found → 409 "Insufficient compatible stock". Mark them issued with request_id, set the request to fulfilled with fulfilled_at, and commit. After commit: notify the requester and the patient. If the remaining available units of the issued group/component are < LOW_STOCK_THRESHOLD, `notifyRoles(['admin'])` low-stock alert. → `{ data: { issuedUnitIds } }`
- `PATCH /requests/:id/reject` (admin) `{ notes? }`: locked; only pending (409).
- `PATCH /requests/:id/cancel` (requester or admin): only pending.

Tests: exhaustive unit tests for the compatibility matrix (all 8 recipients × 3 rule families, spot-checking O- universal red cell donor, AB universal plasma donor, AB+ universal red cell recipient), computeExpiry, and the service (insufficient stock, FEFO order). Integration tests: donor → donations → inventory counts → request → fulfill issues the earliest-expiring compatible units → second fulfill 409 → 56-day rule 409 → doctor cannot fulfill (403).

### Task 4: Emergency management (backend)

Files: `migration_emergency.sql`, `utils/triage.js`, `controllers/emergencyController.js`, `routes/emergencyRoutes.js`, `validators/emergencyValidators.js`, app.js, applySchema.js, tests. It uses `bedService.allocateBed` (Task 2) and `notificationService` (Task 1).

Schema `emergency_cases`: `id, patient_id FK users NULL ON DELETE SET NULL, patient_name VARCHAR(100) NOT NULL, age INT NULL, gender ENUM('male','female','other') NULL, contact_phone VARCHAR(20) NULL, chief_complaint VARCHAR(500) NOT NULL, arrival_mode ENUM('walk_in','ambulance','referral') NOT NULL DEFAULT 'walk_in', triage_level TINYINT NOT NULL, heart_rate INT NULL, resp_rate INT NULL, bp_systolic INT NULL, bp_diastolic INT NULL, spo2 INT NULL, temperature DECIMAL(4,1) NULL, status ENUM('waiting','in_treatment','admitted','discharged','transferred') NOT NULL DEFAULT 'waiting', assigned_doctor_id FK doctors NULL ON DELETE SET NULL, bed_allocation_id FK bed_allocations NULL ON DELETE SET NULL, created_by FK users NULL ON DELETE SET NULL, arrived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at DATETIME NULL, INDEX idx_er_queue (status, triage_level, arrived_at)`.

`utils/triage.js` (pure):
- `suggestEsiLevel({ requiresImmediateIntervention, highRisk, expectedResources, heartRate, respRate, spo2 })`: 1 if requiresImmediateIntervention. 2 if highRisk. Resources 0 → 5, 1 → 4, ≥2 → 3. A 3 becomes 2 when heartRate > 100 or respRate > 20 or spo2 < 92 (any provided).
- `ALLOWED_TRANSITIONS = { waiting: ['in_treatment','transferred','discharged'], in_treatment: ['admitted','discharged','transferred'], admitted: [], discharged: [], transferred: [] }` and `canTransition(from, to)`.

Endpoints `/api/emergency`, all `auth` + role admin or doctor:
- `POST /cases` `{ patientId?, patientName (required unless patientId; when patientId is given, name defaults to the user's name), age?, gender?, contactPhone?, chiefComplaint, arrivalMode?, requiresImmediateIntervention=false, highRisk=false, expectedResources=0..10 (default 0), triageLevel? 1..5 (clinician override), heartRate?, respRate?, bpSystolic?, bpDiastolic?, spo2? 0..100, temperature? }` → 201 `{ data: { id, triageLevel, suggestedLevel } }`. A level ≤ 2 sends an alert after insert: `notifyRoles(['admin','doctor'], {type:'emergency', title:'ESI <n> emergency arrival', link})` (link `/admin/emergency` for admins, `/doctor/emergency` for doctors: use two notifyRoles calls).
- `GET /cases?status=active|closed|all` (default active = waiting+in_treatment): ordered by `triage_level ASC, arrived_at ASC`, with `assigned_doctor_name` and `wait_minutes` (TIMESTAMPDIFF to NOW or closed_at). One JOIN query. Max 200.
- `GET /cases/:id` → 404 if missing
- `PATCH /cases/:id` `{ status?, triageLevel?, assignedDoctorId?, vitals fields? }` at least one field: transaction, lock the row. A status change must pass `canTransition` (409 otherwise). `admitted` is NOT settable here (use /admit, 400). Moving to discharged/transferred sets closed_at. assignedDoctorId must exist (404) and that doctor's user gets notified after commit.
- `POST /cases/:id/admit` `{ bedId }`: transaction. Lock the case. It must be waiting/in_treatment (409) and must have patient_id (400 "Register the patient before admission"). Then `allocateBed(conn, { bedId, patientId, reason: 'Emergency: <complaint truncated 200>', allocatedBy: req.user.id })`, update the case to status admitted, bed_allocation_id and closed_at. → 200 `{ data: { allocationId } }`.
- `GET /stats` → `{ active, waiting, inTreatment, byTriageLevel: {1..5 counts among active}, avgWaitMinutes (waiting only, rounded int, 0 if none), admittedToday }`

Tests: unit tests for triage.js (each ESI branch, danger-zone upgrade, transitions) and controller transition paths. Integration: create a case (alert notifications appear for an admin), queue ordering (ESI 1 before an earlier ESI 3), invalid transition 409, admit allocates a bed (bed becomes occupied), admit without patient_id 400, patient role 403.

### Task 5: Payment integration (backend, Razorpay + test mode)

Files: `migration_payments.sql`, `services/paymentGateway.js`, `controllers/paymentController.js`, `routes/paymentRoutes.js`, `validators/paymentValidators.js`, app.js (raw-body webhook route + CSRF exemption for that path only), applySchema.js, `backend/.env.example`, list SELECTs in patient/doctor/admin controllers (add `a.payment_status`), tests.

Schema:
- `ALTER TABLE appointments ADD COLUMN payment_status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid'`
- `payments`: `id, appointment_id FK appointments ON DELETE CASCADE UNIQUE, patient_id FK users ON DELETE CASCADE, amount_paise INT NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'INR', provider ENUM('razorpay','mock') NOT NULL, provider_order_id VARCHAR(64) NOT NULL UNIQUE, provider_payment_id VARCHAR(64) NULL UNIQUE, status ENUM('created','paid','failed') NOT NULL DEFAULT 'created', paid_at DATETIME NULL, created_at, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX(patient_id, created_at)`
- `payment_webhook_events`: `id, event_id VARCHAR(100) NOT NULL UNIQUE, event_type VARCHAR(60) NOT NULL, received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

`services/paymentGateway.js`:
- `getMode()`: `'razorpay'` if `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set. Else `'mock'` unless `NODE_ENV === 'production'`, where it returns `null` (not configured).
- `createOrder({ amountPaise, receipt, notes })`. Razorpay: `POST https://api.razorpay.com/v1/orders` via global `fetch` with Basic auth, body `{amount, currency:'INR', receipt, notes}`. A non-2xx becomes an `AppError(502,'PAYMENT_GATEWAY_ERROR')`. Mock: `{ id: 'order_mock_' + 24 random hex }`. Mode null → `AppError(503,'PAYMENT_NOT_CONFIGURED')`.
- `signCheckout(orderId, paymentId)` = hex HMAC-SHA256 of `${orderId}|${paymentId}` with the key secret (mock secret: `'mock_secret_dev_only'`).
- `verifyCheckoutSignature(orderId, paymentId, signature)` uses `crypto.timingSafeEqual` (length-check first, never throw on bad input).
- `verifyWebhookSignature(rawBodyBuffer, signature)` uses `RAZORPAY_WEBHOOK_SECRET`. Returns false if the secret is unset.

Endpoints `/api/payments`:
- `POST /orders` (patient) `{ appointmentId }`: transaction, lock the appointment `WHERE id=? AND patient_id=?` (404). Cancelled → 400. Already paid → 409. The amount = `ROUND(doctors.fees*100)` from the DB. An existing payment row with status created/failed is reused: return its order if `amount_paise` is unchanged and status is created, otherwise create a new gateway order and update the row. Response `{ data: { orderId, amount, currency, mode, keyId (razorpay only), appointmentId, mock?: { paymentId, signature } } }`. `mock` is only present in mock mode: `paymentId='pay_mock_'+hex`, signature=`signCheckout(...)`.
- `POST /verify` (patient) `{ orderId, paymentId, signature }`: transaction, lock the payment by order id AND patient_id (404). Already paid → 200 `{ alreadyPaid: true }`. Bad signature → 400 (do NOT mark failed). Otherwise `markPaid` sets payments paid + provider_payment_id + paid_at and appointments.payment_status='paid'. After commit, notify the patient and the doctor's user (type 'payment').
- `POST /webhook` (no auth, no CSRF, `express.raw({ type: 'application/json' })` mounted in app.js BEFORE `express.json()`): bad signature → 400. Insert the event id from the `x-razorpay-event-id` header into payment_webhook_events (ER_DUP_ENTRY → 200 `{ duplicate: true }`). `payment.captured`/`order.paid` → mark paid by order id via the same internal `markPaid(conn, orderId, paymentId)` (idempotent). `payment.failed` → set status failed only if not paid. Unknown events → 200 ignored. Do the dedupe insert and the state change in one transaction.
- `POST /orders/:orderId/fail` (patient, owner) marks a 'created' payment failed (checkout dismissed/failed client-side) → 200
- `GET /my` (patient): payments with doctor name, specialization, slot date/time, newest first
- `GET /` (admin): all payments with patient/doctor names + `summary: { totalPaidPaise, paidCount, pendingCount }`

Add `RAZORPAY_KEY_ID=`, `RAZORPAY_KEY_SECRET=`, `RAZORPAY_WEBHOOK_SECRET=` to `.env.example` with a comment that empty means mock mode outside production.

Tests: unit tests for the gateway (signature ok/tampered/wrong length/missing webhook secret, mode selection) and the controller (amount from DB, not client). Integration: book → order (mock) → verify with mock signature → appointment payment_status paid → verify again idempotent → tampered signature 400 → another patient's appointment 404 → webhook with valid HMAC (set RAZORPAY_WEBHOOK_SECRET in-test via process.env) marks paid, and the duplicate event id returns duplicate:true → webhook bad signature 400.

### Task 6: Teleconsultation (backend)

Files: `migration_teleconsult.sql`, `controllers/teleconsultController.js`, `routes/teleconsultRoutes.js`, `validators/teleconsultValidators.js`, `validators/appointmentValidators.js`, `controllers/appointmentController.js`, list SELECTs in patient/doctor/admin controllers (add `a.consultation_type`), app.js, applySchema.js, `.env.example` (`JITSI_DOMAIN=meet.jit.si`), tests.

Schema: `ALTER TABLE appointments ADD COLUMN consultation_type ENUM('in_person','video') NOT NULL DEFAULT 'in_person'`, `ALTER TABLE appointments ADD COLUMN video_room VARCHAR(64) NULL`, `CREATE UNIQUE INDEX uq_appt_video_room ON appointments (video_room)`.

Booking: `bookAppointmentSchema` gains `consultationType: z.enum(['in_person','video']).default('in_person')`. When it's video, the INSERT stores `video_room = 'hms-' + crypto.randomBytes(16).toString('hex')`. The booking notification text mentions video (it extends the Task 1 hook).

Endpoints `/api/teleconsult`, `auth`, role patient or doctor:
- `GET /:appointmentId/join`: loads the appointment plus slot plus the doctor's user_id. Access: the patient owner, or the doctor whose `doctors.user_id = req.user.id`. Anyone else → 404 (don't reveal existence). Must be consultation_type video (400) and status pending (409 if completed/cancelled). The patient must have payment_status paid (402-like: use `AppError(402,'PAYMENT_REQUIRED')`); doctors are exempt. Join window: from 15 min before the slot start to 60 min after (403 `AppError(403,'OUTSIDE_JOIN_WINDOW')` with `startsAt` in details). Response `{ data: { roomName, domain: process.env.JITSI_DOMAIN || 'meet.jit.si', displayName: user's name, role, startsAt (ISO), appointmentId } }`.
- `PATCH /:appointmentId/complete` (doctor of the appointment): marks the appointment `completed` if pending (409 otherwise), notifies the patient (type 'teleconsult').

Time logic goes in a pure exported helper `isWithinJoinWindow(slotDateStr, slotTimeStr, now)` in `utils/dates.js` (or a new `utils/teleconsult.js`), and it gets a unit test.

Tests: unit tests for the join window boundaries (−16 min false, −15 true, +60 true, +61 false) and the controller access paths. Integration: book a video appointment (room created, unique, absent for in_person), join as an unpaid patient → 402, after mock payment → 200 within the window (seed the slot at the current time rounded), the doctor joins → 200, another patient → 404, in-person → 400, outside window → 403.

### Task 7: Hospital navigation (backend)

Files: `migration_navigation.sql`, `utils/pathfinding.js`, `controllers/navigationController.js`, `routes/navigationRoutes.js`, `validators/navigationValidators.js`, app.js, applySchema.js, tests.

Schema:
- `nav_locations`: `id, code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL, category ENUM('entrance','reception','department','ward','facility','elevator','stairs','junction') NOT NULL, building VARCHAR(50) NOT NULL DEFAULT 'Main', floor INT NOT NULL DEFAULT 0, description VARCHAR(255) NULL, INDEX(category)`
- `nav_edges`: `id, from_location_id FK nav_locations ON DELETE CASCADE, to_location_id FK ON DELETE CASCADE, distance_m INT NOT NULL, instruction VARCHAR(255) NOT NULL (from→to), reverse_instruction VARCHAR(255) NOT NULL (to→from), accessible TINYINT(1) NOT NULL DEFAULT 1, UNIQUE KEY uq_edge (from_location_id, to_location_id)`
- Seed a connected 3-floor graph with INSERT IGNORE (edges via subselects on code). Floor 0: MAIN_ENTRANCE, RECEPTION, EMERGENCY, PHARMACY, RADIOLOGY, LIFT_G, STAIRS_G, JUNCTION_G. Floor 1: LIFT_1, STAIRS_1, GENERAL_MEDICINE, CARDIOLOGY, ORTHOPEDICS, GENERAL_WARD_A, BLOOD_BANK. Floor 2: LIFT_2, STAIRS_2, NEUROLOGY, DERMATOLOGY, ICU. Lift edges (LIFT_G–LIFT_1, LIFT_1–LIFT_2) are accessible. Stairs edges are `accessible=0`. Stairs is shorter than lift, so the default route differs from the accessible route.

`utils/pathfinding.js` (pure): `buildGraph(edges, { accessibleOnly })` (undirected, each direction carries its own instruction) and `shortestPath(graph, fromId, toId)` → `{ locationIds, totalDistance, steps: [{ fromId, toId, instruction, distance }] }` or `null`. Dijkstra. from === to → zero-step path.

Endpoints `/api/navigation`:
- Public: `GET /locations?category=&q=` (name LIKE, ordered floor, name). `GET /route?from=<id>&to=<id>&accessible=true|false`: a missing location → 404, unreachable → 404 "No route". The response includes `steps` with the from/to location names and floors, plus `totalDistance` and `estimatedMinutes = ceil(totalDistance / 70)` (≈70 m/min walking pace, minimum 1 when distance > 0). Load locations and edges with 2 queries (no per-node queries).
- Admin: `POST /locations` `{ code (A-Z0-9_), name, category, building?, floor, description? }` → 201. `POST /edges` `{ fromLocationId, toLocationId (≠ from), distanceM 1..2000, instruction, reverseInstruction, accessible? }` → 201 (missing location → 400 via the FK mapping, or explicit 404). `DELETE /edges/:id` → 404 / 200. `DELETE /locations/:id` → 404 / 200.

Tests: unit tests for pathfinding (shortest chosen over fewer hops, accessible-only avoids stairs, unreachable null, same node, reverse instructions used when walking backward). Integration: seeded route MAIN_ENTRANCE→NEUROLOGY default vs accessible differ (the accessible one contains no stairs location), unknown id 404, admin create/delete, a patient creating a location → 403.

### Task 8: Frontend foundation: test setup, services, notification bell, navigation entries

Files: `frontend/package.json` (devDeps `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`. Script `"test": "vitest run"`), `frontend/vite.config.ts` (vitest `test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' }`. Exclude `e2e/**`), `frontend/src/test/setup.ts`, `frontend/tsconfig*.json` if types are needed. Services: `notificationService.ts`, `bedService.ts`, `bloodBankService.ts`, `emergencyService.ts`, `paymentService.ts`, `teleconsultService.ts`, `navigationService.ts` (typed request/response interfaces matching Tasks 1–7 exactly, in `frontend/src/types/modules.ts`). `components/NotificationBell.tsx` (in the Layout header for all roles). `components/Layout.tsx` (sidebar entries below). `App.tsx` (placeholder-free: routes are added by Tasks 9–10, so this task adds only the bell).

NotificationBell: polls `GET /notifications?limit=10` every 30 s while `document.visibilityState === 'visible'` and immediately on open. It shows an unread badge (cap the display at "9+"), a dropdown with items (title, message, relative time via date-fns `formatDistanceToNow`), and click → mark read + navigate to the link. It has a "Mark all read" button. It clears the interval on unmount. It's keyboard accessible (button with aria-label "Notifications", aria-expanded, Escape closes, click outside closes).

Sidebar entries (add to `getNavigation` in Layout; routes come in Tasks 9–10):
- patient: `Payments` → `/patient/payments` (CreditCard), `Hospital Map` → `/navigate` (MapPin)
- doctor: `Emergency` → `/doctor/emergency` (Siren), `Beds` → `/doctor/beds` (BedDouble), `Blood Requests` → `/doctor/blood` (Droplet), `Hospital Map` → `/navigate`
- admin: `Emergency` → `/admin/emergency`, `Beds` → `/admin/beds`, `Blood Bank` → `/admin/blood`, `Payments` → `/admin/payments`, `Hospital Map` → `/navigate`

Tests (vitest): NotificationBell renders the badge count from a mocked service, marks read on click, "9+" cap, mark all read. A services contract test checks each service function hits the right method + URL (mock `api`).

### Task 9: Frontend operations pages: beds, blood bank, emergency (admin + doctor)

Files: `pages/shared/BedManagement.tsx`, `pages/shared/BloodBank.tsx`, `pages/shared/EmergencyBoard.tsx`, `components/PatientPicker.tsx` (debounced 300 ms search via `/beds/patients/search`), `App.tsx` routes (`/admin/beds`, `/doctor/beds`, `/admin/blood`, `/doctor/blood`, `/admin/emergency`, `/doctor/emergency`), tests.

- **BedManagement**: stats cards (total/available/occupied/occupancy %), ward filter + status filter, a bed grid colored by status showing the patient name when occupied. Allocate dialog (PatientPicker + reason) on available beds, a Discharge button on occupied beds (confirm first). Admin only: add ward, add bed, set maintenance/reserved/available on non-occupied beds. Uses `user.role` from `useAuth`.
- **BloodBank**: tabs. Inventory (8×4 matrix with low-stock < 5 highlighted, expiring-soon counts) is visible to admin and doctor. Requests (list + new request form: PatientPicker, group, component, units, urgency. Admin sees Fulfill/Reject, the requester sees Cancel) is visible to both. Donors (list/search, add donor, "Record donation" form) and Units (filter list, discard) are admin only. The 409 insufficient-stock message is shown inline.
- **EmergencyBoard**: stats bar (active, waiting, avg wait, per-ESI counts). A queue table sorted as the API returns, with an ESI badge colored 1 red, 2 orange, 3 yellow, 4 green, 5 blue. New arrival form with an ESI decision helper: checkboxes for immediate intervention/high risk, an expected-resources number and vitals show a live suggested level computed client-side with the same rules as `utils/triage.js` (put the client copy in `frontend/src/utils/triage.ts`). The clinician can override. Row actions: start treatment, assign doctor (list from `/doctors`), admit (bed select of available beds), discharge, transfer. Only valid transitions are shown. Auto-refresh every 30 s while visible.
- Every async action gets a loading state, disables its button while pending, shows errors via getErrorMessage, and re-fetches after success. Use `useCallback`/stable deps so polling doesn't re-create intervals every render.

Tests (vitest + RTL, mocked services): BedManagement allocate flow calls the service with the right args and admin-only controls are hidden for doctor. BloodBank inventory matrix renders zero-filled cells and low-stock highlight, and Donors tab absent for doctor. EmergencyBoard suggested-ESI updates as inputs change and only valid transition buttons render. Plus `utils/triage.ts` unit tests mirroring the backend cases.

### Task 10: Frontend patient flows: payments, teleconsultation, navigation

Files: `pages/patient/BookAppointment.tsx` (consultation type toggle In-person / Video, sent as `consultationType`), `pages/patient/History.tsx` (badges for video and payment status. A "Pay ₹<fees>" button for unpaid non-cancelled appointments. A "Join video" button for paid video pending appointments), `pages/patient/Payments.tsx` (`/patient/payments` list), `pages/admin/AdminPayments.tsx` (`/admin/payments` summary + table), `pages/doctor/Appointments.tsx` (video badge + "Join video" + "Mark completed" for video appointments), `pages/shared/TeleconsultRoom.tsx` (`/consult/:appointmentId` inside Layout), `pages/Navigate.tsx` (`/navigate`, public, outside Layout, with its own simple header linking home), `utils/razorpay.ts` (checkout loader), `Home.tsx` (link to the hospital map), `App.tsx` routes, tests.

- **Pay flow** (`utils/razorpay.ts` + a hook or a function used by History): `createOrder` → mode `mock`: show a test-mode confirm modal ("Test payment, no money moves"), then `verify` with `mock.paymentId/signature`. Mode `razorpay`: lazy-load `https://checkout.razorpay.com/v1/checkout.js` once (cached promise, rejects on load error). Open `new Razorpay({ key: keyId, amount, currency, order_id, name: 'HMS', handler: resp => verify(resp.razorpay_order_id, resp.razorpay_payment_id, resp.razorpay_signature), modal: { ondismiss: () => fail(orderId) } })`. Then refresh the list and show success or failure.
- **TeleconsultRoom**: calls `/teleconsult/:id/join`. Errors 402 → "Payment required" with a link to history. 403 OUTSIDE_JOIN_WINDOW → shows startsAt. 404/400/409 → message. Loads `https://<domain>/external_api.js` (cached loader), creates `JitsiMeetExternalAPI(domain, { roomName, parentNode, userInfo: { displayName }, configOverwrite: { prejoinPageEnabled: true } })`, and calls `api.dispose()` on unmount. Doctors get a "Mark consultation completed" button. Tests mock the script loader.
- **Navigate**: from/to selects populated from `/navigation/locations` (grouped by floor), an "Accessible route (avoid stairs)" checkbox, a Find route button, then an ordered step list (instruction, distance, floor change highlighted), total distance and an ETA. A swap button. Pre-select from a `?to=<code>` query param if present (match by code).

Tests (vitest + RTL): BookAppointment sends consultationType. History shows the Pay button only for unpaid non-cancelled and Join only for paid video pending. The mock pay flow calls verify with the mock signature. TeleconsultRoom shows the payment-required message on 402 and disposes the Jitsi api on unmount. Navigate renders steps and passes `accessible=true` when checked.

### Task 11: End-to-end tests (Playwright)

Files: `frontend/package.json` (devDep `@playwright/test`, script `"test:e2e": "playwright test"`), `frontend/playwright.config.ts`, `frontend/e2e/*.spec.ts`, `frontend/e2e/helpers.ts`, `backend/package.json` script `"start:e2e": "node -r dotenv/config server.js dotenv_config_path=.env.test"`, `README.md` (a Testing section describing unit/integration/e2e commands).

Config: `use.channel: 'chrome'` (system Google Chrome is installed, so no browser download), baseURL `http://localhost:5173`. `webServer`: [backend `npm --prefix ../backend run start:e2e` on port 5001 health URL `http://localhost:5001/api/health`, frontend `npm run dev` port 5173], `reuseExistingServer: true`, workers 1. `globalSetup` runs `node ../backend/database/setupTestDb.js`, then seeds via direct mysql2 (credentials from backend/.env.test): an admin, a doctor with a doctors row and slots today+1, and a patient, each with a known password. Write the e2e credentials into `e2e/.auth-fixtures.json` (git-ignored).

Specs (each independent, logging in through the real UI):
1. `notifications-booking.spec.ts`: the patient books a video appointment for tomorrow, the bell shows unread ≥ 1, and opening it shows "Appointment booked".
2. `payments.spec.ts`: the patient pays via the mock flow from history, and the badge becomes Paid. The admin payments page lists it.
3. `teleconsult.spec.ts`: an unpaid video appointment's join shows payment required. Stub `external_api.js` with `page.route` to a fake `JitsiMeetExternalAPI` so no real call starts. A paid appointment in the window renders the room container. Seed an appointment at the current time via the DB.
4. `beds.spec.ts`: the admin allocates a bed to the patient, it shows occupied with the patient name, discharges it, and it's available again.
5. `blood-bank.spec.ts`: the admin adds a donor and records a donation, the inventory increments, the admin creates a request and fulfills it, and the status is fulfilled.
6. `emergency.spec.ts`: the doctor registers an ESI-1 arrival, it appears at the top of the queue, the admin bell gets an emergency alert, the doctor starts treatment and admits to a bed.
7. `navigation.spec.ts`: a public visitor routes Main Entrance → Neurology, then toggles accessible, and the steps no longer mention stairs.

Run the full suite and record the results in the report. Fix product bugs found (in the relevant files) and note them.
