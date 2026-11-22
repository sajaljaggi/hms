// Types mirror the backend controllers exactly: rows are snake_case as returned by MySQL,
// request bodies are camelCase. DECIMAL columns come back as strings (mysql2), DATE columns as ISO strings.

export interface ApiOk { success: true }

// ── Notifications ──────────────────────────────────────────────
export type NotificationType = 'appointment' | 'payment' | 'emergency' | 'blood' | 'bed' | 'teleconsult' | 'system';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  is_read: 0 | 1;
  created_at: string;
}
export interface NotificationListResponse { success: true; data: AppNotification[]; unreadCount: number }
export interface NotificationQuery { unreadOnly?: boolean; limit?: number }

// ── Beds ───────────────────────────────────────────────────────
export type WardType = 'general' | 'icu' | 'emergency' | 'maternity' | 'pediatric' | 'private';
export type BedStatus = 'available' | 'occupied' | 'maintenance' | 'reserved';

export interface Ward {
  id: number;
  name: string;
  ward_type: WardType;
  floor: number;
  total: number;
  available: number;
  occupied: number;
  maintenance: number;
  reserved: number;
}
export interface Bed {
  id: number;
  ward_id: number;
  bed_number: string;
  status: BedStatus;
  daily_rate: string;
  ward_name: string;
  allocation_id: number | null;
  patient_id: number | null;
  patient_name: string | null;
  admitted_at: string | null;
}
export interface BedStats {
  total: number;
  available: number;
  occupied: number;
  maintenance: number;
  reserved: number;
  occupancyRate: number;
}
export interface PatientSearchResult { id: number; name: string; email: string; phone: string | null }
export interface CreateWardBody { name: string; wardType: WardType; floor?: number }
export interface CreateBedBody { wardId: number; bedNumber: string; dailyRate?: number }
export interface AllocateBedBody { patientId: number; reason?: string }
export interface BedListQuery { wardId?: number; status?: BedStatus }

// Doctors request beds and discharges; the admin fulfills or rejects them (like blood requests).
export type BedRequestType = 'admission' | 'discharge';
export type BedRequestStatus = 'pending' | 'fulfilled' | 'rejected' | 'cancelled';
export type BedUrgency = 'routine' | 'urgent' | 'emergency';
export interface BedRequest {
  id: number;
  request_type: BedRequestType;
  patient_id: number;
  requested_by: number | null;
  ward_type: WardType | null;
  allocation_id: number | null;
  emergency_case_id: number | null;
  urgency: BedUrgency;
  status: BedRequestStatus;
  reason: string | null;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  patient_name: string;
  requester_name: string | null;
  bed_number: string | null;
  ward_name: string | null;
}
export type CreateBedRequestBody =
  | { type: 'admission'; patientId: number; wardType?: WardType; urgency?: BedUrgency; reason?: string }
  | { type: 'discharge'; allocationId: number; urgency?: BedUrgency; reason?: string };
// A current admission of one of this doctor's patients.
export interface MyPatientBed {
  allocation_id: number;
  patient_id: number;
  patient_name: string;
  admitted_at: string;
  reason: string | null;
  bed_number: string;
  ward_name: string;
  ward_type: WardType;
  discharge_request_id: number | null;
}

// ── Blood bank ─────────────────────────────────────────────────
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type BloodComponent = 'whole_blood' | 'packed_rbc' | 'plasma' | 'platelets';
export type BloodUnitStatus = 'available' | 'issued' | 'expired' | 'discarded';
export type BloodUrgency = 'routine' | 'urgent' | 'emergency';
export type BloodRequestStatus = 'pending' | 'fulfilled' | 'rejected' | 'cancelled';

export interface BloodInventoryRow { blood_group: BloodGroup; component: BloodComponent; available: number; expiring_soon: number }
export interface BloodDonor {
  id: number;
  name: string;
  blood_group: BloodGroup;
  phone: string;
  email: string | null;
  last_donation_date: string | null;
  created_at: string;
}
export interface BloodUnit {
  id: number;
  donor_id: number | null;
  blood_group: BloodGroup;
  component: BloodComponent;
  volume_ml: number;
  collected_on: string;
  expires_on: string;
  status: BloodUnitStatus;
  request_id: number | null;
  created_at: string;
}
export interface BloodRequest {
  id: number;
  patient_id: number;
  requested_by: number | null;
  blood_group: BloodGroup;
  component: BloodComponent;
  units_requested: number;
  urgency: BloodUrgency;
  status: BloodRequestStatus;
  notes: string | null;
  created_at: string;
  fulfilled_at: string | null;
  patient_name: string;
  requester_name: string | null;
}
export interface CreateDonorBody { name: string; bloodGroup: BloodGroup; phone: string; email?: string }
export interface DonorListQuery { bloodGroup?: BloodGroup; q?: string }
export interface DonationBody { donorId: number; component: BloodComponent; volumeMl: number; collectedOn?: string }
export interface DonationResult { unitId: number; expiresOn: string }
export interface UnitListQuery { bloodGroup?: BloodGroup; component?: BloodComponent; status?: BloodUnitStatus }
export interface CreateBloodRequestBody {
  patientId: number;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequested: number;
  urgency?: BloodUrgency;
  notes?: string;
}

