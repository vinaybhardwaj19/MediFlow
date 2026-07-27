/**
 * @file timeline.controller.js
 * @description Aggregates all care history items (appointments, triage, orders, lab results) into a unified timeline.
 */

const Appointment = require('../models/Appointment.model');
const TriageRecord = require('../models/TriageRecord.model');
const Order = require('../models/Order.model');
const LabReport = require('../models/LabReport.model');
const ApiResponse = require('../utils/ApiResponse');

/**
 * GET /api/v1/timeline
 * Query parameters: search
 */
exports.getPatientTimeline = async (req, res) => {
  const patientId = req.user.id;
  const { search } = req.query;

  const searchQuery = search ? search.trim().toLowerCase() : '';

  // Fetch all parallel sources
  const [appointments, triageRecords, orders, labReports] = await Promise.all([
    Appointment.find({ patientId }).populate('doctorId', 'firstName lastName').sort({ scheduledAt: -1 }),
    TriageRecord.find({ patientId }).sort({ createdAt: -1 }),
    Order.find({ patientId }).populate('pharmacyId', 'name').sort({ createdAt: -1 }),
    LabReport.find({ patientId }).sort({ bookingDate: -1 })
  ]);

  const timelineEvents = [];

  // 1. Process Appointments
  appointments.forEach(a => {
    const drName = a.doctorId ? `Dr. ${a.doctorId.firstName} ${a.doctorId.lastName}` : 'Specialist';
    const event = {
      id: a._id,
      type: 'appointment',
      date: a.scheduledAt,
      title: `${a.type?.toUpperCase() || 'VIDEO'} Consultation with ${drName}`,
      description: `Reason: ${a.reason || 'General medical follow-up'}. Status is currently ${a.status}.`,
      badge: a.status,
      icon: '📅'
    };
    timelineEvents.push(event);
  });

  // 2. Process Triage Records
  triageRecords.forEach(t => {
    const symptomsStr = t.symptoms.join(', ');
    const event = {
      id: t._id,
      type: 'triage',
      date: t.createdAt,
      title: 'AI Symptom Checker Triage',
      description: `Analyzed symptoms: ${symptomsStr}. Specialty: ${t.mlPrediction?.recommendedSpecialty || 'General Practitioner'}. Urgency: ${t.mlPrediction?.urgencyLevel || 'routine'}.`,
      badge: t.mlPrediction?.severity || 'LOW',
      icon: '🧠'
    };
    timelineEvents.push(event);
  });

  // 3. Process Pharmacy Orders
  orders.forEach(o => {
    const itemsStr = o.items.map(i => `${i.medicineName || 'Medicine'} (x${i.quantity})`).join(', ');
    const storeName = o.pharmacyId?.name || 'Local Pharmacy';
    const event = {
      id: o._id,
      type: 'order',
      date: o.createdAt,
      title: `E-Pharmacy Purchase from ${storeName}`,
      description: `Ordered items: ${itemsStr}. Total Paid: ₹${(o.totalAmount / 100).toFixed(2)}.`,
      badge: o.currentStatus,
      icon: '💊'
    };
    timelineEvents.push(event);
  });

  // 4. Process Lab Reports
  labReports.forEach(l => {
    const event = {
      id: l._id,
      type: 'lab_report',
      date: l.bookingDate,
      title: `Lab Test Booking: ${l.testName}`,
      description: `Booked at ${l.labName}. Status: ${l.status}. ${l.aiExplanation ? 'AI explanation summary is available.' : ''}`,
      badge: l.status,
      icon: '🧪'
    };
    timelineEvents.push(event);
  });

  // Sort by date descending (most recent first)
  timelineEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Filter if search query exists
  let filteredEvents = timelineEvents;
  if (searchQuery) {
    filteredEvents = timelineEvents.filter(e => 
      e.title.toLowerCase().includes(searchQuery) || 
      e.description.toLowerCase().includes(searchQuery) ||
      e.badge.toLowerCase().includes(searchQuery)
    );
  }

  return ApiResponse.ok(res, filteredEvents, 'Unified care timeline aggregated.');
};
