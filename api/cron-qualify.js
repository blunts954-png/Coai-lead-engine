// api/cron-qualify.js — hourly lead qualification orchestrator
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
      `SELECT id, audit_score, rating, reviews_count, phone, website, email
       FROM leads
       WHERE pipeline_stage = 'discovered' AND audit_score IS NOT NULL
       ORDER BY audit_score DESC LIMIT 20`
    );

    let qualified = 0;

    for (const lead of leadResult.rows) {
      let score = 0;

      if (lead.audit_score) score += Math.min(42, lead.audit_score);
      if (lead.phone) score += 12;
      if (lead.website || lead.email) score += 10;
      if (lead.rating && lead.rating >= 4.5) score += 8;
      if (lead.reviews_count && lead.reviews_count >= 10) score += 10;

      const hasContact = lead.phone || lead.email;
      const hasWebsite = lead.website;
      const qualifiesForOutreach = score >= 50 && hasContact;

      if (qualifiesForOutreach) {
        await query(
          `UPDATE leads SET score = $1, pipeline_stage = 'qualified', updated_at = NOW() WHERE id = $2`,
          [score, lead.id]
        );
        qualified++;
      } else {
        await query(
          `UPDATE leads SET score = $1, updated_at = NOW() WHERE id = $2`,
          [score, lead.id]
        );
      }
    }

    res.status(200).json({ status: 'OK', qualified });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
