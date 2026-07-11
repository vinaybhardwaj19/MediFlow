/**
 * exhibition-seed.js — Creates exhibition-ready users for MediFlow demo.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mediflow';

const demoUsers = [
  {
    firstName: 'Alice',
    lastName: 'Patient',
    email: 'patient@mediflow.com',
    passwordHash: 'Demo1234!',
    role: 'patient',
    isVerified: true
  },
  {
    firstName: 'Bob',
    lastName: 'Doctor',
    email: 'doctor@mediflow.com',
    passwordHash: 'Demo1234!',
    role: 'doctor',
    isVerified: true
  },
  {
    firstName: 'Charlie',
    lastName: 'Pharmacist',
    email: 'pharmacist@mediflow.com',
    passwordHash: 'Demo1234!',
    role: 'pharmacist',
    isVerified: true
  }
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    for (const u of demoUsers) {
      const exists = await User.findOne({ email: u.email });
      if (exists) {
        console.log(`User ${u.email} already exists, skipping.`);
        continue;
      }
      await User.create(u);
      console.log(`Created ${u.role}: ${u.email}`);
    }

    console.log('Seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
