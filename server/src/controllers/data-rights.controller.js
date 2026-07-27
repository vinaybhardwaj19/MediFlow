const User = require('../models/User.model');
let Appointment, Prescription, MedicalRecord;
try {
  Appointment = require('../models/Appointment.model');
} catch (e) {
  Appointment = null;
}
try {
  Prescription = require('../models/Prescription.model');
} catch (e) {
  Prescription = null;
}
try {
  MedicalRecord = require('../models/MedicalRecord.model');
} catch (e) {
  MedicalRecord = null;
}

exports.exportData = async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // Ensure the user is requesting their own data or is an admin
    if (req.user.id !== patientId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const patient = await User.findById(patientId).select('-password');
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const exportData = {
      patient,
      appointments: Appointment ? await Appointment.find({ patient: patientId }) : [],
      prescriptions: Prescription ? await Prescription.find({ patient: patientId }) : [],
      medicalRecords: MedicalRecord ? await MedicalRecord.find({ patient: patientId }) : []
    };

    // Log the export (Placeholder for actual audit logging)
    console.log(`[Audit] Data export triggered for patient ${patientId} by ${req.user.id}`);

    res.status(200).json({ success: true, data: exportData });
  } catch (error) {
    console.error('Export Data Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.eraseData = async (req, res) => {
  try {
    const { patientId } = req.params;
    
    if (req.user.id !== patientId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    // Delete related records
    if (Appointment) await Appointment.deleteMany({ patient: patientId });
    if (Prescription) await Prescription.deleteMany({ patient: patientId });
    if (MedicalRecord) await MedicalRecord.deleteMany({ patient: patientId });
    
    // Delete user
    await User.findByIdAndDelete(patientId);

    // Log the erasure
    console.log(`[Audit] Data erasure triggered for patient ${patientId} by ${req.user.id}`);

    res.status(200).json({ success: true, message: 'Data erased successfully' });
  } catch (error) {
    console.error('Erase Data Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
