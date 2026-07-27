/**
 * models.ts — TypeScript Interfaces for MediFlow Data Models
 *
 * Comprehensive type definitions for all data models used across the
 * MediFlow frontend. Provides IDE autocompletion and static type checking
 * when used with JSDoc annotations in vanilla JS files.
 */

// ── User & Auth ──────────────────────────────────────────────────────────────

export type UserRole = 'patient' | 'doctor' | 'pharmacist' | 'rider' | 'admin' | 'worker';

export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  phone?: string;
  isVerified: boolean;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    accessToken: string;
    user: User;
  };
}

export interface JWTPayload {
  id: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// ── Vital Signs & Clinical Scores ────────────────────────────────────────────

export interface VitalSigns {
  heartRate?: number;
  hrv?: number;
  spo2?: number;
  systolicBp?: number;
  diastolicBp?: number;
  temperature?: number;
  respiratoryRate?: number;
  glucose?: number;
  avpuScore?: 'alert' | 'voice' | 'pain' | 'unresponsive';
}

export interface ClinicalScores {
  mews: number;
  mewsLevel: 'low' | 'medium' | 'high' | 'critical';
  curb65?: number;
  curb65Risk?: string;
  computed: boolean;
}

// ── Triage ───────────────────────────────────────────────────────────────────

export interface SHAPFeature {
  symptom: string;
  shap_value: number;
  direction: 'increases_risk' | 'decreases_risk';
  present: boolean;
}

export interface Differential {
  condition: string;
  probability: number;
}

export interface TriageResult {
  recommendedSpecialty: string;
  confidence: number;
  urgencyLevel: 'routine' | 'urgent' | 'emergency';
  differentials: Differential[];
  explanation: {
    topFeatures: SHAPFeature[];
    baseValue: number;
    outputValue: number;
    method: 'shap_tree' | 'feature_importance_fallback';
  };
  clinicalScores: ClinicalScores;
  processingTimeMs: number;
  modelVersion: string;
}

export interface TriageSubmission {
  symptoms: string[];
  vitalSigns?: VitalSigns;
  patientAge?: number;
  symptomDetails?: {
    severity?: 'mild' | 'moderate' | 'severe';
    duration?: string;
  };
}

// ── Appointment ──────────────────────────────────────────────────────────────

export type AppointmentStatus = 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled';
export type AppointmentType = 'video' | 'in-person' | 'chat';

export interface Appointment {
  _id: string;
  patientId: string;
  doctorId: string;
  scheduledAt: string;
  type: AppointmentType;
  status: AppointmentStatus;
  chiefComplaint?: string;
  notes?: string;
  consultationRoom?: {
    roomId: string;
    token: string;
  };
  createdAt: string;
}

// ── Doctor ───────────────────────────────────────────────────────────────────

export interface DoctorSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface Doctor {
  _id: string;
  userId: string;
  name: string;
  specializations: string[];
  experience: number;
  consultationFee: number;
  availability: Record<string, DoctorSlot[]>;
  rating?: number;
  isVerified: boolean;
}

// ── Prescription ─────────────────────────────────────────────────────────────

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface Prescription {
  _id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  diagnosis: string;
  medications: Medication[];
  notes?: string;
  status: 'active' | 'dispensed' | 'cancelled';
  createdAt: string;
}

// ── Pharmacy & Orders ────────────────────────────────────────────────────────

export interface Medicine {
  _id: string;
  name: string;
  manufacturer: string;
  price: number;
  inStock: boolean;
  requiresPrescription: boolean;
  category: string;
}

export interface CartItem {
  medicine: Medicine;
  quantity: number;
}

export interface DeliveryAddress {
  street: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
}

export interface PharmacyOrder {
  _id: string;
  patientId: string;
  prescriptionId?: string;
  items: CartItem[];
  status: 'pending' | 'confirmed' | 'preparing' | 'dispatched' | 'delivered' | 'cancelled';
  deliveryAddress: DeliveryAddress;
  totalAmount: number;
  droneRoute?: DroneRoute;
  createdAt: string;
}

// ── Drone Delivery ───────────────────────────────────────────────────────────

export interface Waypoint3D {
  lat: number;
  lng: number;
  altitudeM: number;
}

export interface DroneRoute {
  waypoints: Waypoint3D[];
  estimatedTimeMinutes: number;
  distanceKm: number;
  batteryRequired: number;
  noFlyZonesAvoided: number;
}

// ── Drug-Drug Interactions ───────────────────────────────────────────────────

export interface DDIResult {
  drug1: string;
  drug2: string;
  severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
  description: string;
  mechanism: string;
}

export interface DDICheckResponse {
  interactions: DDIResult[];
  safeCount: number;
  warningCount: number;
  dangerCount: number;
}

// ── Anomaly Detection ────────────────────────────────────────────────────────

export type AnomalyClass =
  | 'normal'
  | 'cardiac_arrhythmia'
  | 'hypoxic_episode'
  | 'hypoglycemic_crash'
  | 'hypertensive_crisis'
  | 'fever_onset'
  | 'sleep_apnea_event';

export interface AnomalyDetection {
  predicted_class: AnomalyClass;
  confidence: number;
  probabilities: Record<AnomalyClass, number>;
  engine: 'lstm' | 'rule_based';
  timestamp: string;
}

// ── Lab Reports ──────────────────────────────────────────────────────────────

export interface LabTest {
  _id: string;
  patientId: string;
  testType: string;
  status: 'booked' | 'sample-collected' | 'processing' | 'completed';
  results?: Record<string, number | string>;
  reportUrl?: string;
  scheduledDate: string;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  _id: string;
  roomId: string;
  senderId: string;
  content: string;
  type: 'text' | 'file' | 'system';
  read: boolean;
  createdAt: string;
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineEvent {
  _id: string;
  type: 'triage' | 'appointment' | 'prescription' | 'lab' | 'order';
  title: string;
  description: string;
  date: string;
  relatedId: string;
}

// ── API Response Wrapper ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ── Rider ────────────────────────────────────────────────────────────────────

export interface Delivery {
  _id: string;
  orderId: string;
  riderId?: string;
  status: 'available' | 'accepted' | 'picked-up' | 'in-transit' | 'delivered';
  pickupAddress: DeliveryAddress;
  dropAddress: DeliveryAddress;
  otp?: string;
  createdAt: string;
}

export interface RiderStats {
  totalDeliveries: number;
  completedToday: number;
  avgDeliveryTime: number;
  rating: number;
}
