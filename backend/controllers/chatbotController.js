const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../config/db');

// ── Gemini Setup ──────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are "MediBot", a friendly and knowledgeable healthcare assistant for the **Care & Cure Hospital Management System (HMS)**.

YOUR CAPABILITIES:
1. Answer general health questions and provide preliminary guidance (always remind users you're not a substitute for professional medical advice).
2. Recommend the right medical specialization based on symptoms.
3. Help patients book appointments by guiding them through the process.
4. Provide information about the hospital's departments and services.
5. Show patients their upcoming and past appointments when they ask.

AVAILABLE SPECIALIZATIONS:
- **Cardiology** — Heart & blood vessel issues (chest pain, high BP, palpitations, shortness of breath)
- **Dermatology** — Skin, hair & nail problems (acne, rashes, eczema, hair loss, skin infections)
- **Neurology** — Brain, spinal cord & nerve issues (headaches, migraines, dizziness, numbness, seizures)
- **Orthopedics** — Bone, joint & muscle problems (fractures, back pain, arthritis, sports injuries, joint pain)
- **General Medicine** — Primary care & general health (fever, cold, cough, stomach aches, routine checkups, fatigue)

BOOKING FLOW:
When a user wants to book an appointment, guide them step by step:
1. Ask about their symptoms to recommend a specialization (or let them choose)
2. Once specialization is decided, tell them you'll show available doctors
3. After they pick a doctor, ask for preferred date
4. Show available time slots
5. Confirm the booking

APPOINTMENT VIEWING:
When a user asks about their appointments, bookings, schedule, upcoming visits, or past visits, respond helpfully and include the action to fetch their appointments. Examples of such requests:
- "Show my appointments"
- "What are my upcoming bookings?"
- "Do I have any appointments?"
- "My past appointments"
- "My booking history"

RESPONSE FORMAT:
- Keep responses concise, warm, and helpful (2-4 sentences max for simple queries)
- Use emojis sparingly for friendliness (💊 🏥 👨‍⚕️ ❤️ 🦴 🧠)
- When you detect booking intent or a symptom that maps to a specialization, include a JSON action block at the END of your response on a new line, formatted EXACTLY like:
  >>>ACTION:{"type":"RECOMMEND_SPECIALIZATION","specialization":"Cardiology"}
  or
  >>>ACTION:{"type":"START_BOOKING","specialization":"General Medicine"}
  or
  >>>ACTION:{"type":"SHOW_DOCTORS","specialization":"Neurology"}

- When a user asks about their appointments (upcoming or past), include:
  >>>ACTION:{"type":"SHOW_APPOINTMENTS","filter":"upcoming"}
  or
  >>>ACTION:{"type":"SHOW_APPOINTMENTS","filter":"past"}
  or
  >>>ACTION:{"type":"SHOW_APPOINTMENTS","filter":"all"}

- Only include ONE action per response.
- If no action is needed, don't include any ACTION line.

RULES:
- Never diagnose conditions definitively. Always recommend consulting a doctor.
- If symptoms sound serious or emergency-level (chest pain + difficulty breathing, severe bleeding, etc.), advise calling emergency services immediately.
- Be empathetic and professional.
- If asked about things outside healthcare/hospital scope, politely redirect.
- If asked about fees — mention that consultation fees vary by doctor and are shown during booking.

HOSPITAL INFO:
- Name: Care & Cure Hospital
- Address: Street Number 299, DJ Block (Newtown), Action Area I, New Town, West Bengal 700156
- Phone: +91 33 2476 5102
- Email: ApolloHospitalshospitalmanagementsystem@gmail.com
- Appointment slots are 15 minutes each
- Appointments can be booked up to 14 days in advance`;

// ── POST /api/chatbot/message ────────────────────────────────────────────────
const sendMessage = async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    // Build conversation history for Gemini
    const chatHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        maxOutputTokens: 500,
      },
    });

    const result = await chat.sendMessage(message);
    const responseText = result.response.text();

    // Parse action from response if present
    let action = null;
    let cleanText = responseText;

    const actionMatch = responseText.match(/>>>ACTION:(\{.*\})/);
    if (actionMatch) {
      try {
        action = JSON.parse(actionMatch[1]);
        cleanText = responseText.replace(/>>>ACTION:\{.*\}/, '').trim();
      } catch (e) {
        // If JSON parse fails, just return the text as-is
        cleanText = responseText.replace(/>>>ACTION:.*/, '').trim();
      }
    }

    res.json({
      success: true,
      data: {
        message: cleanText,
        action,
      },
    });
  } catch (err) {
    console.error('Chatbot error:', err.message);
    // Return a friendly fallback so the frontend doesn't break
    res.json({
      success: true,
      data: {
        message: "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment, or navigate to the **Book Appointment** page to schedule your visit directly. 🏥",
        action: null,
      },
    });
  }
};

// ── GET /api/chatbot/doctors?specialization= ────────────────────────────────
const getChatbotDoctors = async (req, res, next) => {
  try {
    const { specialization } = req.query;

    let sql = `
      SELECT d.id, u.name, d.specialization, d.fees
      FROM doctors d
      JOIN users u ON d.user_id = u.id
    `;
    const params = [];

    if (specialization) {
      sql += ' WHERE d.specialization = ?';
      params.push(specialization);
    }

    sql += ' ORDER BY u.name ASC';

    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/chatbot/slots?doctorId=&date= ──────────────────────────────────
const getChatbotSlots = async (req, res, next) => {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({ success: false, message: 'doctorId and date are required.' });
    }

    const [rows] = await db.query(
      `SELECT id, date, time
       FROM doctor_slots
       WHERE doctor_id = ? AND date = ? AND is_booked = 0
       ORDER BY time ASC`,
      [doctorId, date]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/chatbot/book (authenticated — patient only) ───────────────────
const chatbotBook = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { doctorId, slotId, reason } = req.body;
    const patientId = req.user.id;

    if (!doctorId || !slotId) {
      return res.status(400).json({ success: false, message: 'doctorId and slotId are required.' });
    }

    await conn.beginTransaction();

    // Lock the slot row
    const [slotRows] = await conn.query(
      'SELECT id, is_booked FROM doctor_slots WHERE id = ? AND doctor_id = ? FOR UPDATE',
      [slotId, doctorId]
    );

    if (slotRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Slot not found.' });
    }

    if (slotRows[0].is_booked) {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'This slot is already booked. Please choose another.' });
    }

    // Mark slot as booked
    await conn.query('UPDATE doctor_slots SET is_booked = 1 WHERE id = ?', [slotId]);

    // Create appointment
    const [result] = await conn.query(
      `INSERT INTO appointments (patient_id, doctor_id, slot_id, status, reason)
       VALUES (?, ?, ?, 'pending', ?)`,
      [patientId, doctorId, slotId, reason || null]
    );

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully via MediBot! 🎉',
      appointmentId: result.insertId,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ── GET /api/chatbot/appointments (authenticated — patient only) ────────────
const getPatientAppointments = async (req, res, next) => {
  try {
    const patientId = req.user.id;
    const { filter } = req.query; // 'upcoming', 'past', or 'all'

    let dateFilter = '';
    if (filter === 'upcoming') {
      dateFilter = 'AND ds.date >= CURDATE()';
    } else if (filter === 'past') {
      dateFilter = 'AND ds.date < CURDATE()';
    }

    const [rows] = await db.query(
      `SELECT
         a.id, a.status, a.reason, a.created_at,
         ds.date, ds.time,
         u.name AS doctor_name,
         d.specialization, d.fees
       FROM appointments a
       JOIN doctor_slots ds ON a.slot_id  = ds.id
       JOIN doctors      d  ON a.doctor_id = d.id
       JOIN users        u  ON d.user_id   = u.id
       WHERE a.patient_id = ? ${dateFilter}
       ORDER BY ds.date DESC, ds.time DESC
       LIMIT 10`,
      [patientId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { sendMessage, getChatbotDoctors, getChatbotSlots, chatbotBook, getPatientAppointments };