// ── Emergency ──────────────────────────────────────────────────
export type TriageLevel = 1 | 2 | 3 | 4 | 5;
export type EmergencyStatus = 'waiting' | 'in_treatment' | 'admitted' | 'discharged' | 'transferred';
export type ArrivalMode = 'walk_in' | 'ambulance' | 'referral';
export type Gender = 'male' | 'female' | 'other';

export interface EmergencyVitals {
  heartRate?: number;
  respRate?: number;
  bpSystolic?: number;
  bpDiastolic?: number;
  spo2?: number;
  temperature?: number;
}
export interface CreateEmergencyCaseBody extends EmergencyVitals {
  patientId?: number;
  patientName?: string; // required when patientId is absent
  age?: number;
  gender?: Gender;
  contactPhone?: string;
  chiefComplaint: string;
  arrivalMode?: ArrivalMode;
  requiresImmediateIntervention?: boolean;
  highRisk?: boolean;
  expectedResources?: number;
  triageLevel?: TriageLevel;
}
export interface CreateEmergencyCaseResult { id: number; triageLevel: TriageLevel; suggestedLevel: TriageLevel }
// 'admitted' is reachable only through admit.
export interface UpdateEmergencyCaseBody extends EmergencyVitals {
  status?: Exclude<EmergencyStatus, 'admitted'>;
  triageLevel?: TriageLevel;
  assignedDoctorId?: number;
}
export interface EmergencyCase {
  id: number;
  patient_id: number | null;
  patient_name: string;
  age: number | null;
  gender: Gender | null;
  contact_phone: string | null;
  chief_complaint: string;
  arrival_mode: ArrivalMode;
  triage_level: TriageLevel;
  heart_rate: number | null;
  resp_rate: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  spo2: number | null;
  temperature: string | null;
  status: EmergencyStatus;
  assigned_doctor_id: number | null;
  bed_allocation_id: number | null;
  bed_request_id: number | null; // a doctor's pending bed request for this case
  created_by: number | null;
  arrived_at: string;
  closed_at: string | null;
  assigned_doctor_name: string | null;
  wait_minutes: number;
}
export interface EmergencyStats {
  active: number;
  waiting: number;
  inTreatment: number;
  byTriageLevel: Record<TriageLevel, number>;
  avgWaitMinutes: number;
  admittedToday: number;
}
export type EmergencyCaseFilter = 'active' | 'closed' | 'all';

// ── Payments ───────────────────────────────────────────────────
export type PaymentStatus = 'created' | 'paid' | 'failed';
export type PaymentMode = 'razorpay' | 'mock';

export interface CreateOrderData {
  orderId: string;
  amount: number; // paise
  currency: 'INR';
  mode: PaymentMode;
  appointmentId: number;
  keyId?: string; // razorpay mode only
  mock?: { paymentId: string; signature: string }; // mock mode only
}
export interface VerifyPaymentBody { orderId: string; paymentId: string; signature: string }
export interface VerifyPaymentData { alreadyPaid: boolean; appointmentId: number }
export interface PaymentRow {
  id: number;
  appointment_id: number;
  amount_paise: number;
  currency: string;
  provider: PaymentMode;
  provider_order_id: string;
  provider_payment_id: string | null;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
  doctor_name: string;
  date: string;
  time: string;
}
export interface MyPaymentRow extends PaymentRow { specialization: string }
export interface AdminPaymentRow extends PaymentRow { patient_name: string }
export interface PaymentSummary { totalPaidPaise: number; paidCount: number; pendingCount: number }

// ── Teleconsultation ───────────────────────────────────────────
interface TeleconsultBase { role: 'doctor' | 'patient'; startsAt: string; appointmentId: number }
// A patient gets `waiting: true` (no room details) until the doctor admits them.
export type TeleconsultJoinData =
  | (TeleconsultBase & { waiting: true })
  | (TeleconsultBase & {
      waiting: false;
      roomName: string;
      domain: string;
      tenant?: string; // JaaS app id; the script loads from https://8x8.vc/<tenant>/external_api.js
      jwt?: string;
      displayName: string;
    });
export type TeleconsultRoomData = Extract<TeleconsultJoinData, { waiting: false }>;
export interface TeleconsultStatus { admitted: boolean; patientWaiting: boolean }

// ── Navigation ─────────────────────────────────────────────────
export type NavCategory = 'entrance' | 'reception' | 'department' | 'ward' | 'facility' | 'elevator' | 'stairs' | 'junction';

export interface NavLocation {
  id: number;
  code: string;
  name: string;
  category: NavCategory;
  building: string;
  floor: number;
  description: string | null;
}
export interface NavPoint { id: number; code: string; name: string; floor: number }
export interface NavStep { from: NavPoint; to: NavPoint; instruction: string; distance: number }
export interface NavRoute {
  from: NavPoint;
  to: NavPoint;
  accessible: boolean;
  totalDistance: number;
  estimatedMinutes: number;
  steps: NavStep[];
}
export interface NavLocationQuery { category?: NavCategory; q?: string }
export interface CreateNavLocationBody {
  code: string; // /^[A-Z0-9_]{1,30}$/
  name: string;
  category: NavCategory;
  building?: string;
  floor: number;
  description?: string;
}
export interface CreateNavEdgeBody {
  fromLocationId: number;
  toLocationId: number;
  distanceM: number;
  instruction: string;
  reverseInstruction: string;
  accessible?: boolean;
}
