/**
 * api.ts — TypeScript API Client Interface Definitions
 *
 * Type-safe wrappers for all MediFlow REST API endpoints.
 * Use with JSDoc annotations in vanilla JS for IDE intellisense:
 *
 *   /** @type {import('../src/types/api').TriageAPI} *\/
 *   const triageApi = { ... };
 */

import type {
  ApiResponse,
  Appointment,
  AuthResponse,
  ChatMessage,
  DDICheckResponse,
  Delivery,
  Doctor,
  DoctorSlot,
  LabTest,
  Medicine,
  PharmacyOrder,
  Prescription,
  RiderStats,
  TimelineEvent,
  TriageResult,
  TriageSubmission,
  User,
} from './models';

// ── Auth API ─────────────────────────────────────────────────────────────────

export interface AuthAPI {
  register(data: { firstName: string; lastName: string; email: string; password: string; role: string; phone?: string }): Promise<AuthResponse>;
  login(email: string, password: string): Promise<AuthResponse>;
  refresh(): Promise<{ accessToken: string }>;
  logout(): Promise<void>;
  getMe(): Promise<ApiResponse<User>>;
  updateMe(data: Partial<User>): Promise<ApiResponse<User>>;
}

// ── Triage API ───────────────────────────────────────────────────────────────

export interface TriageAPI {
  submit(data: TriageSubmission): Promise<ApiResponse<TriageResult>>;
  getRecord(id: string): Promise<ApiResponse<TriageResult>>;
  getHistory(patientId: string): Promise<ApiResponse<TriageResult[]>>;
  getMLMetrics(): Promise<ApiResponse<Record<string, unknown>>>;
  getFederatedStats(): Promise<ApiResponse<Record<string, unknown>>>;
  checkDDI(drugs: string[]): Promise<ApiResponse<DDICheckResponse>>;
  getDDIGraph(): Promise<ApiResponse<{ nodes: unknown[]; edges: unknown[] }>>;
  extractEntities(notes: string): Promise<ApiResponse<{ symptoms: string[]; diagnoses: string[]; medications: string[] }>>;
}

// ── Appointments API ─────────────────────────────────────────────────────────

export interface AppointmentAPI {
  book(data: { doctorId: string; scheduledAt: string; type: string; chiefComplaint?: string }): Promise<ApiResponse<Appointment>>;
  list(): Promise<ApiResponse<Appointment[]>>;
  get(id: string): Promise<ApiResponse<Appointment>>;
  updateStatus(id: string, status: string): Promise<ApiResponse<Appointment>>;
  cancel(id: string, reason?: string): Promise<ApiResponse<Appointment>>;
  getRoomToken(id: string): Promise<ApiResponse<{ token: string; roomId: string }>>;
}

// ── Prescription API ─────────────────────────────────────────────────────────

export interface PrescriptionAPI {
  create(data: { patientId: string; appointmentId: string; diagnosis: string; medications: unknown[]; notes?: string }): Promise<ApiResponse<Prescription>>;
  get(id: string): Promise<ApiResponse<Prescription>>;
  listForPatient(patientId: string): Promise<ApiResponse<Prescription[]>>;
  listAll(): Promise<ApiResponse<Prescription[]>>;
  updateStatus(id: string, status: string): Promise<ApiResponse<Prescription>>;
}

// ── Pharmacy API ─────────────────────────────────────────────────────────────

export interface PharmacyAPI {
  searchMedicines(query?: string): Promise<ApiResponse<Medicine[]>>;
  getMedicine(id: string): Promise<ApiResponse<Medicine>>;
  listPharmacies(): Promise<ApiResponse<unknown[]>>;
  getNearbyPharmacies(lat: number, lng: number, radius?: number): Promise<ApiResponse<unknown[]>>;
  getInventory(): Promise<ApiResponse<unknown[]>>;
  placeOrder(data: { prescriptionId: string; pharmacyId: string; deliveryAddress: unknown }): Promise<ApiResponse<PharmacyOrder>>;
  listOrders(): Promise<ApiResponse<PharmacyOrder[]>>;
  getOrder(id: string): Promise<ApiResponse<PharmacyOrder>>;
  trackOrder(id: string): Promise<ApiResponse<{ status: string; location: unknown; eta: number }>>;
}

// ── Doctor API ───────────────────────────────────────────────────────────────

export interface DoctorAPI {
  list(specialization?: string): Promise<ApiResponse<Doctor[]>>;
  get(id: string): Promise<ApiResponse<Doctor>>;
  getSlots(id: string, date?: string): Promise<ApiResponse<DoctorSlot[]>>;
  updateProfile(id: string, data: Partial<Doctor>): Promise<ApiResponse<Doctor>>;
}

// ── Lab API ──────────────────────────────────────────────────────────────────

export interface LabAPI {
  bookTest(data: { testType: string; scheduledDate?: string }): Promise<ApiResponse<LabTest>>;
  getHistory(): Promise<ApiResponse<LabTest[]>>;
  uploadReport(formData: FormData): Promise<ApiResponse<unknown>>;
  explainReport(id: string): Promise<ApiResponse<{ explanation: string }>>;
}

// ── Chat API ─────────────────────────────────────────────────────────────────

export interface ChatAPI {
  medibot(message: string): Promise<ApiResponse<{ reply: string }>>;
  getHistory(roomId: string, page?: number): Promise<ApiResponse<ChatMessage[]>>;
  markAsRead(roomId: string): Promise<ApiResponse<void>>;
}

// ── Rider API ────────────────────────────────────────────────────────────────

export interface RiderAPI {
  getQueue(): Promise<ApiResponse<Delivery[]>>;
  acceptDelivery(deliveryId: string): Promise<ApiResponse<Delivery>>;
  updateStatus(deliveryId: string, status: string): Promise<ApiResponse<Delivery>>;
  confirmOTP(deliveryId: string, otp: string): Promise<ApiResponse<Delivery>>;
  getStats(): Promise<ApiResponse<RiderStats>>;
  getRoute(deliveryId: string): Promise<ApiResponse<unknown>>;
}

// ── Admin API ────────────────────────────────────────────────────────────────

export interface AdminAPI {
  getDashboard(): Promise<ApiResponse<{ totalUsers: number; totalAppointments: number; revenue: number }>>;
  listUsers(page?: number, role?: string): Promise<ApiResponse<User[]>>;
  toggleUserStatus(id: string): Promise<ApiResponse<User>>;
  verifyUser(id: string): Promise<ApiResponse<User>>;
  getAuditLogs(): Promise<ApiResponse<unknown[]>>;
}

// ── Timeline API ─────────────────────────────────────────────────────────────

export interface TimelineAPI {
  get(): Promise<ApiResponse<TimelineEvent[]>>;
}

// ── Data Rights API ──────────────────────────────────────────────────────────

export interface DataRightsAPI {
  exportData(patientId: string): Promise<ApiResponse<unknown>>;
  eraseData(patientId: string): Promise<ApiResponse<void>>;
}

// ── Combined API Interface ───────────────────────────────────────────────────

export interface MediFlowAPI {
  auth: AuthAPI;
  triage: TriageAPI;
  appointments: AppointmentAPI;
  prescriptions: PrescriptionAPI;
  pharmacy: PharmacyAPI;
  doctors: DoctorAPI;
  lab: LabAPI;
  chat: ChatAPI;
  rider: RiderAPI;
  admin: AdminAPI;
  timeline: TimelineAPI;
  dataRights: DataRightsAPI;
}
