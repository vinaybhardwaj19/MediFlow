/**
 * exhibition-helper.js — Idempotent auto-seeding for demonstrations
 * ─────────────────────────────────────────────────────────────────────────────
 * CRITICAL FIX: This version uses count-based guards before every seed
 * operation. It NEVER calls deleteMany(). If data already exists, seeding is
 * skipped. This makes the function safe to call on every server restart
 * without destroying existing demo state.
 *
 * Seeded entities:
 *   - 4 Users (patient, doctor, pharmacist, admin)
 *   - 1 Doctor profile  (linked to doctor user)
 *   - 1 PatientProfile  (linked to patient user)
 *   - 3 Pharmacy nodes  (with inventory + geo-coordinates)
 *   - 12 Medicines
 *   - 2 Appointments
 */

const mongoose     = require('mongoose');
const User         = require('../models/User.model');
const Medicine     = require('../models/Medicine.model');
const Pharmacy     = require('../models/Pharmacy.model');
const Appointment  = require('../models/Appointment.model');
const Doctor       = require('../models/Doctor.model');
const PatientProfile = require('../models/PatientProfile.model');
const Provider     = require('../models/Provider.model');
const { encrypt }  = require('../services/encryption.service');
const logger       = require('./logger');

// ── Demo User Definitions ─────────────────────────────────────────────────────
const demoUsers = [
  {
    firstName: 'Ananya',
    lastName: 'Sharma',
    email: 'patient@mediflow.com',
    passwordHash: 'Demo1234!',
    role: 'patient',
    isVerified: true,
    phone: '+91-98765-43210',
    gender: 'female',
    dateOfBirth: new Date('1993-06-15'),
    profileImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80'
  },
  {
    firstName: 'Dr. Vikram',
    lastName: 'Nair',
    email: 'doctor@mediflow.com',
    passwordHash: 'Demo1234!',
    role: 'doctor',
    isVerified: true,
    phone: '+91-98765-43211',
    gender: 'male',
    dateOfBirth: new Date('1978-03-22'),
    profileImage: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=150&q=80'
  },
  {
    firstName: 'Priya',
    lastName: 'Patel',
    email: 'pharmacist@mediflow.com',
    passwordHash: 'Demo1234!',
    role: 'pharmacist',
    isVerified: true,
    phone: '+91-98765-43212',
    gender: 'female',
    dateOfBirth: new Date('1985-11-30'),
    profileImage: 'https://images.unsplash.com/photo-1559839734-2b71f1536783?auto=format&fit=crop&w=150&q=80'
  },
  {
    firstName: 'Admin',
    lastName: 'MediFlow',
    email: 'admin@mediflow.com',
    passwordHash: 'Demo1234!',
    role: 'admin',
    isVerified: true,
    phone: '+91-98765-43213',
    gender: 'other',
    profileImage: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=150&q=80'
  },
  {
    firstName: 'Alex',
    lastName: 'Rider',
    email: 'rider@mediflow.com',
    passwordHash: 'Demo1234!',
    role: 'rider',
    isVerified: true,
    phone: '+91-98765-43214',
    gender: 'male',
    profileImage: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=150&q=80'
  },
  {
    firstName: 'Suresh',
    lastName: 'Worker',
    email: 'worker@mediflow.com',
    passwordHash: 'Demo1234!',
    role: 'worker',
    isVerified: true,
    phone: '+91-98765-43215',
    gender: 'male',
  },
];

