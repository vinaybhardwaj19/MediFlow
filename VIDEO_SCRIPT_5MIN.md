# 🎬 MediFlow Enterprise — 5-Minute Multi-Tab Live Demo Script
## Multi-Role Localhost Demo Walkthrough for Hackathon Judges

---

## 💻 PRE-RECORDING TAB SETUP (Do this 2 minutes before recording)

Open **4 Browser Tabs** (or Windows) on `http://localhost:5050` using the Exhibition Quick Access buttons:

- **Tab 1 — PATIENT**: Click "Get Started Free" ➔ Sign In ➔ Click **Patient** button
- **Tab 2 — DOCTOR**: Open new Incognito/Browser Tab ➔ Sign In ➔ Click **Doctor** button
- **Tab 3 — PHARMACIST**: Open new Tab ➔ Sign In ➔ Click **Pharmacist** button
- **Tab 4 — RIDER**: Open new Tab ➔ Sign In ➔ Click **Rider** button

Now you can click through Tab 1 ➔ Tab 2 ➔ Tab 3 ➔ Tab 4 smoothly without logging out or re-typing passwords on video!

---

## ⏱️ MINUTE 1: Intro & Problem Statement (0:00 – 1:00)

**[Screen Action: Show Tab 1 — MediFlow Home Page]**

**What to Say (Plain English):**
> "Hello everyone! Today I’m demonstrating **MediFlow Enterprise**, an AI-first telemedicine platform for India.
> 
> India has a critical healthcare shortage: only 0.7 doctors for every 1,000 people, with 80% located in big cities. Furthermore, nearly 2 million hospitalizations occur every year due to adverse drug interactions.
> 
> Instead of waiting hours for a morning clinic, MediFlow operates in real time across 5 distinct user roles.
> 
> In this 5-minute demo, I will show you our live multi-role workflow running on localhost: from Patient AI triage, to Doctor consultation, to Pharmacist drone dispatch, and Rider delivery."

---

## ⏱️ MINUTE 2: Tab 1 — Patient AI Triage & SHAP Explanation (1:00 – 2:00)

**[Screen Action: Switch to Tab 1 (Patient) ➔ Click Triage / Symptom Checker]**

**What to Say (Plain English):**
> "Here on Tab 1, I am logged in as a Patient. Let me report symptoms: **'chest pain'** and **'shortness of breath'**.
> 
> When I hit submit, our Random Forest AI model instantly recommends **Cardiology** with 91% confidence.
> 
> But instead of a black-box answer, MediFlow provides **Explainable AI (SHAP)**. 
> The interactive breakdown shows exactly why the decision was made: Chest pain contributed +0.34 to Cardiology risk, and shortness of breath added +0.21. 
> 
> It also calculates a clinical early warning score (MEWS) of 3, flagging this as an urgent case."

---

## ⏱️ MINUTE 3: Tab 2 — Doctor Workspace & Drug Safety GNN (2:00 – 3:00)

**[Screen Action: Switch to Tab 2 (Doctor Workspace)]**

**What to Say (Plain English):**
> "Now let me switch to Tab 2 — the Doctor's Workspace. 
> 
> The doctor immediately sees the incoming patient in their priority queue, along with the patient’s live vitals monitor and SHAP triage explanation.
> 
> When writing a prescription, our **Graph Neural Network (GraphSAGE GNN)** checks drug safety in real time. 
> If the doctor selects **Warfarin** and **Aspirin**, the system flags a **SEVERE CONTRAINDICATION** warning for internal bleeding risk — protecting the patient before the prescription is issued.
> 
> Once approved, the prescription is submitted to the pharmacy network."

---

## ⏱️ MINUTE 4: Tab 3 & 4 — Pharmacist Drone Dispatch & Rider Delivery (3:00 – 4:00)

**[Screen Action: Switch to Tab 3 (Pharmacist) ➔ Show Drone Tracker]**
**[Screen Action: Switch to Tab 4 (Rider Dashboard) ➔ Show Leaflet Map & OTP]**

**What to Say (Plain English):**
> "Let's switch to Tab 3 — the Pharmacist Dashboard.
> 
> The pharmacist receives the order. For emergency medicines in hard-to-reach areas, MediFlow has an **Autonomous 3D Drone Router**. 
> Our 3D A-Star algorithm computes a 3D flight trajectory up to 120 meters altitude, automatically bypassing government no-fly zones and calculating battery cost for climbing.
> 
> Now switching to Tab 4 — the Rider Delivery Hub. 
> For ground deliveries, riders get a live Leaflet routing map, real-time GPS tracking, and a secure 4-digit OTP verification system upon delivery to ensure medicine reaches the right hands."

---

## ⏱️ MINUTE 5: Security, Scale & Conclusion (4:00 – 5:00)

**[Screen Action: Show Care Timeline / Architecture Diagram]**

**What to Say (Plain English):**
> "Finally, security and infrastructure.
> 
> All patient records are encrypted at rest with **AES-256-GCM** encryption. We fully comply with **India's DPDP Act 2023** with data export and erasure features.
> 
> For long-term security, MediFlow implements **NIST Post-Quantum Cryptography** (Kyber-768 key encapsulation and Dilithium-3 digital signatures) to protect data against future quantum threats.
> 
> Everything runs on an 8-microservice architecture with Node.js, Python FastAPI, Go, Kafka, MongoDB, and Prometheus/Grafana monitoring.
> 
> MediFlow connects patients, doctors, pharmacists, and riders in one seamless, AI-powered healthcare ecosystem. Thank you!"

---

## 💡 TIP FOR SMOOTH DEMO RECORDING:
- Keep Tab 1 (Patient), Tab 2 (Doctor), Tab 3 (Pharmacist), and Tab 4 (Rider) already logged in before pressing record on OBS/Loom!
- Just press `Ctrl + Tab` to jump between roles seamlessly on video!
