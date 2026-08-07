// api/cron-outreach.js — hourly email outreach orchestrator
const { query } = require('../lib/db');
const nodemailer = require('nodemailer');

const templates = {
  initial: (name, city) =>
    `Hi ${name},\n\nWe specialize in helping local businesses like yours improve their online presence and attract more customers. We've been working with shops in ${city} and would love to discuss how we can help.\n\nWould you be open to a quick 15-minute call?\n\nBest regards`,
  followup: (name) =>
    `Hi ${name},\n\nJust following up on our previous message. We have a proven system that's helped similar businesses increase their visibility.\n\nLet me know if you'd like to chat.\n\nBest regards`
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authToken = req.headers.authorization;
  if (authToken !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const leadResult = await query(
      `SELECT id, name, email, city, last_messaged
       FROM leads
       WHERE pipeline_stage = 'qualified' AND email IS NOT NULL AND last_messaged IS NULL
       ORDER BY score DESC LIMIT 10`
    );

    let sent = 0;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    for (const lead of leadResult.rows) {
      try {
        const body = templates.initial(lead.name, lead.city || 'your area');

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: lead.email,
          subject: `Quick question for ${lead.name}`,
          text: body
        });

        await query(
          `INSERT INTO outreach_log (lead_id, email, template_name, status)
           VALUES ($1, $2, $3, $4)`,
          [lead.id, lead.email, 'initial', 'sent']
        );

        await query(
          `UPDATE leads SET last_messaged = NOW(), pipeline_stage = 'messaged', updated_at = NOW() WHERE id = $1`,
          [lead.id]
        );

        sent++;
      } catch (err) {
        console.error(`Outreach failed for lead ${lead.id}:`, err.message);
      }
    }

    res.status(200).json({ status: 'OK', sent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
