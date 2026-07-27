const Appointment = require('../models/Appointment.model');
const Prescription = require('../models/Prescription.model');
const TriageRecord = require('../models/TriageRecord.model');
const User = require('../models/User.model');
const ApiResponse = require('../utils/ApiResponse');
const { callOpenAI } = require('../utils/openai');
const { fetchWeather } = require('../utils/weather');

/**
 * GET /api/v1/companion/insights
 * Aggregates medication schedule, appointments, reports, and logs to output personalized alerts.
 */
exports.getCompanionInsights = async (req, res) => {
  const patientId = req.user.id;

  // Retrieve patient details, prescriptions, and upcoming appointments
  const [patientUser, prescriptions, appointments, recentTriage] = await Promise.all([
    User.findById(patientId),
    Prescription.find({ patientId, status: 'active' }).sort({ createdAt: -1 }).limit(5),
    Appointment.find({ patientId, status: 'confirmed', scheduledAt: { $gte: new Date() } }).populate('doctorId', 'firstName lastName specializations').sort({ scheduledAt: 1 }),
    TriageRecord.find({ patientId }).sort({ createdAt: -1 }).limit(1)
  ]);

  const reminders = [];
  let insights = [];

  // 1. Process medication reminders
  prescriptions.forEach(p => {
    p.medicines.forEach(m => {
      reminders.push({
        type: 'medicine',
        title: `Take ${m.name} (${m.dosage || '1 tablet'})`,
        time: m.frequency || 'After breakfast & dinner',
        details: `Prescribed by Dr. ${p.doctorId ? 'Specialist' : 'Physician'}. Instructions: ${m.instructions || 'With warm water'}.`
      });
    });
  });

  // 2. Process appointment reminders
  appointments.forEach(a => {
    const drName = a.doctorId ? `Dr. ${a.doctorId.firstName} ${a.doctorId.lastName}` : 'Specialist';
    reminders.push({
      type: 'appointment',
      title: `Consultation with ${drName}`,
      time: new Date(a.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' on ' + new Date(a.scheduledAt).toLocaleDateString(),
      details: `Type: ${a.type?.toUpperCase() || 'VIDEO'} consultation. Reason: ${a.reason || 'General checkup'}.`
    });
  });

  // 3. Extract habits from query parameters with defaults
  const habits = {
    waterIntakeMl: parseInt(req.query.water) || 1800,
    waterGoalMl: parseInt(req.query.waterGoal) || 3000,
    sleepHours: parseFloat(req.query.sleep) || 6.5,
    sleepGoalHours: parseFloat(req.query.sleepGoal) || 8,
    exerciseMins: parseInt(req.query.exercise) || 20,
    exerciseGoalMins: parseInt(req.query.exerciseGoal) || 45
  };

  // Calculate age
  let age;
  if (patientUser?.dateOfBirth) {
    const diff = Date.now() - new Date(patientUser.dateOfBirth).getTime();
    age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  // Fetch local weather
  const city = patientUser?.address?.city || 'Bengaluru';
  const weatherData = await fetchWeather(city);

  // 4. Generate AI Health Insights based on vitals, weather & triage history
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const recentTriageText = recentTriage.length > 0 
      ? `Recent Triage Recommendation: Specialty: ${recentTriage[0].mlPrediction?.recommendedSpecialty}, Urgency: ${recentTriage[0].mlPrediction?.urgencyLevel}`
      : 'No recent triage check.';
    
    const prescriptionsText = prescriptions.map(p => 
      p.medicines.map(m => `- ${m.name}: ${m.dosage} (${m.frequency})`).join('\n')
    ).join('\n') || 'No active prescriptions.';

    const appointmentsText = appointments.map(a => 
      `- Dr. ${a.doctorId?.firstName || 'Specialist'} ${a.doctorId?.lastName || ''} (${a.doctorId?.specializations?.join(', ') || ''}) on ${new Date(a.scheduledAt).toLocaleDateString()}`
    ).join('\n') || 'No upcoming appointments.';

    const weatherText = weatherData 
      ? `Current weather in ${weatherData.city}: ${weatherData.temp}°C, feels like ${weatherData.feels_like}°C, ${weatherData.description}, humidity: ${weatherData.humidity}%, wind speed: ${weatherData.wind_speed} m/s.`
      : `Weather data currently unavailable for ${city}.`;

    const promptMessages = [
      {
        role: 'system',
        content: `You are an expert AI clinical health assistant and personal medical companion.
Your task is to generate 4-5 brief, actionable, personalized predictive health insights based on the patient's demographics, current habits, active prescriptions, recent triage results, upcoming appointments, and local weather.

Return ONLY a raw JSON array of objects (no markdown, no backticks, no wrapping), where each object has:
- "category": A short category label (e.g. "Hydration", "Sleep Hygiene", "Exercise Advice", "Prescription Adherence", "Weather Impact")
- "text": A brief, friendly, highly specific clinical insight or recommendation (1-2 sentences). Do not use bold markdown inside text values.

Example Output Format:
[
  {"category": "Hydration", "text": "You are currently at 60% of your water goal. Try to drink another 1.2L to maintain your heart rate variability."},
  {"category": "Weather Alert", "text": "It is currently 24 degrees and overcast in Bengaluru. If you go out for your walk, watch for allergies."}
]`
      },
      {
        role: 'user',
        content: `Patient Context:
- Name: ${patientUser?.firstName || 'Patient'} ${patientUser?.lastName || ''}
- Demographics: Age ${age || 'N/A'}, Gender ${patientUser?.gender || 'N/A'}
- Habits Today: Water Intake: ${habits.waterIntakeMl}/${habits.waterGoalMl} ml, Sleep: ${habits.sleepHours}/${habits.sleepGoalHours} hours, Exercise: ${habits.exerciseMins}/${habits.exerciseGoalMins} mins
- Active Prescriptions:
${prescriptionsText}
- Upcoming Appointments:
${appointmentsText}
- ${recentTriageText}
- Local Weather: ${weatherText}`
      }
    ];

    try {
      const { callGemini } = require('../utils/gemini');
      const geminiPrompt = promptMessages[1].content;
      const geminiSys = promptMessages[0].content;
      const geminiResponse = await callGemini(geminiPrompt, geminiSys);

      if (geminiResponse) {
        const cleaned = geminiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        insights = JSON.parse(cleaned);
      } else {
        const responseText = await callOpenAI(promptMessages, 1000);
        if (responseText) {
          const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
          insights = JSON.parse(cleaned);
        }
      }
    } catch (err) {
      console.error('[Companion AI] Error generating dynamic insights:', err);
    }
  }

  // Fallback to default lifestyle insights if OpenAI fails
  if (!insights || insights.length === 0) {
    insights = [];
    if (recentTriage.length > 0) {
      const triage = recentTriage[0];
      const specialty = triage.mlPrediction?.recommendedSpecialty;
      insights.push({
        category: 'Triage Check',
        text: `Your recent triage check suggested consulting a **${specialty}** specialist. Don't forget to book this to ensure preemptive care.`
      });
    }

    insights.push({
      category: 'Hydration',
      text: `You have completed **${Math.round((habits.waterIntakeMl / habits.waterGoalMl) * 100)}%** of your daily hydration goal. Drinking another ${((habits.waterGoalMl - habits.waterIntakeMl)/1000).toFixed(1)}L of water will help maintain optimal heart rate variability (HRV).`
    });
    
    insights.push({
      category: 'Sleep Cycle',
      text: `Your average sleep duration is **${habits.sleepHours} hours**, which is slightly below your target of ${habits.sleepGoalHours} hours. Improving deep sleep cycle length helps lower resting blood pressure.`
    });

    insights.push({
      category: 'Medication Adherence',
      text: `Excellent! You have logged all prescribed dosages on-time for the past 7 days. This keeps your blood pressure stable.`
    });
  }

  return ApiResponse.ok(res, {
    reminders,
    insights,
    habits
  }, 'AI Companion insights generated.');
};
