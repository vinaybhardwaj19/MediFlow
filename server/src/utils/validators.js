/**
 * @file validators.js
 * @description Centralised Joi validation schemas for all MediFlow domains.
 * Import the schema you need and pass it to the validate() middleware.
 *
 * Design decisions:
 *   - .options({ allowUnknown: false }) — reject undeclared fields (prevents mass-assignment)
 *   - .options({ abortEarly: false })   — collect ALL errors per request, not just the first
 *   - Passwords: min 8 chars, must contain uppercase, lowercase, digit, special char
 */

const Joi = require('joi');

// ─── Reusable primitives ───────────────────────────────────────────────────────

const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .message('Must be a valid MongoDB ObjectId');

const password = Joi.string()
  .min(8).max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/)
  .message('Password must have uppercase, lowercase, a number, and a special character');

const phone = Joi.string()
  .pattern(/^\+?[1-9]\d{7,14}$/)
  .message('Phone must be in E.164 format e.g. +919876543210');

const coordinates = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

// ─── Auth schemas ──────────────────────────────────────────────────────────────

const auth = {
  register: Joi.object({
    firstName: Joi.string().trim().min(1).max(60).required(),
    lastName : Joi.string().trim().min(1).max(60).required(),
    email    : Joi.string().email().lowercase().required(),
    password,
    role     : Joi.string().valid('patient', 'doctor', 'pharmacist', 'admin', 'rider', 'worker').default('patient'),
    phone    : phone.optional(),
    dateOfBirth: Joi.date().max('now').iso().optional(),
    gender   : Joi.string().valid('male','female','other','prefer_not_to_say').optional(),
    // Allow role-specific onboarding fields
    licenseNumber: Joi.string().optional(),
    specialization: Joi.string().optional(),
    pharmacyId: Joi.string().optional(),
    vehicleNumber: Joi.string().optional(),
    drivingLicense: Joi.string().optional(),
  }).options({ allowUnknown: false }),

  login: Joi.object({
    email   : Joi.string().email().lowercase().required(),
    password: Joi.string().required(),
  }).options({ allowUnknown: false }),
};

// ─── Patient schemas ───────────────────────────────────────────────────────────

const patient = {
  updateProfile: Joi.object({
    bloodGroup       : Joi.string().valid('A+','A-','B+','B-','AB+','AB-','O+','O-'),
    allergies        : Joi.array().items(Joi.string().max(100)),
    chronicConditions: Joi.array().items(Joi.string().max(100)),
    currentMedications: Joi.array().items(Joi.object({
      name     : Joi.string().required(),
      dosage   : Joi.string().required(),
      frequency: Joi.string().required(),
    })),
    emergencyContact: Joi.object({
      name    : Joi.string().max(100),
      relation: Joi.string().max(50),
      phone   : phone,
    }),
  }).options({ allowUnknown: false }),
};

// ─── Appointment schemas ───────────────────────────────────────────────────────

const appointment = {
  book: Joi.object({
    doctorId      : objectId.required(),
    scheduledAt   : Joi.date().iso().greater('now').required()
                      .messages({ 'date.greater': 'scheduledAt must be in the future' }),
    type          : Joi.string().valid('video','audio','chat').default('video'),
    chiefComplaint: Joi.string().max(500).required(),
    triageRecordId: objectId.optional(),
  }).options({ allowUnknown: false }),

  updateStatus: Joi.object({
    status: Joi.string()
      .valid('confirmed','in_progress','completed','no_show')
      .required(),
  }).options({ allowUnknown: false }),

  cancel: Joi.object({
    reason: Joi.string().max(300).required(),
  }).options({ allowUnknown: false }),
};

// ─── Triage schemas ────────────────────────────────────────────────────────────

const triage = {
  submit: Joi.object({
    symptoms: Joi.array().items(Joi.string().max(100)).min(1).max(20).required(),
    symptomDetails: Joi.object({
      duration   : Joi.string().max(100),
      severity   : Joi.string().valid('mild','moderate','severe'),
      onset      : Joi.string().max(100),
      location   : Joi.string().max(100),
      aggravating: Joi.array().items(Joi.string().max(100)),
      relieving  : Joi.array().items(Joi.string().max(100)),
    }).optional(),
    vitalSigns: Joi.object({
      temperature      : Joi.number().min(30).max(45),
      heartRate        : Joi.number().min(20).max(300),
      bloodPressure    : Joi.object({
        systolic : Joi.number().min(50).max(300),
        diastolic: Joi.number().min(20).max(200),
      }),
      oxygenSaturation : Joi.number().min(0).max(100),
    }).optional(),
  }).options({ allowUnknown: false }),
};

// ─── Pharmacy / Order schemas ──────────────────────────────────────────────────

const pharmacy = {
  placeOrder: Joi.object({
    pharmacyId    : objectId.required(),
    prescriptionId: objectId.optional(),
    items: Joi.array().items(Joi.object({
      medicineId  : objectId.required(),
      medicineName: Joi.string().required(),
      quantity    : Joi.number().integer().min(1).max(999).required(),
      unitPrice   : Joi.number().min(0).required(),
      subtotal    : Joi.number().min(0).required(),
    })).min(1).required(),
    deliveryAddress: Joi.object({
      street     : Joi.string().max(200).required(),
      city       : Joi.string().max(100).required(),
      coordinates: coordinates.optional(),
    }).required(),
    paymentMethod: Joi.string().valid('card','insurance','wallet','cod').required(),
  }).options({ allowUnknown: false }),
};

// ─── Prescription schemas ──────────────────────────────────────────────────────

const prescription = {
  create: Joi.object({
    appointmentId: objectId.required(),
    patientId    : objectId.required(),
    medications  : Joi.array().items(Joi.object({
      medicineName: Joi.string().required(),
      medicineId  : objectId.optional(),
      dosage      : Joi.string().required(),
      frequency   : Joi.string().required(),
      duration    : Joi.string().optional(),
      instructions: Joi.string().max(300).optional(),
    })).min(1).required(),
    diagnosis: Joi.string().max(1000).required(),
    notes    : Joi.string().max(2000).optional(),
  }).options({ allowUnknown: false }),
};

module.exports = { auth, patient, appointment, triage, pharmacy, prescription };
