const bcrypt = require('bcryptjs');
const db = require('./config/db');

async function seed() {
  try {
    const specializations = ['Cardiology', 'Dermatology', 'Neurology', 'Orthopedics', 'General Medicine'];
    const names = ['Emily Davis', 'James Wilson', 'Robert Smith', 'Lisa Wong', 'David Chen', 
                   'Amanda Garcia', 'Thomas Brown', 'Sarah Taylor', 'Michael Miller', 'Jessica Anderson',
                   'William Clark', 'Ashley White', 'Joseph Harris', 'Elizabeth Martin', 'Christopher Lee'];

    console.log('Seeding doctors and slots...');
    const hashed = await bcrypt.hash('password', 10);
    
    let nameIndex = 0;
    
    // We want 3 doctors per specialization
    for (const spec of specializations) {
      for (let i = 0; i < 3; i++) {
        const docName = 'Dr. ' + names[nameIndex++];
        const email = docName.toLowerCase().replace(/[^a-z]/g, '') + '@hms.com';
        const fees = Math.floor(Math.random() * (2000 - 800) + 800); // 800 to 2000
        
        // Insert user
        const [uRes] = await db.query(
          `INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, 'doctor')`,
          [docName, email, hashed]
        );
        
        let userId = uRes.insertId;
        if (!userId) {
          const [existing] = await db.query(`SELECT id FROM users WHERE email = ?`, [email]);
          userId = existing[0].id;
        }

        // Insert doctor
        const [dRes] = await db.query(
          `INSERT IGNORE INTO doctors (user_id, specialization, fees) VALUES (?, ?, ?)`,
          [userId, spec, fees]
        );
        
        let doctorId = dRes.insertId;
        if (!doctorId) {
          const [existing] = await db.query(`SELECT id FROM doctors WHERE user_id = ?`, [userId]);
          doctorId = existing[0].id;
        }

        // Create 15-minute slots for the next 14 days
        // Morning: 9:00 AM to 12:00 PM
        // Afternoon: 2:00 PM to 5:00 PM
        const times = [];
        for (let h of [9, 10, 11, 14, 15, 16]) {
          for (let m of ['00', '15', '30', '45']) {
            times.push(`${h.toString().padStart(2, '0')}:${m}:00`);
          }
        }
        
        for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
          const date = new Date();
          date.setDate(date.getDate() + dayOffset);
          const dateStr = date.toISOString().split('T')[0];
          
          for (const time of times) {
            await db.query(
              `INSERT IGNORE INTO doctor_slots (doctor_id, date, time, is_booked) VALUES (?, ?, ?, 0)`,
              [doctorId, dateStr, time]
            );
          }
        }
      }
    }
    console.log('✅ Seed completed successfully! 15 doctors added with slots for the next 7 days.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to seed:', err);
    process.exit(1);
  }
}

seed();
