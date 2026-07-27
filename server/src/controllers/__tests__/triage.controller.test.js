/**
 * @file triage.controller.test.js
 * @description Unit tests for the triage controller clinical severity grades.
 */

require('dotenv').config();
const { submitTriage } = require('../triage.controller');
const TriageRecord = require('../../models/TriageRecord.model');
const triageService = require('../../services/triage.service');

// Mock dependencies
jest.mock('../../models/TriageRecord.model');
jest.mock('../../services/triage.service');

jest.setTimeout(30000);

describe('Triage Controller Severity Engine', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { id: 'patient123' },
      body: {
        symptoms: ['Chest pressure'],
        vitals: {
          heartRate: 110,
          spo2: 91,
          bloodPressure: '145/95',
          temperature: 38.5,
          glucose: 140
        }
      }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  it('should correctly classify HIGH/CRITICAL severity on abnormal vitals and return structured advice', async () => {
    // Mock service and DB response
    triageService.predictSpecialty.mockResolvedValue({
      urgencyLevel: 'urgent',
      recommendedSpecialty: 'Cardiology',
      advice: 'Seek urgent attention.'
    });

    TriageRecord.create.mockImplementation((data) => Promise.resolve({
      _id: 'record456',
      ...data
    }));

    await submitTriage(req, res);

    expect(TriageRecord.create).toHaveBeenCalled();
    const createdData = TriageRecord.create.mock.calls[0][0];

    // High blood pressure, high HR, low spo2 should trigger CRITICAL or HIGH severity
    expect(createdData.mlPrediction.severity).toBe('HIGH');
    expect(createdData.mlPrediction.recommendation).toBe('Priority consultation');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
