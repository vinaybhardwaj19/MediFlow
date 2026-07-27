/**
 * @file encrypt_existing_records.js
 * @description Migration script to scan and encrypt unencrypted PHI fields in MongoDB.
 * Safely encrypts raw unencrypted values using AES-256-GCM without double-encrypting already encrypted fields.
 *
 * Usage: node scripts/encrypt_existing_records.js [--dry-run]
 */

const path = require('path');
module.paths.push(path.join(__dirname, '../server/node_modules'));

const mongoose = require('mongoose');

// Ensure server environment variables are loaded
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });


const env = require('../server/src/config/env');
const { encrypt } = require('../server/src/services/encryption.service');

const PatientProfile = require('../server/src/models/PatientProfile.model');
const Appointment = require('../server/src/models/Appointment.model');
const Doctor = require('../server/src/models/Doctor.model');
const Prescription = require('../server/src/models/Prescription.model');

const isDryRun = process.argv.includes('--dry-run');

function isEncrypted(val) {
  if (typeof val !== 'string') return false;
  const parts = val.split(':');
  return parts.length === 3 && parts.every(part => /^[0-9a-fA-F]+$/.test(part));
}

async function migratePatientProfiles() {
  console.log('\n--- Migrating PatientProfile records ---');
  const profiles = await PatientProfile.find().select('+insuranceInfo.policyNumber +insuranceInfo.groupNumber');
  let updatedCount = 0;

  for (const doc of profiles) {
    let modified = false;

    if (doc.insuranceInfo?.policyNumber && !isEncrypted(doc.insuranceInfo.policyNumber)) {
      doc.insuranceInfo.policyNumber = encrypt(doc.insuranceInfo.policyNumber);
      modified = true;
    }
    if (doc.insuranceInfo?.groupNumber && !isEncrypted(doc.insuranceInfo.groupNumber)) {
      doc.insuranceInfo.groupNumber = encrypt(doc.insuranceInfo.groupNumber);
      modified = true;
    }
    if (doc.emergencyContact?.phone && !isEncrypted(doc.emergencyContact.phone)) {
      doc.emergencyContact.phone = encrypt(doc.emergencyContact.phone);
      modified = true;
    }

    if (modified) {
      updatedCount++;
      if (!isDryRun) {
        await doc.save();
      }
    }
  }
  console.log(`[PatientProfile] ${updatedCount} records ${isDryRun ? 'would be' : 'were'} updated.`);
}

async function migrateAppointments() {
  console.log('\n--- Migrating Appointment records ---');
  const appointments = await Appointment.find();
  let updatedCount = 0;

  for (const doc of appointments) {
    let modified = false;

    if (doc.notes && !isEncrypted(doc.notes)) {
      doc.notes = encrypt(doc.notes);
      modified = true;
    }
    if (doc.chiefComplaint && !isEncrypted(doc.chiefComplaint)) {
      doc.chiefComplaint = encrypt(doc.chiefComplaint);
      modified = true;
    }
    if (doc.cancellationReason && !isEncrypted(doc.cancellationReason)) {
      doc.cancellationReason = encrypt(doc.cancellationReason);
      modified = true;
    }

    if (modified) {
      updatedCount++;
      if (!isDryRun) {
        await doc.save();
      }
    }
  }
  console.log(`[Appointment] ${updatedCount} records ${isDryRun ? 'would be' : 'were'} updated.`);
}

async function migrateDoctors() {
  console.log('\n--- Migrating Doctor records ---');
  const doctors = await Doctor.find();
  let updatedCount = 0;

  for (const doc of doctors) {
    let modified = false;

    if (doc.licenseNumber && !isEncrypted(doc.licenseNumber)) {
      doc.licenseNumber = encrypt(doc.licenseNumber);
      modified = true;
    }

    if (modified) {
      updatedCount++;
      if (!isDryRun) {
        await doc.save();
      }
    }
  }
  console.log(`[Doctor] ${updatedCount} records ${isDryRun ? 'would be' : 'were'} updated.`);
}

async function runMigration() {
  console.log(`Starting PHI Encryption Migration Utility ${isDryRun ? '(DRY-RUN MODE)' : ''}`);
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log('[MongoDB] Connected successfully.');

    await migratePatientProfiles();
    await migrateAppointments();
    await migrateDoctors();

    console.log('\n✅ PHI Encryption Migration Completed Successfully!');
  } catch (err) {
    console.error('❌ Migration failed with error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

runMigration();
