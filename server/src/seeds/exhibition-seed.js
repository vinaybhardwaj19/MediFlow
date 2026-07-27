/**
 * exhibition-seed.js — Creates exhibition-ready users for MediFlow demo.
 * 
 * Demo Credentials (all passwords: Demo1234!):
 *   Patient     → Patient@gmail.com
 *   Doctor      → Doctor@gmail.com
 *   Pharmacist  → Pharmacist@gmail.com
 *   Admin       → Admin@gmail.com
 *   Rider       → Rider@gmail.com
 *   Worker      → Worker@gmail.com
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mediflow';

const DEMO_PASSWORD = 'Demo1234!';

const demoUsers = [
  {
    firstName: 'Alice',
    lastName: 'Patient',
    email: 'patient@gmail.com',
    passwordHash: DEMO_PASSWORD,
    role: 'patient',
    isVerified: true,
    profileImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80'
  },
  {
    firstName: 'Dr. Bob',
    lastName: 'Sharma',
    email: 'doctor@gmail.com',
    passwordHash: DEMO_PASSWORD,
    role: 'doctor',
    isVerified: true,
    profileImage: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=150&q=80',
    onboardingData: {
      licenseNumber: 'MCI-2024-78901',
      specialization: 'General Medicine'
    }
  },
  {
    firstName: 'Charlie',
    lastName: 'Pharmacist',
    email: 'pharmacist@gmail.com',
    passwordHash: DEMO_PASSWORD,
    role: 'pharmacist',
    isVerified: true,
    profileImage: 'https://images.unsplash.com/photo-1559839734-2b71f1536783?auto=format&fit=crop&w=150&q=80',
    onboardingData: {
      pharmacyId: 'PHARM-BLR-001'
    }
  },
  {
    firstName: 'Admin',
    lastName: 'MediFlow',
    email: 'admin@gmail.com',
    passwordHash: DEMO_PASSWORD,
    role: 'admin',
    isVerified: true,
    profileImage: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=150&q=80'
  },
  {
    firstName: 'Dan',
    lastName: 'Rider',
    email: 'rider@gmail.com',
    passwordHash: DEMO_PASSWORD,
    role: 'rider',
    isVerified: true,
    profileImage: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=150&q=80',
    onboardingData: {
      vehicleNumber: 'KA-01-AB-1234',
      drivingLicense: 'DL-2024-56789'
    }
  },
  {
    firstName: 'Asha',
    lastName: 'Worker',
    email: 'worker@gmail.com',
    passwordHash: DEMO_PASSWORD,
    role: 'worker',
    isVerified: true,
    profileImage: 'https://images.unsplash.com/photo-1594824476967-48c8b964ac31?auto=format&fit=crop&w=150&q=80'
  }
];

const Provider = require('../models/Provider.model');

const demoProviders = [
  // Bengaluru coordinates
  {
    name: 'Bengaluru General Hospital',
    type: 'hospital',
    phone: '+91 80 1234 5678',
    address: {
      street: '100 Feet Rd, Indiranagar',
      city: 'Bengaluru',
      coordinates: { type: 'Point', coordinates: [77.6400, 12.9720] }
    }
  },
  {
    name: 'MedPlus Pharmacy Indiranagar',
    type: 'medical_store',
    phone: '+91 80 8765 4321',
    address: {
      street: '12th Main Rd',
      city: 'Bengaluru',
      coordinates: { type: 'Point', coordinates: [77.6415, 12.9730] }
    }
  },
  {
    name: 'MediFlow Diagnostics Lab',
    type: 'laboratory',
    phone: '+91 80 9999 8888',
    address: {
      street: 'Double Road',
      city: 'Bengaluru',
      coordinates: { type: 'Point', coordinates: [77.6380, 12.9705] }
    }
  },
  // Ludhiana coordinates
  {
    name: 'Ludhiana Health Clinic',
    type: 'hospital',
    phone: '+91 161 500 6000',
    address: {
      street: 'Mall Road',
      city: 'Ludhiana',
      coordinates: { type: 'Point', coordinates: [75.8550, 30.9020] }
    }
  },
  {
    name: 'Satguru Pharmacy Ludhiana',
    type: 'medical_store',
    phone: '+91 161 500 7000',
    address: {
      street: 'Ferozepur Road',
      city: 'Ludhiana',
      coordinates: { type: 'Point', coordinates: [75.8450, 30.8980] }
    }
  }
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    for (const u of demoUsers) {
      const exists = await User.findOne({ email: u.email });
      if (exists) {
        // Update existing user to match new credentials
        exists.passwordHash = u.passwordHash;
        exists.firstName = u.firstName;
        exists.lastName = u.lastName;
        exists.isVerified = true;
        exists.isActive = true;
        if (u.profileImage) exists.profileImage = u.profileImage;
        if (u.onboardingData) exists.onboardingData = u.onboardingData;
        await exists.save();
        console.log(`Updated ${u.role}: ${u.email}`);
        continue;
      }
      await User.create(u);
      console.log(`Created ${u.role}: ${u.email}`);
    }

    // Seed providers
    for (const p of demoProviders) {
      const exists = await Provider.findOne({ name: p.name });
      if (exists) {
        console.log(`Provider ${p.name} already exists, skipping.`);
        continue;
      }
      await Provider.create(p);
      console.log(`Created Provider: ${p.name}`);
    }

    console.log('\n=== DEMO CREDENTIALS ===');
    console.log('All passwords: Demo1234!');
    console.log('  Patient    -> Patient@gmail.com');
    console.log('  Doctor     -> Doctor@gmail.com');
    console.log('  Pharmacist -> Pharmacist@gmail.com');
    console.log('  Admin      -> Admin@gmail.com');
    console.log('  Rider      -> Rider@gmail.com');
    console.log('  Worker     -> Worker@gmail.com');
    console.log('========================\n');
    console.log('Seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