// ── Medicine Catalogue ────────────────────────────────────────────────────────
const demoMedicines = [
  { name: 'Paracetamol 500mg', generic: 'Acetaminophen', category: 'otc', price: 1250, stock: 500, manufacturer: 'Cipla', requiresPrescription: false, description: 'Fever & pain relief. Standard first-line antipyretic.', images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80'] },
  { name: 'Amoxicillin 250mg', generic: 'Amoxicillin', category: 'prescription', price: 4500, stock: 200, manufacturer: 'Sun Pharma', requiresPrescription: true, description: 'Broad-spectrum antibiotic — penicillin class.', images: ['https://images.unsplash.com/photo-1550572017-edb79a558509?auto=format&fit=crop&w=400&q=80'], isHighRisk: true },
  { name: 'Metformin 850mg', generic: 'Metformin HCl', category: 'prescription', price: 2800, stock: 350, manufacturer: 'Dr Reddys', requiresPrescription: true, description: 'First-line Type 2 diabetes management — biguanide class.', images: ['https://images.unsplash.com/photo-1576091160550-2173bdd99625?auto=format&fit=crop&w=400&q=80'], isHighRisk: false },
  { name: 'Atorvastatin 20mg', generic: 'Atorvastatin', category: 'prescription', price: 6500, stock: 280, manufacturer: 'Torrent', requiresPrescription: true, description: 'HMG-CoA reductase inhibitor — LDL cholesterol reduction.', images: ['https://images.unsplash.com/photo-1550572017-edb79a558509?auto=format&fit=crop&w=400&q=80'], isHighRisk: true },
  { name: 'Cetirizine 10mg', generic: 'Cetirizine HCl', category: 'otc', price: 1800, stock: 400, manufacturer: 'Cipla', requiresPrescription: false, description: 'Second-generation antihistamine. Non-sedating.', images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80'] },
  { name: 'Omeprazole 20mg', generic: 'Omeprazole', category: 'otc', price: 3500, stock: 320, manufacturer: 'Ranbaxy', requiresPrescription: false, description: 'Proton pump inhibitor — GERD & peptic ulcer treatment.', images: ['https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=400&q=80'] },
  { name: 'Ibuprofen 400mg', generic: 'Ibuprofen', category: 'otc', price: 1500, stock: 600, manufacturer: 'Abbott', requiresPrescription: false, description: 'NSAID — anti-inflammatory, analgesic, antipyretic.', images: ['https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&w=400&q=80'] },
  { name: 'Vitamin D3 1000IU', generic: 'Cholecalciferol', category: 'otc', price: 2200, stock: 450, manufacturer: 'Himalaya', requiresPrescription: false, description: 'Bone health & immune modulation. Widespread deficiency in India.', images: ['https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?auto=format&fit=crop&w=400&q=80'] },
];

// ── Pharmacy Nodes (geo-coordinates: Bengaluru area for realistic routing) ────
const demoPharmacies = [
  {
    name: 'MediFlow Central Pharmacy',
    licenseNumber: 'KA-PHARM-2024-001',
    address: {
      street: '12, Brigade Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      zip: '560001',
      country: 'India',
      coordinates: { type: 'Point', coordinates: [77.5946, 12.9716] }, // [lng, lat] Central Bengaluru
    },
    contactPhone: '+91-80-4567-8901',
    isActive: true,
    deliveryRadius: 15,
    routingWeight: 1,
    operatingHours: [
      { dayOfWeek: 1, open: '08:00', close: '22:00' },
      { dayOfWeek: 2, open: '08:00', close: '22:00' },
      { dayOfWeek: 3, open: '08:00', close: '22:00' },
      { dayOfWeek: 4, open: '08:00', close: '22:00' },
      { dayOfWeek: 5, open: '08:00', close: '22:00' },
      { dayOfWeek: 6, open: '09:00', close: '20:00' },
      { dayOfWeek: 0, open: '10:00', close: '18:00' },
    ],
  },
  {
    name: 'MediFlow North Depot',
    licenseNumber: 'KA-PHARM-2024-002',
    address: {
      street: '45, Hebbal Flyover Junction',
      city: 'Bengaluru',
      state: 'Karnataka',
      zip: '560024',
      country: 'India',
      coordinates: { type: 'Point', coordinates: [77.5966, 13.0358] }, // North Bengaluru
    },
    contactPhone: '+91-80-4567-8902',
    isActive: true,
    deliveryRadius: 20,
    routingWeight: 1.2,
    operatingHours: [
      { dayOfWeek: 1, open: '07:00', close: '23:00' },
      { dayOfWeek: 2, open: '07:00', close: '23:00' },
      { dayOfWeek: 3, open: '07:00', close: '23:00' },
      { dayOfWeek: 4, open: '07:00', close: '23:00' },
      { dayOfWeek: 5, open: '07:00', close: '23:00' },
      { dayOfWeek: 6, open: '08:00', close: '21:00' },
      { dayOfWeek: 0, open: '09:00', close: '19:00' },
    ],
  },
  {
    name: 'MediFlow Electronic City Hub',
    licenseNumber: 'KA-PHARM-2024-003',
    address: {
      street: 'Phase 1, Electronic City',
      city: 'Bengaluru',
      state: 'Karnataka',
      zip: '560100',
      country: 'India',
      coordinates: { type: 'Point', coordinates: [77.6598, 12.8444] }, // South Bengaluru
    },
    contactPhone: '+91-80-4567-8903',
    isActive: true,
    deliveryRadius: 12,
    routingWeight: 1.5,
    operatingHours: [
      { dayOfWeek: 1, open: '09:00', close: '21:00' },
      { dayOfWeek: 2, open: '09:00', close: '21:00' },
      { dayOfWeek: 3, open: '09:00', close: '21:00' },
      { dayOfWeek: 4, open: '09:00', close: '21:00' },
      { dayOfWeek: 5, open: '09:00', close: '21:00' },
      { dayOfWeek: 6, open: '10:00', close: '18:00' },
      { dayOfWeek: 0, open: '11:00', close: '17:00' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

async function autoSeed() {
  try {
    // ── Step 1: Seed Users (only if none exist) ───────────────────────────────
    const userCount = await User.countDocuments();
    let createdUsers = [];

    if (userCount === 0) {
      logger.info('[Seed] No users found — seeding demo users...');
      for (const u of demoUsers) {
        const user = await User.create(u);
        createdUsers.push(user);
      }
      logger.info(`[Seed] ✅ ${createdUsers.length} demo users created.`);
    } else {
      logger.info(`[Seed] ℹ️  ${userCount} users already exist — skipping user seed.`);
      // Load existing demo users for profile linking
      createdUsers = await User.find({
        email: { $in: demoUsers.map(u => u.email) }
      });
    }

    const patient     = createdUsers.find(u => u.role === 'patient');
    const doctorUser  = createdUsers.find(u => u.role === 'doctor');

    // ── Step 2: Seed Doctor Profile ───────────────────────────────────────────
    if (doctorUser) {
      const doctorProfileCount = await Doctor.countDocuments({ userId: doctorUser._id });
      if (doctorProfileCount === 0) {
        await Doctor.create({
          userId         : doctorUser._id,
          licenseNumber  : encrypt('MCI-2024-KA-87654', doctorUser._id.toString() + ':licenseNumber'), // AES-256 encrypted with AAD
          specializations: ['Cardiology', 'Internal Medicine'],
          subSpecialties : ['Interventional Cardiology', 'Echocardiography'],
          qualifications : [
            { degree: 'MBBS', institution: 'AIIMS New Delhi', year: 2002 },
            { degree: 'MD (Medicine)', institution: 'AIIMS New Delhi', year: 2006 },
            { degree: 'DM (Cardiology)', institution: 'PGI Chandigarh', year: 2009 },
          ],
          experience          : 15,
          consultationFee     : 80000,  // 800 INR in paisa (cents equivalent)
          hospitalAffiliation : 'Apollo Hospitals, Bengaluru',
          bio                 : 'Senior Cardiologist with 15 years of experience in interventional cardiology. Former faculty at AIIMS. Special interest in heart failure management and preventive cardiology.',
          languages           : ['English', 'Hindi', 'Kannada', 'Malayalam'],
          isAcceptingPatients : true,
          ratings             : { average: 4.8, count: 312 },
          availableSlots: [
            { dayOfWeek: 1, startTime: '09:00', endTime: '13:00', slotDuration: 30 },
            { dayOfWeek: 2, startTime: '09:00', endTime: '13:00', slotDuration: 30 },
            { dayOfWeek: 3, startTime: '14:00', endTime: '18:00', slotDuration: 30 },
            { dayOfWeek: 4, startTime: '09:00', endTime: '13:00', slotDuration: 30 },
            { dayOfWeek: 5, startTime: '09:00', endTime: '12:00', slotDuration: 30 },
          ],
        });
        logger.info('[Seed] ✅ Doctor profile seeded for Dr. Vikram Nair.');
      } else {
        logger.info('[Seed] ℹ️  Doctor profile already exists — skipping.');
      }
    }

    // ── Step 3: Seed Patient Profile ──────────────────────────────────────────
    if (patient) {
      const patientProfileCount = await PatientProfile.countDocuments({ userId: patient._id });
      if (patientProfileCount === 0) {
        await PatientProfile.create({
          userId            : patient._id,
          bloodGroup        : 'B+',
          allergies         : ['Penicillin', 'Sulfa drugs'],
          chronicConditions : ['Hypertension', 'Type 2 Diabetes Mellitus'],
          currentMedications: [
            { name: 'Metformin 850mg', dosage: '850mg', frequency: 'Twice daily after meals' },
            { name: 'Losartan 50mg',   dosage: '50mg',  frequency: 'Once daily morning' },
          ],
          emergencyContact: {
            name     : 'Rajesh Sharma',
            relation : 'Spouse',
            phone    : '+91-98765-11111',
          },
        });
        logger.info('[Seed] ✅ Patient profile seeded for Ananya Sharma.');
      } else {
        logger.info('[Seed] ℹ️  Patient profile already exists — skipping.');
      }
    }

    // ── Step 4: Seed Medicines ────────────────────────────────────────────────
    const medCount = await Medicine.countDocuments();
    let medicines = [];
    if (medCount === 0) {
      medicines = await Medicine.insertMany(demoMedicines);
      logger.info(`[Seed] ✅ ${medicines.length} medicines seeded.`);
    } else {
      logger.info(`[Seed] ℹ️  ${medCount} medicines already exist — skipping.`);
      medicines = await Medicine.find().limit(12);
    }

    // ── Step 5: Seed Pharmacies with Inventory ───────────────────────────────
    const pharmCount = await Pharmacy.countDocuments();
    if (pharmCount === 0 && medicines.length > 0) {
      // Build inventory: link each pharmacy to all medicines with varied stock
      const pharmaciesWithInventory = demoPharmacies.map((pharm, pIdx) => ({
        ...pharm,
        inventory: medicines.map((med, mIdx) => ({
          medicineId  : med._id,
          stock       : 50 + (pIdx * 30) + (mIdx * 10),
          reorderLevel: 10,
          batchNumber : `BATCH-${2024 + pIdx}-${String(mIdx + 1).padStart(3, '0')}`,
          expiresAt   : new Date(Date.now() + (365 + pIdx * 90) * 24 * 60 * 60 * 1000),
        })),
      }));
      await Pharmacy.insertMany(pharmaciesWithInventory);
      logger.info(`[Seed] ✅ ${demoPharmacies.length} pharmacies seeded with full inventory.`);
    } else if (pharmCount > 0) {
      logger.info(`[Seed] ℹ️  ${pharmCount} pharmacies already exist — skipping.`);
    }

    // ── Step 6: Seed Demo Appointments ───────────────────────────────────────
    if (patient && doctorUser) {
      const apptCount = await Appointment.countDocuments();
      if (apptCount === 0) {
        const appt1Start = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const appt2Start = new Date(Date.now() + 26 * 60 * 60 * 1000);
        const appt3Start = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago (completed)

        await Appointment.create([
          {
            patientId  : patient._id,
            doctorId   : doctorUser._id,
            scheduledAt: appt1Start,
            endAt      : new Date(appt1Start.getTime() + 30 * 60 * 1000),
            type       : 'video',
            status     : 'confirmed',
            chiefComplaint     : 'Elevated blood pressure readings at home — 155/95 mmHg',
            consultationRoom   : { roomId: 'DEMO-ROOM-001' },
          },
          {
            patientId  : patient._id,
            doctorId   : doctorUser._id,
            scheduledAt: appt2Start,
            endAt      : new Date(appt2Start.getTime() + 30 * 60 * 1000),
            type       : 'video',
            status     : 'pending',
            chiefComplaint     : 'HbA1c review and medication adjustment',
            consultationRoom   : { roomId: 'DEMO-ROOM-002' },
          },
          {
            patientId  : patient._id,
            doctorId   : doctorUser._id,
            scheduledAt: appt3Start,
            endAt      : new Date(appt3Start.getTime() + 30 * 60 * 1000),
            type       : 'video',
            status     : 'completed',
            chiefComplaint     : 'Initial consultation — AI-triaged: cardiac symptom pattern',
            consultationRoom   : { roomId: 'DEMO-ROOM-003' },
          },
        ]);
        logger.info('[Seed] ✅ 3 demo appointments seeded (1 confirmed, 1 pending, 1 completed).');
      } else {
        logger.info(`[Seed] ℹ️  ${apptCount} appointments already exist — skipping.`);
      }
    }

    // ── Step 7: Seed Providers (Location Intelligence) ───────────────────────────
    const providerCount = await Provider.countDocuments();
    if (providerCount === 0) {
      const demoProviders = [
        {
          name: 'Apollo Clinic Indiranagar',
          type: 'emergency_center',
          phone: '+91 80 1234 5678',
          rating: 4.8,
          reviewsCount: 142,
          consultationFee: 50000,
          address: {
            street: '100 Feet Rd, Indiranagar',
            city: 'Bengaluru',
            state: 'Karnataka',
            zip: '560038',
            coordinates: { type: 'Point', coordinates: [77.6400, 12.9720] }
          }
        },
        {
          name: 'MedPlus Pharmacy Indiranagar',
          type: 'medical_store',
          phone: '+91 80 8765 4321',
          rating: 4.5,
          reviewsCount: 88,
          address: {
            street: '12th Main Rd, Indiranagar',
            city: 'Bengaluru',
            state: 'Karnataka',
            zip: '560038',
            coordinates: { type: 'Point', coordinates: [77.6415, 12.9730] }
          }
        },
        {
          name: 'Narayana Health Diagnostics',
          type: 'laboratory',
          phone: '+91 80 9999 8888',
          rating: 4.6,
          reviewsCount: 104,
          address: {
            street: 'Double Road, Indiranagar',
            city: 'Bengaluru',
            state: 'Karnataka',
            zip: '560038',
            coordinates: { type: 'Point', coordinates: [77.6380, 12.9705] }
          }
        },
        {
          name: 'Ludhiana Health Clinic',
          type: 'hospital',
          phone: '+91 161 500 6000',
          rating: 4.7,
          reviewsCount: 210,
          consultationFee: 60000,
          address: {
            street: 'Mall Road',
            city: 'Ludhiana',
            state: 'Punjab',
            zip: '141001',
            coordinates: { type: 'Point', coordinates: [75.8550, 30.9020] }
          }
        },
        {
          name: 'Satguru Pharmacy Ludhiana',
          type: 'medical_store',
          phone: '+91 161 500 7000',
          rating: 4.4,
          reviewsCount: 35,
          address: {
            street: 'Ferozepur Road',
            city: 'Ludhiana',
            state: 'Punjab',
            zip: '141001',
            coordinates: { type: 'Point', coordinates: [75.8450, 30.8980] }
          }
        }
      ];
      await Provider.create(demoProviders);
      logger.info('[Seed] ✅ 5 healthcare providers seeded.');
    } else {
      logger.info(`[Seed] ℹ️  ${providerCount} providers already exist — skipping.`);
    }

    logger.info('─────────────────────────────────────────────────────────');
    logger.info('[Seed] 🚀 MediFlow exhibition data ready!');
    logger.info('[Seed]    patient@mediflow.com   / Demo1234!');
    logger.info('[Seed]    doctor@mediflow.com    / Demo1234!');
    logger.info('[Seed]    pharmacist@mediflow.com/ Demo1234!');
    logger.info('[Seed]    admin@mediflow.com     / Demo1234!');
    logger.info('─────────────────────────────────────────────────────────');

  } catch (err) {
    logger.error('[Seed] ❌ Auto-seed failed:', err.message);
    logger.error(err.stack);
  }
}

module.exports = { autoSeed };
