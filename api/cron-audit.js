// api/cron-audit.js — hourly website audit orchestrator
const { query } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authToken = req.headers.authorization;
  if (authToken !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const leadResult = await query(
      `SELECT id, website FROM leads
       WHERE pipeline_stage = 'discovered' AND website IS NOT NULL AND audit_score IS NULL
       ORDER BY created_at ASC LIMIT 5`
    );

    let audited = 0;
    for (const lead of leadResult.rows) {
      try {
        const auditRes = await fetch(
          `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/audit?url=${encodeURIComponent(lead.website)}`,
          {
            headers: { Authorization: process.env.APP_PASSWORD }
          }
        );

        const auditData = await auditRes.json();
        if (auditData.status === 'OK') {
          await query(
            `UPDATE leads SET audit_score = $1, last_audited = NOW() WHERE id = $2`,
            [auditData.score, lead.id]
          );
          audited++;
        }
      } catch (err) {
        console.error(`Audit failed for lead ${lead.id}:`, err.message);
      }
    }

    res.status(200).json({ status: 'OK', audited });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
